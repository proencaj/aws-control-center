import "server-only";
import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeKeyPairsCommand,
  DescribeRegionsCommand,
  DescribeSecurityGroupRulesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  RebootInstancesCommand,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  type IpPermission,
  type _InstanceType,
} from "@aws-sdk/client-ec2";
import { ec2Client } from "@/lib/aws/clients";

const PAGE_SIZE = 50;

export type Direction = "ingress" | "egress";

export async function listRegions() {
  const ec2 = await ec2Client();
  const { Regions = [] } = await ec2.send(new DescribeRegionsCommand({}));
  return Regions.flatMap((region) =>
    region.RegionName ? [region.RegionName] : [],
  ).sort();
}

export async function listInstances({
  nameFilter,
  nextToken,
}: {
  nameFilter?: string;
  nextToken?: string;
}) {
  const ec2 = await ec2Client();
  const { Reservations = [], NextToken } = await ec2.send(
    new DescribeInstancesCommand({
      MaxResults: PAGE_SIZE,
      NextToken: nextToken,
      Filters: nameFilter
        ? [{ Name: "tag:Name", Values: [`*${nameFilter}*`] }]
        : undefined,
    }),
  );
  return {
    instances: Reservations.flatMap(
      (reservation) => reservation.Instances ?? [],
    ),
    nextToken: NextToken,
  };
}

export async function getInstance(instanceId: string) {
  const ec2 = await ec2Client();
  const { Reservations = [] } = await ec2.send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
  );
  return Reservations[0]?.Instances?.[0];
}

export async function startInstance(instanceId: string) {
  const ec2 = await ec2Client();
  await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
}

export async function stopInstance(instanceId: string) {
  const ec2 = await ec2Client();
  await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
}

export async function rebootInstance(instanceId: string) {
  const ec2 = await ec2Client();
  await ec2.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }));
}

export async function terminateInstance(instanceId: string) {
  const ec2 = await ec2Client();
  await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
}

export async function getLaunchOptions() {
  const ec2 = await ec2Client();
  const [images, keyPairs, subnets, securityGroups] = await Promise.all([
    ec2.send(
      new DescribeImagesCommand({
        Owners: ["amazon"],
        Filters: [
          { Name: "name", Values: ["al2023-ami-2023*"] },
          { Name: "architecture", Values: ["x86_64"] },
          { Name: "state", Values: ["available"] },
        ],
      }),
    ),
    ec2.send(new DescribeKeyPairsCommand({})),
    ec2.send(new DescribeSubnetsCommand({})),
    ec2.send(new DescribeSecurityGroupsCommand({})),
  ]);
  const latestImage = (images.Images ?? []).sort((a, b) =>
    (b.CreationDate ?? "").localeCompare(a.CreationDate ?? ""),
  )[0];
  return {
    defaultImageId: latestImage?.ImageId,
    keyPairs: keyPairs.KeyPairs ?? [],
    subnets: subnets.Subnets ?? [],
    securityGroups: securityGroups.SecurityGroups ?? [],
  };
}

export type LaunchInput = {
  name?: string;
  imageId: string;
  instanceType: string;
  keyName?: string;
  subnetId?: string;
  securityGroupIds: string[];
};

export async function launchInstance(input: LaunchInput) {
  const ec2 = await ec2Client();
  const params = {
    ImageId: input.imageId,
    InstanceType: input.instanceType as _InstanceType,
    MinCount: 1,
    MaxCount: 1,
    KeyName: input.keyName,
    SubnetId: input.subnetId,
    SecurityGroupIds: input.securityGroupIds.length
      ? input.securityGroupIds
      : undefined,
    TagSpecifications: input.name
      ? [
          {
            ResourceType: "instance" as const,
            Tags: [{ Key: "Name", Value: input.name }],
          },
        ]
      : undefined,
  };
  try {
    await ec2.send(new RunInstancesCommand({ ...params, DryRun: true }));
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "DryRunOperation")
      throw error;
  }
  const { Instances = [] } = await ec2.send(new RunInstancesCommand(params));
  return Instances[0]?.InstanceId;
}

export async function listSecurityGroups({
  nextToken,
}: {
  nextToken?: string;
}) {
  const ec2 = await ec2Client();
  const { SecurityGroups = [], NextToken } = await ec2.send(
    new DescribeSecurityGroupsCommand({
      MaxResults: PAGE_SIZE,
      NextToken: nextToken,
    }),
  );
  return { securityGroups: SecurityGroups, nextToken: NextToken };
}

