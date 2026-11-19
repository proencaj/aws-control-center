"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function BucketSearch({ prefix }: { prefix: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(prefix);
  const [pending, startTransition] = useTransition();
  const [typing, setTyping] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    // Don't overwrite newer typing when an earlier navigation finishes.
    if (!timer.current && !pending && input.current) {
      input.current.value = prefix;
      latest.current = prefix;
    }
  }, [prefix, pending]);

  function navigate(value: string) {
    clearTimeout(timer.current);
    timer.current = undefined;
    setTyping(false);
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      if (value) params.set("prefix", value);
      else params.delete("prefix");
      router.replace(
        `/s3${params.size ? `?${params}` : ""}`,
        { scroll: false },
      );
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
        <span className="sr-only">Bucket name prefix</span>
        <input
          ref={input}
          type="search"
          name="prefix"
          defaultValue={prefix}
          placeholder="Find buckets by name prefix"
          className="w-full border border-border bg-background px-3 py-2"
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
