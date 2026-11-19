import Link from "next/link";
import { getRegion } from "@/lib/aws/clients";
import { listLogGroups, type LogGroupPage } from "@/lib/cloudwatch-logs";
import { toUiError } from "@/lib/aws/errors";
import { Explorer } from "./explorer";

export default async function LogsExplorerPage() {
  const region = await getRegion();
  let groups: LogGroupPage = { groups: [], nextToken: undefined };
  let error: string | undefined;
  try {
    groups = await listLogGroups(region);
  } catch (cause) {
    error = toUiError(cause);
  }
  return (
    <div className="space-y-6">
      <section className="console-window">
        <div className="console-title">
          <span>CloudWatch / Logs Insights</span>
          <Link href="/logs-monitor" className="underline">
            Logs Monitor
          </Link>
        </div>
        <div className="space-y-2 p-5">
          <h1 className="console-heading">Logs Explorer</h1>
          <p className="text-sm text-muted">
            Query, search, and inspect the events surrounding a match.
          </p>
          <p className="console-kicker">Region / {region}</p>
        </div>
      </section>
      <Explorer
        key={region}
        region={region}
        initialGroups={groups}
        initialError={error}
      />
    </div>
  );
}
