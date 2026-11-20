"use client";

import { useEffect, useState } from "react";

type Metric = "available" | "in-flight";

export function AnimatedCount({
  region,
  queueName,
  metric,
  value,
}: {
  region: string;
  queueName: string;
  metric: Metric;
  value: string;
}) {
  const [transition, setTransition] = useState<{
    previous: string;
    version: number;
  }>();

  useEffect(() => {
    if (document.documentElement.dataset.theme !== "apple") return;
    const storageKey = `aws-control-center.sqs-count.${region}.${queueName}.${metric}`;
    const previous = sessionStorage.getItem(storageKey);
    sessionStorage.setItem(storageKey, value);
    if (
      previous !== null &&
      previous !== value &&
      /^\d+$/.test(previous) &&
      /^\d+$/.test(value)
    ) {
      const timer = window.setTimeout(() => {
        setTransition((current) => ({
          previous,
          version: (current?.version ?? 0) + 1,
        }));
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [metric, queueName, region, value]);

  return (
    <span
      className={`sqs-count${transition ? " sqs-count-changing" : ""}`}
      aria-label={value}
    >
      <span
        key={`${transition?.version ?? 0}-${value}`}
        className="sqs-count-current"
        aria-hidden="true"
      >
        {value}
      </span>
      {transition && (
        <span
          key={`previous-${transition.version}-${transition.previous}`}
          className="sqs-count-previous"
          aria-hidden="true"
        >
          {transition.previous}
        </span>
      )}
    </span>
  );
}
