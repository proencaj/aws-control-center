import Link from "next/link";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { listLogGroups, type LogGroupPage } from "@/lib/cloudwatch-logs";
import { LogsViewer } from "./viewer";

export default async function LogsMonitorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const lines = Number(query.lines);
  const minutes = Number(query.minutes);
  const initialConfig = {
    group:
      typeof query.group === "string" &&
      /^[A-Za-z0-9_./#-]{1,512}$/.test(query.group)
        ? query.group
        : undefined,
    lines: Number.isInteger(lines) && lines >= 1 && lines <= 1000 ? lines : 100,
    minutes: [10, 60, 1440, 10080].includes(minutes) ? minutes : 60,
    tail: query.tail === "true",
  };
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
          <span>03 / CloudWatch Logs</span>
          <Link href="/" className="underline">
            Directory
          </Link>
        </div>
        <div className="space-y-2 p-5">
          <h1 className="console-heading">Logs Monitor</h1>
          <p className="text-sm text-muted">
            Select a log group, fetch recent events, and follow new output as it
            arrives.
          </p>
          <p className="console-kicker">Region / {region}</p>
        </div>
      </section>
      <LogsViewer
        key={region}
        region={region}
        initialGroups={groups}
        initialError={error}
        initialConfig={initialConfig}
      />
    </div>
  );
}
