import {
  CancelMessageMoveTaskCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListQueuesCommand,
  ListDeadLetterSourceQueuesCommand,
  ListMessageMoveTasksCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
  StartMessageMoveTaskCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, expect, it, vi } from "vitest";
import {
  allowTopic,
  cancelMessageMoveTask,
  deleteMessage,
  getRedriveInfo,
  listQueues,
  receiveMessages,
  startMessageMoveTask,
} from "./sqs";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const mock = mockClient(SQSClient);
beforeEach(() => mock.reset());

it("lists a bounded prefix page", async () => {
  mock.on(ListQueuesCommand).resolves({ QueueUrls: ["https://sqs.us-east-1.amazonaws.com/123/orders"], NextToken: "more" });
  mock.on(GetQueueAttributesCommand).resolves({ Attributes: { ApproximateNumberOfMessages: "12", ApproximateNumberOfMessagesNotVisible: "3" } });
  await expect(listQueues("us-east-1", "ord", "page")).resolves.toMatchObject({
    nextToken: "more",
    queues: [{ attributes: { ApproximateNumberOfMessages: "12", ApproximateNumberOfMessagesNotVisible: "3" } }],
  });
  expect(mock.commandCalls(ListQueuesCommand)[0].args[0].input).toEqual({ QueueNamePrefix: "ord", NextToken: "page", MaxResults: 50 });
  expect(mock.commandCalls(GetQueueAttributesCommand)[0].args[0].input).toMatchObject({ AttributeNames: ["All"] });
});

it("keeps the queue list when attributes for one queue are unavailable", async () => {
  mock.on(ListQueuesCommand).resolves({ QueueUrls: ["queue-url"] });
  mock.on(GetQueueAttributesCommand).rejects(new Error("denied"));
  await expect(listQueues("us-east-1")).resolves.toMatchObject({
    queues: [{ queueUrl: "queue-url", attributes: undefined }],
  });
});

it("long polls without deleting and exposes all attributes", async () => {
  mock.on(GetQueueUrlCommand).resolves({ QueueUrl: "queue-url" });
  mock.on(GetQueueAttributesCommand).resolves({ Attributes: { QueueArn: "arn:aws:sqs:us-east-1:123:orders" } });
  mock.on(ReceiveMessageCommand).resolves({ Messages: [{ MessageId: "one", ReceiptHandle: "receipt", Body: "hello" }] });
  await expect(receiveMessages("us-east-1", "orders", 20)).resolves.toHaveLength(1);
  expect(mock.commandCalls(ReceiveMessageCommand)[0].args[0].input).toMatchObject({ MaxNumberOfMessages: 10, WaitTimeSeconds: 20, AttributeNames: ["All"], MessageAttributeNames: ["All"] });
  expect(mock.commandCalls(DeleteMessageCommand)).toHaveLength(0);
  expect(mock.commandCalls(GetQueueAttributesCommand)[0].args[0].input).toMatchObject({ AttributeNames: ["All"] });
});

it("preserves unrelated queue policy statements and replaces its idempotent topic grant", async () => {
  const topic = "arn:aws:sns:us-east-1:123:orders";
  mock.on(GetQueueUrlCommand).resolves({ QueueUrl: "queue-url" });
  mock.on(GetQueueAttributesCommand).resolves({ Attributes: { QueueArn: "arn:aws:sqs:us-east-1:123:queue", Policy: JSON.stringify({ Version: "2012-10-17", Statement: [{ Sid: "Existing", Effect: "Allow" }] }) } });
  mock.on(SetQueueAttributesCommand).resolves({});
  await expect(allowTopic("us-east-1", "queue", topic)).resolves.toBe("arn:aws:sqs:us-east-1:123:queue");
  const saved = JSON.parse(mock.commandCalls(SetQueueAttributesCommand)[0].args[0].input.Attributes!.Policy!);
  expect(saved.Statement).toHaveLength(2);
  expect(saved.Statement[0]).toMatchObject({ Sid: "Existing" });
  expect(saved.Statement[1]).toMatchObject({ Principal: { Service: "sns.amazonaws.com" }, Action: "sqs:SendMessage", Condition: { ArnEquals: { "aws:SourceArn": topic } } });
});

it("deletes a received message only with its receipt handle", async () => {
  mock.on(GetQueueUrlCommand).resolves({ QueueUrl: "queue-url" });
  mock.on(GetQueueAttributesCommand).resolves({ Attributes: {} });
  mock.on(DeleteMessageCommand).resolves({});
  await deleteMessage("us-east-1", "orders", "receipt");
  expect(mock.commandCalls(DeleteMessageCommand)[0].args[0].input).toEqual({ QueueUrl: "queue-url", ReceiptHandle: "receipt" });
});

it("loads DLQ sources and recent message movement tasks", async () => {
  mock.on(GetQueueUrlCommand).resolves({ QueueUrl: "dlq-url" });
  mock.on(GetQueueAttributesCommand).resolves({ Attributes: { QueueArn: "arn:aws:sqs:us-east-1:123:orders-dlq" } });
  mock.on(ListDeadLetterSourceQueuesCommand).resolves({ queueUrls: ["source-url"] });
  mock.on(ListMessageMoveTasksCommand).resolves({ Results: [{ Status: "RUNNING", TaskHandle: "task" }] });
  await expect(getRedriveInfo("us-east-1", "orders-dlq")).resolves.toMatchObject({
    sourceQueueUrls: ["source-url"],
    tasks: [{ Status: "RUNNING", TaskHandle: "task" }],
  });
  expect(mock.commandCalls(ListMessageMoveTasksCommand)[0].args[0].input).toEqual({ SourceArn: "arn:aws:sqs:us-east-1:123:orders-dlq", MaxResults: 10 });
});

it("starts and cancels a bounded custom-destination redrive task", async () => {
  mock.on(GetQueueUrlCommand).resolves({ QueueUrl: "dlq-url" });
  mock.on(GetQueueAttributesCommand).resolves({ Attributes: { QueueArn: "arn:aws:sqs:us-east-1:123:orders-dlq" } });
  mock.on(StartMessageMoveTaskCommand).resolves({ TaskHandle: "task" });
  await expect(startMessageMoveTask("us-east-1", "orders-dlq", "arn:aws:sqs:us-east-1:123:orders", 25)).resolves.toMatchObject({ TaskHandle: "task" });
  expect(mock.commandCalls(StartMessageMoveTaskCommand)[0].args[0].input).toEqual({
    SourceArn: "arn:aws:sqs:us-east-1:123:orders-dlq",
    DestinationArn: "arn:aws:sqs:us-east-1:123:orders",
    MaxNumberOfMessagesPerSecond: 25,
  });
  mock.on(CancelMessageMoveTaskCommand).resolves({});
  await cancelMessageMoveTask("us-east-1", "task");
  expect(mock.commandCalls(CancelMessageMoveTaskCommand)[0].args[0].input).toEqual({ TaskHandle: "task" });
});
