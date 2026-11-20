import Link from "next/link";
import { getRegion } from "@/lib/aws/clients";

export default async function SnsLayout({ children }: { children: React.ReactNode }) {
  const region = await getRegion();
  return <div className="space-y-8"><section className="console-window"><div className="console-title"><span>Messaging / Notification service</span><Link className="underline" href="/">Directory</Link></div><div className="space-y-2 p-5"><h1 className="console-heading">SNS</h1><p className="text-sm text-muted">Manage topics, connect SQS subscribers, and publish messages.</p><p className="console-kicker">Region / {region}</p></div><nav aria-label="SNS resources" className="console-tabs text-sm"><Link href="/sns">Topics</Link><Link href="/sns/new">Create topic</Link></nav></section><div key={region}>{children}</div></div>;
}
