import "server-only";
import { DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import { cloudWatchClient } from "@/lib/aws/clients";
export async function listAlarms(region: string, nextToken?: string) {
  const r = await cloudWatchClient(region).send(
    new DescribeAlarmsCommand({
      MaxRecords: 20,
      NextToken: nextToken,
      AlarmTypes: ["MetricAlarm"],
    }),
  );
  return { resources: r.MetricAlarms ?? [], nextToken: r.NextToken };
}
