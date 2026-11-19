import { z } from "zod";

export const resourceName = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9_-]{1,255}$/,
    "Use letters, numbers, hyphens, or underscores.",
  );
export const identifier = z.string().trim().min(1).max(2048);
const arn = z
  .string()
  .regex(/^arn:[a-z-]+:[a-z0-9-]+:[a-z0-9-]*:\d{12}:.+$/, "Enter a valid ARN.");
export const strategySchema = z
  .array(
    z.object({
      capacityProvider: resourceName,
      weight: z.number().int().min(0).max(1000).default(1),
      base: z.number().int().min(0).max(100000).default(0),
    }),
  )
  .max(20)
  .superRefine((items, ctx) => {
    if (items.length && !items.some((i) => i.weight > 0))
      ctx.addIssue({
        code: "custom",
        message: "At least one capacity provider must have positive weight.",
      });
    if (items.filter((i) => i.base > 0).length > 1)
      ctx.addIssue({
        code: "custom",
        message: "Only one provider can have a base.",
      });
    if (new Set(items.map((i) => i.capacityProvider)).size !== items.length)
      ctx.addIssue({
        code: "custom",
        message: "Capacity providers must be unique.",
      });
    const fargate = items.some((i) =>
      ["FARGATE", "FARGATE_SPOT"].includes(i.capacityProvider),
    );
    if (
      fargate &&
      items.some(
        (i) => !["FARGATE", "FARGATE_SPOT"].includes(i.capacityProvider),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Do not mix Fargate and EC2 capacity providers.",
      });
  });
export const networkSchema = z.object({
  awsvpcConfiguration: z.object({
    subnets: z
      .array(z.string().regex(/^subnet-[a-f0-9]+$/))
      .min(1)
      .max(16),
    securityGroups: z
      .array(z.string().regex(/^sg-[a-f0-9]+$/))
      .max(5)
      .optional(),
    assignPublicIp: z.enum(["ENABLED", "DISABLED"]).default("DISABLED"),
  }),
});
export const loadBalancersSchema = z
  .array(
    z.object({
      targetGroupArn: arn,
      containerName: z.string().min(1),
      containerPort: z.number().int().min(1).max(65535),
    }),
  )
  .max(5);
export const deploymentSchema = z.object({
  minimumHealthyPercent: z.number().int().min(0).max(100).optional(),
  maximumPercent: z.number().int().min(100).max(200).optional(),
  deploymentCircuitBreaker: z
    .object({ enable: z.boolean(), rollback: z.boolean() })
    .optional(),
  alarms: z
    .object({
      alarmNames: z.array(z.string().min(1)).max(10),
      enable: z.boolean(),
      rollback: z.boolean(),
    })
    .optional(),
});
export const workloadSchema = z
  .object({
    taskDefinition: identifier,
    launchType: z.enum(["FARGATE", "EC2"]).optional(),
    capacityProviderStrategy: strategySchema.optional(),
    networkConfiguration: networkSchema.optional(),
    platformVersion: z.string().min(1).optional(),
    placementConstraints: z
      .array(
        z.object({
          type: z.enum(["distinctInstance", "memberOf"]),
          expression: z.string().optional(),
        }),
      )
      .max(10)
      .optional(),
    placementStrategy: z
      .array(
        z.object({
          type: z.enum(["random", "spread", "binpack"]),
          field: z.string().optional(),
        }),
      )
      .max(5)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.launchType && value.capacityProviderStrategy?.length)
      ctx.addIssue({
        code: "custom",
        message:
          "Choose a launch type or a capacity provider strategy, not both.",
      });
  });
export const serviceSchema = workloadSchema
  .safeExtend({
    serviceName: resourceName,
    desiredCount: z.number().int().min(0).max(100000).optional(),
    schedulingStrategy: z.enum(["REPLICA", "DAEMON"]).default("REPLICA"),
    loadBalancers: loadBalancersSchema.optional(),
    deploymentConfiguration: deploymentSchema.optional(),
    healthCheckGracePeriodSeconds: z.number().int().min(0).optional(),
    enableExecuteCommand: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.launchType === "FARGATE" && v.schedulingStrategy === "DAEMON")
      ctx.addIssue({
        code: "custom",
        message: "Fargate does not support DAEMON scheduling.",
      });
    if (v.schedulingStrategy === "DAEMON" && v.desiredCount !== undefined)
      ctx.addIssue({
        code: "custom",
        message: "DAEMON services do not have a desired count.",
      });
  });

