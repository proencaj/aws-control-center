import Link from "next/link";
import { bucketRegion, getObject, getVersioning } from "@/lib/s3";
import { attempt } from "@/lib/aws/errors";
import { ErrorNotice } from "@/components/error-notice";
import { ObjectBrowser } from "../../objects";
import { formatSize, objectsUrl, storageName } from "../../options";
import { getCallerIdentity } from "@/lib/sts";

export default async function ObjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ bucket: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bucket } = await params;
  const query = await searchParams;
  const key = typeof query.key === "string" ? query.key : "";
  if (!key) return <ErrorNotice message="An object key is required." />;
  const regionResult = await attempt(bucketRegion(bucket));
  if ("error" in regionResult)
    return <ErrorNotice message={regionResult.error} />;
  const region = regionResult.data;
  const [result, versioning, identity] = await Promise.all([
    attempt(getObject(bucket, region, key)),
    attempt(getVersioning(bucket, region)),
    attempt(getCallerIdentity()),
  ]);
  if ("error" in result) return <ErrorNotice message={result.error} />;
  if ("error" in identity) return <ErrorNotice message={identity.error} />;
  if (!identity.data.account)
    return <ErrorNotice message="AWS did not return an account ID." />;
  const object = result.data;
  const prefix = key.slice(0, key.lastIndexOf("/") + 1);
  const fields: [string, string][] = [
    ["Bucket", bucket],
    ["Object key", key],
    ["AWS region", region],
    ["Size", formatSize(object.ContentLength ?? 0)],
    ["Storage class", storageName(object.StorageClass ?? "STANDARD")],
    ["Content type", object.ContentType ?? "—"],
    ["Last modified (UTC)", object.LastModified?.toISOString() ?? "—"],
    ["ETag", object.ETag ?? "—"],
    ["Version ID", object.VersionId ?? "—"],
    [
      "Encryption",
      object.ServerSideEncryption ??
        (object.SSECustomerAlgorithm ? "SSE-C" : "—"),
    ],
    ["Restore status", restoreLabel(object.Restore)],
  ];
  return (
    <section className="space-y-5">
      <nav
        aria-label="S3 breadcrumbs"
        className="flex flex-wrap gap-2 text-xs normal-case"
      >
        <Link href="/s3" className="underline">
          Buckets
        </Link>
        <span>/</span>
        <Link href={objectsUrl(bucket)} className="underline">
          {bucket}
        </Link>
        <span>/</span>
        <Link href={objectsUrl(bucket, prefix)} className="underline">
          Containing folder
        </Link>
      </nav>
      <div>
        <p className="console-kicker">Object properties</p>
        <h2 className="console-heading">{key.split("/").pop() || key}</h2>
      </div>
      <ObjectBrowser
        bucket={bucket}
        account={identity.data.account}
        prefix={prefix}
        versioning={
          "data" in versioning
            ? (versioning.data.Status ?? "Not enabled")
            : "Unknown"
        }
        objects={[
          {
            key,
            etag: object.ETag ?? "",
            size: object.ContentLength ?? 0,
            storageClass: object.StorageClass ?? "STANDARD",
            modified: object.LastModified?.toISOString() ?? "",
            restoreInProgress: object.Restore?.includes(
              'ongoing-request="true"',
            ),
            restoreExpiry: object.Restore?.match(/expiry-date="([^"]+)"/)?.[1],
          },
        ]}
      />
      <section className="console-window">
        <h3 className="console-title">Object overview</h3>
        <dl className="divide-y divide-border text-sm">
          {fields.map(([label, value]) => (
            <div
              key={label}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_1fr]"
            >
              <dt>{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="console-window">
        <h3 className="console-title">User-defined metadata</h3>
        {Object.keys(object.Metadata ?? {}).length ? (
          <dl className="divide-y divide-border text-sm">
            {Object.entries(object.Metadata ?? {}).map(([name, value]) => (
              <div
                key={name}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_1fr]"
              >
                <dt className="break-all">{name}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="p-4 text-sm text-muted">No user-defined metadata.</p>
        )}
      </section>
    </section>
  );
}

function restoreLabel(value?: string) {
  if (!value) return "Not restored";
  if (value.includes('ongoing-request="true"')) return "Restore in progress";
  const expiry = value.match(/expiry-date="([^"]+)"/)?.[1];
  return expiry
    ? `Restored temporarily until ${new Date(expiry).toISOString()}`
    : "Restored and available";
}
