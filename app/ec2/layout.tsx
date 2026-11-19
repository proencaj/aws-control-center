import Link from "next/link";

export default function Ec2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <div className="console-window">
        <div className="console-title">
          <span>01 / Compute</span>
          <Link href="/" className="underline">
            Directory
          </Link>
        </div>
        <div className="space-y-2 p-5">
          <h1 className="console-heading">EC2 / Instance manager</h1>
          <p className="text-sm text-muted">
            Inspect virtual machines, control their lifecycle, and manage
            network access.
          </p>
        </div>
        <nav aria-label="EC2 resources" className="console-tabs text-sm">
          <Link href="/ec2">Instances</Link>
          <Link href="/ec2/security-groups">Security groups</Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
