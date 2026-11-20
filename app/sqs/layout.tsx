import Link from "next/link";
import { getRegion } from "@/lib/aws/clients";

export default async function SqsLayout({ children }: { children: React.ReactNode }) {
  const region = await getRegion();
  return <div className="space-y-8">
    <section className="console-window">
      <div className="console-title"><span>Messaging / Queue service</span><Link className="underline" href="/">Directory</Link></div>
      <div className="space-y-2 p-5"><h1 className="console-heading">SQS</h1><p className="text-sm text-muted">Create queues, send messages, and inspect deliveries with controlled polling.</p><p className="console-kicker">Region / {region}</p></div>
      <nav aria-label="SQS resources" className="console-tabs text-sm"><Link href="/sqs">Queues</Link><Link href="/sqs/new">Create queue</Link></nav>
    </section>
    <div key={region}>{children}</div>
  </div>;
}
