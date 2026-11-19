export const storageClasses = [
  "STANDARD",
  "INTELLIGENT_TIERING",
  "STANDARD_IA",
  "ONEZONE_IA",
  "GLACIER_IR",
  "GLACIER",
  "DEEP_ARCHIVE",
] as const;
export const storageInfo: Record<
  (typeof storageClasses)[number],
  { name: string; description: string }
> = {
  STANDARD: {
    name: "Standard",
    description: "Frequent access with immediate retrieval.",
  },
  INTELLIGENT_TIERING: {
    name: "Intelligent-Tiering",
    description:
      "Automatically moves eligible objects between access tiers. Monitoring charges may apply.",
  },
  STANDARD_IA: {
    name: "Standard-IA",
    description:
      "Infrequent access, immediate retrieval. Retrieval and minimum storage charges apply.",
  },
  ONEZONE_IA: {
    name: "One Zone-IA",
    description:
      "Infrequent access in a single Availability Zone. Suitable for data you can recreate.",
  },
  GLACIER_IR: {
    name: "Glacier Instant Retrieval",
    description:
      "Archive storage with immediate access. Retrieval and minimum storage charges apply.",
  },
  GLACIER: {
    name: "Glacier Flexible Retrieval",
    description:
      "Archived objects must be restored before they can be read. Retrieval takes time and may incur charges.",
  },
  DEEP_ARCHIVE: {
    name: "Glacier Deep Archive",
    description:
      "Long-term archive. Restore is required before reading; retrieval can take hours.",
  },
};
export function storageName(value: string) {
  return storageInfo[value as keyof typeof storageInfo]?.name ?? value;
}
export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** power).toFixed(1)} ${units[power - 1]}`;
}
export function objectsUrl(bucket: string, prefix = "", next?: string) {
  const params = new URLSearchParams();
  if (prefix) params.set("prefix", prefix);
  if (next) params.set("next", next);
  return `/s3/${encodeURIComponent(bucket)}${params.size ? `?${params}` : ""}`;
}
