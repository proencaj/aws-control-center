import { expect, it } from "vitest";
import { formatLog, mergeLogs, MAX_EVENTS, type LogEvent } from "./log-buffer";
const event = (id: number, text = "line"): LogEvent => ({
  id: String(id),
  time: id,
  ingested: id,
  stream: "stream",
  text,
});

it("deduplicates overlapping pages by event ID, retaining distinct identical messages", () => {
  expect(
    mergeLogs([event(2)], [event(1), event(2), event(3)], "newest").events.map(
      (e) => e.id,
    ),
  ).toEqual(["1", "2", "3"]);
});

it("bounds tail memory and allows history to evict the newer end", () => {
  const events = Array.from({ length: MAX_EVENTS + 2 }, (_, i) => event(i));
  const latest = mergeLogs([], events, "newest");
  expect(latest.events).toHaveLength(MAX_EVENTS);
  expect(latest.events[0].id).toBe("2");
  expect(latest.trimmed).toBe(true);
  expect(mergeLogs([], events, "oldest").events[0].id).toBe("0");
});

it("bounds large multiline messages by total characters", () => {
  const result = mergeLogs(
    [],
    [event(1, "x".repeat(1_000_000)), event(2, "y".repeat(1_000_000))],
    "newest",
  );
  expect(result.events.map((e) => e.id)).toEqual(["2"]);
  expect(result.trimmed).toBe(true);
});

it("keeps multiline text and UTC timestamps", () => {
  expect(formatLog(event(0, "first\nsecond\n")).text).toBe(
    "1970-01-01T00:00:00.000Z first\nsecond",
  );
});

it("strips Nest color codes without misclassifying its yellow context label", () => {
  const raw =
    "\u001b[32m[Nest] 1  - \u001b[39m11/19/2026, 8:06:34 AM \u001b[32m    LOG\u001b[39m \u001b[38;5;3m[HealthCheckService] \u001b[39m\u001b[32mHealthcheck executed successfully\u001b[39m";
  const source = event(0, raw);
  const result = formatLog(source);
  expect(result.severity).toBe("normal");
  expect(result.text).toContain(
    "LOG [HealthCheckService] Healthcheck executed successfully",
  );
  expect(result.text).not.toContain("\u001b");
  expect(result.text).not.toContain("[stream]");
  expect(source.text).toBe(raw);
});

it.each([
  [
    "\u001b[31m[Nest] 1 - 11/19/2026, 8:00:00 AM ERROR [App] Failed\u001b[39m\n  at handler",
    "error",
  ],
  ["[Nest] 1 - 11/19/2026, 8:00:00 AM WARN [App] Slow request", "warning"],
  ["[ERROR] Could not connect", "error"],
  ["2026-11-19T11:00:00Z WARNING retrying", "warning"],
  ['{"level":"error","message":"Failed"}', "error"],
  ['{"level":40,"msg":"Slow"}', "warning"],
  ['{"severityText":"FATAL","message":"Failed"}', "error"],
  ["\u001b[1;91mConnection failed\u001b[0m", "error"],
  ["\u001b[38;5;3mRetrying connection\u001b[0m", "warning"],
  ["\u001b[48;5;31mBackground color\u001b[0m", "normal"],
  ["INFO \u001b[31merror\u001b[0m counter reset", "normal"],
  ["Healthcheck complete, no errors or warnings", "normal"],
])(
  "classifies severity without coloring message contents: %s",
  (text, severity) => {
    expect(formatLog(event(0, text)).severity).toBe(severity);
  },
);

it("strips cursor controls and hyperlink escapes while keeping their visible text", () => {
  const text =
    "\u001b[2K\u001b]8;;https://example.com\u0007details\u001b]8;;\u0007\nnext line";
  expect(formatLog(event(0, text)).text).toBe(
    "1970-01-01T00:00:00.000Z details\nnext line",
  );
});
