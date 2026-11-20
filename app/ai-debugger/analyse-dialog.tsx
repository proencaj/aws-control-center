"use client";

import { useRef, useState } from "react";
import { Bot } from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { sendToDebugger, type DebuggerRequest } from "./handoff";

const MAX_CHARACTERS = 400_000;
type Range = "last" | "first" | "all";

export function AnalyseDialog({
  lines,
  onOpen,
}: {
  lines: string[];
  onOpen: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { openService } = useWorkspace();
  const [range, setRange] = useState<Range>("last");
  const [count, setCount] = useState(200);
  const [full, setFull] = useState(false);
  const [errors, setErrors] = useState(false);
  const [language, setLanguage] =
    useState<DebuggerRequest["language"]>("en");

  const selected =
    range === "all"
      ? lines
      : range === "first"
        ? lines.slice(0, count)
        : lines.slice(-count);
  const logs = selected.join("\n");
  const tooLong = logs.length > MAX_CHARACTERS;

  function analyse(event: React.FormEvent) {
    event.preventDefault();
    sendToDebugger({ logs, full, errors, language });
    dialog.current?.close();
    openService("/ai-debugger");
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1"
        disabled={!lines.length}
        onClick={() => {
          onOpen();
          dialog.current?.showModal();
        }}
      >
        <Bot size={14} /> Analyse
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="analyse-title"
        className="console-window m-auto w-[min(36rem,calc(100%-2rem))] text-left text-foreground"
      >
        <div className="console-title">
          <h2 id="analyse-title">Analyse with AI Debugger</h2>
          <button type="button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        <form onSubmit={analyse} className="space-y-5 p-5 text-sm">
          <fieldset className="group-box space-y-2 p-3">
            <legend className="console-kicker">Context</legend>
            <div className="flex flex-wrap items-center gap-4">
              {(
                [
                  ["last", "Last lines"],
                  ["first", "First lines"],
                  ["all", "All lines"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="range"
                    checked={range === value}
                    onChange={() => setRange(value)}
                  />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-2">
                Lines
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, lines.length)}
                  required
                  value={count}
                  disabled={range === "all"}
                  onChange={(event) => setCount(Number(event.target.value))}
                  className="w-24"
                />
              </label>
            </div>
            <p role="status" className="text-xs text-muted">
              Sending {selected.length} of {lines.length} lines /{" "}
              {logs.length.toLocaleString()} characters
            </p>
            {tooLong && (
              <p role="alert" className="text-xs font-bold">
                Too long. Send at most {MAX_CHARACTERS.toLocaleString()}{" "}
                characters.
              </p>
            )}
          </fieldset>
          <fieldset className="group-box flex flex-wrap items-center gap-4 p-3">
            <legend className="console-kicker">Analysis</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={full}
                onChange={(event) => setFull(event.target.checked)}
              />
              Full Analysis
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={errors}
                onChange={(event) => setErrors(event.target.checked)}
              />
              Filter Errors
            </label>
            <label className="flex items-center gap-2">
              Language
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as DebuggerRequest["language"])
                }
              >
                <option value="en">English</option>
                <option value="pt-br">Português (Brasil)</option>
              </select>
            </label>
          </fieldset>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              Logs are sent to the Anthropic API.
            </p>
            <button className="font-bold" disabled={!selected.length || tooLong}>
              Analyse
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
