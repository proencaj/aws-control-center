"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LogGroupPage, LogPage } from "@/lib/cloudwatch-logs";
import { AnalyseDialog } from "@/app/ai-debugger/analyse-dialog";
import { useWorkspaceActive } from "@/components/workspace";
import { formatLog, mergeLogs, type LogEvent } from "./log-buffer";

const inputClass = "w-full";
const buttonClass = "";
type Session = {
  controller: AbortController;
  group: string;
  lines: number;
  start: number;
  end: number;
  older?: string;
  historyBusy: boolean;
  tail: boolean;
  pollStart: number;
  pollEnd?: number;
  pollNext?: string;
  timer?: ReturnType<typeof setTimeout>;
};

async function request<T>(
  region: string,
  query: Record<string, string>,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(
    `/logs-monitor/data?${new URLSearchParams({ region, ...query })}`,
    { signal, cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "CloudWatch request failed.");
  return result;
}

export function LogsViewer({
  region,
  initialGroups,
  initialError,
  initialConfig,
}: {
  region: string;
  initialGroups: LogGroupPage;
  initialError?: string;
  initialConfig?: {
    group?: string;
    lines: number;
    minutes: number;
    tail: boolean;
  };
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [prefix, setPrefix] = useState("");
  const searchedPrefix = useRef("");
  const [group, setGroup] = useState(
    initialConfig?.group ?? initialGroups.groups[0] ?? "",
  );
  const [lines, setLines] = useState(initialConfig?.lines ?? 100);
  const [minutes, setMinutes] = useState(initialConfig?.minutes ?? 60);
  const [tail, setTail] = useState(initialConfig?.tail ?? false);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState(initialError);
  const [error, setError] = useState("");
  const [{ events, trimmed }, setBuffer] = useState<{
    events: LogEvent[];
    trimmed: boolean;
  }>({ events: [], trimmed: false });
  const [busy, setBusy] = useState(false);
  const [tailing, setTailing] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [activeGroup, setActiveGroup] = useState("");
  const [status, setStatus] = useState("Select a log group and press Monitor.");
  const [following, setFollowing] = useState(true);
  const follow = useRef(true);
  const session = useRef<Session | null>(null);
  const groupRequest = useRef<AbortController | null>(null);
  const output = useRef<HTMLPreElement>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const workspaceActive = useWorkspaceActive();
  const resume = useRef(false);

  useEffect(
    () => () => {
      session.current?.controller.abort();
      clearTimeout(session.current?.timer);
      session.current = null;
      groupRequest.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (workspaceActive) {
      if (resume.current) {
        resume.current = false;
        void startMonitoring();
      }
      return;
    }
    if (!session.current) return;
    resume.current = session.current.tail;
    stop();
    setStatus(resume.current ? "Paused while this workspace is hidden." : "Stopped while this workspace is hidden.");
    // startMonitoring intentionally uses the latest form values on resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceActive]);

  useLayoutEffect(() => {
    const box = output.current;
    if (!box) return;
    if (anchor.current) {
      box.scrollTop =
        anchor.current.top + box.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (follow.current) box.scrollTop = box.scrollHeight;
  }, [events]);

  function stop() {
    session.current?.controller.abort();
    clearTimeout(session.current?.timer);
    session.current = null;
    setBusy(false);
    setTailing(false);
    setHasOlder(false);
    setStatus("Stopped. Press Monitor to fetch again.");
  }

  async function loadGroups(next?: string) {
    groupRequest.current?.abort();
    const controller = new AbortController();
    groupRequest.current = controller;
    setGroupBusy(true);
    setGroupError(undefined);
    const search = next ? searchedPrefix.current : prefix.trim();
    try {
      const result = await request<LogGroupPage>(
        region,
        { kind: "groups", prefix: search, ...(next ? { next } : {}) },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      searchedPrefix.current = search;
      setGroups(result);
    } catch (cause) {
      if (!controller.signal.aborted)
        setGroupError(
          cause instanceof Error ? cause.message : "Could not load log groups.",
        );
    } finally {
      if (!controller.signal.aborted) setGroupBusy(false);
    }
  }

  function fetchEvents(
    s: Session,
    direction: "older" | "newer",
    start: number,
    end: number,
    next?: string,
  ) {
    return request<LogPage>(
      region,
      {
        kind: "events",
        group: s.group,
        lines: String(s.lines),
        direction,
        start: String(start),
        end: String(end),
        ...(next ? { next } : {}),
      },
      s.controller.signal,
    );
  }

  function append(s: Session, incoming: LogEvent[], keep: "oldest" | "newest") {
    if (session.current !== s) return;
    setBuffer((current) => {
      const next = mergeLogs(current.events, incoming, keep);
      return { events: next.events, trimmed: current.trimmed || next.trimmed };
    });
  }

  function fail(s: Session, cause: unknown) {
    if (session.current !== s || s.controller.signal.aborted) return;
    stop();
    setError(cause instanceof Error ? cause.message : "Could not load logs.");
    setStatus("Request failed. Output retained; press Monitor to retry.");
  }

  async function poll(s: Session) {
    if (session.current !== s) return;
    s.pollEnd ??= Date.now();
    try {
      const result = await fetchEvents(
        s,
        "newer",
        s.pollStart,
        s.pollEnd,
        s.pollNext,
      );
      if (session.current !== s) return;
      append(
        s,
        result.events.filter(
          (event) => event.time >= s.end || event.ingested >= s.end,
        ),
        "newest",
      );
      s.pollNext = result.nextToken;
      if (!s.pollNext) {
        // Replay one minute to catch delayed ingestion and timestamp boundaries.
        s.pollStart = Math.max(s.start, s.pollEnd - 60_000);
        s.pollEnd = undefined;
      }
      setStatus(
        result.nextToken
          ? "Tail active / catching up…"
          : "Tail active / waiting for new events…",
      );
      s.timer = setTimeout(() => void poll(s), result.nextToken ? 250 : 2000);
    } catch (cause) {
      fail(s, cause);
    }
  }

  async function startMonitoring() {
    stop();
    const end = Date.now();
    const s: Session = {
      controller: new AbortController(),
      group,
      lines,
      start: end - minutes * 60_000,
      end,
      historyBusy: true,
      tail,
      pollStart: Math.max(end - minutes * 60_000, end - 60_000),
    };
    session.current = s;
    follow.current = true;
    anchor.current = null;
    setFollowing(true);
    setBuffer({ events: [], trimmed: false });
    setError("");
    setBusy(true);
    setActiveGroup(group);
    setStatus("Fetching recent events…");
    // Save configuration, never event contents, in the shareable URL.
    const url = new URL(window.location.href);
    url.pathname = "/logs-monitor";
    url.searchParams.set("group", group);
    url.searchParams.set("lines", String(lines));
    url.searchParams.set("minutes", String(minutes));
    url.searchParams.set("tail", String(tail));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    window.dispatchEvent(new Event("workspace-url-change"));
    try {
      const result = await fetchEvents(s, "older", s.start, s.end);
      if (session.current !== s) return;
      append(s, result.events, "newest");
      s.older = result.nextToken;
      setHasOlder(Boolean(s.older));
      setStatus(
        result.events.length
          ? "Snapshot loaded / oldest to newest"
          : result.nextToken
            ? "Search continues. Load older events to scan the next page."
            : "No events found in this time range.",
      );
      if (s.tail) {
        setTailing(true);
        s.timer = setTimeout(() => void poll(s), 2000);
      }
    } catch (cause) {
      fail(s, cause);
    } finally {
      s.historyBusy = false;
      if (session.current === s) setBusy(false);
    }
  }

  function monitor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void startMonitoring();
  }

  async function loadOlder() {
    const s = session.current;
    if (!s?.older || s.historyBusy) return;
    s.historyBusy = true;
    setBusy(true);
    follow.current = false;
    setFollowing(false);
    try {
      const result = await fetchEvents(s, "older", s.start, s.end, s.older);
      if (session.current !== s) return;
      if (output.current)
        anchor.current = {
          height: output.current.scrollHeight,
          top: output.current.scrollTop,
        };
      append(s, result.events, "oldest");
      s.older = result.nextToken;
      setHasOlder(Boolean(s.older));
    } catch (cause) {
      fail(s, cause);
    } finally {
      s.historyBusy = false;
      if (session.current === s) setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="console-window">
        <h2 className="console-title">Monitor configuration</h2>
        <div className="space-y-4 p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadGroups();
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="min-w-0 flex-1 space-y-1">
              <span className="console-kicker">Log group prefix</span>
              <input
                className={inputClass}
                value={prefix}
                onChange={(event) => setPrefix(event.target.value)}
                placeholder="/aws/lambda/"
              />
            </label>
            <button className={buttonClass} disabled={groupBusy}>
              Find groups
            </button>
            {groups.nextToken && (
              <button
                type="button"
                className={buttonClass}
                disabled={groupBusy}
                onClick={() => void loadGroups(groups.nextToken)}
              >
                Next groups →
              </button>
            )}
          </form>
          {groupError && (
            <p role="alert" className="text-sm">
              {groupError}
            </p>
          )}
          {!groupBusy && !groups.groups.length && !groupError && (
            <p className="text-sm text-muted">
              No groups on this page. Try another prefix, region, or the next
              page.
            </p>
          )}
          <form onSubmit={monitor} className="space-y-4">
            <label className="block space-y-1">
              <span className="console-kicker">Log group</span>
              <select
                required
                className={inputClass}
                value={group}
                onChange={(event) => setGroup(event.target.value)}
                disabled={busy || tailing}
              >
                <option value="">Select a log group</option>
                {group && !groups.groups.includes(group) && (
                  <option value={group}>{group}</option>
                )}
                {groups.groups.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-4">
              <label className="w-40 space-y-1">
                <span className="console-kicker">Lines per fetch</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  required
                  className={inputClass}
                  value={lines}
                  onChange={(event) => setLines(Number(event.target.value))}
                  disabled={busy || tailing}
                />
              </label>
              <label className="space-y-1">
                <span className="console-kicker">Look back</span>
                <select
                  className={inputClass}
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                  disabled={busy || tailing}
                >
                  <option value={10}>10 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={1440}>24 hours</option>
                  <option value={10080}>7 days</option>
                </select>
              </label>
              <label className="flex items-center gap-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={tail}
                  onChange={(event) => setTail(event.target.checked)}
                  disabled={busy || tailing}
                />
                Tail
              </label>
              <button
                className="font-bold"
                disabled={!group || busy || tailing}
              >
                Monitor
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!busy && !tailing}
                onClick={stop}
              >
                Stop
              </button>
            </div>
            <p className="text-xs text-muted">
              Fetch up to 1,000 events at a time; multiline messages stay
              together. Tail checks every 2 seconds. Scroll up for older events.
            </p>
          </form>
        </div>
      </section>
      {error && (
        <p role="alert" className="border border-border p-3 text-sm">
          {error}
        </p>
      )}
      <section className="console-window">
        <div className="console-title">
          <h2>Log output</h2>
          <span>{tailing ? "Following CloudWatch" : "Snapshot"}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 text-xs">
          <span className="break-all">
            {activeGroup || "No log group monitored"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={!hasOlder || busy}
              onClick={() => void loadOlder()}
            >
              Load older events
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!events.length}
              onClick={() => {
                follow.current = true;
                setFollowing(true);
                if (output.current)
                  output.current.scrollTop = output.current.scrollHeight;
              }}
            >
              Jump to latest
            </button>
            <AnalyseDialog
              lines={events.map((event) => formatLog(event).text)}
              onOpen={() => {
                if (session.current) stop();
              }}
            />
          </div>
        </div>
        <pre
          ref={output}
          role="region"
          aria-label="CloudWatch log output"
          tabIndex={0}
          className="h-[60vh] min-h-80 overflow-auto whitespace-pre p-4 font-mono text-xs leading-6 [overflow-anchor:none]"
          onScroll={() => {
            const box = output.current;
            if (!box) return;
            const atBottom =
              box.scrollHeight - box.scrollTop - box.clientHeight < 40;
            follow.current = atBottom;
            setFollowing(atBottom);
            if (
              box.scrollTop < 40 &&
              box.scrollHeight > box.clientHeight &&
              !atBottom
            )
              void loadOlder();
          }}
        >
          {events.length
            ? events.map((event, index) => {
                const line = formatLog(event);
                return (
                  <span
                    key={event.id}
                    className="log-message"
                    data-severity={line.severity}
                  >
                    {line.text}
                    {index < events.length - 1 ? "\n" : ""}
                  </span>
                );
              })
            : busy
              ? "Fetching CloudWatch events…"
              : activeGroup
                ? "No events displayed. Try a longer time range or load another page."
                : "Ready. Configure the monitor above to fetch logs."}
        </pre>
        <div
          role="status"
          className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted"
        >
          <span>{status}</span>
          <span>
            {events.length} events buffered /{" "}
            {following ? "Auto-scroll on" : "Reading history"}
          </span>
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          {trimmed ? "Buffer limit reached. Some events were removed. " : ""}
          Buffer: up to 5,000 events / 2 million characters. Times are UTC.
        </p>
      </section>
    </div>
  );
}
