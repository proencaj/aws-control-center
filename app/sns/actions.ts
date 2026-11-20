"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { getCallerIdentity } from "@/lib/sts";
import * as sns from "@/lib/sns";
import * as sqs from "@/lib/sqs";

export type SnsActionState = { error?: string; message?: string };
const topicName = z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9_-]+(?:\.fifo)?$/, "Use letters, numbers, hyphens, or underscores; FIFO names must end in .fifo.");
const arn = z.string().startsWith("arn:");
const contextSchema = z.object({ region: z.string().min(1), account: z.string().regex(/^\d{12}$/) });
const messageAttributes = z.record(z.string().min(1).max(256), z.object({ DataType: z.enum(["String", "Number"]), StringValue: z.string() }));

function failure(error: unknown): SnsActionState {
  if (error instanceof z.ZodError) return { error: error.issues.map((issue) => issue.message).join(". ") };
  return { error: toUiError(error) };
}

async function assertContext(formData: FormData) {
  const expected = contextSchema.parse({ region: formData.get("region"), account: formData.get("account") });
  const [region, identity] = await Promise.all([getRegion(), getCallerIdentity()]);
  if (region !== expected.region || identity.account !== expected.account) throw new Error("The account or region changed. Refresh this page before submitting again.");
  return expected;
}

export async function createTopicAction(_previous: SnsActionState, formData: FormData): Promise<SnsActionState> {
  let created: string | undefined;
  try {
    const { region } = await assertContext(formData);
    const fifo = formData.get("topicType") === "fifo";
    let name = topicName.parse(formData.get("topicName"));
    if (fifo && !name.endsWith(".fifo")) name += ".fifo";
    if (!fifo && name.endsWith(".fifo")) throw new Error("A Standard topic name cannot end in .fifo.");
    created = await sns.createTopic(region, name, fifo ? { FifoTopic: "true", ContentBasedDeduplication: formData.get("contentBasedDeduplication") === "on" ? "true" : "false" } : {});
  } catch (error) { return failure(error); }
  revalidatePath("/sns");
  redirect(`/sns/topics/${encodeURIComponent(created!)}`);
}

export async function updateTopicAction(topicArn: string, fifo: boolean, _previous: SnsActionState, formData: FormData): Promise<SnsActionState> {
  try {
    const { region } = await assertContext(formData);
    await sns.updateTopic(region, arn.parse(topicArn), {
      DisplayName: z.string().max(100).parse(formData.get("displayName")),
      ...(fifo ? { ContentBasedDeduplication: formData.get("contentBasedDeduplication") === "on" ? "true" : "false" } : {}),
    });
    revalidatePath(`/sns/topics/${encodeURIComponent(topicArn)}`);
    return { message: "Topic configuration updated." };
  } catch (error) { return failure(error); }
}

export async function publishAction(topicArn: string, fifo: boolean, _previous: SnsActionState, formData: FormData): Promise<SnsActionState> {
  try {
    const { region } = await assertContext(formData);
    const message = z.string().min(1, "Message is required.").refine((value) => new TextEncoder().encode(value).byteLength <= 256 * 1024, "Message exceeds 256 KiB.").parse(formData.get("message"));
    const attributes = messageAttributes.parse(JSON.parse(z.string().parse(formData.get("messageAttributes") || "{}")));
    const result = await sns.publish(region, arn.parse(topicArn), {
      message,
      subject: z.string().trim().max(100).optional().parse(formData.get("subject") || undefined),
      attributes: Object.keys(attributes).length ? attributes : undefined,
      messageGroupId: fifo ? z.string().trim().min(1, "Message group ID is required.").max(128).parse(formData.get("messageGroupId")) : undefined,
      messageDeduplicationId: fifo ? z.string().trim().max(128).optional().parse(formData.get("messageDeduplicationId") || undefined) : undefined,
    });
    return { message: `Message published. ID: ${result.MessageId ?? "unknown"}` };
  } catch (error) { return failure(error instanceof SyntaxError ? new Error("Message attributes must be valid JSON.") : error); }
}

export async function subscribeQueueAction(topicArn: string, _previous: SnsActionState, formData: FormData): Promise<SnsActionState> {
  try {
    const { region } = await assertContext(formData);
    const name = z.string().min(1).parse(formData.get("queueName"));
    const queueArn = await sqs.allowTopic(region, name, arn.parse(topicArn));
    const subscriptionArn = await sns.subscribeQueue(region, topicArn, queueArn, formData.get("rawMessageDelivery") === "on");
    revalidatePath(`/sns/topics/${encodeURIComponent(topicArn)}`);
    return { message: `Queue connected. Subscription: ${subscriptionArn ?? "created"}` };
  } catch (error) { return failure(error); }
}

export async function unsubscribeAction(topicArn: string, subscriptionArn: string, _previous: SnsActionState, formData: FormData): Promise<SnsActionState> {
  try {
    const { region } = await assertContext(formData);
    if (formData.get("confirm") !== subscriptionArn) return { error: "Type the exact subscription ARN to confirm." };
    await sns.unsubscribe(region, arn.parse(subscriptionArn));
    revalidatePath(`/sns/topics/${encodeURIComponent(topicArn)}`);
    return { message: "Subscription removed. The queue policy statement remains in place." };
  } catch (error) { return failure(error); }
}

export async function deleteTopicAction(topicArn: string, _previous: SnsActionState, formData: FormData): Promise<SnsActionState> {
  try {
    const { region } = await assertContext(formData);
    const parsed = arn.parse(topicArn);
    const name = sns.topicNameFromArn(parsed);
    if (formData.get("confirm") !== name) return { error: "Type the exact topic name to confirm deletion." };
    await sns.deleteTopic(region, parsed);
  } catch (error) { return failure(error); }
  revalidatePath("/sns");
  redirect("/sns");
}
