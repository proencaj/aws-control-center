"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LambdaActionState } from "./actions";

export function EnvironmentEditor({
  variables,
}: {
  variables: Record<string, string>;
}) {
  const [rows, setRows] = useState(() =>
    Object.entries(variables).map(([key, value]) => ({ key, value })),
  );
  const [reveal, setReveal] = useState(false);
  const object = Object.fromEntries(
    rows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]),
  );
  return (
    <fieldset className="group-box space-y-3 p-4">
      <input type="hidden" name="environment" value={JSON.stringify(object)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="font-medium">Environment variables</legend>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={reveal} onChange={(event) => setReveal(event.target.checked)} />
          Reveal values
        </label>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            aria-label={`Environment variable ${index + 1} name`}
            value={row.key}
            placeholder="KEY"
            onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))}
          />
          <input
            aria-label={`Environment variable ${index + 1} value`}
            type={reveal ? "text" : "password"}
            value={row.value}
            placeholder="Value"
            onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}
          />
          <button type="button" onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows((current) => [...current, { key: "", value: "" }])}>
        Add variable
      </button>
    </fieldset>
  );
}

export function InvokeForm({
  action,
  context,
}: {
  action: (previous: LambdaActionState, formData: FormData) => Promise<LambdaActionState>;
  context: { region: string; account: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="region" value={context.region} />
      <input type="hidden" name="account" value={context.account} />
      <label className="block space-y-1 text-sm">
        <span className="font-medium">JSON event</span>
        <textarea name="payload" defaultValue="{}" rows={10} className="w-full font-mono text-xs" spellCheck={false} />
      </label>
      <p className="text-xs text-muted">This synchronously executes $LATEST in the selected account and region.</p>
      <button disabled={pending} className="font-bold">{pending ? "Invoking…" : "Invoke function"}</button>
      {state.error && <p role="alert" className="text-sm font-medium">{state.error}</p>}
      {state.result && (
        <section className="console-window text-sm">
          <div className="console-title">
            <span>Invocation result</span>
            <span>{state.result.functionError ? `Function error / ${state.result.functionError}` : `HTTP ${state.result.statusCode ?? "—"}`}</span>
          </div>
          <dl className="divide-y divide-border">
            <Result label="Request ID" value={state.result.requestId} />
            <Result label="Response payload" value={state.result.payload || "(empty)"} pre />
            <Result label="Last 4 KB of logs" value={state.result.logs || "(no log tail returned)"} pre />
          </dl>
        </section>
      )}
    </form>
  );
}

function Result({ label, value, pre = false }: { label: string; value?: string; pre?: boolean }) {
  return (
    <div className="grid gap-2 p-4 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-all">{pre ? <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs">{value}</pre> : value ?? "—"}</dd>
    </div>
  );
}

export function PendingRefresh({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => router.refresh(), 2500);
    return () => clearTimeout(timer);
  }, [pending, router]);
  return pending ? <p role="status" className="text-xs text-muted">AWS is applying an update. Status refreshes automatically.</p> : null;
}
