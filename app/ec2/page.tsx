import Link from "next/link";
import { ErrorNotice } from "@/components/error-notice";
import { attempt } from "@/lib/aws/errors";
import { listInstances } from "@/lib/ec2";
import { InstanceState, instanceName } from "./instance-state";

export default async function InstancesPage({
  searchParams,
}: PageProps<"/ec2">) {
  const { q, next } = await searchParams;
  const nameFilter = typeof q === "string" ? q : undefined;
  const nextToken = typeof next === "string" ? next : undefined;
  const result = await attempt(listInstances({ nameFilter, nextToken }));

  return (
    <section className="space-y-4">
      <div className="space-y-2 border-b-4 border-double border-border pb-4">
        <h2 className="console-heading">Instance directory</h2>
        <p className="text-sm text-muted">
          Open an instance to inspect its configuration or change its state.
        </p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 border border-border bg-surface p-4">
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1">
            <span className="console-kicker block">Name filter</span>
            <input
              aria-label="Filter instances by name"
              name="q"
              defaultValue={nameFilter}
              placeholder="Instance name"
              className="rounded-md border border-border bg-transparent px-2 py-1.5 outline-none focus:border-foreground"
            />
          </label>
          <button className="rounded-md border border-border px-3 py-1.5 hover:bg-background">
            Apply filter
          </button>
          {nameFilter && (
            <Link href="/ec2" className="px-2 py-1.5 underline">
              Clear
            </Link>
          )}
        </form>
        <Link
          href="/ec2/instances/new"
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
        >
          Launch instance
        </Link>
      </div>

      {"error" in result ? (
        <ErrorNotice message={result.error} />
      ) : (
        <>
          <div className="console-window overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="border-b border-border bg-surface px-4 py-2 text-left text-xs uppercase tracking-wider">
                Result set / {result.data.instances.length}{" "}
                {result.data.instances.length === 1 ? "instance" : "instances"}{" "}
                on this page
              </caption>
              <thead className="border-b border-border text-muted">
                <tr>
                  {[
                    "Name",
                    "Instance ID",
                    "State",
                    "Type",
                    "AZ",
                    "Public IPv4",
                    "Private IPv4",
                    "Launched",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-2 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.data.instances.map((instance) => (
                  <tr key={instance.InstanceId}>
                    <td className="px-4 py-2">
                      {instanceName(instance.Tags) ?? "-"}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/ec2/instances/${instance.InstanceId}`}
                        className="underline"
                      >
                        {instance.InstanceId}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <InstanceState state={instance.State?.Name} />
                    </td>
                    <td className="px-4 py-2">{instance.InstanceType}</td>
                    <td className="px-4 py-2">
                      {instance.Placement?.AvailabilityZone}
                    </td>
                    <td className="px-4 py-2">
                      {instance.PublicIpAddress ?? "-"}
                    </td>
                    <td className="px-4 py-2">
                      {instance.PrivateIpAddress ?? "-"}
                    </td>
                    <td className="px-4 py-2">
                      {instance.LaunchTime?.toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </td>
                  </tr>
                ))}
                {result.data.instances.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-6 text-center text-muted"
                    >
                      <p className="mb-2 text-xs uppercase tracking-wider">
                        Empty result set
                      </p>
                      <p>
                        {nameFilter
                          ? "No instances match this name. Clear the filter or try another name."
                          : "No instances returned. Launch an instance or select another region."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-xs">
            <span className="mr-auto text-muted">
              {result.data.nextToken
                ? "More instances available"
                : "End of result set"}
            </span>
            {nextToken && (
              <Link
                href={
                  nameFilter
                    ? `/ec2?q=${encodeURIComponent(nameFilter)}`
                    : "/ec2"
                }
                className="underline"
              >
                First page
              </Link>
            )}
            {result.data.nextToken && (
              <Link
                href={`/ec2?${new URLSearchParams({ ...(nameFilter && { q: nameFilter }), next: result.data.nextToken })}`}
                className="underline"
              >
                Next page
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
