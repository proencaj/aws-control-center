import Link from "next/link";
import { listBuckets } from "@/lib/s3";
import { attempt } from "@/lib/aws/errors";
import { ErrorNotice } from "@/components/error-notice";
import { objectsUrl } from "./options";
import { BucketSearch } from "./bucket-search";

export default async function BucketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const prefix = typeof params.prefix === "string" ? params.prefix : "";
  const next = typeof params.next === "string" ? params.next : undefined;
  const result = await attempt(listBuckets(prefix, next));
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="console-kicker">All regions</p>
          <h2 className="console-heading">Buckets</h2>
        </div>
        <Link
          href={`/s3?${new URLSearchParams({ ...(prefix ? { prefix } : {}), ...(next ? { next } : {}) })}`}
          className="btn"
        >
          Refresh
        </Link>
      </div>
      <BucketSearch prefix={prefix} />
      {"error" in result ? (
        <ErrorNotice message={result.error} />
      ) : (
        <>
          <div className="console-window overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="border-b border-border bg-surface px-4 py-1 text-left text-xs font-bold">
                {result.data.buckets.length} buckets on this page / General
                purpose
              </caption>
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3">Bucket name</th>
                  <th className="px-4 py-3">AWS region</th>
                  <th className="px-4 py-3">Creation date (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.data.buckets.map((bucket) => (
                  <tr key={bucket.Name}>
                    <td className="px-4 py-3">
                      <Link
                        className="underline"
                        href={objectsUrl(bucket.Name!)}
                      >
                        {bucket.Name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {bucket.BucketRegion ?? "Resolved when opened"}
                    </td>
                    <td className="px-4 py-3">
                      {bucket.CreationDate?.toISOString()
                        .replace("T", " ")
                        .slice(0, 19) ?? "—"}
                    </td>
                  </tr>
                ))}
                {!result.data.buckets.length && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-muted">
                      No buckets returned{prefix ? " for this prefix" : ""}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between text-xs text-muted">
            <span>
              Global bucket list / region selector does not filter these results
            </span>
            <div className="flex gap-4">
              {next && (
                <Link
                  className="underline"
                  href={`/s3?${new URLSearchParams({ prefix })}`}
                >
                  First page
                </Link>
              )}
              {result.data.next && (
                <Link
                  className="underline"
                  href={`/s3?${new URLSearchParams({ prefix, next: result.data.next })}`}
                >
                  Next page →
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
