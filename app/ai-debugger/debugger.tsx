"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileDown } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { useWorkspaceActive } from "@/components/workspace";
import { analyse, type AnalyseState } from "./actions";
import { Fluxogram } from "./fluxogram";
import { takeDebuggerRequest, type DebuggerRequest } from "./handoff";

export function Debugger() {
  const [state, formAction, pending] = useActionState<AnalyseState, FormData>(
    analyse,
    {},
  );
  const [logs, setLogs] = useState("");
  const [sent, setSent] = useState<FormData>();
  const [full, setFull] = useState(false);
  const [errors, setErrors] = useState(false);
  const [language, setLanguage] = useState<DebuggerRequest["language"]>("en");
  const active = useWorkspaceActive();

  // Logs sent from Logs Monitor / Logs Explorer start analysing as soon as this tab shows.
  useEffect(() => {
    if (!active) return;
    const request = takeDebuggerRequest();
    if (!request) return;
    // The handoff is an external store read once on activation; show it before the analysis lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogs(request.logs);
    setFull(request.full);
    setErrors(request.errors);
    setLanguage(request.language);
    const data = new FormData();
    data.set("logs", request.logs);
    data.set("language", request.language);
    if (request.full) data.set("full", "on");
    if (request.errors) data.set("errors", "on");
    startTransition(() => {
      setSent(data);
      formAction(data);
    });
  }, [active, formAction]);

  return (
    <div className="space-y-5">
      <section className="console-window">
        <h2 className="console-title">Logs input</h2>
        <form
          action={(data) => {
            setSent(data);
            formAction(data);
          }}
          className="space-y-4 p-5"
        >
          <textarea
            name="logs"
            aria-label="Logs to analyse"
            value={logs}
            onChange={(event) => setLogs(event.target.value)}
            placeholder="Paste logs here…"
            className="h-[60vh] min-h-80 w-full overflow-auto whitespace-pre p-4 font-mono text-xs leading-6"
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="full"
                checked={full}
                onChange={(event) => setFull(event.target.checked)}
                disabled={pending}
              />
              Full Analysis
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="errors"
                checked={errors}
                onChange={(event) => setErrors(event.target.checked)}
                disabled={pending}
              />
              Filter Errors
            </label>
            <label className="flex items-center gap-2 text-sm">
              Language
              <select
                name="language"
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as DebuggerRequest["language"])
                }
                disabled={pending}
              >
                <option value="en">English</option>
                <option value="pt-br">Português (Brasil)</option>
              </select>
            </label>
            <button className="font-bold" disabled={pending || !logs.trim()}>
              Analyse
            </button>
          </div>
          <p className="text-xs text-muted">
            Logs are sent to the Anthropic API. Remove secrets before analysing.
          </p>
        </form>
      </section>
      <section className="console-window print-area">
        <div className="console-title">
          <h2>Analysis</h2>
          <span>
            {pending
              ? "Analysing…"
              : state.analysis
                ? `${state.errors ? "Errors · " : ""}${state.full ? "Full analysis" : "Summary"}`
                : "Idle"}
          </span>
        </div>
        <div
          aria-live="polite"
          className="space-y-3 p-5 text-sm leading-6 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-bold [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc [&_code]:font-mono [&_code]:text-xs [&_pre]:overflow-auto [&_pre]:p-3"
        >
          {state.analysis && !pending && (
            <div className="flex justify-end print:hidden">
              <CopyButton value={state.analysis} label="Copy markdown" />
            </div>
          )}
          {state.error && (
            <p role="alert" className="font-medium">
              {state.error}
            </p>
          )}
          {state.analysis ? (
            <>
              <Markdown remarkPlugins={[remarkGfm]}>{state.analysis}</Markdown>
              {!pending && (
                <div className="flex justify-end print:hidden">
                  <button
                    type="button"
                    className="btn inline-flex items-center gap-1"
                    onClick={() => window.print()}
                  >
                    <FileDown size={14} /> Export
                  </button>
                </div>
              )}
            </>
          ) : (
            !state.error && (
              <p className="text-muted">
                {pending
                  ? "Claude is reading your logs…"
                  : "The analysis will appear here."}
              </p>
            )
          )}
        </div>
      </section>
      {state.analysis && !pending && sent && <Fluxogram request={sent} />}
    </div>
  );
}
