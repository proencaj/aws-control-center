"use client";

import { useRef, useState } from "react";
import { ActionForm } from "@/components/action-form";

export function ConfirmDelete({
  action,
  resourceName,
  label,
  impact,
  hiddenFields,
}: {
  action: (
    previous: { error?: string },
    formData: FormData,
  ) => Promise<{ error?: string }>;
  resourceName: string;
  label: string;
  impact: string;
  hiddenFields?: Record<string, string>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="font-bold"
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setTyped("")}
        className="console-window m-auto w-full max-w-md text-foreground"
      >
        <p className="console-title">Confirmation required</p>
        <ActionForm action={action} className="space-y-4 p-4">
          {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <h2 className="console-heading">{label}</h2>
          <p className="text-sm">{impact}</p>
          <label className="block space-y-1 text-sm">
            <span>
              Type <code className="font-bold">{resourceName}</code> to confirm
            </span>
            <input
              name="confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              className="w-full"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={typed !== resourceName}
              className="font-bold"
            >
              {label}
            </button>
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}
