"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useState,
} from "react";
import { FileDown, Workflow } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { fluxogram, type FluxogramState } from "./actions";

export function Fluxogram({ request }: { request: FormData }) {
  const [state, formAction, pending] = useActionState<FluxogramState, FormData>(
    fluxogram,
    {},
  );
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState("");
  const diagramId = `flow-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (!state.mermaid) return;
    let current = true;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "strict",
        });
        const { svg } = await mermaid.render(diagramId, state.mermaid!);
        if (current) {
          setSvg(svg);
          setRenderError("");
        }
      })
      .catch((error: unknown) => {
        if (current) {
          setSvg("");
          setRenderError(
            error instanceof Error ? error.message : "Could not draw diagram.",
          );
        }
      });
    return () => {
      current = false;
    };
  }, [state.mermaid, diagramId]);

  function exportPdf() {
    const root = document.documentElement;
    root.dataset.print = "flow";
    window.addEventListener("afterprint", () => delete root.dataset.print, {
      once: true,
    });
    window.print();
  }

  return (
    <section className="console-window print-flow">
      <div className="console-title">
        <h2>Fluxogram</h2>
        <span>{pending ? "Drawing…" : state.mermaid ? "Mermaid" : "Idle"}</span>
      </div>
      <div className="space-y-3 p-5 text-sm">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            className="btn inline-flex items-center gap-1"
            disabled={pending}
            onClick={() => startTransition(() => formAction(request))}
          >
            <Workflow size={14} /> Fluxogram
          </button>
          {state.mermaid && !pending && (
            <>
              <CopyButton value={state.mermaid} label="Copy mermaid" />
              <button
                type="button"
                className="btn inline-flex items-center gap-1"
                disabled={!svg}
                onClick={exportPdf}
              >
                <FileDown size={14} /> Export PDF
              </button>
            </>
          )}
        </div>
        {state.error && (
          <p role="alert" className="font-medium">
            {state.error}
          </p>
        )}
        {renderError && (
          <div className="space-y-2">
            <p role="alert" className="font-medium">
              Could not draw the diagram: {renderError}
            </p>
            <pre className="overflow-auto p-3 font-mono text-xs">
              {state.mermaid}
            </pre>
          </div>
        )}
        {svg && !pending && (
          <div
            className="overflow-auto bg-white p-4 text-black [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        {!state.mermaid && !state.error && (
          <p className="text-muted">
            {pending
              ? "Claude is drawing the flow of events…"
              : "Draw a visual aid of the logs to explain the errors to others."}
          </p>
        )}
      </div>
    </section>
  );
}
