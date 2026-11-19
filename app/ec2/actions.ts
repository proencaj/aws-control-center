"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toUiError } from "@/lib/aws/errors";
import {
  addRule,
  createSecurityGroup,
  deleteSecurityGroup,
  launchInstance,
  rebootInstance,
  removeRule,
  startInstance,
  stopInstance,
  terminateInstance,
  type Direction,
} from "@/lib/ec2";

export type ActionState = { error?: string };

const instanceId = z.string().regex(/^i-[0-9a-f]+$/, "Invalid instance ID");
const groupId = z.string().regex(/^sg-[0-9a-f]+$/, "Invalid security group ID");
const ruleId = z.string().regex(/^sgr-[0-9a-f]+$/, "Invalid rule ID");
const direction = z.enum(["ingress", "egress"]);
const port = z.coerce.number().int().min(-1).max(65535);

function failure(error: unknown): ActionState {
  if (error instanceof z.ZodError)
    return { error: error.issues.map((issue) => issue.message).join(". ") };
  return { error: toUiError(error) };
}

async function run(
  work: () => Promise<void>,
  paths: string[],
): Promise<ActionState> {
  try {
    await work();
  } catch (error) {
    return failure(error);
  }
  for (const path of paths) revalidatePath(path);
  return {};
}

function instanceAction(command: (id: string) => Promise<void>) {
  return async (id: string): Promise<ActionState> =>
    run(() => command(instanceId.parse(id)), ["/ec2", `/ec2/instances/${id}`]);
}

export const startInstanceAction = instanceAction(startInstance);
export const stopInstanceAction = instanceAction(stopInstance);
export const rebootInstanceAction = instanceAction(rebootInstance);

export async function terminateInstanceAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formData.get("confirm") !== id)
    return { error: "Type the instance ID to confirm." };
  return run(
    () => terminateInstance(instanceId.parse(id)),
    ["/ec2", `/ec2/instances/${id}`],
  );
}

const launchSchema = z.object({
  name: z.string().trim().optional(),
  imageId: z.string().regex(/^ami-[0-9a-f]+$/, "Invalid AMI ID"),
  instanceType: z
    .string()
    .regex(/^[a-z0-9]+\.[a-z0-9]+$/, "Invalid instance type"),
  keyName: z.string().optional(),
  subnetId: z.string().optional(),
  securityGroupIds: z.array(groupId),
});

export async function launchInstanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let newInstanceId: string | undefined;
  try {
    const input = launchSchema.parse({
      name: formData.get("name") || undefined,
      imageId: formData.get("imageId"),
      instanceType: formData.get("instanceType"),
      keyName: formData.get("keyName") || undefined,
      subnetId: formData.get("subnetId") || undefined,
      securityGroupIds: formData.getAll("securityGroupIds"),
    });
    newInstanceId = await launchInstance(input);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/ec2");
  redirect(newInstanceId ? `/ec2/instances/${newInstanceId}` : "/ec2");
}

const createGroupSchema = z.object({
  groupName: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().min(1, "Description is required").max(255),
  vpcId: z.string().optional(),
});

export async function createSecurityGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let newGroupId: string | undefined;
  try {
    const input = createGroupSchema.parse({
      groupName: formData.get("groupName"),
      description: formData.get("description"),
      vpcId: formData.get("vpcId") || undefined,
    });
    newGroupId = await createSecurityGroup(input);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/ec2/security-groups");
  redirect(
    newGroupId ? `/ec2/security-groups/${newGroupId}` : "/ec2/security-groups",
  );
}

export async function deleteSecurityGroupAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formData.get("confirm") !== id)
    return { error: "Type the security group ID to confirm." };
  try {
    await deleteSecurityGroup(groupId.parse(id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/ec2/security-groups");
  redirect("/ec2/security-groups");
}

const ruleSchema = z.object({
  protocol: z.enum(["tcp", "udp", "icmp", "-1"]),
  fromPort: port.optional(),
  toPort: port.optional(),
  cidr: z
    .string()
    .regex(
      /^[0-9a-fA-F.:]+\/\d{1,3}$/,
      "Source must be a CIDR such as 10.0.0.0/16",
    ),
  description: z.string().trim().max(255).optional(),
});

export async function addRuleAction(
  id: string,
  ruleDirection: Direction,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return run(async () => {
    const rule = ruleSchema.parse({
      protocol: formData.get("protocol"),
      fromPort: formData.get("fromPort") || undefined,
      toPort: formData.get("toPort") || undefined,
      cidr: formData.get("cidr"),
      description: formData.get("description") || undefined,
    });
    if (
      rule.protocol !== "-1" &&
      (rule.fromPort === undefined || rule.toPort === undefined)
    ) {
      throw new z.ZodError([
        { code: "custom", message: "Port range is required", path: [] },
      ]);
    }
    await addRule(groupId.parse(id), direction.parse(ruleDirection), rule);
  }, [`/ec2/security-groups/${id}`]);
}

export async function removeRuleAction(
  id: string,
  ruleDirection: Direction,
  rule: string,
): Promise<ActionState> {
  return run(
    () =>
      removeRule(
        groupId.parse(id),
        direction.parse(ruleDirection),
        ruleId.parse(rule),
      ),
    [`/ec2/security-groups/${id}`],
  );
}
