import "server-only";
import { DescribeTargetGroupsCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import { elbv2Client } from "@/lib/aws/clients";
export async function listTargetGroups(region: string, marker?: string) {
  const r = await elbv2Client(region).send(
    new DescribeTargetGroupsCommand({ PageSize: 20, Marker: marker }),
  );
  return { resources: r.TargetGroups ?? [], nextToken: r.NextMarker };
}
export async function validateTargetGroups(
  region: string,
  arns: string[],
  awsvpc: boolean,
  vpc?: string,
) {
  const r = await elbv2Client(region).send(
    new DescribeTargetGroupsCommand({ TargetGroupArns: arns }),
  );
  if (r.TargetGroups?.length !== new Set(arns).size)
    throw new Error("Target group was not found in this region.");
  for (const g of r.TargetGroups) {
    if (awsvpc && g.TargetType !== "ip")
      throw new Error("awsvpc tasks require IP target groups.");
    if (g.TargetType === "lambda" || g.TargetType === "alb")
      throw new Error("Select an instance or IP target group for ECS.");
    if (vpc && vpc !== g.VpcId)
      throw new Error("Target groups and task subnets must use the same VPC.");
  }
}
export async function albResourceLabel(region: string, arn: string) {
  const r = await elbv2Client(region).send(
    new DescribeTargetGroupsCommand({ TargetGroupArns: [arn] }),
  );
  const group = r.TargetGroups?.[0];
  const lb = group?.LoadBalancerArns?.find((a) =>
    a.includes(":loadbalancer/app/"),
  );
  if (!lb || !group?.TargetGroupArn)
    throw new Error(
      "Select a target group attached to an Application Load Balancer.",
    );
  return `${lb.split(":loadbalancer/")[1]}/${group.TargetGroupArn.split(":").slice(5).join(":")}`;
}
