import Link from "next/link";
import { ErrorNotice } from "@/components/error-notice";
export const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground";
export const buttonClass =
  "inline-flex rounded-md border border-border px-3 py-2 text-sm hover:bg-surface";
export function Heading({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-double border-border pb-4">
      <h2 className="console-heading">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm text-muted">
        {label}
        {children}
      </label>
    </div>
  );
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="console-window">
      <h3 className="console-title">{title}</h3>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}
export function Details({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="console-window divide-y divide-border text-sm">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_1fr]"
        >
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-all">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function JsonDetails({
  value,
  label = "Full configuration",
}: {
  value: unknown;
  label?: string;
}) {
  return (
    <details className="rounded-md border border-border p-4 text-sm">
      <summary className="cursor-pointer font-medium uppercase">
        {label} / JSON
      </summary>
      <pre className="mt-4 overflow-auto whitespace-pre-wrap break-all text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
export function Table({
  headers,
  rows,
  empty = "No resources found in this region.",
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  return (
    <div className="console-window overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="border-b border-border bg-surface px-4 py-2 text-left text-xs uppercase tracking-wider">
          Result set / {rows.length} {rows.length === 1 ? "record" : "records"}{" "}
          on this page
        </caption>
        <thead className="border-b border-border text-muted">
          <tr>
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 align-top">
                    {cell ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                className="p-8 text-center text-muted"
                colSpan={headers.length}
              >
                <p className="mb-2 text-xs uppercase tracking-wider">
                  Empty result set
                </p>
                <p>{empty}</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({
  base,
  nextToken,
  current,
  query = {},
  tokenKey = "next",
}: {
  base: string;
  nextToken?: string;
  current?: string;
  query?: Record<string, string>;
  tokenKey?: string;
}) {
  const clean = { ...query };
  delete clean[tokenKey];
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-3 text-xs">
      <p className="text-muted">
        {nextToken ? "More records available" : "End of result set"}
      </p>
      <div className="flex gap-4">
        {current && (
          <Link
            className="underline"
            href={`${base}?${new URLSearchParams(clean)}`}
          >
            ← First page
          </Link>
        )}
        {nextToken && (
          <Link
            className="underline"
            href={`${base}?${new URLSearchParams({ ...clean, [tokenKey]: nextToken })}`}
          >
            Next page →
          </Link>
        )}
      </div>
    </div>
  );
}
export function Failures({
  failures,
}: {
  failures?: { arn?: string; reason?: string; detail?: string }[];
}) {
  return (
    <>
      {failures?.map((f, i) => (
        <ErrorNotice
          key={i}
          message={`${f.arn ?? "Resource"}: ${f.reason ?? "Failed"} ${f.detail ?? ""}`}
        />
      ))}
    </>
  );
}
export function ResourceLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="break-all underline underline-offset-2">
      {children}
    </Link>
  );
}
export function Tabs({
  base,
  items,
  active,
}: {
  base: string;
  items: [string, string][];
  active: string;
}) {
  return (
    <nav className="console-tabs text-sm">
      {items.map(([key, label]) => (
        <Link
          aria-current={active === key ? "page" : undefined}
          key={key}
          href={`${base}${key ? `/${key}` : ""}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
export const shortId = (value?: string) => value?.split("/").pop() ?? "";
export const encoded = encodeURIComponent;
