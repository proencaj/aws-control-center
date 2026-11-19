import { getCallerIdentity } from "@/lib/sts";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function loadIdentity() {
  try {
    return { identity: await getCallerIdentity() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export default async function Home() {
  const { identity, error } = await loadIdentity();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="console-kicker">00 / Main directory</p>
        <h1 className="console-heading">AWS Control Center</h1>
        <p className="text-sm text-muted">
          Select a service. Inspect resources. Manage your account.
        </p>
      </div>

      {identity ? (
        <section className="console-window">
          <div className="console-title">
            <h2>Account connection</h2>
            <span>Verified / STS</span>
          </div>
          <dl className="divide-y divide-border text-sm">
            <Row label="Account" value={identity.account} />
            <Row label="Identity" value={identity.arn} />
            <Row label="Region" value={identity.region} />
          </dl>
        </section>
      ) : (
        <section className="console-window text-sm">
          <div className="console-title">
            <h2>Account connection</h2>
            <span>Not connected</span>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-muted">{error}</p>
            <h3 className="font-medium">Connection checklist</h3>
            <ol className="list-inside list-decimal space-y-2 text-muted">
              <li>
                Copy <code>.env.example</code> to <code>.env.local</code>.
              </li>
              <li>
                Set <code>AWS_ACCESS_KEY_ID</code>,{" "}
                <code>AWS_SECRET_ACCESS_KEY</code> and <code>AWS_REGION</code>.
                For temporary credentials, also set{" "}
                <code>AWS_SESSION_TOKEN</code>.
              </li>
              <li>Restart Docker Compose, then reload this page.</li>
            </ol>
          </div>
        </section>
      )}

      <section className="console-window" aria-labelledby="service-directory">
        <div className="console-title">
          <h2 id="service-directory">Service directory</h2>
          <span>04 services</span>
        </div>
        <div className="grid md:grid-cols-2">
          <div className="space-y-5 border-b border-border p-5 md:border-r md:border-b-0">
            <div>
              <p className="console-kicker">01 / Compute</p>
              <h3 className="text-lg font-bold">EC2</h3>
              <p className="text-sm text-muted">
                Virtual machines and network access.
              </p>
            </div>
            <ul className="space-y-3 text-sm">
              <li>
                <Link className="underline" href="/ec2">
                  Browse instances →
                </Link>
              </li>
              <li>
                <Link className="underline" href="/ec2/security-groups">
                  Inspect security groups →
                </Link>
              </li>
              <li>
                <Link className="underline" href="/ec2/instances/new">
                  Launch an instance →
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-5 p-5">
            <div>
              <p className="console-kicker">02 / Containers</p>
              <h3 className="text-lg font-bold">ECS</h3>
              <p className="text-sm text-muted">
                Clusters, workloads, and compute capacity.
              </p>
            </div>
            <ul className="space-y-3 text-sm">
              <li>
                <Link className="underline" href="/ecs">
                  Browse clusters →
                </Link>
              </li>
              <li>
                <Link className="underline" href="/ecs/task-definitions">
                  Inspect task definitions →
                </Link>
              </li>
              <li>
                <Link className="underline" href="/ecs/capacity-providers">
                  Manage capacity providers →
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="space-y-3 border-t border-border p-5">
          <p className="console-kicker">03 / CloudWatch Logs</p>
          <h3 className="text-lg font-bold">Logs Monitor</h3>
          <p className="text-sm text-muted">
            Read recent log events and follow new output in a live console.
          </p>
          <Link className="inline-block text-sm underline" href="/logs-monitor">
            Open Logs Monitor →
          </Link>
          <Link
            className="ml-4 inline-block text-sm underline"
            href="/logs-explorer"
          >
            Open Logs Explorer →
          </Link>
        </div>
        <div className="space-y-3 border-t border-border p-5">
          <p className="console-kicker">04 / Object storage</p>
          <h3 className="text-lg font-bold">S3</h3>
          <p className="text-sm text-muted">
            Browse buckets across all regions, inspect objects, and manage their
            storage class.
          </p>
          <Link className="inline-block text-sm underline" href="/s3">
            Browse S3 buckets →
          </Link>
        </div>
        <p className="border-t border-border bg-surface px-5 py-3 text-xs text-muted">
          Regional services use the region selected above. S3 lists buckets
          globally.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
