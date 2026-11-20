import Link from "next/link";
import { getRegion } from "@/lib/aws/clients";

export default async function EcrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const region = await getRegion();
  return (
    <div className="space-y-8">
      <section className="console-window">
        <div className="console-title">
          <span>05 / Container registry</span>
          <Link className="underline" href="/">
            Directory
          </Link>
        </div>
        <div className="space-y-2 p-5">
          <h1 className="console-heading">Elastic Container Registry</h1>
          <p className="text-sm text-muted">
            Store private container images, manage tags, and copy commands for
            Docker pushes.
          </p>
          <p className="console-kicker">Region / {region}</p>
        </div>
        <nav aria-label="ECR resources" className="console-tabs text-sm">
          <Link href="/ecr">Private repositories</Link>
        </nav>
      </section>
      <div key={region}>{children}</div>
    </div>
  );
}