export async function getSecurityGroup(groupId: string) {
  const ec2 = await ec2Client();
  const [groups, rules] = await Promise.all([
    ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [groupId] })),
    ec2.send(
      new DescribeSecurityGroupRulesCommand({
        Filters: [{ Name: "group-id", Values: [groupId] }],
      }),
    ),
  ]);
  const group = groups.SecurityGroups?.[0];
  if (!group) return undefined;
  const all = rules.SecurityGroupRules ?? [];
  return {
    group,
    ingress: all.filter((rule) => !rule.IsEgress),
    egress: all.filter((rule) => rule.IsEgress),
  };
}

export async function listVpcs() {
  const ec2 = await ec2Client();
  const { Vpcs = [] } = await ec2.send(new DescribeVpcsCommand({}));
  return Vpcs;
}

export async function createSecurityGroup(input: {
  groupName: string;
  description: string;
  vpcId?: string;
}) {
  const ec2 = await ec2Client();
  const { GroupId } = await ec2.send(
    new CreateSecurityGroupCommand({
      GroupName: input.groupName,
      Description: input.description,
      VpcId: input.vpcId,
    }),
  );
  return GroupId;
}

export async function deleteSecurityGroup(groupId: string) {
  const ec2 = await ec2Client();
  await ec2.send(new DeleteSecurityGroupCommand({ GroupId: groupId }));
}

export type RuleInput = {
  protocol: string;
  fromPort?: number;
  toPort?: number;
  cidr: string;
  description?: string;
};

export function toIpPermission({
  protocol,
  fromPort,
  toPort,
  cidr,
  description,
}: RuleInput): IpPermission {
  const permission: IpPermission = { IpProtocol: protocol };
  if (protocol !== "-1") {
    permission.FromPort = fromPort;
    permission.ToPort = toPort;
  }
  if (cidr.includes(":")) {
    permission.Ipv6Ranges = [{ CidrIpv6: cidr, Description: description }];
  } else {
    permission.IpRanges = [{ CidrIp: cidr, Description: description }];
  }
  return permission;
}

export async function addRule(
  groupId: string,
  direction: Direction,
  rule: RuleInput,
) {
  const ec2 = await ec2Client();
  const input = { GroupId: groupId, IpPermissions: [toIpPermission(rule)] };
  if (direction === "ingress") {
    await ec2.send(new AuthorizeSecurityGroupIngressCommand(input));
  } else {
    await ec2.send(new AuthorizeSecurityGroupEgressCommand(input));
  }
}

export async function removeRule(
  groupId: string,
  direction: Direction,
  ruleId: string,
) {
  const ec2 = await ec2Client();
  const input = { GroupId: groupId, SecurityGroupRuleIds: [ruleId] };
  if (direction === "ingress") {
    await ec2.send(new RevokeSecurityGroupIngressCommand(input));
  } else {
    await ec2.send(new RevokeSecurityGroupEgressCommand(input));
  }
}

export async function listEcsNetworkOptions(
  region: string,
  kind: "subnets" | "security-groups",
  nextToken?: string,
) {
  const client = await ec2Client(region);
  if (kind === "subnets") {
    const r = await client.send(
      new DescribeSubnetsCommand({ MaxResults: 20, NextToken: nextToken }),
    );
    return {
      resources: (r.Subnets ?? []).map((s) => ({
        id: s.SubnetId!,
        label: `${s.SubnetId} · ${s.VpcId} · ${s.AvailabilityZone}`,
      })),
      nextToken: r.NextToken,
    };
  }
  const r = await client.send(
    new DescribeSecurityGroupsCommand({ MaxResults: 20, NextToken: nextToken }),
  );
  return {
    resources: (r.SecurityGroups ?? []).map((g) => ({
      id: g.GroupId!,
      label: `${g.GroupName} · ${g.GroupId} · ${g.VpcId}`,
    })),
    nextToken: r.NextToken,
  };
}
export async function validateEcsNetwork(
  region: string,
  input: { subnets?: string[]; securityGroups?: string[] },
) {
  const client = await ec2Client(region);
  if (!input.subnets?.length) throw new Error("Choose at least one subnet.");
  const subnets = await client.send(
    new DescribeSubnetsCommand({ SubnetIds: input.subnets }),
  );
  if (subnets.Subnets?.length !== new Set(input.subnets).size)
    throw new Error("Subnet was not found in this region.");
  const vpcs = new Set(subnets.Subnets.map((s) => s.VpcId));
  if (vpcs.size !== 1 || !subnets.Subnets[0]?.VpcId)
    throw new Error("All subnets must belong to one VPC.");
  const vpc = subnets.Subnets[0].VpcId;
  if (input.securityGroups?.length) {
    const groups = await client.send(
      new DescribeSecurityGroupsCommand({ GroupIds: input.securityGroups }),
    );
    if (
      groups.SecurityGroups?.length !== new Set(input.securityGroups).size ||
      groups.SecurityGroups.some((g) => g.VpcId !== vpc)
    )
      throw new Error(
        "Security groups must belong to the selected subnets' VPC.",
      );
  }
  return vpc;
}
