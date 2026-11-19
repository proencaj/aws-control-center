"use client";
import { useEffect, useRef, useState } from "react";
import type { InsightsContext } from "@/lib/cloudwatch-logs";
import { formatLog } from "@/app/logs-monitor/log-buffer";
import { api } from "./client";

export function ContextDialog({
  region,
  pointer,
  close,
}: {
  region: string;
  pointer: string;
  close: () => void;
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const anchor = useRef<HTMLPreElement>(null);
  const [before, setBefore] = useState(10);
  const [after, setAfter] = useState(10);
  const [range, setRange] = useState({ before: 10, after: 10 });
  const [data, setData] = useState<InsightsContext>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    modal.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<InsightsContext>(
      region,
      { kind: "context", pointer, ...range },
      true,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setBusy(false);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause.message);
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [region, pointer, range]);
  useEffect(() => {
    anchor.current?.scrollIntoView({ block: "center" });
  }, [data]);
  function load(b: number, a: number) {
    setBefore(b);
    setAfter(a);
    setBusy(true);
    setError("");
    setRange({ before: b, after: a });
  }
  return (
    <dialog
      ref={modal}
      onClose={close}
      aria-labelledby="context-title"
      className="console-window m-auto max-h-[90vh] w-[95vw] max-w-6xl overflow-auto bg-background text-foreground backdrop:bg-foreground/40"
    >
      <div className="console-title">
        <h2 id="context-title">Event context / unfiltered source stream</h2>
        <button onClick={() => modal.current?.close()} className="underline">
          Close
        </button>
      </div>
      <div className="space-y-4 p-4">
        {data && (
          <p className="break-all text-xs text-muted">
            {data.group} / {data.stream}
          </p>
        )}
        <form
          className="flex flex-wrap items-end gap-3 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            load(before, after);
          }}
        >
          <label>
            Events before{" "}
            <input
              type="number"
              min={0}
              max={100}
              required
              value={before}
              onChange={(event) => setBefore(Number(event.target.value))}
              className="w-20 border border-border bg-background p-2"
            />
          </label>
          <label>
            Events after{" "}
            <input
              type="number"
              min={0}
              max={100}
              required
              value={after}
              onChange={(event) => setAfter(Number(event.target.value))}
              className="w-20 border border-border bg-background p-2"
            />
          </label>
          <button disabled={busy} className="border border-border p-2">
            Load context
          </button>
          <button
            type="button"
            disabled={busy || range.before >= 100}
            onClick={() => load(Math.min(100, range.before + 10), range.after)}
            className="border border-border p-2"
          >
            Load earlier
          </button>
          <button
            type="button"
            disabled={busy || range.after >= 100}
            onClick={() => load(range.before, Math.min(100, range.after + 10))}
            className="border border-border p-2"
          >
            Load later
          </button>
        </form>
        {busy && <p role="status">Loading context…</p>}
        {error && <p role="alert">{error}</p>}
        <div
          className="max-h-[55vh] overflow-auto border border-border"
          aria-label="Surrounding events"
          tabIndex={0}
        >
          {data?.events.map((event, index) => {
            const formatted = formatLog({
              ...event,
              id: String(index),
              stream: data.stream,
            });
            return (
              <pre
                key={index}
                ref={index === data.anchor ? anchor : undefined}
                className={`log-message whitespace-pre px-3 py-2 font-mono text-xs leading-6 ${index === data.anchor ? "border-y-2 border-foreground bg-surface" : ""}`}
                data-severity={formatted.severity}
              >
                {index === data.anchor ? "> SELECTED EVENT\n" : ""}
                {formatted.text}
              </pre>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          UTC timestamps. Counts refer to events; multiline messages stay
          together.{" "}
          {data?.limited
            ? "Context was limited by the page or size cap; fewer events may be shown."
            : "Fewer events may be available at the start or end of the stream."}
        </p>
      </div>
    </dialog>
  );
}
