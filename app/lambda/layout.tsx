import Link from "next/link";
import { getRegion } from "@/lib/aws/clients";

export default async function LambdaLayout({ children }: { children: React.ReactNode }) {
  const region = await getRegion();
  return (
    <div className="space-y-8">
      <section className="console-window">
        <div className="console-title">
          <span>06 / Serverless compute</span>
          <Link className="underline" href="/">Directory</Link>
        </div>
        <div className="space-y-2 p-5">
          <h1 className="console-heading">Lambda</h1>
          <p className="text-sm text-muted">Inspect triggers, deploy code, configure, invoke, and manage Lambda functions.</p>
          <p className="console-kicker">Region / {region}</p>
        </div>
        <nav aria-label="Lambda resources" className="console-tabs text-sm">
          <Link href="/lambda">Functions</Link>
          <Link href="/lambda/new">Create function</Link>
        </nav>
      </section>
      <div key={region}>{children}</div>
    </div>
  );
}
