"use client";
import { useRef, useState } from "react";
import { ActionForm } from "@/components/action-form";

export const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground";
export const buttonClass =
  "rounded-md border border-border px-3 py-2 text-sm hover:bg-surface disabled:opacity-40";
export type FormAction = (
  previous: { error?: string; message?: string },
  data: FormData,
) => Promise<{ error?: string; message?: string }>;
export function Picker({
  region,
  kind,
  onSelect,
}: {
  region: string;
  kind: string;
  onSelect: (id: string) => void;
}) {
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  const [next, setNext] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  async function load(token?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/ecs/options?${new URLSearchParams({ region, kind, ...(token ? { next: token } : {}) })}`,
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to load resources.");
      setItems(result.resources);
      setNext(result.nextToken);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => load()}
        >
          {busy ? "Loading…" : loaded ? "First page" : "Browse existing"}
        </button>
        {next && (
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={() => load(next)}
          >
            Next page
          </button>
        )}
      </div>
      {loaded && (
        <select
          aria-label={`Choose ${kind}`}
          className={inputClass}
          value=""
          onChange={(e) => {
            if (e.target.value) onSelect(e.target.value);
          }}
        >
          <option value="">
            {items.length ? "Select a resource" : "No resources on this page"}
          </option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      )}
      {error && (
        <p role="alert" className="text-muted">
          {error} You can enter the identifier directly.
        </p>
      )}
    </div>
  );
}
export function ResourceInput({
  region,
  kind,
  name,
  defaultValue = "",
  multiple = false,
}: {
  region: string;
  kind: string;
  name: string;
  defaultValue?: string;
  multiple?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="space-y-2">
      <input
        className={inputClass}
        name={name}
        aria-label={kind}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Picker
        region={region}
        kind={kind}
        onSelect={(id) =>
          setValue(
            multiple
              ? [
                  ...new Set([
                    ...value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                    id,
                  ]),
                ].join(", ")
              : id,
          )
        }
      />
    </div>
  );
}
export function Submit({ children = "Save" }: { children?: React.ReactNode }) {
  return (
    <button className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">
      {children}
    </button>
  );
}
export function JsonForm({
  action,
  initial,
  label = "Save",
  children,
  confirmationName,
  hint,
}: {
  action: FormAction;
  initial: unknown;
  label?: string;
  children?: React.ReactNode;
  confirmationName?: string;
  hint?: string;
}) {
  const [value, setValue] = useState(JSON.stringify(initial, null, 2));
  return (
    <ActionForm action={action} className="space-y-4 text-sm">
      {children}
      {hint && <p className="text-muted">{hint}</p>}
      <label className="block space-y-2">
        <span>Configuration JSON</span>
        <textarea
          aria-label="Configuration JSON"
          name="payload"
          rows={Math.min(22, Math.max(6, value.split("\n").length))}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          className={`${inputClass} font-mono`}
        />
      </label>
      {confirmationName ? (
        <ConfirmSubmit resourceName={confirmationName} label={label} />
      ) : (
        <Submit>{label}</Submit>
      )}
    </ActionForm>
  );
}
// The submit button lives in the dialog but belongs to the same form; validation still runs server-side.
export function ConfirmSubmit({
  resourceName,
  label = "Save changes",
}: {
  resourceName: string;
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          setValue("");
          dialog.current?.showModal();
        }}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        className="m-auto max-w-lg rounded-md border border-border bg-background p-6 text-foreground backdrop:bg-foreground/40"
      >
        <div className="space-y-4">
          <h3 className="font-medium">{label}</h3>
          <p className="text-sm">
            This can change running workloads or remove configuration. Type{" "}
            <strong>{resourceName}</strong> to confirm.
          </p>
          <input
            aria-label="Confirmation"
            name="confirm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
          <div className="flex gap-2">
            <button
              className={buttonClass}
              type="button"
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button
              className={buttonClass}
              disabled={value !== resourceName}
              onClick={() => dialog.current?.close()}
            >
              {label}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
