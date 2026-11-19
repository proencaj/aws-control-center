"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

export function FilterSearch({
  param,
  value,
  label,
  placeholder,
}: {
  param: string;
  value: string;
  label: string;
  placeholder: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(value);
  const [pending, startTransition] = useTransition();
  const [typing, setTyping] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    // Don't overwrite newer typing when an earlier navigation finishes.
    if (!timer.current && !pending && input.current) {
      input.current.value = value;
      latest.current = value;
    }
  }, [value, pending]);

  function navigate(next: string) {
    clearTimeout(timer.current);
    timer.current = undefined;
    setTyping(false);
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      if (next) params.set(param, next);
      else params.delete(param);
      // A new filter invalidates any pagination token.
      params.delete("next");
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, {
        scroll: false,
      });
    });
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(latest.current);
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <input
          ref={input}
          type="search"
          name={param}
          defaultValue={value}
          placeholder={placeholder}
          className="w-full"
          onChange={(event) => {
            latest.current = event.target.value;
            clearTimeout(timer.current);
            setTyping(true);
            timer.current = setTimeout(() => navigate(latest.current), 300);
          }}
        />
      </label>
      <button
        type="button"
        className="px-3 py-2 underline"
        onClick={() => {
          if (input.current) input.current.value = "";
          latest.current = "";
          navigate("");
        }}
      >
        Clear
      </button>
      <span role="status" className="text-xs text-muted">
        {typing || pending ? "Filtering…" : ""}
      </span>
    </form>
  );
}