const port = z
  .object({
    containerPort: z.number().int().min(1).max(65535),
    hostPort: z.number().int().min(0).max(65535).optional(),
    protocol: z.enum(["tcp", "udp"]).optional(),
  })
  .passthrough();
const container = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9_-]+$/),
    image: z.string().min(1),
    essential: z.boolean().optional(),
    cpu: z.number().int().min(0).optional(),
    memory: z.number().int().positive().optional(),
    memoryReservation: z.number().int().positive().optional(),
    portMappings: z.array(port).optional(),
    environment: z
      .array(z.object({ name: z.string().min(1), value: z.string() }))
      .optional(),
    secrets: z
      .array(
        z.object({ name: z.string().min(1), valueFrom: z.string().min(1) }),
      )
      .optional(),
    logConfiguration: z
      .object({
        logDriver: z.string().min(1),
        options: z.record(z.string(), z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export const taskDefinitionSchema = z
  .object({
    family: resourceName,
    containerDefinitions: z.array(container).min(1).max(10),
    taskRoleArn: arn.optional(),
    executionRoleArn: arn.optional(),
    networkMode: z.enum(["bridge", "host", "awsvpc", "none"]).optional(),
    requiresCompatibilities: z
      .array(z.enum(["EC2", "FARGATE", "EXTERNAL"]))
      .optional(),
    cpu: z.string().regex(/^\d+$/).optional(),
    memory: z.string().regex(/^\d+$/).optional(),
    runtimePlatform: z
      .object({
        cpuArchitecture: z.enum(["X86_64", "ARM64"]).optional(),
        operatingSystemFamily: z.string().min(1).optional(),
      })
      .optional(),
    volumes: z.array(z.record(z.string(), z.unknown())).optional(),
    placementConstraints: z.array(z.record(z.string(), z.unknown())).optional(),
    ephemeralStorage: z
      .object({ sizeInGiB: z.number().int().min(21).max(200) })
      .optional(),
    pidMode: z.enum(["host", "task"]).optional(),
    ipcMode: z.enum(["host", "task", "none"]).optional(),
    proxyConfiguration: z.record(z.string(), z.unknown()).optional(),
    inferenceAccelerators: z
      .array(z.record(z.string(), z.unknown()))
      .optional(),
    enableFaultInjection: z.boolean().optional(),
    tags: z
      .array(z.object({ key: z.string().min(1), value: z.string().optional() }))
      .max(50)
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      new Set(v.containerDefinitions.map((c) => c.name)).size !==
      v.containerDefinitions.length
    )
      issue("Container names must be unique.");
    if (v.containerDefinitions.every((c) => c.essential === false))
      issue("At least one container must be essential.");
    if (v.requiresCompatibilities?.includes("FARGATE")) {
      if (v.networkMode !== "awsvpc")
        issue("Fargate requires awsvpc networking.");
      const cpu = Number(v.cpu),
        memory = Number(v.memory);
      const ranges: Record<number, [number, number, number]> = {
        256: [512, 2048, 512],
        512: [1024, 4096, 1024],
        1024: [2048, 8192, 1024],
        2048: [4096, 16384, 1024],
        4096: [8192, 30720, 1024],
        8192: [16384, 61440, 4096],
        16384: [32768, 122880, 8192],
      };
      const range = ranges[cpu];
      if (
        !range ||
        memory < range[0] ||
        memory > range[1] ||
        memory % range[2] !== 0 ||
        (cpu === 256 && memory === 1536)
      )
        issue("Choose a valid Fargate CPU/memory combination (memory in MiB).");
      if (
        v.runtimePlatform?.operatingSystemFamily?.startsWith("WINDOWS") &&
        (cpu < 1024 ||
          cpu > 4096 ||
          v.runtimePlatform.cpuArchitecture === "ARM64")
      )
        issue("Windows Fargate requires x86_64 and 1–4 vCPU.");
    }
  });

export function parseJson(text: unknown): unknown {
  if (typeof text !== "string") throw new Error("JSON is required.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON. Check commas, quotes, and brackets.");
  }
}

// DescribeTaskDefinition adds response-only fields; never send those back on registration.
export function registrationInput(value: Record<string, unknown>) {
  const {
    taskDefinitionArn,
    revision,
    status,
    requiresAttributes,
    compatibilities,
    registeredAt,
    registeredBy,
    deregisteredAt,
    ...input
  } = value;
  void [
    taskDefinitionArn,
    revision,
    status,
    requiresAttributes,
    compatibilities,
    registeredAt,
    registeredBy,
    deregisteredAt,
  ];
  return input;
}
