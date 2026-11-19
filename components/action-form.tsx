"use client";

import { useActionState } from "react";

type State = { error?: string; message?: string };

export function ActionForm({
  action,
  children,
  className,
}: {
  action: (previous: State, formData: FormData) => Promise<State>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {pending && (
        <p role="status" className="mt-2 text-sm text-muted">
          Submitting…
        </p>
      )}
      {state.message && (
        <p role="status" className="mt-2 text-sm">
          {state.message}
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-2 text-sm font-medium">
          {state.error}
        </p>
      )}
    </form>
  );
}
