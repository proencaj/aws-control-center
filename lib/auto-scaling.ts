import "server-only";
import { DescribeAutoScalingGroupsCommand } from "@aws-sdk/client-auto-scaling";
import { autoScalingClient } from "@/lib/aws/clients";
export async function listAutoScalingGroups(
  region: string,
  nextToken?: string,
) {
  const r = await autoScalingClient(region).send(
    new DescribeAutoScalingGroupsCommand({
      MaxRecords: 20,
      NextToken: nextToken,
    }),
  );
  return { resources: r.AutoScalingGroups ?? [], nextToken: r.NextToken };
}
export async function validateAutoScalingGroup(
  region: string,
  arn: string,
  terminationProtection: boolean,
) {
  const name = arn.split(":autoScalingGroupName:")[1];
  if (!name) throw new Error("Enter an Auto Scaling group ARN.");
  const r = await autoScalingClient(region).send(
    new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [name] }),
  );
  const group = r.AutoScalingGroups?.find((g) => g.AutoScalingGroupARN === arn);
  if (!group)
    throw new Error("Auto Scaling group was not found in this region.");
  if (terminationProtection && !group.NewInstancesProtectedFromScaleIn)
    throw new Error(
      "Enable scale-in protection on the Auto Scaling group before enabling managed termination protection.",
    );
}
