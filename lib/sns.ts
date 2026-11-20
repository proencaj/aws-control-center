import "server-only";

import {
  CreateTopicCommand,
  DeleteTopicCommand,
  GetTopicAttributesCommand,
  ListSubscriptionsByTopicCommand,
  ListTopicsCommand,
  PublishCommand,
  SetSubscriptionAttributesCommand,
  SetTopicAttributesCommand,
  SubscribeCommand,
  UnsubscribeCommand,
  type MessageAttributeValue,
} from "@aws-sdk/client-sns";
import { snsClient } from "@/lib/aws/clients";

export async function listTopics(region: string, token?: string) {
  const result = await snsClient(region).send(new ListTopicsCommand({ NextToken: token }));
  return { topics: result.Topics ?? [], nextToken: result.NextToken };
}

export function topicNameFromArn(arn: string) {
  return arn.split(":").at(-1) ?? arn;
}

export async function getTopic(region: string, topicArn: string, token?: string) {
  const client = snsClient(region);
  const [attributes, subscriptions] = await Promise.all([
    client.send(new GetTopicAttributesCommand({ TopicArn: topicArn })),
    client.send(new ListSubscriptionsByTopicCommand({ TopicArn: topicArn, NextToken: token })),
  ]);
  return {
    attributes: attributes.Attributes ?? {},
    subscriptions: subscriptions.Subscriptions ?? [],
    nextToken: subscriptions.NextToken,
  };
}

export async function createTopic(region: string, name: string, attributes: Record<string, string>) {
  const result = await snsClient(region).send(new CreateTopicCommand({ Name: name, Attributes: attributes }));
  if (!result.TopicArn) throw new Error("AWS did not return the new topic ARN.");
  return result.TopicArn;
}

export async function updateTopic(region: string, topicArn: string, attributes: Record<string, string>) {
  const client = snsClient(region);
  await Promise.all(Object.entries(attributes).map(([AttributeName, AttributeValue]) =>
    client.send(new SetTopicAttributesCommand({ TopicArn: topicArn, AttributeName, AttributeValue })),
  ));
}

export async function deleteTopic(region: string, topicArn: string) {
  await snsClient(region).send(new DeleteTopicCommand({ TopicArn: topicArn }));
}

export async function publish(region: string, topicArn: string, input: {
  message: string;
  subject?: string;
  attributes?: Record<string, MessageAttributeValue>;
  messageGroupId?: string;
  messageDeduplicationId?: string;
}) {
  return snsClient(region).send(new PublishCommand({
    TopicArn: topicArn,
    Message: input.message,
    Subject: input.subject,
    MessageAttributes: input.attributes,
    MessageGroupId: input.messageGroupId,
    MessageDeduplicationId: input.messageDeduplicationId,
  }));
}

export async function subscribeQueue(region: string, topicArn: string, queueArn: string, raw: boolean) {
  const client = snsClient(region);
  const result = await client.send(new SubscribeCommand({ TopicArn: topicArn, Protocol: "sqs", Endpoint: queueArn, ReturnSubscriptionArn: true }));
  if (raw && result.SubscriptionArn && result.SubscriptionArn !== "pending confirmation") {
    await client.send(new SetSubscriptionAttributesCommand({ SubscriptionArn: result.SubscriptionArn, AttributeName: "RawMessageDelivery", AttributeValue: "true" }));
  }
  return result.SubscriptionArn;
}

export async function unsubscribe(region: string, subscriptionArn: string) {
  await snsClient(region).send(new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }));
}
