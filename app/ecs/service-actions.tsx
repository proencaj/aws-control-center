"use client";

import { useRef, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { ConfirmAction } from "@/components/confirm-action";
import type { FormAction } from "./controls";

export function ServiceActions({
  serviceName,
  desiredCount,
  daemon,
  setDesiredCount,
  redeploy,
  stopAll,
}: {
  serviceName: string;
  desiredCount: number;
  daemon: boolean;
  setDesiredCount: FormAction;
  redeploy: FormAction;
  stopAll: FormAction;
}) {
  const countDialog = useRef<HTMLDialogElement>(null);
  const [count, setCount] = useState(String(desiredCount));
  const valid = count !== "" && Number.isInteger(Number(count));

  return (
    <div className="flex flex-wrap gap-2">
      {!daemon && (
        <>
          <button
            type="button"
            onClick={() => {
              setCount(String(desiredCount));
              countDialog.current?.showModal();
            }}
          >
            Set desired count
          </button>
          <dialog
            ref={countDialog}
            className="console-window m-auto w-full max-w-md text-foreground"
          >
            <p className="console-title">Set desired count</p>
            <ActionForm action={setDesiredCount} className="space-y-4 p-4">
              <p className="text-sm">
                Service <strong>{serviceName}</strong>
              </p>
              <input
                type="hidden"
                name="payload"
                value={JSON.stringify({ desiredCount: Number(count) })}
              />
              <label className="block space-y-1 text-sm">
                <span>Desired count</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                  className="w-full"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => countDialog.current?.close()}
                >
                  Cancel
                </button>
                <button type="submit" disabled={!valid} className="font-bold">
                  Update
                </button>
              </div>
            </ActionForm>
          </dialog>
        </>
      )}
      <ConfirmAction
        action={redeploy}
        label="Force new deployment"
        impact={
          <>
            Replaces every running task of <strong>{serviceName}</strong> with a
            new one, using the current task definition.
          </>
        }
      />
      {!daemon && (
        <ConfirmAction
          action={stopAll}
          label="Stop all tasks"
          impact={
            <>
              Stops every task of <strong>{serviceName}</strong> by setting its
              desired count to zero.
            </>
          }
        />
      )}
    </div>
  );
}
