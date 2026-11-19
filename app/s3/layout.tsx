import Link from "next/link";

export default function S3Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <section className="console-window">
        <div className="console-title">
          <span>04 / Object storage</span>
          <Link className="underline" href="/">
            Directory
          </Link>
        </div>
        <div className="space-y-2 p-5">
          <h1 className="console-heading">S3</h1>
          <p className="text-sm text-muted">
            Browse general purpose buckets across all regions. Objects use their
            bucket’s region, independently of the top-bar selector.
          </p>
        </div>
      </section>
      {children}
    </div>
  );
}
