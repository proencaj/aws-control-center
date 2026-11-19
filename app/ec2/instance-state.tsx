import { Circle, CircleDot, CircleOff, Loader } from "lucide-react";

const icons = {
  running: CircleDot,
  stopped: Circle,
  terminated: CircleOff,
} as const;

export function InstanceState({ state }: { state?: string }) {
  const Icon = icons[state as keyof typeof icons] ?? Loader;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={14} className="text-muted" />
      {state ?? "unknown"}
    </span>
  );
}

export function instanceName(tags?: { Key?: string; Value?: string }[]) {
  return tags?.find((tag) => tag.Key === "Name")?.Value;
}
