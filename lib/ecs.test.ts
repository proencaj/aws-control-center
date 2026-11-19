import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import * as ECS from "@aws-sdk/client-ecs";
import {
  EC2Client,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
} from "@aws-sdk/client-ec2";
import {
  ElasticLoadBalancingV2Client,
  DescribeTargetGroupsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { ecsClient } from "./aws/clients";
import * as ecs from "./ecs";
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const mock = mockClient(ECS.ECSClient),
  network = mockClient(EC2Client),
  elb = mockClient(ElasticLoadBalancingV2Client);
const region = "us-east-1";
beforeEach(() => {
  mock.reset();
  network.reset();
  elb.reset();
});
function workload() {
  mock.on(ECS.DescribeClustersCommand).resolves({
    clusters: [
      {
        clusterName: "test",
        capacityProviders: ["FARGATE", "ec2-provider"],
        defaultCapacityProviderStrategy: [
          { capacityProvider: "FARGATE", weight: 1 },
        ],
      },
    ],
  });
  mock.on(ECS.DescribeTaskDefinitionCommand).resolves({
    taskDefinition: {
      family: "app",
      revision: 1,
      status: "ACTIVE",
      compatibilities: ["FARGATE", "EC2"],
      networkMode: "awsvpc",
      containerDefinitions: [
        { name: "app", portMappings: [{ containerPort: 80 }] },
      ],
    },
  });
  network
    .on(DescribeSubnetsCommand)
    .resolves({ Subnets: [{ SubnetId: "subnet-abc", VpcId: "vpc-1" }] });
  network
    .on(DescribeSecurityGroupsCommand)
    .resolves({ SecurityGroups: [{ GroupId: "sg-abc", VpcId: "vpc-1" }] });
}
const input = {
  taskDefinition: "app:1",
  launchType: "FARGATE" as const,
  networkConfiguration: {
    awsvpcConfiguration: {
      subnets: ["subnet-abc"],
      securityGroups: ["sg-abc"],
      assignPublicIp: "DISABLED" as const,
    },
  },
};
describe("ECS reads", () => {
  it("loads a bounded page and describes services in batches of ten", async () => {
    const arns = Array.from({ length: 23 }, (_, i) => `service-${i}`);
    mock.on(ECS.ListServicesCommand).resolves({ serviceArns: arns });
    mock.on(ECS.DescribeServicesCommand).callsFake((args) => ({
      services: args.services.map((name: string) => ({ serviceName: name })),
      failures: args.services.includes("service-20")
        ? [{ arn: "missing", reason: "MISSING" }]
        : [],
    }));
    const result = await ecs.listServices(region, "test", "previous");
    expect(mock.commandCalls(ECS.ListServicesCommand)[0].args[0].input).toEqual(
      { cluster: "test", maxResults: 100, nextToken: "previous" },
    );
    expect(
      mock
        .commandCalls(ECS.DescribeServicesCommand)
        .map((c) => c.args[0].input.services?.length),
    ).toEqual([10, 10, 3]);
    expect(result.resources).toHaveLength(23);
    expect(result.failures).toHaveLength(1);
    expect(result.nextToken).toBeUndefined();
  });
  it("filters service names across pages", async () => {
    mock
      .on(ECS.ListServicesCommand)
      .resolvesOnce({
        serviceArns: ["arn:x/test/api", "arn:x/test/web"],
        nextToken: "t",
      })
      .resolvesOnce({ serviceArns: ["arn:x/test/WEB-2"] });
    mock.on(ECS.DescribeServicesCommand).callsFake((args) => ({
      services: args.services.map((name: string) => ({ serviceName: name })),
    }));
    const result = await ecs.listServices(region, "test", undefined, "web");
    expect(result.resources.map((s) => s.serviceName)).toEqual([
      "arn:x/test/web",
      "arn:x/test/WEB-2",
    ]);
    expect(mock.commandCalls(ECS.ListServicesCommand)).toHaveLength(2);
  });
  it("does not describe an empty page", async () => {
    mock
      .on(ECS.ListClustersCommand)
      .resolves({ clusterArns: [], nextToken: "continue" });
    expect(await ecs.listClusters(region)).toEqual({
      resources: [],
      failures: [],
      nextToken: "continue",
    });
    expect(mock.commandCalls(ECS.DescribeClustersCommand)).toHaveLength(0);
  });
  it("reports resource failures and absent resources", async () => {
    mock
      .on(ECS.DescribeServicesCommand)
      .resolves({ failures: [{ arn: "missing", reason: "MISSING" }] });
    await expect(ecs.getService(region, "test", "missing")).rejects.toThrow(
      "MISSING",
    );
    mock.on(ECS.DescribeTasksCommand).resolves({ tasks: [] });
    await expect(ecs.getTask(region, "test", "missing")).rejects.toThrow(
      "not found",
    );
  });
  it("passes task status and filters with pagination", async () => {
    mock.on(ECS.ListTasksCommand).resolves({ taskArns: ["task1"] });
    mock.on(ECS.DescribeTasksCommand).resolves({
      tasks: [{ taskArn: "task1" }],
      failures: [{ reason: "MISSING" }],
    });
    const result = await ecs.listTasks(region, "test", {
      family: "app",
      desiredStatus: "STOPPED",
      nextToken: "page",
    });
    expect(
      mock.commandCalls(ECS.ListTasksCommand)[0].args[0].input,
    ).toMatchObject({
      cluster: "test",
      desiredStatus: "STOPPED",
      family: "app",
      nextToken: "page",
      maxResults: 50,
    });
    expect(result.failures).toHaveLength(1);
  });
  it("caches clients by region without crossing regions", async () => {
    expect(ecsClient(region)).toBe(ecsClient(region));
    expect(ecsClient(region)).not.toBe(ecsClient("eu-west-1"));
    expect(await ecsClient("eu-west-1").config.region()).toBe("eu-west-1");
  });
});
describe("workload validation", () => {
  beforeEach(workload);
  it("validates Fargate networking and target group mapping", async () => {
    elb.on(DescribeTargetGroupsCommand).resolves({
      TargetGroups: [
        { TargetGroupArn: "target", TargetType: "ip", VpcId: "vpc-1" },
      ],
    });
    await expect(
      ecs.validateWorkload(region, "test", {
        ...input,
        loadBalancers: [
          { targetGroupArn: "target", containerName: "app", containerPort: 80 },
        ],
      }),
    ).resolves.toMatchObject({ family: "app" });
    await expect(
      ecs.validateWorkload(region, "test", {
        ...input,
        loadBalancers: [
          {
            targetGroupArn: "target",
            containerName: "missing",
            containerPort: 80,
          },
        ],
      }),
    ).rejects.toThrow("declared");
  });
  it("rejects cross-VPC subnets and security groups", async () => {
    network.on(DescribeSecurityGroupsCommand).resolves({
      SecurityGroups: [{ GroupId: "sg-abc", VpcId: "vpc-other" }],
    });
    await expect(ecs.validateWorkload(region, "test", input)).rejects.toThrow(
      "VPC",
    );
    network.on(DescribeSubnetsCommand).resolves({
      Subnets: [
        { SubnetId: "subnet-abc", VpcId: "vpc-1" },
        { SubnetId: "subnet-def", VpcId: "vpc-2" },
      ],
    });
    await expect(
      ecs.validateWorkload(region, "test", {
        ...input,
        networkConfiguration: {
          awsvpcConfiguration: { subnets: ["subnet-abc", "subnet-def"] },
        },
      }),
    ).rejects.toThrow("one VPC");
  });
  it("rejects instance target groups for awsvpc and targets in another VPC", async () => {
    elb.on(DescribeTargetGroupsCommand).resolves({
      TargetGroups: [
        { TargetGroupArn: "target", TargetType: "instance", VpcId: "vpc-1" },
      ],
    });
    const request = {
      ...input,
      loadBalancers: [
        { targetGroupArn: "target", containerName: "app", containerPort: 80 },
      ],
    };
    await expect(ecs.validateWorkload(region, "test", request)).rejects.toThrow(
      "IP target groups",
    );
    elb.on(DescribeTargetGroupsCommand).resolves({
      TargetGroups: [
        { TargetGroupArn: "target", TargetType: "ip", VpcId: "other" },
      ],
    });
    await expect(ecs.validateWorkload(region, "test", request)).rejects.toThrow(
      "same VPC",
    );
  });
  it("rejects incompatible compute, inactive definitions, daemon Fargate and mixed strategies", async () => {
    await expect(
      ecs.validateWorkload(region, "test", {
        ...input,
        schedulingStrategy: "DAEMON",
      }),
    ).rejects.toThrow("DAEMON");
    await expect(
      ecs.validateWorkload(region, "test", {
        ...input,
        capacityProviderStrategy: [{ capacityProvider: "FARGATE", weight: 1 }],
      }),
    ).rejects.toThrow("either");
    mock.on(ECS.DescribeTaskDefinitionCommand).resolves({
      taskDefinition: { status: "ACTIVE", compatibilities: ["EC2"] },
    });
    await expect(ecs.validateWorkload(region, "test", input)).rejects.toThrow(
      "incompatible",
    );
    mock
      .on(ECS.DescribeTaskDefinitionCommand)
      .resolves({ taskDefinition: { status: "INACTIVE" } });
    await expect(ecs.validateWorkload(region, "test", input)).rejects.toThrow(
      "ACTIVE",
    );
  });
  it("supports EC2 bridge tasks without awsvpc configuration", async () => {
    mock.on(ECS.DescribeTaskDefinitionCommand).resolves({
      taskDefinition: {
        status: "ACTIVE",
        compatibilities: ["EC2"],
        networkMode: "bridge",
      },
    });
    await expect(
      ecs.validateWorkload(region, "test", {
        taskDefinition: "app:1",
        launchType: "EC2",
      }),
    ).resolves.toBeDefined();
    expect(network.commandCalls(DescribeSubnetsCommand)).toHaveLength(0);
  });
  it("retains successful task launches alongside failures and passes the request token", async () => {
    mock.on(ECS.RunTaskCommand).resolves({
      tasks: [{ taskArn: "started" }],
      failures: [{ reason: "RESOURCE:CPU" }],
    });
    const result = await ecs.runTask(region, {
      ...input,
      cluster: "test",
      count: 2,
      clientToken: "request-token",
    });
    expect(result.tasks).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(
      mock.commandCalls(ECS.RunTaskCommand)[0].args[0].input.clientToken,
    ).toBe("request-token");
  });
});
describe("mutation guards and preservation", () => {
  it("preserves capacity associations unless explicitly removed", async () => {
    mock
      .on(ECS.DescribeClustersCommand)
      .resolves({ clusters: [{ capacityProviders: ["old", "keep"] }] });
    mock.on(ECS.PutClusterCapacityProvidersCommand).resolves({});
    await ecs.setClusterCapacity(
      region,
      "test",
      ["new"],
      ["old"],
      [{ capacityProvider: "new", weight: 1 }],
    );
    expect(
      mock.commandCalls(ECS.PutClusterCapacityProvidersCommand)[0].args[0].input
        .capacityProviders,
    ).toEqual(["keep", "new"]);
  });
  it("blocks cluster, service and instance deletion while in use", async () => {
    mock
      .on(ECS.DescribeClustersCommand)
      .resolves({ clusters: [{ activeServicesCount: 1 }] });
    mock
      .on(ECS.DescribeServicesCommand)
      .resolves({ services: [{ desiredCount: 0, pendingCount: 1 }] });
    mock
      .on(ECS.DescribeContainerInstancesCommand)
      .resolves({ containerInstances: [{ runningTasksCount: 1 }] });
    await expect(ecs.deleteCluster(region, "test")).rejects.toThrow(
      "no services",
    );
    await expect(ecs.deleteService(region, "test", "web")).rejects.toThrow(
      "zero",
    );
    await expect(
      ecs.deregisterContainerInstance(region, "test", "instance"),
    ).rejects.toThrow("Drain");
    expect(mock.commandCalls(ECS.DeleteClusterCommand)).toHaveLength(0);
    expect(mock.commandCalls(ECS.DeleteServiceCommand)).toHaveLength(0);
    expect(
      mock.commandCalls(ECS.DeregisterContainerInstanceCommand),
    ).toHaveLength(0);
  });
  it("requires inactive task definitions before permanent deletion", async () => {
    mock
      .on(ECS.DescribeTaskDefinitionCommand)
      .resolves({ taskDefinition: { status: "ACTIVE" } });
    await expect(ecs.deleteTaskDefinition(region, "app:1")).rejects.toThrow(
      "Deregister",
    );
    expect(mock.commandCalls(ECS.DeleteTaskDefinitionsCommand)).toHaveLength(0);
  });
  it("preserves advanced deployment configuration when changing thresholds", async () => {
    workload();
    mock.on(ECS.DescribeServicesCommand).resolves({
      services: [
        {
          ...input,
          deploymentConfiguration: {
            maximumPercent: 200,
            minimumHealthyPercent: 100,
            alarms: { enable: true, alarmNames: ["health"], rollback: true },
          },
        },
      ],
    });
    mock.on(ECS.UpdateServiceCommand).resolves({});
    await ecs.updateService(region, "test", "web", {
      deploymentConfiguration: { minimumHealthyPercent: 50 },
    });
    const sent = mock.commandCalls(ECS.UpdateServiceCommand)[0].args[0].input;
    expect(sent.deploymentConfiguration).toEqual({
      maximumPercent: 200,
      minimumHealthyPercent: 50,
      alarms: { enable: true, alarmNames: ["health"], rollback: true },
    });
    expect(sent).not.toHaveProperty("loadBalancers");
  });
  it("rejects unsupported deployment modes", async () => {
    mock.on(ECS.DescribeServicesCommand).resolves({
      services: [{ deploymentController: { type: "CODE_DEPLOY" } }],
    });
    await expect(ecs.redeployService(region, "test", "web")).rejects.toThrow(
      "read-only",
    );
    expect(mock.commandCalls(ECS.UpdateServiceCommand)).toHaveLength(0);
  });
});

describe("existing service revisions", () => {
  it("scales existing workloads without revalidating an inactive task definition or requiring networking lookups", async () => {
    mock.on(ECS.DescribeServicesCommand).resolves({
      services: [
        {
          serviceName: "web",
          taskDefinition: "app:1",
          schedulingStrategy: "REPLICA",
          desiredCount: 2,
        },
      ],
    });
    mock.on(ECS.UpdateServiceCommand).resolves({});
    await ecs.updateService(region, "test", "web", { desiredCount: 1 });
    expect(mock.commandCalls(ECS.DescribeTaskDefinitionCommand)).toHaveLength(
      0,
    );
    expect(network.commandCalls(DescribeSubnetsCommand)).toHaveLength(0);
    expect(
      mock.commandCalls(ECS.UpdateServiceCommand)[0].args[0].input,
    ).toEqual({ cluster: "test", service: "web", desiredCount: 1 });
  });
  it("preserves advanced nested circuit-breaker settings", async () => {
    const advanced = { enable: true, rollback: true, resetOnHealthyTask: true };
    mock.on(ECS.DescribeServicesCommand).resolves({
      services: [
        { deploymentConfiguration: { deploymentCircuitBreaker: advanced } },
      ],
    });
    mock.on(ECS.UpdateServiceCommand).resolves({});
    await ecs.updateService(region, "test", "web", {
      deploymentConfiguration: {
        deploymentCircuitBreaker: { enable: true, rollback: false },
      },
    });
    expect(
      mock.commandCalls(ECS.UpdateServiceCommand)[0].args[0].input
        .deploymentConfiguration?.deploymentCircuitBreaker,
    ).toMatchObject({
      enable: true,
      rollback: false,
      resetOnHealthyTask: true,
    });
  });
});
