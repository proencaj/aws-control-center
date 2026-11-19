import Link from "next/link";
import { bucketRegion, getVersioning, listObjects } from "@/lib/s3";
import { attempt } from "@/lib/aws/errors";
import { ErrorNotice } from "@/components/error-notice";
import { ObjectBrowser } from "../objects";
import { objectsUrl } from "../options";

export default async function BucketPage({
  params,
  searchParams,
}: {
  params: Promise<{ bucket: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bucket } = await params;
  const query = await searchParams;
  const prefix = typeof query.prefix === "string" ? query.prefix : "";
  const next = typeof query.next === "string" ? query.next : undefined;
  const regionResult = await attempt(bucketRegion(bucket));
  if ("error" in regionResult)
    return <ErrorNotice message={regionResult.error} />;
  const region = regionResult.data;
  const [result, versioning] = await Promise.all([
    attempt(listObjects(bucket, region, prefix, next)),
    attempt(getVersioning(bucket, region)),
  ]);
  const versionStatus =
    "data" in versioning
      ? (versioning.data.Status ?? "Not enabled")
      : "Unknown";
  const crumbs = [...prefix.matchAll(/\//g)].map((match) => ({
    prefix: prefix.slice(0, match.index! + 1),
    name: prefix.slice(0, match.index).split("/").pop() || "/",
  }));
  return (
    <section className="space-y-4">
      <nav
        aria-label="S3 breadcrumbs"
        className="flex flex-wrap gap-2 text-xs normal-case"
      >
        <Link href="/s3" className="underline">
          Buckets
        </Link>
        <span>/</span>
        <Link className="underline" href={objectsUrl(bucket)}>
          {bucket}
        </Link>
        {crumbs.map((crumb) => (
          <span key={crumb.prefix} className="flex gap-2">
            <span>/</span>
            <Link className="underline" href={objectsUrl(bucket, crumb.prefix)}>
              {crumb.name}
            </Link>
          </span>
        ))}
      </nav>
      <div className="space-y-1">
        <h2 className="console-heading">{bucket}</h2>
        <p className="console-kicker">
          {region} / Versioning: {versionStatus}
        </p>
      </div>
      <div className="border-b border-border pb-2 text-sm font-semibold">
        Objects
      </div>
      <form className="flex flex-wrap gap-2 text-sm">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Object key prefix</span>
          <input
            name="prefix"
            defaultValue={prefix}
            placeholder="Find objects by key prefix"
            className="w-full border border-border bg-background px-3 py-2"
          />
        </label>
        <button className="border border-border px-3 py-2 hover:bg-surface">
          Find objects
        </button>
        <Link
          href={objectsUrl(bucket, prefix, next)}
          className="border border-border px-3 py-2 hover:bg-surface"
        >
          Refresh
        </Link>
      </form>
      {"error" in result ? (
        <ErrorNotice message={result.error} />
      ) : (
        <>
          <ObjectBrowser
            key={`${bucket}:${prefix}:${next ?? ""}`}
            bucket={bucket}
            prefix={prefix}
            versioning={versionStatus}
            folders={result.data.folders}
            objects={result.data.objects.map((item) => ({
              key: item.Key!,
              size: item.Size ?? 0,
              etag: item.ETag ?? "",
              storageClass: item.StorageClass ?? "STANDARD",
              modified: item.LastModified?.toISOString() ?? "",
            }))}
          />
          <div className="flex justify-between gap-4 text-xs text-muted">
            <span>
              Folders open a prefix. Actions affect selected objects only.
            </span>
            <div className="flex gap-4">
              {next && (
                <Link href={objectsUrl(bucket, prefix)} className="underline">
                  First page
                </Link>
              )}
              {result.data.next && (
                <Link
                  href={objectsUrl(bucket, prefix, result.data.next)}
                  className="underline"
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
