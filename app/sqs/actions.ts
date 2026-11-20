"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { getCallerIdentity } from "@/lib/sts";
import * as sqs from "@/lib/sqs";

export type SqsActionState = { error?: string; message?: string };
const queueName = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+(?:\.fifo)?$/, "Use letters, numbers, hyphens, or underscores; FIFO names must end in .fifo.");
const contextSchema = z.object({ region: z.string().min(1), account: z.string().regex(/^\d{12}$/) });
const messageAttributes = z.record(z.string().min(1).max(256), z.object({
  DataType: z.enum(["String", "Number"]),
  StringValue: z.string(),
}));

function failure(error: unknown): SqsActionState {
  if (error instanceof z.ZodError) return { error: error.issues.map((issue) => issue.message).join(". ") };
  return { error: toUiError(error) };
}

async function assertContext(formData: FormData) {
  const expected = contextSchema.parse({ region: formData.get("region"), account: formData.get("account") });
  const [region, identity] = await Promise.all([getRegion(), getCallerIdentity()]);
  if (region !== expected.region || identity.account !== expected.account) throw new Error("The account or region changed. Refresh this page before submitting again.");
  return expected;
}

function queueSettings(formData: FormData, fifo: boolean) {
  return {
    VisibilityTimeout: String(z.coerce.number().int().min(0).max(43200).parse(formData.get("visibilityTimeout"))),
    MessageRetentionPeriod: String(z.coerce.number().int().min(60).max(1209600).parse(formData.get("messageRetentionPeriod"))),
    DelaySeconds: String(z.coerce.number().int().min(0).max(900).parse(formData.get("delaySeconds"))),
    ReceiveMessageWaitTimeSeconds: String(z.coerce.number().int().min(0).max(20).parse(formData.get("receiveWaitTime"))),
    ...(fifo ? { FifoQueue: "true", ContentBasedDeduplication: formData.get("contentBasedDeduplication") === "on" ? "true" : "false" } : {}),
  };
}

export async function createQueueAction(_previous: SqsActionState, formData: FormData): Promise<SqsActionState> {
  let created: string | undefined;
  try {
    const { region } = await assertContext(formData);
    const fifo = formData.get("queueType") === "fifo";
    let name = queueName.parse(formData.get("queueName"));
    if (fifo && !name.endsWith(".fifo")) name += ".fifo";
    if (!fifo && name.endsWith(".fifo")) throw new Error("A Standard queue name cannot end in .fifo.");
    await sqs.createQueue(region, name, {
      ...queueSettings(formData, fifo),
      SqsManagedSseEnabled: "true",
    });
    created = name;
  } catch (error) { return failure(error); }
  revalidatePath("/sqs");
  redirect(`/sqs/queues/${encodeURIComponent(created!)}`);
}

export async function updateQueueAction(name: string, fifo: boolean, _previous: SqsActionState, formData: FormData): Promise<SqsActionState> {
  try {
    const { region } = await assertContext(formData);
    const attributes = queueSettings(formData, fifo);
    delete (attributes as Record<string, string>).FifoQueue;
    await sqs.updateQueue(region, queueName.parse(name), attributes);
    revalidatePath(`/sqs/queues/${encodeURIComponent(name)}`);
    return { message: "Queue configuration updated." };
  } catch (error) { return failure(error); }
}

export async function sendMessageAction(name: string, fifo: boolean, _previous: SqsActionState, formData: FormData): Promise<SqsActionState> {
  try {
    const { region } = await assertContext(formData);
    const body = z.string().min(1, "Message body is required.").refine((value) => new TextEncoder().encode(value).byteLength <= 1024 * 1024, "Message body exceeds 1 MiB.").parse(formData.get("body"));
    const rawAttributes = z.string().parse(formData.get("messageAttributes") || "{}");
    const attributes = messageAttributes.parse(JSON.parse(rawAttributes));
    const result = await sqs.sendMessage(region, queueName.parse(name), {
      body,
      delaySeconds: fifo ? undefined : z.coerce.number().int().min(0).max(900).parse(formData.get("messageDelay") || 0),
      messageAttributes: Object.keys(attributes).length ? attributes : undefined,
      messageGroupId: fifo ? z.string().trim().min(1, "Message group ID is required.").max(128).parse(formData.get("messageGroupId")) : undefined,
      messageDeduplicationId: fifo ? z.string().trim().max(128).optional().parse(formData.get("messageDeduplicationId") || undefined) : undefined,
    });
    return { message: `Message sent. ID: ${result.MessageId ?? "unknown"}` };
  } catch (error) { return failure(error instanceof SyntaxError ? new Error("Message attributes must be valid JSON.") : error); }
}

export async function deleteQueueAction(name: string, _previous: SqsActionState, formData: FormData): Promise<SqsActionState> {
  try {
    const { region } = await assertContext(formData);
    const parsed = queueName.parse(name);
    if (formData.get("confirm") !== parsed) return { error: "Type the exact queue name to confirm deletion." };
    await sqs.deleteQueue(region, parsed);
  } catch (error) { return failure(error); }
  revalidatePath("/sqs");
  redirect("/sqs");
}

