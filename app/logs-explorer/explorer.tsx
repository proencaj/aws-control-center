"use client";
import { useEffect, useRef, useState } from "react";
import type { InsightsPage, LogGroupPage } from "@/lib/cloudwatch-logs";
import { api, boundRows } from "./client";
import { Results } from "./results";
import { ContextDialog } from "./context";
import { useWorkspaceActive } from "@/components/workspace";

const inputClass = "";
const buttonClass = "";
const defaultQuery =
  "fields @timestamp, @message\n| sort @timestamp desc\n| limit 1000";
type Run = {
  cancelled: boolean;
  region: string;
  id?: string;
  timer?: ReturnType<typeof setTimeout>;
  controller: AbortController;
  groups: string[];
  query: string;
  limit: number;
  minutes: number;
  interval: number;
  customStart: number;
  customEnd: number;
  refresh: boolean;
};

export function Explorer({
  region,
  initialGroups,
  initialError,
}: {
  region: string;
  initialGroups: LogGroupPage;
  initialError?: string;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [selected, setSelected] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("");
  const groupPrefix = useRef("");
  const groupRequest = useRef<AbortController | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState(initialError ?? "");
  const [query, setQuery] = useState(defaultQuery);
  const [minutes, setMinutes] = useState(60);
  const [timezone, setTimezone] = useState("UTC");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(1000);
  const [refresh, setRefresh] = useState(false);
  const [interval, setIntervalSeconds] = useState(30);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(
    "Ready. Choose log groups and run a query.",
  );
  const [page, setPage] = useState<InsightsPage>({
    status: "Complete",
    rows: [],
    statistics: undefined,
    next: undefined,
  });
  const [trimmed, setTrimmed] = useState(false);
  const [pointer, setPointer] = useState<string>();
  const [elapsed, setElapsed] = useState(0);
  const current = useRef<Run | null>(null);
  const started = useRef(0);
  const workspaceActive = useWorkspaceActive();
  const resume = useRef(false);

  async function stopRemote(run: Run) {
    if (run.id)
      return api<{ stopped: boolean }>(
        run.region,
        { kind: "stop", id: run.id },
        true,
        undefined,
        true,
      );
  }
  useEffect(() => {
    const cleanup = () => {
      const run = current.current;
      if (run) {
        run.cancelled = true;
        clearTimeout(run.timer);
        run.controller.abort();
        void stopRemote(run).catch(() => {});
      }
      groupRequest.current?.abort();
    };
    window.addEventListener("pagehide", cleanup);
    return () => {
      window.removeEventListener("pagehide", cleanup);
      cleanup();
    };
  }, []);
  useEffect(() => {
    if (workspaceActive) {
      if (resume.current) {
        resume.current = false;
        startQuery();
      }
      return;
    }
    const run = current.current;
    if (!run) return;
    resume.current = run.refresh;
    void cancel();
    setStatus(resume.current ? "Auto-refresh paused while this workspace is hidden." : "Query stopped while this workspace is hidden.");
    // Resume from the latest editor state when this workspace becomes active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceActive]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started.current) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);
  async function cancel() {
    const run = current.current;
    if (!run) return;
    run.cancelled = true;
    clearTimeout(run.timer);
    run.controller.abort();
    setRunning(false);
    setBusy(false);
    setPage((previous) => ({ ...previous, next: undefined }));
    setStatus("Stopped locally. Cancelling any running AWS query…");
    try {
      const result = await stopRemote(run);
      if (current.current !== run) return;
      setStatus(
        result?.stopped
          ? "Query cancelled. Results retained."
          : "Auto-refresh stopped. Query may already have completed.",
      );
    } catch (cause) {
      if (current.current !== run) return;
      setError(
        `Could not confirm AWS cancellation: ${(cause as Error).message}`,
      );
    }
  }
  async function findGroups(next?: string) {
    groupRequest.current?.abort();
    const controller = new AbortController();
    groupRequest.current = controller;
    setGroupBusy(true);
    setGroupError("");
    const filter = next ? groupPrefix.current : prefix;
    try {
      const result = await api<LogGroupPage>(
        region,
        { kind: "groups", prefix: filter, ...(next ? { next } : {}) },
        false,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        groupPrefix.current = filter;
        setGroups(result);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setGroupError((cause as Error).message);
    } finally {
      if (!controller.signal.aborted) setGroupBusy(false);
    }
  }
  function accept(result: InsightsPage, append = false) {
    setPage((previous) => {
      const combined = append
        ? [...previous.rows, ...result.rows]
        : result.rows;
      return { ...result, rows: boundRows(combined) };
    });
    if (boundRows(result.rows).length < result.rows.length) setTrimmed(true);
  }
  async function poll(run: Run) {
    if (run.cancelled || current.current !== run || !run.id) return;
    try {
      const result = await api<InsightsPage>(
        run.region,
        { kind: "results", id: run.id },
        false,
        run.controller.signal,
      );
      if (run.cancelled || current.current !== run) return;
      accept(result);
      setStatus(result.status);
      if (result.status === "Running" || result.status === "Scheduled") {
        run.timer = setTimeout(() => void poll(run), 1000);
        return;
      }
      setBusy(false);
      if (result.status === "Complete" && run.refresh) {
        setStatus(`Complete / next refresh in ${run.interval}s`);
        run.timer = setTimeout(() => void execute(run), run.interval * 1000);
      } else {
        setRunning(false);
        if (result.status !== "Complete")
          setError(
            `Query ${result.status.toLowerCase()}. Check the query or time range and run again.`,
          );
      }
    } catch (cause) {
      if (!run.cancelled && current.current === run) {
        setError((cause as Error).message);
        setBusy(false);
        setRunning(false);
        run.cancelled = true;
        void stopRemote(run).catch(() => {});
      }
    }
  }
  async function execute(run: Run) {
    if (run.cancelled) return;
    setBusy(true);
    setTrimmed(false);
    setElapsed(0);
    started.current = Date.now();
    setStatus("Starting query…");
    const end = run.minutes ? Math.floor(Date.now() / 1000) : run.customEnd;
    const start = run.minutes ? end - run.minutes * 60 : run.customStart;
    run.id = undefined;
    try {
      // Don't abort StartQuery: a late query ID must still be cancelled on AWS.
      const result = await api<{ id: string }>(
        run.region,
        {
          kind: "start",
          groups: run.groups,
          query: run.query,
          start,
          end,
          limit: run.limit,
        },
        true,
      );
      run.id = result.id;
      if (run.cancelled || current.current !== run) {
        await stopRemote(run);
        return;
      }
      await poll(run);
    } catch (cause) {
      if (!run.cancelled && current.current === run) {
        setError((cause as Error).message);
        setBusy(false);
        setRunning(false);
      }
    }
  }
  function startQuery() {
    const date = (value: string) =>
      Math.floor(
        new Date(value + (timezone === "UTC" ? "Z" : "")).getTime() / 1000,
      );
    const customStart = date(from),
      customEnd = date(to);
    if (
      !minutes &&
      (!Number.isFinite(customStart) ||
        !Number.isFinite(customEnd) ||
        customEnd <= customStart)
    ) {
      setError("Choose a valid custom start and end time.");
      return;
    }
    const run: Run = {
      cancelled: false,
      region,
      controller: new AbortController(),
      groups: [...selected],
      query,
      limit,
      minutes,
      interval,
      customStart,
      customEnd,
      refresh: refresh && minutes > 0,
    };
    current.current = run;
    setError("");
    setRunning(true);
    setPage({
      status: "Scheduled",
      rows: [],
      statistics: undefined,
      next: undefined,
    });
    void execute(run);
  }
  function runQuery(event: React.FormEvent) {
    event.preventDefault();
    startQuery();
  }
  async function more() {
    const run = current.current;
    if (!run?.id || !page.next || busy) return;
    setBusy(true);
    try {
      const result = await api<InsightsPage>(
        run.region,
        { kind: "results", id: run.id, next: page.next },
        false,
        run.controller.signal,
      );
      if (run.cancelled || current.current !== run) return;
      const count = boundRows([...page.rows, ...result.rows]).length;
      if (count < page.rows.length + result.rows.length) setTrimmed(true);
      accept(result, true);
    } catch (cause) {
      if (!run.cancelled && current.current === run)
        setError((cause as Error).message);
    } finally {
      if (current.current === run) setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <section className="console-window">
        <h2 className="console-title">Query definition / Logs Insights QL</h2>
        <div className="space-y-4 p-5">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void findGroups();
            }}
          >
            <label className="flex-1 text-xs">
              Log group prefix{" "}
              <input
                className={`${inputClass} ml-2`}
                value={prefix}
                onChange={(event) => setPrefix(event.target.value)}
                placeholder="/aws/"
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
                onClick={() => void findGroups(groups.nextToken)}
              >
                Next groups
              </button>
            )}
          </form>
          {groupError && <p role="alert">{groupError}</p>}
          <fieldset disabled={running} className="space-y-2">
            <legend className="text-xs">
              Select log groups ({selected.length}/50)
            </legend>
            <div className="max-h-36 overflow-auto border border-border p-3">
              {groups.groups.map((group) => (
                <label
                  key={group}
                  className="flex gap-2 break-all py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(group)}
                    disabled={
                      !selected.includes(group) && selected.length >= 50
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, group]
                          : selected.filter((item) => item !== group),
                      )
                    }
                  />
                  {group}
                </label>
              ))}
              {!groups.groups.length && (
                <p className="text-xs text-muted">
                  No groups on this page. Try another prefix or region.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.map((group) => (
                <button
                  type="button"
                  key={group}
                  className="max-w-full break-all text-xs"
                  onClick={() =>
                    setSelected(selected.filter((item) => item !== group))
                  }
                >
                  {group} ×
                </button>
              ))}
            </div>
          </fieldset>
          <form onSubmit={runQuery} className="space-y-4">
            <fieldset disabled={running} className="space-y-4">
              <div className="flex flex-wrap items-end gap-3 text-xs">
                <label>
                  Time range{" "}
                  <select
                    className={inputClass}
                    value={minutes}
                    onChange={(event) => setMinutes(Number(event.target.value))}
                  >
                    {[15, 30, 60, 180, 1440].map((value) => (
                      <option key={value} value={value}>
                        {value < 60 ? `${value}m` : `${value / 60}h`}
                      </option>
                    ))}
                    <option value={0}>Custom</option>
                  </select>
                </label>
                <label>
                  Timezone{" "}
                  <select
                    className={inputClass}
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                  >
                    <option>UTC</option>
                    <option value="local">Local time</option>
                  </select>
                </label>
                <label>
                  Result limit{" "}
                  <input
                    type="number"
                    required
                    min={1}
                    max={5000}
                    className={`${inputClass} w-24`}
                    value={limit}
                    onChange={(event) => setLimit(Number(event.target.value))}
                  />
                </label>
              </div>
              {!minutes && (
                <div className="flex flex-wrap gap-3">
                  <label>
                    Start{" "}
                    <input
                      type="datetime-local"
                      required
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label>
                    End{" "}
                    <input
                      type="datetime-local"
                      required
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                      className={inputClass}
                    />
                  </label>
                </div>
              )}
              <label className="block space-y-2 text-xs">
                <span>Logs Insights QL query</span>
                <textarea
                  spellCheck={false}
                  required
                  maxLength={10000}
                  rows={7}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full resize-y font-mono text-sm leading-6"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label>
                  <input
                    type="checkbox"
                    checked={refresh}
                    disabled={!minutes}
                    onChange={(event) => setRefresh(event.target.checked)}
                  />{" "}
                  Tail / auto-refresh rolling window
                </label>
                <label>
                  Interval{" "}
                  <select
                    className={inputClass}
                    value={interval}
                    onChange={(event) =>
                      setIntervalSeconds(Number(event.target.value))
                    }
                  >
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </label>
              </div>
            </fieldset>
            <div className="flex gap-2">
              <button
                className="font-bold"
                disabled={running || busy || !selected.length}
              >
                Run query
              </button>
              <button
                type="button"
                disabled={!running && !busy}
                className={buttonClass}
                onClick={() => void cancel()}
              >
                Cancel
              </button>
            </div>
          </form>
          <p className="text-xs text-muted">
            Auto-refresh reruns QL after each query completes and replaces the
            snapshot, preserving aggregate and sort semantics. Each run scans
            data and may incur Insights charges. Results and context show UTC
            timestamps.
          </p>
        </div>
      </section>
      {error && (
        <p role="alert" className="border border-border p-3">
          {error}
        </p>
      )}
      <div
        role="status"
        className="flex flex-wrap justify-between gap-3 text-xs text-muted"
      >
        <span>
          {status} / {elapsed}s
        </span>
        <span>
          {Math.round((page.statistics?.bytesScanned ?? 0) / 1024)} KiB scanned
          / {page.statistics?.recordsMatched ?? 0} matched
        </span>
      </div>
      <Results
        rows={page.rows}
        onContext={setPointer}
        onAnalyse={() => {
          if (running || busy) void cancel();
        }}
      />
      <div className="flex flex-wrap justify-between gap-3 text-xs text-muted">
        <span>
          {trimmed ? "Display cap reached. " : ""}Up to 5,000 rows / 2 million
          characters. Search covers loaded results.
        </span>
        <button
          className={buttonClass}
          disabled={
            !page.next || busy || running || trimmed || page.rows.length >= 5000
          }
          onClick={() => void more()}
        >
          Load more results
        </button>
      </div>
      {pointer && (
        <ContextDialog
          region={region}
          pointer={pointer}
          close={() => setPointer(undefined)}
        />
      )}
    </div>
  );
}
