import {
  AuthorizeSecurityGroupIngressCommand,
  DescribeInstancesCommand,
  EC2Client,
  RevokeSecurityGroupEgressCommand,
  RunInstancesCommand,
} from "@aws-sdk/client-ec2";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addRule, launchInstance, listInstances, removeRule, toIpPermission } from "./ec2";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const ec2Mock = mockClient(EC2Client);
beforeEach(() => ec2Mock.reset());

describe("listInstances", () => {
  it("flattens reservations and passes the filter and token", async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [{ Instances: [{ InstanceId: "i-1" }] }, { Instances: [{ InstanceId: "i-2" }] }],
      NextToken: "token-2",
    });

    const result = await listInstances({ nameFilter: "web", nextToken: "token-1" });

    expect(result.instances.map((instance) => instance.InstanceId)).toEqual(["i-1", "i-2"]);
    expect(result.nextToken).toBe("token-2");
    expect(ec2Mock.commandCalls(DescribeInstancesCommand)[0].args[0].input).toMatchObject({
      NextToken: "token-1",
      Filters: [{ Name: "tag:Name", Values: ["*web*"] }],
    });
  });
});

describe("launchInstance", () => {
  it("dry-runs first, then launches", async () => {
    const dryRunError = Object.assign(new Error("would have succeeded"), { name: "DryRunOperation" });
    ec2Mock
      .on(RunInstancesCommand, { DryRun: true })
      .rejects(dryRunError)
      .on(RunInstancesCommand)
      .resolves({ Instances: [{ InstanceId: "i-new" }] });

    const id = await launchInstance({
      name: "web",
      imageId: "ami-1",
      instanceType: "t3.micro",
      securityGroupIds: [],
    });

    expect(id).toBe("i-new");
    const calls = ec2Mock.commandCalls(RunInstancesCommand).map((call) => call.args[0].input.DryRun);
    expect(calls).toEqual([true, undefined]);
  });

  it("stops when the dry run fails for a real reason", async () => {
    ec2Mock.on(RunInstancesCommand).rejects(Object.assign(new Error("denied"), { name: "UnauthorizedOperation" }));

    await expect(
      launchInstance({ imageId: "ami-1", instanceType: "t3.micro", securityGroupIds: [] }),
    ).rejects.toThrow("denied");
    expect(ec2Mock.commandCalls(RunInstancesCommand)).toHaveLength(1);
  });
});

describe("rules", () => {
  it("uses IpRanges for IPv4 and Ipv6Ranges for IPv6", () => {
    const base = { protocol: "tcp", fromPort: 22, toPort: 22 };
    expect(toIpPermission({ ...base, cidr: "10.0.0.0/8" }).IpRanges).toEqual([
      { CidrIp: "10.0.0.0/8", Description: undefined },
    ]);
    expect(toIpPermission({ ...base, cidr: "::/0" }).Ipv6Ranges).toEqual([
      { CidrIpv6: "::/0", Description: undefined },
    ]);
  });

  it("omits ports for all traffic", () => {
    const permission = toIpPermission({ protocol: "-1", fromPort: 1, toPort: 2, cidr: "0.0.0.0/0" });
    expect(permission.FromPort).toBeUndefined();
    expect(permission.ToPort).toBeUndefined();
  });

  it("authorizes ingress and revokes egress by rule ID", async () => {
    ec2Mock.onAnyCommand().resolves({});

    await addRule("sg-1", "ingress", { protocol: "tcp", fromPort: 80, toPort: 80, cidr: "0.0.0.0/0" });
    await removeRule("sg-1", "egress", "sgr-1");

    expect(ec2Mock.commandCalls(AuthorizeSecurityGroupIngressCommand)).toHaveLength(1);
    expect(ec2Mock.commandCalls(RevokeSecurityGroupEgressCommand)[0].args[0].input).toMatchObject({
      GroupId: "sg-1",
      SecurityGroupRuleIds: ["sgr-1"],
    });
  });
});
