import Link from "next/link";
import { FilterSearch } from "@/components/filter-search";
import { ErrorNotice } from "@/components/error-notice";
import { getRegion } from "@/lib/aws/clients";
import { attempt } from "@/lib/aws/errors";
import { listFunctions } from "@/lib/lambda";

function listUrl(query: string, next?: string) {
  const params = new URLSearchParams({ ...(query ? { q: query } : {}), ...(next ? { next } : {}) });
  return `/lambda${params.size ? `?${params}` : ""}`;
}

export default async function FunctionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const next = typeof params.next === "string" ? params.next : undefined;
  const region = await getRegion();
  const result = await attempt(listFunctions(region, next));
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="console-kicker">Functions / {region}</p>
          <h2 className="console-heading">Function directory</h2>
        </div>
        <div className="flex gap-2">
          <Link className="btn" href={listUrl(query, next)}>Refresh</Link>
          <Link className="btn font-bold" href="/lambda/new">Create function</Link>
        </div>
      </div>
      <div className="group-box space-y-1 p-3">
        <FilterSearch param="q" value={query} label="Filter functions" placeholder="Filter this page by function name" />
        <p className="text-xs text-muted">The filter applies to the current AWS result page.</p>
      </div>
      {"error" in result ? <ErrorNotice message={result.error} /> : (
        <>
          <div className="console-window overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="border-b border-border bg-surface px-4 py-1 text-left text-xs font-bold">
                {result.data.functions.filter((item) => item.FunctionName?.toLowerCase().includes(query.toLowerCase())).length} functions shown
              </caption>
              <thead className="border-b border-border text-muted"><tr>
                <th className="px-4 py-3">Function name</th><th className="px-4 py-3">Package</th><th className="px-4 py-3">Runtime</th><th className="px-4 py-3">Memory</th><th className="px-4 py-3">Last modified</th><th className="px-4 py-3">Description</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {result.data.functions.filter((item) => item.FunctionName?.toLowerCase().includes(query.toLowerCase())).map((item) => (
                  <tr key={item.FunctionArn}>
                    <td className="px-4 py-3"><Link className="underline" href={`/lambda/functions/${encodeURIComponent(item.FunctionName!)}`}>{item.FunctionName}</Link></td>
                    <td className="px-4 py-3">{item.PackageType ?? "Zip"}</td>
                    <td className="px-4 py-3">{item.Runtime ?? "—"}</td>
                    <td className="px-4 py-3">{item.MemorySize ? `${item.MemorySize} MB` : "—"}</td>
                    <td className="px-4 py-3">{item.LastModified ?? "—"}</td>
                    <td className="max-w-72 truncate px-4 py-3" title={item.Description}>{item.Description || "—"}</td>
                  </tr>
                ))}
                {!result.data.functions.some((item) => item.FunctionName?.toLowerCase().includes(query.toLowerCase())) && <tr><td colSpan={6} className="p-8 text-center text-muted">{query ? "No functions on this page match the filter." : "No functions exist in this region."}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-4 text-xs">
            {next && <Link className="underline" href={listUrl(query)}>First page</Link>}
            {result.data.nextToken && <Link className="underline" href={listUrl(query, result.data.nextToken)}>Next page →</Link>}
          </div>
        </>
      )}
    </section>
  );
}
