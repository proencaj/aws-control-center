import Link from "next/link";
import { FilterSearch } from "@/components/filter-search";
import { ErrorNotice } from "@/components/error-notice";
import { getRegion } from "@/lib/aws/clients";
import { attempt } from "@/lib/aws/errors";
import { listQueues, queueNameFromUrl } from "@/lib/sqs";
import { AnimatedCount } from "./animated-count";

function listUrl(query: string, next?: string) {
  const params = new URLSearchParams({ ...(query ? { q: query } : {}), ...(next ? { next } : {}) });
  return `/sqs${params.size ? `?${params}` : ""}`;
}

export default async function QueuesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const next = typeof params.next === "string" ? params.next : undefined;
  const region = await getRegion();
  const result = await attempt(listQueues(region, query, next));
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="console-kicker">Queues / {region}</p><h2 className="console-heading">Queue directory</h2></div><div className="flex gap-2"><Link className="btn" href={listUrl(query, next)}>Refresh</Link><Link className="btn font-bold" href="/sqs/new">Create queue</Link></div></div>
    <div className="group-box space-y-1 p-3"><FilterSearch param="q" value={query} label="Queue name prefix" placeholder="Search AWS by queue name prefix" /><p className="text-xs text-muted">SQS applies this prefix before returning the page.</p></div>
    {"error" in result ? <ErrorNotice message={result.error} /> : <>
      <div className="console-window overflow-x-auto"><table className="w-full text-left text-sm"><caption className="border-b border-border bg-surface px-4 py-1 text-left text-xs font-bold">{result.data.queues.length} queues</caption><thead className="border-b border-border text-muted"><tr><th className="px-4 py-3">Queue name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3 text-right">In flight (processing)</th><th className="px-4 py-3">Queue URL</th></tr></thead><tbody className="divide-y divide-border">{result.data.queues.map(({ queueUrl, attributes }) => { const name = queueNameFromUrl(queueUrl); const available = attributes?.ApproximateNumberOfMessages ?? "—"; const inFlight = attributes?.ApproximateNumberOfMessagesNotVisible ?? "—"; return <tr key={queueUrl}><td className="px-4 py-3"><Link className="underline" href={`/sqs/queues/${encodeURIComponent(name)}`}>{name}</Link></td><td className="px-4 py-3">{attributes?.FifoQueue === "true" || name.endsWith(".fifo") ? "FIFO" : "Standard"}</td><td className="px-4 py-3 text-right tabular-nums"><AnimatedCount region={region} queueName={name} metric="available" value={available} /></td><td className="px-4 py-3 text-right tabular-nums"><AnimatedCount region={region} queueName={name} metric="in-flight" value={inFlight} /></td><td className="break-all px-4 py-3 font-mono text-xs">{queueUrl}</td></tr>; })}{!result.data.queues.length && <tr><td colSpan={5} className="p-8 text-center text-muted">No queues match this prefix in the selected region.</td></tr>}</tbody></table></div>
      <div className="flex justify-end gap-4 text-xs">{next && <Link className="underline" href={listUrl(query)}>First page</Link>}{result.data.nextToken && <Link className="underline" href={listUrl(query, result.data.nextToken)}>Next page →</Link>}</div>
    </>}
  </section>;
}
