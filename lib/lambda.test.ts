import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetPolicyCommand,
  InvokeCommand,
  LambdaClient,
  ListEventSourceMappingsCommand,
  ListFunctionsCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, expect, it, vi } from "vitest";
import {
  createFunction,
  deleteFunction,
  getTriggers,
  invokeFunction,
  listFunctions,
  updateFunctionCode,
  updateFunctionConfiguration,
} from "./lambda";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const mock = mockClient(LambdaClient);
beforeEach(() => mock.reset());

it("lists a bounded page of functions and exposes the continuation marker", async () => {
  mock.on(ListFunctionsCommand).resolves({
    Functions: [{ FunctionName: "orders", Runtime: "nodejs22.x" }],
    NextMarker: "page-2",
  });
  await expect(listFunctions("us-east-1", "page-1")).resolves.toEqual({
    functions: [{ FunctionName: "orders", Runtime: "nodejs22.x" }],
    nextToken: "page-2",
  });
  expect(mock.commandCalls(ListFunctionsCommand)[0].args[0].input).toEqual({
    Marker: "page-1",
    MaxItems: 50,
  });
});

it("keeps event-source mappings separate from invocation permissions", async () => {
  mock.on(ListEventSourceMappingsCommand).resolves({
    EventSourceMappings: [{ UUID: "mapping", EventSourceArn: "arn:aws:sqs:us-east-1:123:queue" }],
    NextMarker: "more",
  });
  mock.on(GetPolicyCommand).resolves({
    Policy: JSON.stringify({
      Statement: [
        { Sid: "s3", Effect: "Allow", Principal: { Service: "s3.amazonaws.com" }, Action: "lambda:InvokeFunction" },
        { Sid: "deny", Effect: "Deny", Principal: "*", Action: "lambda:InvokeFunction" },
      ],
    }),
  });
  const result = await getTriggers("us-east-1", "orders");
  expect(result.mappings).toHaveLength(1);
  expect(result.permissions).toEqual([
    { Sid: "s3", Effect: "Allow", Principal: { Service: "s3.amazonaws.com" }, Action: "lambda:InvokeFunction" },
  ]);
  expect(result.nextToken).toBe("more");
});

it("treats a missing resource policy as an empty permission list", async () => {
  mock.on(ListEventSourceMappingsCommand).resolves({});
  const missing = Object.assign(new Error("missing"), { name: "ResourceNotFoundException" });
  mock.on(GetPolicyCommand).rejects(missing);
  await expect(getTriggers("us-east-1", "orders")).resolves.toMatchObject({
    mappings: [],
    permissions: [],
    policyError: undefined,
  });
});

it("creates and updates ZIP functions without publishing", async () => {
  mock.on(CreateFunctionCommand).resolves({ FunctionName: "orders" });
  await createFunction("us-east-1", {
    name: "orders",
    role: "arn:aws:iam::123456789012:role/lambda-role",
    runtime: "nodejs22.x",
    handler: "index.handler",
    architecture: "arm64",
    code: { S3Bucket: "packages", S3Key: "orders.zip" },
  });
  expect(mock.commandCalls(CreateFunctionCommand)[0].args[0].input).toMatchObject({
    FunctionName: "orders",
    PackageType: "Zip",
    Architectures: ["arm64"],
    MemorySize: 128,
    Timeout: 3,
  });

  mock.on(UpdateFunctionCodeCommand).resolves({});
  await updateFunctionCode(
    "us-east-1",
    "orders",
    { ZipFile: new Uint8Array([1, 2, 3]) },
    "revision",
  );
  expect(mock.commandCalls(UpdateFunctionCodeCommand)[0].args[0].input).toMatchObject({
    FunctionName: "orders",
    RevisionId: "revision",
    Publish: false,
  });
});

it("preserves complete environment configuration and revision checks", async () => {
  mock.on(UpdateFunctionConfigurationCommand).resolves({});
  await updateFunctionConfiguration("us-east-1", "orders", {
    description: "Orders",
    memorySize: 512,
    timeout: 30,
    ephemeralStorage: 1024,
    role: "arn:aws:iam::123456789012:role/lambda-role",
    runtime: "nodejs22.x",
    handler: "index.handler",
    environment: { API_URL: "https://example.test", MODE: "safe" },
    revisionId: "revision",
  });
  expect(mock.commandCalls(UpdateFunctionConfigurationCommand)[0].args[0].input).toMatchObject({
    Environment: { Variables: { API_URL: "https://example.test", MODE: "safe" } },
    EphemeralStorage: { Size: 1024 },
    RevisionId: "revision",
  });
});

it("decodes invocation payloads and log tails and deletes by exact name", async () => {
  mock.on(InvokeCommand).resolves({
    StatusCode: 200,
    Payload: new TextEncoder().encode('{"ok":true}') as never,
    LogResult: Buffer.from("START\nEND").toString("base64"),
    $metadata: { requestId: "request-1" },
  });
  await expect(invokeFunction("us-east-1", "orders", "{}")).resolves.toMatchObject({
    statusCode: 200,
    payload: '{"ok":true}',
    logs: "START\nEND",
    requestId: "request-1",
  });
  mock.on(DeleteFunctionCommand).resolves({});
  await deleteFunction("us-east-1", "orders");
  expect(mock.commandCalls(DeleteFunctionCommand)[0].args[0].input).toEqual({ FunctionName: "orders" });
});
