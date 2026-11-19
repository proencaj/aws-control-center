export async function api<T>(
  region: string,
  input: Record<string, unknown>,
  post = false,
  signal?: AbortSignal,
  keepalive = false,
): Promise<T> {
  const data = { region, ...input };
  const response = await fetch(
    post
      ? "/logs-explorer/data"
      : `/logs-explorer/data?${new URLSearchParams(data as Record<string, string>)}`,
    post
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal,
          keepalive,
          cache: "no-store",
        }
      : { signal, cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "CloudWatch request failed.");
  return result;
}
export function timestamp(value: string) {
  return Date.parse(
    /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(" ", "T") + "Z",
  );
}
export function boundRows(rows: Record<string, string>[]) {
  let size = 0;
  return rows.slice(0, 5000).filter((row) => {
    size += Object.values(row).reduce((n, value) => n + value.length, 0);
    return size <= 2_000_000;
  });
}
