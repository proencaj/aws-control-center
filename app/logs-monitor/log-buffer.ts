import type { LogPage } from "@/lib/cloudwatch-logs";
import stripAnsi from "strip-ansi";

export type LogEvent = LogPage["events"][number];
export const MAX_EVENTS = 5000;
export const MAX_CHARACTERS = 2_000_000;

export function mergeLogs(
  current: LogEvent[],
  incoming: LogEvent[],
  keep: "oldest" | "newest",
) {
  const unique = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) unique.set(event.id, event);
  const sorted = [...unique.values()].sort(
    (a, b) =>
      a.time - b.time || a.ingested - b.ingested || a.id.localeCompare(b.id),
  );
  const candidates = keep === "newest" ? sorted.reverse() : sorted;
  const events: LogEvent[] = [];
  let characters = 0;
  for (const event of candidates) {
    const size = event.text.length + event.stream.length + 40;
    if (events.length === MAX_EVENTS || characters + size > MAX_CHARACTERS)
      break;
    events.push(event);
    characters += size;
  }
  return {
    events: keep === "newest" ? events.reverse() : events,
    trimmed: events.length < sorted.length,
  };
}

type Severity = "normal" | "warning" | "error";

function severityForLevel(level: unknown): Severity | undefined {
  if (typeof level === "number") {
    if (level >= 50 && level <= 60) return "error";
    if (level === 40) return "warning";
    if (level >= 10 && level < 40) return "normal";
  }
  if (typeof level !== "string") return undefined;
  switch (level.toUpperCase()) {
    case "ERROR":
    case "FATAL":
    case "CRITICAL":
      return "error";
    case "WARN":
    case "WARNING":
      return "warning";
    case "LOG":
    case "INFO":
    case "DEBUG":
    case "TRACE":
    case "VERBOSE":
      return "normal";
    default:
      return undefined;
  }
}

function logSeverity(message: string, original: string): Severity {
  const text = message.trimStart();
  // Prefer explicit levels: Nest's yellow context labels aren't warnings.
  const nest = text.match(
    /^\[Nest\]\s+\d+\s+-\s+.*?\b(LOG|ERROR|WARN|FATAL|DEBUG|VERBOSE)\b/,
  );
  const prefix = text.match(
    /^(?:\[?\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?\]?\s+)?(?:\[(ERROR|FATAL|CRITICAL|WARN|WARNING|LOG|INFO|DEBUG|TRACE|VERBOSE)\]|(ERROR|FATAL|CRITICAL|WARN|WARNING|LOG|INFO|DEBUG|TRACE|VERBOSE)\b)/i,
  );
  const level = severityForLevel(nest?.[1] ?? prefix?.[1] ?? prefix?.[2]);
  if (level) return level;
  if (text.startsWith("{")) {
    try {
      const record = JSON.parse(text);
      const structured = severityForLevel(
        record.level ?? record.severity ?? record.severityText,
      );
      if (structured) return structured;
    } catch {
      /* Plain messages and incomplete JSON are still displayed. */
    }
  }
  // Fall back to red/yellow ANSI foreground colors for otherwise unlabelled logs.
  // Only inspect SGR here; strip-ansi removes all terminal formatting separately.
  let severity: Severity = "normal";
  const escape = String.fromCharCode(27);
  for (const match of original.matchAll(
    new RegExp(`(?:${escape}\\[|\\u009b)([0-9;:]*)m`, "g"),
  )) {
    const codes = match[1].split(/[;:]/).map(Number);
    for (let i = 0; i < codes.length; i++) {
      let color = codes[i];
      if (color === 38 || color === 48 || color === 58) {
        const foreground = color === 38;
        const mode = codes[++i];
        if (mode === 5) {
          const palette = codes[++i];
          color = foreground
            ? [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97][
                palette
              ]
            : -1;
        } else {
          // RGB color components aren't severity codes.
          if (mode === 2) break;
          continue;
        }
      }
      if (color === 31 || color === 91) return "error";
      if (color === 33 || color === 93) severity = "warning";
    }
  }
  return severity;
}

export function formatLog(event: LogEvent) {
  const message = stripAnsi(event.text).replace(/\r?\n$/, "");
  return {
    severity: logSeverity(message, event.text),
    text: `${new Date(event.time).toISOString()} ${message}`,
  };
}
