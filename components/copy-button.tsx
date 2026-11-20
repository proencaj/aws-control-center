"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn inline-flex items-center gap-1"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={14} /> : <Clipboard size={14} />}
      {copied ? "Copied" : label}
    </button>
  );
}
