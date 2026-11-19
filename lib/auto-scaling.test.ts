import { mockClient } from "aws-sdk-client-mock";
import * as AutoScaling from "@aws-sdk/client-auto-scaling";
import { beforeEach, describe, expect, it } from "vitest";
import { listAutoScalingGroups, updateCapacity } from "./auto-scaling";

const mock = mockClient(AutoScaling.AutoScalingClient);
beforeEach(() => mock.reset());

const group = (name: string) =>
  ({ AutoScalingGroupName: name }) as AutoScaling.AutoScalingGroup;

describe("listAutoScalingGroups", () => {
  it("filters names across pages", async () => {
    mock
      .on(AutoScaling.DescribeAutoScalingGroupsCommand)
      .resolvesOnce({
        AutoScalingGroups: [group("web-a"), group("db")],
        NextToken: "t1",
      })
      .resolvesOnce({ AutoScalingGroups: [group("WEB-b")] });
    const r = await listAutoScalingGroups("us-east-1", undefined, "web");
    expect(r.resources.map((g) => g.AutoScalingGroupName)).toEqual([
      "web-a",
      "WEB-b",
    ]);
    expect(r.nextToken).toBeUndefined();
  });

  it("stops at a full page and returns the token", async () => {
    mock.on(AutoScaling.DescribeAutoScalingGroupsCommand).resolves({
      AutoScalingGroups: Array.from({ length: 20 }, (_, i) => group(`g${i}`)),
      NextToken: "more",
    });
    const r = await listAutoScalingGroups("us-east-1");
    expect(r.resources).toHaveLength(20);
    expect(r.nextToken).toBe("more");
    expect(
      mock.commandCalls(AutoScaling.DescribeAutoScalingGroupsCommand),
    ).toHaveLength(1);
  });
});

describe("updateCapacity", () => {
  it("sends min, desired and max", async () => {
    mock.on(AutoScaling.UpdateAutoScalingGroupCommand).resolves({});
    await updateCapacity("us-east-1", "web", { min: 0, desired: 2, max: 10 });
    expect(
      mock.commandCalls(AutoScaling.UpdateAutoScalingGroupCommand)[0].args[0]
        .input,
    ).toEqual({
      AutoScalingGroupName: "web",
      MinSize: 0,
      DesiredCapacity: 2,
      MaxSize: 10,
    });
  });
});
