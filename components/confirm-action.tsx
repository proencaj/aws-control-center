"use client";

import { useRef } from "react";
import { ActionForm } from "@/components/action-form";

export function ConfirmAction({
  action,
  label,
  impact,
}: {
  action: (
    previous: { error?: string; message?: string },
    formData: FormData,
  ) => Promise<{ error?: string; message?: string }>;
  label: string;
  impact: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={dialog}
        className="console-window m-auto w-full max-w-md text-foreground"
      >
        <p className="console-title">Confirmation required</p>
        <ActionForm action={action} className="space-y-4 p-4">
          <h2 className="console-heading">{label}</h2>
          <p className="text-sm">{impact}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="font-bold">
              {label}
            </button>
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}
