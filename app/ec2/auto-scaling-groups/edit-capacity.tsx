"use client";

import { useRef, useState } from "react";
import { ActionForm } from "@/components/action-form";

type State = { error?: string; message?: string };

export function EditCapacity({
  name,
  min,
  desired,
  max,
  action,
}: {
  name: string;
  min: number;
  desired: number;
  max: number;
  action: (previous: State, formData: FormData) => Promise<State>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState({ min, desired, max });
  const valid =
    Object.values(values).every((v) => Number.isInteger(v) && v >= 0) &&
    values.min <= values.desired &&
    values.desired <= values.max;
  const field = (key: "min" | "desired" | "max") => ({
    name: key,
    type: "number",
    min: 0,
    step: 1,
    className: "w-full",
    value: Number.isNaN(values[key]) ? "" : values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues({ ...values, [key]: event.target.valueAsNumber }),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValues({ min, desired, max });
          dialog.current?.showModal();
        }}
      >
        Edit
      </button>
      <dialog
        ref={dialog}
        className="console-window m-auto w-[calc(100%_-_2rem)] max-w-[28rem] text-foreground"
      >
        <p className="console-title">Group size</p>
        <ActionForm action={action} className="space-y-4 p-4 text-sm">
          <p>
            Set the size of <strong>{name}</strong> by changing the desired
            capacity. You can also set minimum and maximum limits.
          </p>
          <label className="block space-y-1">
            <span className="font-bold">Desired capacity type</span>
            <select disabled className="w-full" defaultValue="units">
              <option value="units">Units (number of instances)</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-bold">Desired capacity</span>
            <input {...field("desired")} />
          </label>
          <fieldset className="group-box space-y-2 p-3">
            <legend className="px-1 font-bold">Scaling limits</legend>
            <p className="text-muted">
              Set limits on how much the desired capacity can be increased or
              decreased.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <label className="block space-y-1">
                <span className="font-bold">Min desired capacity</span>
                <input {...field("min")} />
                <span className="block text-xs text-muted">
                  Equal to or less than desired capacity
                </span>
              </label>
              <label className="block space-y-1">
                <span className="font-bold">Max desired capacity</span>
                <input {...field("max")} />
                <span className="block text-xs text-muted">
                  Equal to or greater than desired capacity
                </span>
              </label>
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()}>
              Close
            </button>
            <button type="submit" disabled={!valid} className="font-bold">
              Update
            </button>
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}
