import {
  ListTopicsCommand,
  PublishCommand,
  SetSubscriptionAttributesCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, expect, it, vi } from "vitest";
import { listTopics, publish, subscribeQueue } from "./sns";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const mock = mockClient(SNSClient);
beforeEach(() => mock.reset());

it("returns an SNS topic page and continuation token", async () => {
  mock.on(ListTopicsCommand).resolves({ Topics: [{ TopicArn: "arn:topic" }], NextToken: "more" });
  await expect(listTopics("us-east-1", "page")).resolves.toEqual({ topics: [{ TopicArn: "arn:topic" }], nextToken: "more" });
});

it("publishes FIFO fields and message attributes", async () => {
  mock.on(PublishCommand).resolves({ MessageId: "message" });
  await publish("us-east-1", "arn:topic.fifo", { message: "hello", messageGroupId: "orders", messageDeduplicationId: "one", attributes: { event: { DataType: "String", StringValue: "created" } } });
  expect(mock.commandCalls(PublishCommand)[0].args[0].input).toMatchObject({ Message: "hello", MessageGroupId: "orders", MessageDeduplicationId: "one", MessageAttributes: { event: { DataType: "String", StringValue: "created" } } });
});

it("enables raw delivery after creating a queue subscription", async () => {
  mock.on(SubscribeCommand).resolves({ SubscriptionArn: "arn:subscription" });
  mock.on(SetSubscriptionAttributesCommand).resolves({});
  await subscribeQueue("us-east-1", "arn:topic", "arn:queue", true);
  expect(mock.commandCalls(SubscribeCommand)[0].args[0].input).toMatchObject({ Protocol: "sqs", Endpoint: "arn:queue", ReturnSubscriptionArn: true });
  expect(mock.commandCalls(SetSubscriptionAttributesCommand)[0].args[0].input).toMatchObject({ SubscriptionArn: "arn:subscription", AttributeName: "RawMessageDelivery", AttributeValue: "true" });
});