export async function updateDeadLetterQueueAction(
  name: string,
  fifo: boolean,
  _previous: SqsActionState,
  formData: FormData,
): Promise<SqsActionState> {
  try {
    const { region } = await assertContext(formData);
    const parsedName = queueName.parse(name);
    const targetName = z.string().trim().parse(formData.get("deadLetterQueue"));
    if (!targetName) {
      await sqs.updateQueue(region, parsedName, { RedrivePolicy: "" });
    } else {
      const parsedTarget = queueName.parse(targetName);
      if (parsedTarget === parsedName) throw new Error("A queue cannot use itself as its dead-letter queue.");
      const target = await sqs.getQueue(region, parsedTarget);
      const targetFifo = target.attributes.FifoQueue === "true" || parsedTarget.endsWith(".fifo");
      if (targetFifo !== fifo) throw new Error("The source queue and dead-letter queue must have the same type.");
      const targetArn = target.attributes.QueueArn;
      if (!targetArn) throw new Error("AWS did not return the dead-letter queue ARN.");
      const maxReceiveCount = z.coerce.number().int().min(1).max(1000).parse(formData.get("maxReceiveCount"));
      await sqs.updateQueue(region, parsedName, {
        RedrivePolicy: JSON.stringify({ deadLetterTargetArn: targetArn, maxReceiveCount: String(maxReceiveCount) }),
      });
    }
    revalidatePath(`/sqs/queues/${encodeURIComponent(parsedName)}`);
    return { message: targetName ? "Dead-letter queue configuration updated." : "Dead-letter queue disabled." };
  } catch (error) { return failure(error); }
}

export async function updateRedriveAllowPolicyAction(
  name: string,
  _previous: SqsActionState,
  formData: FormData,
): Promise<SqsActionState> {
  try {
    const { region, account } = await assertContext(formData);
    const permission = z.enum(["allowAll", "denyAll", "byQueue"]).parse(formData.get("redrivePermission"));
    let policy: { redrivePermission: string; sourceQueueArns?: string[] } = { redrivePermission: permission };
    if (permission === "byQueue") {
      const sourceQueueArns = z.array(z.string().trim().min(1)).min(1, "Enter at least one source queue ARN.").max(10, "Enter no more than 10 source queue ARNs.").parse(
        z.string().parse(formData.get("sourceQueueArns")).split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      );
      const prefix = `arn:aws:sqs:${region}:${account}:`;
      if (sourceQueueArns.some((value) => !value.startsWith(prefix))) throw new Error("Every source queue ARN must belong to the selected account and region.");
      policy = { redrivePermission: permission, sourceQueueArns };
    }
    const parsedName = queueName.parse(name);
    await sqs.updateQueue(region, parsedName, { RedriveAllowPolicy: JSON.stringify(policy) });
    revalidatePath(`/sqs/queues/${encodeURIComponent(parsedName)}`);
    return { message: "Redrive allow policy updated." };
  } catch (error) { return failure(error); }
}

export async function startRedriveAction(
  name: string,
  fifo: boolean,
  _previous: SqsActionState,
  formData: FormData,
): Promise<SqsActionState> {
  try {
    const { region } = await assertContext(formData);
    const parsedName = queueName.parse(name);
    const destinationName = z.string().trim().parse(formData.get("destinationQueue"));
    let destinationArn: string | undefined;
    if (destinationName) {
      const parsedDestination = queueName.parse(destinationName);
      if (parsedDestination === parsedName) throw new Error("The redrive destination must be different from the dead-letter queue.");
      const destination = await sqs.getQueue(region, parsedDestination);
      const destinationFifo = destination.attributes.FifoQueue === "true" || parsedDestination.endsWith(".fifo");
      if (destinationFifo !== fifo) throw new Error("The dead-letter queue and destination queue must have the same type.");
      destinationArn = destination.attributes.QueueArn;
      if (!destinationArn) throw new Error("AWS did not return the destination queue ARN.");
    }
    const rawVelocity = z.string().trim().parse(formData.get("maxVelocity") || "");
    const velocity = rawVelocity ? z.coerce.number().int().min(1).max(500).parse(rawVelocity) : undefined;
    const result = await sqs.startMessageMoveTask(region, parsedName, destinationArn, velocity);
    revalidatePath(`/sqs/queues/${encodeURIComponent(parsedName)}`);
    return { message: `Redrive started. Task: ${result.TaskHandle ?? "accepted"}` };
  } catch (error) { return failure(error); }
}

export async function cancelRedriveAction(
  name: string,
  taskHandle: string,
  _previous: SqsActionState,
  formData: FormData,
): Promise<SqsActionState> {
  try {
    const { region } = await assertContext(formData);
    await sqs.cancelMessageMoveTask(region, z.string().min(1).parse(taskHandle));
    revalidatePath(`/sqs/queues/${encodeURIComponent(name)}`);
    return { message: "Redrive cancellation requested. Messages already moved remain in their destination." };
  } catch (error) { return failure(error); }
}
