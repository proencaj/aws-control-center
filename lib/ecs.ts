import "server-only";
import * as ECS from "@aws-sdk/client-ecs";
import { ecsClient } from "@/lib/aws/clients";
import { validateEcsNetwork } from "@/lib/ec2";
import { validateTargetGroups } from "@/lib/elbv2";
import { registrationInput } from "@/lib/ecs-validation";

export function checkFailures(failures?: ECS.Failure[]) {
  if (failures?.length)
    throw new Error(
      failures
        .map(
          (f) =>
            `${f.arn ?? "Resource"}: ${f.reason ?? "Failed"}${f.detail ? ` — ${f.detail}` : ""}`,
        )
        .join("; "),
    );
}
function required<T>(resource: T | undefined, kind: string): T {
  if (!resource)
    throw Object.assign(new Error(`${kind} was not found in this region.`), {
      name: "ResourceNotFoundException",
    });
  return resource;
}
export async function listClusters(region: string, nextToken?: string) {
  const client = ecsClient(region);
  const page = await client.send(
    new ECS.ListClustersCommand({ maxResults: 50, nextToken }),
  );
  const details = page.clusterArns?.length
    ? await client.send(
        new ECS.DescribeClustersCommand({
          clusters: page.clusterArns,
          include: ["SETTINGS", "STATISTICS"],
        }),
      )
    : { clusters: [], failures: [] };
  return {
    resources: details.clusters ?? [],
    failures: details.failures ?? [],
    nextToken: page.nextToken,
  };
}
export async function getCluster(region: string, cluster: string) {
  const result = await ecsClient(region).send(
    new ECS.DescribeClustersCommand({
      clusters: [cluster],
      include: [
        "SETTINGS",
        "STATISTICS",
        "ATTACHMENTS",
        "CONFIGURATIONS",
        "TAGS",
      ],
    }),
  );
  checkFailures(result.failures);
  return required(result.clusters?.[0], "Cluster");
}
export async function createCluster(
  region: string,
  clusterName: string,
  insights: string,
) {
  return (
    await ecsClient(region).send(
      new ECS.CreateClusterCommand({
        clusterName,
        settings: [{ name: "containerInsights", value: insights }],
      }),
    )
  ).cluster;
}
export async function updateClusterSettings(
  region: string,
  cluster: string,
  insights: string,
) {
  await ecsClient(region).send(
    new ECS.UpdateClusterSettingsCommand({
      cluster,
      settings: [{ name: "containerInsights", value: insights }],
    }),
  );
}
export async function setClusterCapacity(
  region: string,
  cluster: string,
  add: string[],
  remove: string[],
  strategy: ECS.CapacityProviderStrategyItem[],
) {
  const current = await getCluster(region, cluster);
  const providers = [
    ...new Set([
      ...(current.capacityProviders ?? []).filter((p) => !remove.includes(p)),
      ...add,
    ]),
  ];
  if (strategy.some((p) => !providers.includes(p.capacityProvider!)))
    throw new Error(
      "Every default strategy provider must be associated with this cluster.",
    );
  await ecsClient(region).send(
    new ECS.PutClusterCapacityProvidersCommand({
      cluster,
      capacityProviders: providers,
      defaultCapacityProviderStrategy: strategy,
    }),
  );
}
export async function deleteCluster(region: string, cluster: string) {
  const current = await getCluster(region, cluster);
  if (
    current.activeServicesCount ||
    current.runningTasksCount ||
    current.pendingTasksCount ||
    current.registeredContainerInstancesCount
  )
    throw new Error(
      "Cluster must have no services, running/pending tasks, or registered container instances. Remove those resources individually first.",
    );
  await ecsClient(region).send(new ECS.DeleteClusterCommand({ cluster }));
}
export async function listServices(
  region: string,
  cluster: string,
  nextToken?: string,
) {
  const client = ecsClient(region);
  const page = await client.send(
    new ECS.ListServicesCommand({ cluster, maxResults: 50, nextToken }),
  );
  const resources: ECS.Service[] = [],
    failures: ECS.Failure[] = [];
  for (let i = 0; i < (page.serviceArns?.length ?? 0); i += 10) {
    const result = await client.send(
      new ECS.DescribeServicesCommand({
        cluster,
        services: page.serviceArns!.slice(i, i + 10),
      }),
    );
    resources.push(...(result.services ?? []));
    failures.push(...(result.failures ?? []));
  }
  return { resources, failures, nextToken: page.nextToken };
}
export async function getService(
  region: string,
  cluster: string,
  service: string,
) {
  const result = await ecsClient(region).send(
    new ECS.DescribeServicesCommand({
      cluster,
      services: [service],
      include: ["TAGS"],
    }),
  );
  checkFailures(result.failures);
  return required(result.services?.[0], "Service");
}
export function assertRolling(service: ECS.Service) {
  if (
    (service.deploymentController?.type &&
      service.deploymentController.type !== "ECS") ||
    (service.deploymentConfiguration?.strategy &&
      service.deploymentConfiguration.strategy !== "ROLLING")
  )
    throw new Error(
      "This service uses a deployment mode that is read-only in this console.",
    );
}
export async function getTaskDefinition(
  region: string,
  taskDefinition: string,
) {
  const result = await ecsClient(region).send(
    new ECS.DescribeTaskDefinitionCommand({
      taskDefinition,
      include: ["TAGS"],
    }),
  );
  return {
    taskDefinition: required(result.taskDefinition, "Task definition"),
    tags: result.tags,
  };
}
export async function validateWorkload(
  region: string,
  cluster: string,
  input: Pick<
    ECS.CreateServiceCommandInput,
    | "taskDefinition"
    | "launchType"
    | "capacityProviderStrategy"
    | "networkConfiguration"
    | "loadBalancers"
    | "schedulingStrategy"
    | "platformVersion"
    | "placementConstraints"
    | "placementStrategy"
  >,
) {
  const { taskDefinition: definition } = await getTaskDefinition(
    region,
    required(input.taskDefinition, "Task definition"),
  );
  if (definition.status !== "ACTIVE")
    throw new Error("Select an ACTIVE task definition revision.");
  if (input.launchType && input.capacityProviderStrategy?.length)
    throw new Error("Choose either launch type or capacity providers.");
  const current = await getCluster(region, cluster);
  const strategy = input.capacityProviderStrategy?.length
    ? input.capacityProviderStrategy
    : input.launchType
      ? []
      : (current.defaultCapacityProviderStrategy ?? []);
  if (!input.launchType && !strategy.length)
    throw new Error(
      "Choose a launch type or configure a capacity provider strategy.",
    );
  if (
    strategy.some(
      (s) => !current.capacityProviders?.includes(s.capacityProvider!),
    )
  )
    throw new Error("Capacity provider is not associated with this cluster.");
  const isFargate =
    input.launchType === "FARGATE" ||
    strategy.some(
      (s) =>
        s.capacityProvider === "FARGATE" ||
        s.capacityProvider === "FARGATE_SPOT",
    );
  if (
    strategy.some((s) => s.capacityProvider?.startsWith("FARGATE")) &&
    strategy.some(
      (s) => !["FARGATE", "FARGATE_SPOT"].includes(s.capacityProvider!),
    )
  )
    throw new Error("Do not mix EC2 and Fargate providers.");
  if (!definition.compatibilities?.includes(isFargate ? "FARGATE" : "EC2"))
    throw new Error(
      "Task definition is incompatible with the selected compute type.",
    );
  if (
    isFargate &&
    (input.schedulingStrategy === "DAEMON" ||
      input.placementConstraints?.length ||
      input.placementStrategy?.length)
  )
    throw new Error(
      "Fargate does not support DAEMON scheduling or EC2 placement settings.",
    );
  if (!isFargate && input.platformVersion)
    throw new Error("Platform version is only valid for Fargate.");
  let vpc: string | undefined;
  if (definition.networkMode === "awsvpc") {
    if (!input.networkConfiguration?.awsvpcConfiguration)
      throw new Error(
        "This task definition requires subnets and security groups (awsvpc).",
      );
    if (
      !isFargate &&
      input.networkConfiguration.awsvpcConfiguration.assignPublicIp ===
        "ENABLED"
    )
      throw new Error("EC2 tasks cannot request a public IP.");
    vpc = await validateEcsNetwork(
      region,
      input.networkConfiguration.awsvpcConfiguration,
    );
  } else if (input.networkConfiguration)
    throw new Error(
      "Network configuration is only supported with awsvpc task definitions.",
    );
  for (const lb of input.loadBalancers ?? []) {
    if (
      !definition.containerDefinitions?.some(
        (c) =>
          c.name === lb.containerName &&
          c.portMappings?.some((p) => p.containerPort === lb.containerPort),
      )
    )
      throw new Error(
        "Each load balancer must reference a port declared by a container in the task definition.",
      );
  }
  if (input.loadBalancers?.length)
    await validateTargetGroups(
      region,
      input.loadBalancers.map((l) => l.targetGroupArn!),
      definition.networkMode === "awsvpc",
      vpc,
    );
  return definition;
}
export async function createService(
  region: string,
  input: ECS.CreateServiceCommandInput,
) {
  await validateWorkload(region, input.cluster!, input);
  return (
    await ecsClient(region).send(
      new ECS.CreateServiceCommand({
        ...input,
        deploymentController: { type: "ECS" },
      }),
    )
  ).service;
}
export async function updateService(
  region: string,
  cluster: string,
  service: string,
  patch: Omit<ECS.UpdateServiceCommandInput, "service" | "cluster">,
) {
  const current = await getService(region, cluster, service);
  assertRolling(current);
  if (
    current.schedulingStrategy === "DAEMON" &&
    patch.desiredCount !== undefined
  )
    throw new Error("DAEMON services cannot be scaled by desired count.");
  // Scaling and deployment-setting edits do not need a new task definition or
  // networking lookup. Existing services can still scale with inactive revisions.
  const workloadKeys = [
    "taskDefinition",
    "capacityProviderStrategy",
    "networkConfiguration",
    "loadBalancers",
    "platformVersion",
    "placementConstraints",
    "placementStrategy",
  ] as const;
  const changedWorkload = workloadKeys.some(
    (key) =>
      patch[key] !== undefined &&
      JSON.stringify(patch[key]) !== JSON.stringify(current[key]),
  );
  const changesCompute = patch.capacityProviderStrategy !== undefined;
  if (changedWorkload)
    await validateWorkload(region, cluster, {
      taskDefinition: patch.taskDefinition ?? current.taskDefinition,
      launchType: changesCompute ? undefined : current.launchType,
      capacityProviderStrategy:
        patch.capacityProviderStrategy ?? current.capacityProviderStrategy,
      networkConfiguration:
        patch.networkConfiguration ?? current.networkConfiguration,
      loadBalancers: patch.loadBalancers ?? current.loadBalancers,
      schedulingStrategy: current.schedulingStrategy,
      platformVersion: patch.platformVersion ?? current.platformVersion,
      placementConstraints:
        patch.placementConstraints ?? current.placementConstraints,
      placementStrategy: patch.placementStrategy ?? current.placementStrategy,
    });
  const deployment = patch.deploymentConfiguration;
  await ecsClient(region).send(
    new ECS.UpdateServiceCommand({
      ...patch,
      cluster,
      service,
      ...(patch.loadBalancers
        ? {
            loadBalancers: patch.loadBalancers.map((lb) => ({
              ...current.loadBalancers?.find(
                (existing) =>
                  existing.targetGroupArn === lb.targetGroupArn &&
                  existing.containerName === lb.containerName &&
                  existing.containerPort === lb.containerPort,
              ),
              ...lb,
            })),
          }
        : {}),
      ...(deployment
        ? {
            deploymentConfiguration: {
              ...current.deploymentConfiguration,
              ...deployment,
              ...(deployment.deploymentCircuitBreaker
                ? {
                    deploymentCircuitBreaker: {
                      ...current.deploymentConfiguration
                        ?.deploymentCircuitBreaker,
                      ...deployment.deploymentCircuitBreaker,
                    },
                  }
                : {}),
              ...(deployment.alarms
                ? {
                    alarms: {
                      ...current.deploymentConfiguration?.alarms,
                      ...deployment.alarms,
                    },
                  }
                : {}),
            },
          }
        : {}),
    }),
  );
}
export async function redeployService(
  region: string,
  cluster: string,
  service: string,
) {
  assertRolling(await getService(region, cluster, service));
  await ecsClient(region).send(
    new ECS.UpdateServiceCommand({
      cluster,
      service,
      forceNewDeployment: true,
    }),
  );
}
export async function deleteService(
  region: string,
  cluster: string,
  service: string,
) {
  const current = await getService(region, cluster, service);
  assertRolling(current);
  if (current.desiredCount || current.runningCount || current.pendingCount)
    throw new Error(
      "Scale the service to zero and wait until running and pending counts are zero before deleting it.",
    );
  await ecsClient(region).send(
    new ECS.DeleteServiceCommand({ cluster, service, force: false }),
  );
}
export async function listTasks(
  region: string,
  cluster: string,
  options: {
    nextToken?: string;
    serviceName?: string;
    family?: string;
    desiredStatus?: ECS.DesiredStatus;
    containerInstance?: string;
  } = {},
) {
  const client = ecsClient(region);
  const page = await client.send(
    new ECS.ListTasksCommand({ cluster, maxResults: 50, ...options }),
  );
  const result = page.taskArns?.length
    ? await client.send(
        new ECS.DescribeTasksCommand({ cluster, tasks: page.taskArns }),
      )
    : { tasks: [], failures: [] };
  return {
    resources: result.tasks ?? [],
    failures: result.failures ?? [],
    nextToken: page.nextToken,
  };
}
export async function getTask(region: string, cluster: string, task: string) {
  const result = await ecsClient(region).send(
    new ECS.DescribeTasksCommand({ cluster, tasks: [task], include: ["TAGS"] }),
  );
  checkFailures(result.failures);
  return required(result.tasks?.[0], "Task");
}
export async function runTask(region: string, input: ECS.RunTaskCommandInput) {
  await validateWorkload(region, input.cluster!, input);
  const result = await ecsClient(region).send(new ECS.RunTaskCommand(input));
  return { tasks: result.tasks ?? [], failures: result.failures ?? [] };
}
export async function stopTask(region: string, cluster: string, task: string) {
  await ecsClient(region).send(
    new ECS.StopTaskCommand({
      cluster,
      task,
      reason: "Stopped from AWS Control Center",
    }),
  );
}
export async function listTaskDefinitions(
  region: string,
  options: {
    nextToken?: string;
    familyPrefix?: string;
    status?: ECS.TaskDefinitionStatus;
  } = {},
) {
  const result = await ecsClient(region).send(
    new ECS.ListTaskDefinitionsCommand({
      maxResults: 50,
      sort: "DESC",
      ...options,
    }),
  );
  return {
    resources: result.taskDefinitionArns ?? [],
    nextToken: result.nextToken,
  };
}
export async function registerTaskDefinition(
  region: string,
  input: ECS.RegisterTaskDefinitionCommandInput,
) {
  return (
    await ecsClient(region).send(new ECS.RegisterTaskDefinitionCommand(input))
  ).taskDefinition;
}
export function cloneTaskDefinition(
  definition: ECS.TaskDefinition,
  tags?: ECS.Tag[],
) {
  return {
    ...registrationInput(definition as unknown as Record<string, unknown>),
    ...(tags ? { tags } : {}),
  };
}
export async function deregisterTaskDefinition(
  region: string,
  taskDefinition: string,
) {
  await ecsClient(region).send(
    new ECS.DeregisterTaskDefinitionCommand({ taskDefinition }),
  );
}
export async function deleteTaskDefinition(
  region: string,
  taskDefinition: string,
) {
  if (
    (await getTaskDefinition(region, taskDefinition)).taskDefinition.status !==
    "INACTIVE"
  )
    throw new Error("Deregister this revision before deleting it.");
  checkFailures(
    (
      await ecsClient(region).send(
        new ECS.DeleteTaskDefinitionsCommand({
          taskDefinitions: [taskDefinition],
        }),
      )
    ).failures,
  );
}
export async function listCapacityProviders(
  region: string,
  nextToken?: string,
) {
  const result = await ecsClient(region).send(
    new ECS.DescribeCapacityProvidersCommand({
      maxResults: 50,
      nextToken,
      include: ["TAGS"],
    }),
  );
  return {
    resources: result.capacityProviders ?? [],
    failures: result.failures ?? [],
    nextToken: result.nextToken,
  };
}
export async function getCapacityProvider(region: string, name: string) {
  const result = await ecsClient(region).send(
    new ECS.DescribeCapacityProvidersCommand({
      capacityProviders: [name],
      include: ["TAGS"],
    }),
  );
  checkFailures(result.failures);
  return required(result.capacityProviders?.[0], "Capacity provider");
}
export async function saveCapacityProvider(
  region: string,
  name: string,
  configuration: ECS.AutoScalingGroupProvider,
  existing: boolean,
) {
  const client = ecsClient(region);
  if (existing) {
    const current = await getCapacityProvider(region, name);
    if (!current.autoScalingGroupProvider)
      throw new Error("Only EC2 Auto Scaling group providers are editable.");
    if (
      configuration.autoScalingGroupArn &&
      current.autoScalingGroupProvider.autoScalingGroupArn !==
        configuration.autoScalingGroupArn
    )
      throw new Error(
        "An existing provider's Auto Scaling group cannot be changed.",
      );
    const { autoScalingGroupArn, ...patch } = configuration;
    void autoScalingGroupArn;
    await client.send(
      new ECS.UpdateCapacityProviderCommand({
        name,
        autoScalingGroupProvider: {
          ...current.autoScalingGroupProvider,
          ...patch,
          managedScaling: patch.managedScaling
            ? {
                ...current.autoScalingGroupProvider.managedScaling,
                ...patch.managedScaling,
              }
            : current.autoScalingGroupProvider.managedScaling,
        },
      }),
    );
  } else
    await client.send(
      new ECS.CreateCapacityProviderCommand({
        name,
        autoScalingGroupProvider: configuration,
      }),
    );
}
export async function deleteCapacityProvider(region: string, name: string) {
  if (!(await getCapacityProvider(region, name)).autoScalingGroupProvider)
    throw new Error(
      "Only EC2 Auto Scaling group providers can be deleted here.",
    );
  await ecsClient(region).send(
    new ECS.DeleteCapacityProviderCommand({ capacityProvider: name }),
  );
}
export async function listContainerInstances(
  region: string,
  cluster: string,
  nextToken?: string,
) {
  const client = ecsClient(region);
  const page = await client.send(
    new ECS.ListContainerInstancesCommand({
      cluster,
      maxResults: 50,
      nextToken,
    }),
  );
  const result = page.containerInstanceArns?.length
    ? await client.send(
        new ECS.DescribeContainerInstancesCommand({
          cluster,
          containerInstances: page.containerInstanceArns,
          include: ["CONTAINER_INSTANCE_HEALTH"],
        }),
      )
    : { containerInstances: [], failures: [] };
  return {
    resources: result.containerInstances ?? [],
    failures: result.failures ?? [],
    nextToken: page.nextToken,
  };
}
export async function getContainerInstance(
  region: string,
  cluster: string,
  id: string,
) {
  const result = await ecsClient(region).send(
    new ECS.DescribeContainerInstancesCommand({
      cluster,
      containerInstances: [id],
      include: ["CONTAINER_INSTANCE_HEALTH", "TAGS"],
    }),
  );
  checkFailures(result.failures);
  return required(result.containerInstances?.[0], "Container instance");
}
export async function setContainerInstanceState(
  region: string,
  cluster: string,
  id: string,
  status: "ACTIVE" | "DRAINING",
) {
  checkFailures(
    (
      await ecsClient(region).send(
        new ECS.UpdateContainerInstancesStateCommand({
          cluster,
          containerInstances: [id],
          status,
        }),
      )
    ).failures,
  );
}
export async function deregisterContainerInstance(
  region: string,
  cluster: string,
  id: string,
) {
  const current = await getContainerInstance(region, cluster, id);
  if (current.runningTasksCount || current.pendingTasksCount)
    throw new Error(
      "Drain this container instance and stop remaining standalone tasks before deregistering it.",
    );
  await ecsClient(region).send(
    new ECS.DeregisterContainerInstanceCommand({
      cluster,
      containerInstance: id,
      force: false,
    }),
  );
}
export async function listDeployments(
  region: string,
  cluster: string,
  service: string,
  nextToken?: string,
) {
  const client = ecsClient(region);
  const page = await client.send(
    new ECS.ListServiceDeploymentsCommand({
      cluster,
      service,
      maxResults: 20,
      nextToken,
    }),
  );
  const arns =
    page.serviceDeployments?.flatMap((d) =>
      d.serviceDeploymentArn ? [d.serviceDeploymentArn] : [],
    ) ?? [];
  const result = arns.length
    ? await client.send(
        new ECS.DescribeServiceDeploymentsCommand({
          serviceDeploymentArns: arns,
        }),
      )
    : { serviceDeployments: [], failures: [] };
  return {
    resources: result.serviceDeployments ?? [],
    failures: result.failures ?? [],
    nextToken: page.nextToken,
  };
}
