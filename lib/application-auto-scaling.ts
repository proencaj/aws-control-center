import "server-only";
import * as AAS from "@aws-sdk/client-application-auto-scaling";
import { applicationAutoScalingClient } from "@/lib/aws/clients";

export function scalingIdentity(cluster: string, service: string) {
  return {
    ServiceNamespace: "ecs" as const,
    ScalableDimension: "ecs:service:DesiredCount" as const,
    ResourceId: `service/${cluster}/${service}`,
  };
}
export async function getScalingTarget(
  region: string,
  cluster: string,
  service: string,
) {
  const { ResourceId, ...identity } = scalingIdentity(cluster, service);
  return (
    await applicationAutoScalingClient(region).send(
      new AAS.DescribeScalableTargetsCommand({
        ...identity,
        ResourceIds: [ResourceId],
      }),
    )
  ).ScalableTargets?.[0];
}
export async function listScalingPolicies(
  region: string,
  cluster: string,
  service: string,
  nextToken?: string,
) {
  const r = await applicationAutoScalingClient(region).send(
    new AAS.DescribeScalingPoliciesCommand({
      ...scalingIdentity(cluster, service),
      MaxResults: 20,
      NextToken: nextToken,
    }),
  );
  return { resources: r.ScalingPolicies ?? [], nextToken: r.NextToken };
}
export async function listScheduledActions(
  region: string,
  cluster: string,
  service: string,
  nextToken?: string,
) {
  const r = await applicationAutoScalingClient(region).send(
    new AAS.DescribeScheduledActionsCommand({
      ...scalingIdentity(cluster, service),
      MaxResults: 20,
      NextToken: nextToken,
    }),
  );
  return { resources: r.ScheduledActions ?? [], nextToken: r.NextToken };
}
export async function listScalingActivities(
  region: string,
  cluster: string,
  service: string,
  nextToken?: string,
) {
  const r = await applicationAutoScalingClient(region).send(
    new AAS.DescribeScalingActivitiesCommand({
      ...scalingIdentity(cluster, service),
      MaxResults: 20,
      NextToken: nextToken,
    }),
  );
  return { resources: r.ScalingActivities ?? [], nextToken: r.NextToken };
}
export async function saveScalingTarget(
  region: string,
  cluster: string,
  service: string,
  input: Pick<
    AAS.RegisterScalableTargetCommandInput,
    "MinCapacity" | "MaxCapacity" | "SuspendedState"
  >,
) {
  await applicationAutoScalingClient(region).send(
    new AAS.RegisterScalableTargetCommand({
      ...scalingIdentity(cluster, service),
      ...input,
    }),
  );
}
export async function removeScalingTarget(
  region: string,
  cluster: string,
  service: string,
) {
  await applicationAutoScalingClient(region).send(
    new AAS.DeregisterScalableTargetCommand(scalingIdentity(cluster, service)),
  );
}
export async function saveScalingPolicy(
  region: string,
  cluster: string,
  service: string,
  policyName: string,
  configuration: AAS.TargetTrackingScalingPolicyConfiguration,
) {
  const id = scalingIdentity(cluster, service);
  const client = applicationAutoScalingClient(region);
  const existing = await client.send(
    new AAS.DescribeScalingPoliciesCommand({
      ...id,
      PolicyNames: [policyName],
    }),
  );
  if (
    existing.ScalingPolicies?.some(
      (p) => p.PolicyType !== "TargetTrackingScaling",
    )
  )
    throw new Error("Step and predictive policies are read-only.");
  await client.send(
    new AAS.PutScalingPolicyCommand({
      ...id,
      PolicyName: policyName,
      PolicyType: "TargetTrackingScaling",
      TargetTrackingScalingPolicyConfiguration: configuration,
    }),
  );
}
export async function removeScalingPolicy(
  region: string,
  cluster: string,
  service: string,
  name: string,
) {
  const client = applicationAutoScalingClient(region),
    id = scalingIdentity(cluster, service);
  const r = await client.send(
    new AAS.DescribeScalingPoliciesCommand({ ...id, PolicyNames: [name] }),
  );
  if (r.ScalingPolicies?.some((p) => p.PolicyType !== "TargetTrackingScaling"))
    throw new Error("Step and predictive policies are read-only.");
  await client.send(
    new AAS.DeleteScalingPolicyCommand({ ...id, PolicyName: name }),
  );
}
export async function saveScheduledAction(
  region: string,
  cluster: string,
  service: string,
  input: Omit<
    AAS.PutScheduledActionCommandInput,
    "ServiceNamespace" | "ResourceId" | "ScalableDimension"
  >,
) {
  const client = applicationAutoScalingClient(region),
    id = scalingIdentity(cluster, service);
  const r = await client.send(
    new AAS.DescribeScheduledActionsCommand({
      ...id,
      ScheduledActionNames: [input.ScheduledActionName!],
    }),
  );
  const existing = r.ScheduledActions?.[0];
  // PutScheduledAction clears dates when omitted. Preserve them when only another field changes.
  await client.send(
    new AAS.PutScheduledActionCommand({
      ...id,
      ...input,
      StartTime: input.StartTime ?? existing?.StartTime,
      EndTime: input.EndTime ?? existing?.EndTime,
    }),
  );
}
export async function removeScheduledAction(
  region: string,
  cluster: string,
  service: string,
  name: string,
) {
  await applicationAutoScalingClient(region).send(
    new AAS.DeleteScheduledActionCommand({
      ...scalingIdentity(cluster, service),
      ScheduledActionName: name,
    }),
  );
}
