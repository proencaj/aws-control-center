"use client";

import { useRef, useState } from "react";
import { ActionForm } from "@/components/action-form";

export function ConfirmDelete({
  action,
  resourceName,
  label,
  impact,
}: {
  action: (
    previous: { error?: string },
    formData: FormData,
  ) => Promise<{ error?: string }>;
  resourceName: string;
  label: string;
  impact: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="rounded-md border border-foreground px-3 py-1.5 text-sm font-medium hover:bg-surface"
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setTyped("")}
        className="console-window m-auto w-full max-w-md bg-background p-6 text-foreground backdrop:bg-foreground/40"
      >
        <ActionForm action={action} className="space-y-4">
          <p className="console-kicker">Confirmation required</p>
          <h2 className="console-heading">{label}</h2>
          <p className="text-sm text-muted">{impact}</p>
          <label className="block space-y-1 text-sm">
            <span>
              Type <code className="font-medium">{resourceName}</code> to
              confirm
            </span>
            <input
              name="confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 outline-none focus:border-foreground"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={typed !== resourceName}
              className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40"
            >
              {label}
            </button>
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}
