import { getCallerIdentity } from "@/lib/sts";
import Link from "next/link";
import { Server, Container, ScrollText, HardDrive } from "lucide-react";

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
      <div className="directory-intro space-y-2">
        <p className="console-kicker">Your workspace</p>
        <h1 className="console-heading">AWS Control Center</h1>
        <p className="text-sm text-muted">
          Your resources, all in one place.
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
              <li>
                Or copy <code>accounts.example.json</code> to{" "}
                <code>accounts.json</code> and add one entry per account. It
                replaces the variables above.
              </li>
              <li>Restart Docker Compose, then reload this page.</li>
            </ol>
          </div>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="service-directory">
        <div className="flex items-center justify-between">
          <h2 id="service-directory" className="text-lg font-semibold">Services</h2>
          <span className="text-xs text-muted">Your AWS workspace</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { name: "EC2", category: "Compute", description: "Virtual machines, capacity, and network access.", icon: Server, links: [["Instances", "/ec2"], ["Security groups", "/ec2/security-groups"], ["Launch instance", "/ec2/instances/new"]] },
            { name: "ECS", category: "Containers", description: "Clusters, workloads, and compute capacity.", icon: Container, links: [["Clusters", "/ecs"], ["Task definitions", "/ecs/task-definitions"], ["Capacity providers", "/ecs/capacity-providers"]] },
            { name: "CloudWatch Logs", category: "Observability", description: "Follow live output and explore your application logs.", icon: ScrollText, links: [["Logs Monitor", "/logs-monitor"], ["Logs Explorer", "/logs-explorer"]] },
            { name: "S3", category: "Storage", description: "Buckets, objects, and storage classes across all regions.", icon: HardDrive, links: [["Buckets", "/s3"]] },
          ].map(({ name, category, description, icon: Icon, links }) => (
            <article key={name} className="service-card" data-service={category}>
              <div className="flex items-center gap-3">
                <span className="service-icon"><Icon size={22} aria-hidden /></span>
                <div><p className="console-kicker">{category}</p><h3 className="text-lg font-semibold">{name}</h3></div>
              </div>
              <p className="text-sm text-muted">{description}</p>
              <ul className="mt-auto flex flex-wrap gap-x-5 gap-y-3 pt-2 text-sm">
                {links.map(([label, href]) => <li key={href}><Link className="inline-flex items-center gap-1 hover:underline" href={href}>{label}</Link></li>)}
              </ul>
            </article>
          ))}
        </div>
        <p className="text-xs text-muted">Regional services use the region selected above. S3 lists buckets globally.</p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="break-all font-mono">{value}</dd>
    </div>
  );
}
