import Link from "next/link";
import { getRegion } from "@/lib/aws/clients";
import { getCallerIdentity } from "@/lib/sts";
export default async function EcsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const region = await getRegion();
  try {
    await getCallerIdentity();
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "CredentialsProviderError",
        "InvalidClientTokenId",
        "ExpiredToken",
        "ExpiredTokenException",
        "UnrecognizedClientException",
      ].includes(error.name)
    ) {
      return (
        <section className="console-window max-w-2xl">
          <div className="console-title">
            02 / Containers — Connection required
          </div>
          <div className="space-y-4 p-6">
            <h1 className="console-heading">Connect your AWS account</h1>
            <p className="text-sm text-muted">
              Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION in
              .env.local. For temporary credentials, also set AWS_SESSION_TOKEN.
              Restart Docker Compose after changing credentials.
            </p>
            <Link href="/" className="inline-block text-sm underline">
              Open connection checklist →
            </Link>
            <p className="text-sm text-muted">
              Use a dedicated sandbox account for management operations.
            </p>
          </div>
        </section>
      );
    }
  }
  return (
    <div className="space-y-8">
      <div className="console-window">
        <div className="console-title">
          <span>02 / Containers</span>
          <Link href="/" className="underline">
            Directory
          </Link>
        </div>
        <div className="space-y-2 p-5">
          <h1 className="console-heading">ECS / Workload manager</h1>
          <p className="text-sm text-muted">
            Inspect clusters, deploy services, and manage container capacity.
          </p>
          <p className="console-kicker">Region / {region}</p>
        </div>
        <nav aria-label="ECS resources" className="console-tabs text-sm">
          <Link href="/ecs">Clusters</Link>
          <Link href="/ecs/task-definitions">Task definitions</Link>
          <Link href="/ecs/capacity-providers">Capacity providers</Link>
        </nav>
      </div>
      <div key={region}>{children}</div>
    </div>
  );
}
