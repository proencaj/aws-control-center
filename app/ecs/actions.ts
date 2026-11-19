"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type {
  RegisterTaskDefinitionCommandInput,
  UpdateServiceCommandInput,
  AutoScalingGroupProvider,
} from "@aws-sdk/client-ecs";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import * as ecs from "@/lib/ecs";
import * as scaling from "@/lib/application-auto-scaling";
import { albResourceLabel } from "@/lib/elbv2";
import { validateAutoScalingGroup } from "@/lib/auto-scaling";
import {
  deploymentSchema,
  identifier,
  loadBalancersSchema,
  networkSchema,
  parseJson,
  resourceName,
  serviceSchema,
  strategySchema,
  taskDefinitionSchema,
  workloadSchema,
} from "@/lib/ecs-validation";

export type EcsActionState = { error?: string; message?: string };
export type EcsTarget = { operation: string; cluster?: string; name?: string };
const operations = z.enum([
  "createCluster",
  "clusterSettings",
  "clusterCapacity",
  "deleteCluster",
  "createService",
  "updateService",
  "redeploy",
  "scaleZero",
  "deleteService",
  "runTask",
  "stopTask",
  "registerDefinition",
  "deregisterDefinition",
  "deleteDefinition",
  "createProvider",
  "updateProvider",
  "deleteProvider",
  "drain",
  "activate",
  "deregisterInstance",
  "scalingTarget",
  "removeScalingTarget",
  "scalingPolicy",
  "removePolicy",
  "schedule",
  "removeSchedule",
]);
const updateSchema = z
  .object({
    taskDefinition: identifier.optional(),
    desiredCount: z.number().int().min(0).max(100000).optional(),
    capacityProviderStrategy: strategySchema.optional(),
    networkConfiguration: networkSchema.optional(),
    loadBalancers: loadBalancersSchema.optional(),
    deploymentConfiguration: deploymentSchema.optional(),
    healthCheckGracePeriodSeconds: z.number().int().min(0).optional(),
    platformVersion: z.string().min(1).optional(),
    placementConstraints: workloadSchema.shape.placementConstraints,
    placementStrategy: workloadSchema.shape.placementStrategy,
  })
  .strict();
