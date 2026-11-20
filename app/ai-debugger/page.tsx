import Link from "next/link";
import { Debugger } from "./debugger";

export default function AiDebuggerPage() {
  return (
    <div className="space-y-6">
      <section className="console-window">
        <div className="console-title">
          <span>04 / Diagnostics</span>
          <Link href="/" className="underline">
            Directory
          </Link>
        </div>
        <div className="space-y-2 p-5">
          <h1 className="console-heading">AI Debugger</h1>
          <p className="text-sm text-muted">
            Paste logs and let Claude summarise what went wrong and what to do
            next.
          </p>
        </div>
      </section>
      <Debugger />
    </div>
  );
}
