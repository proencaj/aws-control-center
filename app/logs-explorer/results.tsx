"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import stripAnsi from "strip-ansi";
import { formatLog } from "@/app/logs-monitor/log-buffer";
import { timestamp } from "./client";
import type { Match } from "./search.worker";

export function Results({
  rows,
  onContext,
}: {
  rows: Record<string, string>[];
  onContext: (pointer: string) => void;
}) {
  const [view, setView] = useState("console");
  const [term, setTerm] = useState("");
  const [regex, setRegex] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [search, setSearch] = useState<{
    matches: Match[];
    error?: string;
    source?: string[][];
  }>({
    matches: [],
  });
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const consoleView =
    view === "console" && rows.every((row) => row["@message"] !== undefined);
  const fields = useMemo(
    () =>
      [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(
        (field) => field !== "@ptr",
      ),
    [rows],
  );
  const cells = useMemo(
    () =>
      rows.map((row) =>
        consoleView
          ? [
              stripAnsi(
                `${row["@timestamp"] ?? ""} ${row["@message"] ?? ""}`,
              ).trimStart(),
            ]
          : fields.map((field) => stripAnsi(row[field] ?? "")),
      ),
    [rows, fields, consoleView],
  );
  useEffect(() => {
    if (!term) return;
    const worker = new Worker(new URL("./search.worker.ts", import.meta.url));
    let timeout: ReturnType<typeof setTimeout>;
    const delay = setTimeout(() => {
      worker.postMessage({ cells, term, regex, sensitive });
      timeout = setTimeout(() => {
        worker.terminate();
        setSearch({
          matches: [],
          source: cells,
          error: "Search took too long. Simplify the expression.",
        });
      }, 1500);
    }, 150);
    worker.onmessage = (event) => {
      clearTimeout(timeout);
      setSearch({ ...event.data, source: cells });
      worker.terminate();
    };
    worker.onerror = () => {
      clearTimeout(timeout);
      setSearch({ matches: [], source: cells, error: "Search could not run." });
      worker.terminate();
    };
    return () => {
      clearTimeout(delay);
      clearTimeout(timeout);
      worker.terminate();
    };
  }, [cells, term, regex, sensitive]);
  const matches = useMemo(
    () => (term && search.source === cells ? search.matches : []),
    [term, search, cells],
  );
  const indexedMatches = useMemo(() => {
    const index = new Map<string, (Match & { index: number })[]>();
    matches.forEach((match, position) => {
      const key = `${match.row}:${match.cell}`;
      const entries = index.get(key) ?? [];
      entries.push({ ...match, index: position });
      index.set(key, entries);
    });
    return index;
  }, [matches]);
  const selected = matches.length ? active % matches.length : 0;
  function jump(direction: number) {
    const index = (selected + direction + matches.length) % matches.length;
    setActive(index);
    container.current
      ?.querySelector(`[data-match="${index}"]`)
      ?.scrollIntoView({ block: "center", inline: "nearest" });
  }
  function highlighted(text: string, row: number, cell: number) {
    const pieces: React.ReactNode[] = [];
    let offset = 0;
    (indexedMatches.get(`${row}:${cell}`) ?? []).forEach((match) => {
      const index = match.index;
      pieces.push(text.slice(offset, match.start));
      pieces.push(
        <mark
          key={index}
          data-match={index}
          className={
            index === selected
              ? "bg-selection text-selection-foreground"
              : "bg-field text-foreground underline"
          }
        >
          {text.slice(match.start, match.end)}
        </mark>,
      );
      offset = match.end;
    });
    pieces.push(text.slice(offset));
    return pieces;
  }
  function resetSearch() {
    setSearch({ matches: [] });
    setActive(0);
  }
  return (
    <section className="console-window">
      <div className="console-title">
        <h2>Query results</h2>
        <span>{rows.length} loaded</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-3 text-xs">
        <label>
          View{" "}
          <select
            value={view}
            onChange={(event) => {
              setView(event.target.value);
              resetSearch();
            }}
          >
            <option value="console">Console</option>
            <option value="table">Table</option>
          </select>
        </label>
        <label className="flex-1">
          Find in loaded results{" "}
          <input
            maxLength={256}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              resetSearch();
            }}
            className="ml-2"
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={sensitive}
            onChange={(event) => {
              setSensitive(event.target.checked);
              resetSearch();
            }}
          />{" "}
          Case sensitive
        </label>
        <label>
          <input
            type="checkbox"
            checked={regex}
            onChange={(event) => {
              setRegex(event.target.checked);
              resetSearch();
            }}
          />{" "}
          Regex
        </label>
        <button
          disabled={!matches.length}
          onClick={() => jump(-1)}
        >
          Previous match
        </button>
        <button
          disabled={!matches.length}
          onClick={() => jump(1)}
        >
          Next match
        </button>
        <span role="status">
          {matches.length ? selected + 1 : 0} / {matches.length}
          {matches.length === 2000 ? "+" : ""}
        </span>
      </div>
      {term && search.error && (
        <p role="alert" className="p-3 text-sm">
          {search.error}
        </p>
      )}
      <div
        ref={container}
        tabIndex={0}
        aria-label="Insights results"
        className="h-[55vh] min-h-80 overflow-auto text-xs"
      >
        {!rows.length ? (
          <p className="p-6 text-muted">
            Run a query to display results. Completed queries may have no
            matches.
          </p>
        ) : consoleView ? (
          rows.map((row, index) => {
            const time = timestamp(row["@timestamp"] ?? "");
            const severity = formatLog({
              id: String(index),
              time: Number.isFinite(time) ? time : 0,
              ingested: 0,
              stream: "",
              text: row["@message"],
            }).severity;
            return (
              <div
                key={row["@ptr"] ?? index}
                className="flex items-start gap-3 border-b border-border px-3 py-2"
              >
                <pre
                  className="log-message min-w-0 flex-1 whitespace-pre font-mono leading-6"
                  data-severity={severity}
                >
                  {highlighted(cells[index][0], index, 0)}
                </pre>
                {row["@ptr"] && (
                  <button
                    className="sticky right-0 shrink-0"
                    onClick={() => onContext(row["@ptr"])}
                  >
                    View context
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr>
                {fields.map((field) => (
                  <th key={field} className="p-3">
                    {field}
                  </th>
                ))}
                <th className="p-3">Context</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row["@ptr"] ?? index}>
                  {fields.map((field, cell) => (
                    <td
                      key={field}
                      className="whitespace-pre-wrap border-b border-border p-3"
                    >
                      {highlighted(cells[index][cell], index, cell)}
                    </td>
                  ))}
                  <td className="p-3">
                    {row["@ptr"] ? (
                      <button
                        className="underline"
                        onClick={() => onContext(row["@ptr"])}
                      >
                        View context
                      </button>
                    ) : (
                      "Not an individual event"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {!consoleView && view === "console" && rows.length > 0 && (
        <p className="border-t border-border p-3 text-xs text-muted">
          This query returns fields or aggregates rather than messages, so
          results are shown as a table.
        </p>
      )}
    </section>
  );
}
