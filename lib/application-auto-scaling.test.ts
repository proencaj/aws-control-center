import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import * as AAS from "@aws-sdk/client-application-auto-scaling";
import {
  DescribeTargetGroupsCommand,
  ElasticLoadBalancingV2Client,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import * as scaling from "./application-auto-scaling";
import { albResourceLabel } from "./elbv2";
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const mock = mockClient(AAS.ApplicationAutoScalingClient),
  elb = mockClient(ElasticLoadBalancingV2Client);
beforeEach(() => {
  mock.reset();
  elb.reset();
});
describe("service autoscaling", () => {
  it("uses the ECS service resource identity and bounded pages", async () => {
    mock
      .on(AAS.DescribeScalingPoliciesCommand)
      .resolves({ ScalingPolicies: [], NextToken: "next" });
    expect(
      await scaling.listScalingPolicies(
        "us-east-1",
        "cluster",
        "service",
        "previous",
      ),
    ).toEqual({ resources: [], nextToken: "next" });
    expect(
      mock.commandCalls(AAS.DescribeScalingPoliciesCommand)[0].args[0].input,
    ).toEqual({
      ServiceNamespace: "ecs",
      ScalableDimension: "ecs:service:DesiredCount",
      ResourceId: "service/cluster/service",
      MaxResults: 20,
      NextToken: "previous",
    });
  });
  it("preserves schedule dates when omitted during edits", async () => {
    const start = new Date("2030-01-01T00:00:00Z"),
      end = new Date("2030-12-31T00:00:00Z");
    mock.on(AAS.DescribeScheduledActionsCommand).resolves({
      ScheduledActions: [
        {
          ScheduledActionName: "workday",
          ScheduledActionARN:
            "arn:aws:autoscaling:us-east-1:123456789012:scheduledAction/test",
          ServiceNamespace: "ecs",
          Schedule: "cron(0 9 ? * MON-FRI *)",
          ResourceId: "service/cluster/service",
          CreationTime: start,
          StartTime: start,
          EndTime: end,
        },
      ],
    });
    mock.on(AAS.PutScheduledActionCommand).resolves({});
    await scaling.saveScheduledAction("us-east-1", "cluster", "service", {
      ScheduledActionName: "workday",
      Schedule: "cron(0 9 ? * MON-FRI *)",
      Timezone: "America/Fortaleza",
      ScalableTargetAction: { MinCapacity: 2, MaxCapacity: 8 },
    });
    expect(
      mock.commandCalls(AAS.PutScheduledActionCommand)[0].args[0].input,
    ).toMatchObject({
      StartTime: start,
      EndTime: end,
      Timezone: "America/Fortaleza",
    });
  });
  it("does not overwrite or delete step/predictive policies", async () => {
    mock
      .on(AAS.DescribeScalingPoliciesCommand)
      .resolves({
        ScalingPolicies: [
          {
            PolicyType: "StepScaling",
            PolicyName: "existing",
            PolicyARN:
              "arn:aws:autoscaling:us-east-1:123456789012:scalingPolicy/test",
            ServiceNamespace: "ecs",
            ResourceId: "service/cluster/service",
            ScalableDimension: "ecs:service:DesiredCount",
            CreationTime: new Date("2030-01-01"),
          },
        ],
      });
    await expect(
      scaling.saveScalingPolicy("us-east-1", "cluster", "service", "existing", {
        TargetValue: 50,
      }),
    ).rejects.toThrow("read-only");
    await expect(
      scaling.removeScalingPolicy(
        "us-east-1",
        "cluster",
        "service",
        "existing",
      ),
    ).rejects.toThrow("read-only");
    expect(mock.commandCalls(AAS.PutScalingPolicyCommand)).toHaveLength(0);
    expect(mock.commandCalls(AAS.DeleteScalingPolicyCommand)).toHaveLength(0);
  });
  it("derives the ALB resource label from actual target group associations", async () => {
    const target =
      "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/app/123";
    elb.on(DescribeTargetGroupsCommand).resolves({
      TargetGroups: [
        {
          TargetGroupArn: target,
          LoadBalancerArns: [
            "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/public/456",
          ],
        },
      ],
    });
    expect(await albResourceLabel("us-east-1", target)).toBe(
      "app/public/456/targetgroup/app/123",
    );
    elb.on(DescribeTargetGroupsCommand).resolves({
      TargetGroups: [{ TargetGroupArn: target, LoadBalancerArns: [] }],
    });
    await expect(albResourceLabel("us-east-1", target)).rejects.toThrow(
      "Application Load Balancer",
    );
  });
});
