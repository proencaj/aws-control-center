import "server-only";

import {
  CreateQueueCommand,
  CancelMessageMoveTaskCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListQueuesCommand,
  ListDeadLetterSourceQueuesCommand,
  ListMessageMoveTasksCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
  StartMessageMoveTaskCommand,
  type MessageAttributeValue,
} from "@aws-sdk/client-sqs";
import { sqsClient } from "@/lib/aws/clients";

export async function listQueues(region: string, prefix?: string, token?: string) {
  const client = sqsClient(region);
  const result = await client.send(new ListQueuesCommand({
    QueueNamePrefix: prefix || undefined,
    NextToken: token,
    MaxResults: 50,
  }));
  const queueUrls = result.QueueUrls ?? [];
  const queues = await Promise.all(queueUrls.map(async (queueUrl) => {
    try {
      const details = await client.send(new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }));
      return { queueUrl, attributes: details.Attributes ?? {} };
    } catch {
      // Listing queues should remain useful if GetQueueAttributes is denied for one queue.
      return { queueUrl, attributes: undefined };
    }
  }));
  return { queueUrls, queues, nextToken: result.NextToken };
}

export function queueNameFromUrl(url: string) {
  return decodeURIComponent(url.split("/").at(-1) ?? url);
}

export async function getQueue(region: string, name: string) {
  const client = sqsClient(region);
  const { QueueUrl } = await client.send(new GetQueueUrlCommand({ QueueName: name }));
  if (!QueueUrl) throw new Error("AWS did not return the queue URL.");
  const result = await client.send(new GetQueueAttributesCommand({
    QueueUrl,
    AttributeNames: ["All"],
  }));
  return { queueUrl: QueueUrl, attributes: result.Attributes ?? {} };
}

export async function createQueue(region: string, name: string, attributes: Record<string, string>) {
  const result = await sqsClient(region).send(new CreateQueueCommand({ QueueName: name, Attributes: attributes }));
  if (!result.QueueUrl) throw new Error("AWS did not return the new queue URL.");
  return result.QueueUrl;
}

export async function updateQueue(region: string, name: string, attributes: Record<string, string>) {
  const { queueUrl } = await getQueue(region, name);
  await sqsClient(region).send(new SetQueueAttributesCommand({ QueueUrl: queueUrl, Attributes: attributes }));
}

export async function deleteQueue(region: string, name: string) {
  const { queueUrl } = await getQueue(region, name);
  await sqsClient(region).send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
}

export async function sendMessage(region: string, name: string, input: {
  body: string;
  delaySeconds?: number;
  messageAttributes?: Record<string, MessageAttributeValue>;
  messageGroupId?: string;
  messageDeduplicationId?: string;
}) {
  const { queueUrl } = await getQueue(region, name);
  return sqsClient(region).send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: input.body,
    DelaySeconds: input.delaySeconds,
    MessageAttributes: input.messageAttributes,
    MessageGroupId: input.messageGroupId,
    MessageDeduplicationId: input.messageDeduplicationId,
  }));
}

export async function receiveMessages(region: string, name: string, waitTimeSeconds: number, visibilityTimeout?: number) {
  const { queueUrl } = await getQueue(region, name);
  const result = await sqsClient(region).send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: waitTimeSeconds,
    VisibilityTimeout: visibilityTimeout,
    AttributeNames: ["All"],
    MessageAttributeNames: ["All"],
  }));
  return result.Messages ?? [];
}

export async function deleteMessage(region: string, name: string, receiptHandle: string) {
  const { queueUrl } = await getQueue(region, name);
  await sqsClient(region).send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }));
}

export async function allowTopic(region: string, name: string, topicArn: string) {
  const { queueUrl, attributes } = await getQueue(region, name);
  const queueArn = attributes.QueueArn;
  if (!queueArn) throw new Error("AWS did not return the queue ARN.");
  const policy = attributes.Policy ? JSON.parse(attributes.Policy) as { Version?: string; Id?: string; Statement?: unknown[] } : {};
  const statements = Array.isArray(policy.Statement) ? policy.Statement : [];
  const sid = `AllowSns${Buffer.from(topicArn).toString("hex").slice(-24)}`;
  const statement = {
    Sid: sid,
    Effect: "Allow",
    Principal: { Service: "sns.amazonaws.com" },
    Action: "sqs:SendMessage",
    Resource: queueArn,
    Condition: { ArnEquals: { "aws:SourceArn": topicArn } },
  };
  const next = { ...policy, Version: policy.Version ?? "2012-10-17", Statement: [...statements.filter((item) => !(item && typeof item === "object" && "Sid" in item && item.Sid === sid)), statement] };
  await sqsClient(region).send(new SetQueueAttributesCommand({ QueueUrl: queueUrl, Attributes: { Policy: JSON.stringify(next) } }));
  return queueArn;
}

export async function getRedriveInfo(region: string, name: string) {
  const client = sqsClient(region);
  const { queueUrl, attributes } = await getQueue(region, name);
  const sourceArn = attributes.QueueArn;
  if (!sourceArn) throw new Error("AWS did not return the queue ARN.");
  const [sources, tasks] = await Promise.all([
    client.send(new ListDeadLetterSourceQueuesCommand({
      QueueUrl: queueUrl,
      MaxResults: 100,
    })),
    client.send(new ListMessageMoveTasksCommand({
      SourceArn: sourceArn,
      MaxResults: 10,
    })),
  ]);
  return {
    sourceQueueUrls: sources.queueUrls ?? [],
    sourceQueueNextToken: sources.NextToken,
    tasks: tasks.Results ?? [],
  };
}

export async function startMessageMoveTask(
  region: string,
  sourceName: string,
  destinationArn?: string,
  maxNumberOfMessagesPerSecond?: number,
) {
  const { attributes } = await getQueue(region, sourceName);
  const sourceArn = attributes.QueueArn;
  if (!sourceArn) throw new Error("AWS did not return the source queue ARN.");
  return sqsClient(region).send(new StartMessageMoveTaskCommand({
    SourceArn: sourceArn,
    DestinationArn: destinationArn,
    MaxNumberOfMessagesPerSecond: maxNumberOfMessagesPerSecond,
  }));
}

export async function cancelMessageMoveTask(
  region: string,
  taskHandle: string,
) {
  await sqsClient(region).send(new CancelMessageMoveTaskCommand({
    TaskHandle: taskHandle,
  }));
}