const providerSchema = z
  .object({
    autoScalingGroupArn: z.string().min(1),
    managedDraining: z.enum(["ENABLED", "DISABLED"]).optional(),
    managedTerminationProtection: z.enum(["ENABLED", "DISABLED"]).optional(),
    managedScaling: z
      .object({
        status: z.enum(["ENABLED", "DISABLED"]),
        targetCapacity: z.number().int().min(1).max(100).optional(),
        minimumScalingStepSize: z.number().int().positive().optional(),
        maximumScalingStepSize: z.number().int().positive().optional(),
        instanceWarmupPeriod: z.number().int().min(0).max(10000).optional(),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (
      (v.managedScaling?.minimumScalingStepSize ?? 1) >
      (v.managedScaling?.maximumScalingStepSize ?? 10000)
    )
      ctx.addIssue({
        code: "custom",
        message: "Minimum scaling step cannot exceed maximum.",
      });
    if (
      v.managedTerminationProtection === "ENABLED" &&
      v.managedScaling?.status !== "ENABLED"
    )
      ctx.addIssue({
        code: "custom",
        message: "Managed termination protection requires managed scaling.",
      });
  });
const bounds = z
  .object({
    MinCapacity: z.number().int().min(0),
    MaxCapacity: z.number().int().min(0),
    SuspendedState: z
      .object({
        DynamicScalingInSuspended: z.boolean(),
        DynamicScalingOutSuspended: z.boolean(),
        ScheduledScalingSuspended: z.boolean(),
      })
      .optional(),
  })
  .refine(
    (v) => v.MinCapacity <= v.MaxCapacity,
    "Minimum capacity cannot exceed maximum.",
  );
const scheduleSchema = z.object({
  ScheduledActionName: z.string().min(1).max(256),
  Schedule: z
    .string()
    .regex(
      /^(at|rate|cron)\(.+\)$/,
      "Use an AWS at(...), rate(...), or cron(...) expression.",
    ),
  Timezone: z.string().default("UTC"),
  StartTime: z.string().datetime({ offset: true }).optional(),
  EndTime: z.string().datetime({ offset: true }).optional(),
  ScalableTargetAction: z
    .object({
      MinCapacity: z.number().int().min(0).optional(),
      MaxCapacity: z.number().int().min(0).optional(),
    })
    .refine(
      (v) => v.MinCapacity !== undefined || v.MaxCapacity !== undefined,
      "Set at least one capacity bound.",
    )
    .refine(
      (v) =>
        v.MinCapacity === undefined ||
        v.MaxCapacity === undefined ||
        v.MinCapacity <= v.MaxCapacity,
      "Minimum cannot exceed maximum.",
    ),
});

function confirm(form: FormData, name: string) {
  if (form.get("confirm") !== name) throw new Error(`Type ${name} to confirm.`);
}
function payload(form: FormData) {
  return parseJson(form.get("payload"));
}
async function scalableService(
  region: string,
  cluster: string,
  service: string,
) {
  const current = await ecs.getService(region, cluster, service);
  ecs.assertRolling(current);
  if (current.schedulingStrategy === "DAEMON" || current.status !== "ACTIVE")
    throw new Error("Autoscaling requires an active REPLICA service.");
  return current;
}

export async function ecsAction(
  region: string,
  target: EcsTarget,
  _previous: EcsActionState,
  form: FormData,
): Promise<EcsActionState> {
  let destination: string | undefined;
  let message = "Request accepted. Refresh to see the latest AWS state.";
  let started = false;
  try {
    if (region !== (await getRegion()))
      throw new Error(
        "The region changed. Refresh this page before submitting again.",
      );
    const operation = operations.parse(target.operation);
    const cluster = target.cluster ? resourceName.parse(target.cluster) : "";
    const name = target.name ? identifier.parse(target.name) : "";
    const clusterOps = [
      "clusterSettings",
      "clusterCapacity",
      "deleteCluster",
      "createService",
      "updateService",
      "redeploy",
      "scaleZero",
      "deleteService",
      "runTask",
      "stopTask",
      "drain",
      "activate",
      "deregisterInstance",
      "scalingTarget",
      "removeScalingTarget",
      "scalingPolicy",
      "removePolicy",
      "schedule",
      "removeSchedule",
    ];
    if (clusterOps.includes(operation) && !cluster)
      throw new Error("Cluster is required.");
    const nameOps = [
      "updateService",
      "redeploy",
      "scaleZero",
      "deleteService",
      "stopTask",
      "deregisterDefinition",
      "deleteDefinition",
      "updateProvider",
      "deleteProvider",
      "drain",
      "activate",
      "deregisterInstance",
      "scalingTarget",
      "removeScalingTarget",
      "scalingPolicy",
      "removePolicy",
      "schedule",
      "removeSchedule",
    ];
    if (nameOps.includes(operation) && !name)
      throw new Error("Resource identifier is required.");
    const destructive = [
      "deleteCluster",
      "deleteService",
      "stopTask",
      "deregisterDefinition",
      "deleteDefinition",
      "deleteProvider",
      "drain",
      "deregisterInstance",
      "removeScalingTarget",
    ];
    if (destructive.includes(operation))
      confirm(form, operation === "deleteCluster" ? cluster : name);
    const base = `/ecs/clusters/${encodeURIComponent(cluster)}`;
    switch (operation) {
      case "createCluster": {
        const clusterName = resourceName.parse(form.get("name"));
        await ecs.createCluster(
          region,
          clusterName,
          z
            .enum(["disabled", "enabled", "enhanced"])
            .parse(form.get("insights")),
        );
        destination = `/ecs/clusters/${encodeURIComponent(clusterName)}`;
        break;
      }
      case "clusterSettings":
        await ecs.updateClusterSettings(
          region,
          cluster,
          z
            .enum(["disabled", "enabled", "enhanced"])
            .parse(form.get("insights")),
        );
        break;
      case "clusterCapacity": {
        const input = z
          .object({
            add: z.array(resourceName),
            remove: z.array(resourceName),
            strategy: strategySchema,
          })
          .parse(payload(form));
        if (input.remove.length) confirm(form, cluster);
        await ecs.setClusterCapacity(
          region,
          cluster,
          input.add,
          input.remove,
          input.strategy,
        );
        break;
      }
      case "deleteCluster":
        await ecs.deleteCluster(region, cluster);
        destination = "/ecs";
        break;
      case "createService": {
        const input = serviceSchema.parse(payload(form));
        if (input.desiredCount === 0) confirm(form, input.serviceName);
        const token = z.string().uuid().parse(form.get("clientToken"));
        await ecs.createService(region, {
          ...input,
          cluster,
          clientToken: token,
        });
        destination = `${base}/services/${encodeURIComponent(input.serviceName)}`;
        break;
      }
      case "updateService": {
        const input = updateSchema.parse(payload(form));
        await ecs.updateService(
          region,
          cluster,
          name,
          input as UpdateServiceCommandInput,
        );
        break;
      }
      case "redeploy":
        await ecs.redeployService(region, cluster, name);
        break;
      case "scaleZero": {
        await ecs.updateService(region, cluster, name, { desiredCount: 0 });
        break;
      }
      case "deleteService": {
        if (await scaling.getScalingTarget(region, cluster, name))
          throw new Error(
            "Remove service autoscaling before deleting this service.",
          );
        await ecs.deleteService(region, cluster, name);
        destination = `${base}/services`;
        break;
      }
      case "runTask": {
        const input = workloadSchema
          .safeExtend({
            count: z.number().int().min(1).max(10).default(1),
            overrides: z
              .object({
                containerOverrides: z
                  .array(
                    z.object({
                      name: z.string().min(1),
                      command: z.array(z.string()).optional(),
                      environment: z
                        .array(
                          z.object({ name: z.string(), value: z.string() }),
                        )
                        .optional(),
                    }),
                  )
                  .optional(),
              })
              .optional(),
          })
          .parse(payload(form));
        const token = z.string().uuid().parse(form.get("clientToken"));
        const result = await ecs.runTask(region, {
          ...input,
          cluster,
          clientToken: token,
        });
        started = result.tasks.length > 0;
        if (!result.tasks.length) {
          ecs.checkFailures(result.failures);
          throw new Error(
            "AWS did not return any started tasks. Refresh before retrying with the same request token.",
          );
        }
        message = `${result.tasks.length} task(s) accepted: ${result.tasks.map((t) => t.taskArn?.split("/").pop()).join(", ") || "none"}.`;
        if (result.failures.length)
          message += ` Some tasks failed: ${result.failures.map((f) => `${f.reason}: ${f.detail ?? f.arn ?? ""}`).join("; ")}. Retry uses the same request token.`;
        break;
      }
      case "stopTask":
        await ecs.stopTask(region, cluster, name);
        break;
      case "registerDefinition": {
        const input = taskDefinitionSchema.parse(payload(form));
        const result = await ecs.registerTaskDefinition(
          region,
          input as RegisterTaskDefinitionCommandInput,
        );
        destination =
          result?.family && result.revision
            ? `/ecs/task-definitions/${encodeURIComponent(`${result.family}:${result.revision}`)}`
            : "/ecs/task-definitions";
        break;
      }
      case "deregisterDefinition":
        await ecs.deregisterTaskDefinition(region, name);
        break;
      case "deleteDefinition":
        await ecs.deleteTaskDefinition(region, name);
        destination = "/ecs/task-definitions";
        break;
      case "createProvider":
      case "updateProvider": {
        const providerName =
          operation === "createProvider"
            ? resourceName.parse(form.get("name"))
            : name;
        if (/^(aws|ecs|fargate)/i.test(providerName))
          throw new Error(
            "Provider names cannot begin with aws, ecs, or fargate.",
          );
        const input = providerSchema.parse(payload(form));
        await validateAutoScalingGroup(
          region,
          input.autoScalingGroupArn,
          input.managedTerminationProtection === "ENABLED",
        );
        await ecs.saveCapacityProvider(
          region,
          providerName,
          input as AutoScalingGroupProvider,
          operation === "updateProvider",
        );
        if (operation === "createProvider")
          destination = `/ecs/capacity-providers/${encodeURIComponent(providerName)}`;
        break;
      }
      case "deleteProvider":
        await ecs.deleteCapacityProvider(region, name);
        destination = "/ecs/capacity-providers";
        break;
      case "drain":
      case "activate":
        await ecs.setContainerInstanceState(
          region,
          cluster,
          name,
          operation === "drain" ? "DRAINING" : "ACTIVE",
        );
        break;
      case "deregisterInstance":
        await ecs.deregisterContainerInstance(region, cluster, name);
        destination = `${base}/container-instances`;
        break;
      case "scalingTarget": {
        await scalableService(region, cluster, name);
        const input = bounds.parse(payload(form));
        if (input.MaxCapacity === 0) confirm(form, name);
        await scaling.saveScalingTarget(region, cluster, name, input);
        break;
      }
      case "removeScalingTarget":
        await scalableService(region, cluster, name);
        await scaling.removeScalingTarget(region, cluster, name);
        break;
      case "scalingPolicy": {
        const service = await scalableService(region, cluster, name);
        const input = z
          .object({
            name: z.string().min(1).max(256),
            metric: z.enum([
              "ECSServiceAverageCPUUtilization",
              "ECSServiceAverageMemoryUtilization",
              "ALBRequestCountPerTarget",
            ]),
            targetValue: z.number().positive(),
            scaleInCooldown: z.number().int().min(0).default(300),
            scaleOutCooldown: z.number().int().min(0).default(300),
            disableScaleIn: z.boolean().default(false),
            targetGroupArn: z.string().optional(),
          })
          .parse(payload(form));
        if (!(await scaling.getScalingTarget(region, cluster, name)))
          throw new Error(
            "Save the service's min/max capacity before creating policies.",
          );
        let label: string | undefined;
        if (input.metric === "ALBRequestCountPerTarget") {
          if (
            !input.targetGroupArn ||
            !service.loadBalancers?.some(
              (l) => l.targetGroupArn === input.targetGroupArn,
            )
          )
            throw new Error("Choose a target group attached to this service.");
          label = await albResourceLabel(region, input.targetGroupArn);
        }
        await scaling.saveScalingPolicy(region, cluster, name, input.name, {
          TargetValue: input.targetValue,
          PredefinedMetricSpecification: {
            PredefinedMetricType: input.metric,
            ResourceLabel: label,
          },
          ScaleInCooldown: input.scaleInCooldown,
          ScaleOutCooldown: input.scaleOutCooldown,
          DisableScaleIn: input.disableScaleIn,
        });
        break;
      }
      case "removePolicy":
      case "removeSchedule": {
        await scalableService(region, cluster, name);
        const itemName = z.string().min(1).max(256).parse(form.get("itemName"));
        confirm(form, itemName);
        if (operation === "removePolicy")
          await scaling.removeScalingPolicy(region, cluster, name, itemName);
        else
          await scaling.removeScheduledAction(region, cluster, name, itemName);
        break;
      }
      case "schedule": {
        await scalableService(region, cluster, name);
        if (!(await scaling.getScalingTarget(region, cluster, name)))
          throw new Error(
            "Save min/max capacity before creating scheduled actions.",
          );
        const input = scheduleSchema.parse(payload(form));
        try {
          new Intl.DateTimeFormat("en", { timeZone: input.Timezone });
        } catch {
          throw new Error(
            "Enter an IANA timezone such as UTC or America/Fortaleza.",
          );
        }
        if (input.ScalableTargetAction.MaxCapacity === 0) confirm(form, name);
        if (
          input.StartTime &&
          input.EndTime &&
          Date.parse(input.StartTime) >= Date.parse(input.EndTime)
        )
          throw new Error("Schedule end must be after its start.");
        await scaling.saveScheduledAction(region, cluster, name, {
          ...input,
          StartTime: input.StartTime ? new Date(input.StartTime) : undefined,
          EndTime: input.EndTime ? new Date(input.EndTime) : undefined,
        });
        break;
      }
    }
    started = true;
  } catch (error) {
    const detail =
      error instanceof z.ZodError
        ? error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(". ")
        : toUiError(error);
    return {
      error: `${started ? "AWS accepted part of this request. Refresh before retrying. " : ""}${detail}`,
    };
  }
  revalidatePath("/ecs", "layout");
  if (destination) redirect(destination);
  return { message };
}
