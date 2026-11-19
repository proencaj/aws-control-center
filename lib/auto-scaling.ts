import "server-only";
import {
  DescribeAutoScalingGroupsCommand,
  UpdateAutoScalingGroupCommand,
  type AutoScalingGroup,
} from "@aws-sdk/client-auto-scaling";
import { autoScalingClient } from "@/lib/aws/clients";
const PAGE_SIZE = 20;

export async function listAutoScalingGroups(
  region: string,
  nextToken?: string,
  filter?: string,
) {
  const client = autoScalingClient(region);
  const needle = filter?.toLowerCase();
  const resources: AutoScalingGroup[] = [];
  let token = nextToken;
  do {
    const r = await client.send(
      new DescribeAutoScalingGroupsCommand({
        MaxRecords: 100,
        NextToken: token,
      }),
    );
    for (const group of r.AutoScalingGroups ?? []) {
      if (
        !needle ||
        group.AutoScalingGroupName?.toLowerCase().includes(needle)
      )
        resources.push(group);
    }
    token = r.NextToken;
  } while (token && resources.length < PAGE_SIZE);
  return { resources, nextToken: token };
}

export async function updateCapacity(
  region: string,
  name: string,
  capacity: { min: number; desired: number; max: number },
) {
  await autoScalingClient(region).send(
    new UpdateAutoScalingGroupCommand({
      AutoScalingGroupName: name,
      MinSize: capacity.min,
      DesiredCapacity: capacity.desired,
      MaxSize: capacity.max,
    }),
  );
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
