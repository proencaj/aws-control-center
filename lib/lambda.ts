import "server-only";

import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetPolicyCommand,
  InvokeCommand,
  ListEventSourceMappingsCommand,
  ListFunctionsCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  type Architecture,
  type FunctionConfiguration,
  type Runtime,
} from "@aws-sdk/client-lambda";
import { lambdaClient } from "@/lib/aws/clients";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function listFunctions(region: string, marker?: string) {
  const result = await lambdaClient(region).send(
    new ListFunctionsCommand({ Marker: marker, MaxItems: 50 }),
  );
  return { functions: result.Functions ?? [], nextToken: result.NextMarker };
}

export async function getFunction(region: string, name: string) {
  return lambdaClient(region).send(new GetFunctionCommand({ FunctionName: name }));
}

export async function getTriggers(
  region: string,
  name: string,
  marker?: string,
) {
  const client = lambdaClient(region);
  const mappings = await client.send(
    new ListEventSourceMappingsCommand({
      FunctionName: name,
      Marker: marker,
      MaxItems: 100,
    }),
  );
  let policy: LambdaPolicy | undefined;
  let policyError: string | undefined;
  try {
    const response = await client.send(new GetPolicyCommand({ FunctionName: name }));
    if (response.Policy) policy = JSON.parse(response.Policy) as LambdaPolicy;
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      policy = { Statement: [] };
    } else {
      policyError = error instanceof Error ? error.message : "Unable to read the resource policy.";
    }
  }
  return {
    mappings: mappings.EventSourceMappings ?? [],
    nextToken: mappings.NextMarker,
    permissions: (Array.isArray(policy?.Statement)
      ? policy.Statement
      : policy?.Statement
        ? [policy.Statement]
        : []
    ).filter((statement) => statement.Effect === "Allow"),
    policyError,
  };
}

type LambdaPolicy = {
  Statement?: LambdaPermission | LambdaPermission[];
};

export type LambdaPermission = {
  Sid?: string;
  Effect?: string;
  Principal?: string | Record<string, string | string[]>;
  Action?: string | string[];
  Resource?: string;
  Condition?: Record<string, Record<string, string | string[]>>;
};

export type FunctionCode =
  | { ZipFile: Uint8Array }
  | { S3Bucket: string; S3Key: string; S3ObjectVersion?: string };

export async function createFunction(
  region: string,
  input: {
    name: string;
    role: string;
    runtime: Runtime;
    handler: string;
    architecture: Architecture;
    description?: string;
    code: FunctionCode;
  },
) {
  const response = await lambdaClient(region).send(
    new CreateFunctionCommand({
      FunctionName: input.name,
      Role: input.role,
      Runtime: input.runtime,
      Handler: input.handler,
      Architectures: [input.architecture],
      Description: input.description,
      PackageType: "Zip",
      Code: input.code,
      MemorySize: 128,
      Timeout: 3,
    }),
  );
  return response.FunctionName;
}

export async function updateFunctionCode(
  region: string,
  name: string,
  code: FunctionCode,
  revisionId?: string,
) {
  return lambdaClient(region).send(
    new UpdateFunctionCodeCommand({
      FunctionName: name,
      ...code,
      RevisionId: revisionId,
      Publish: false,
    }),
  );
}

export async function updateFunctionConfiguration(
  region: string,
  name: string,
  input: {
    description?: string;
    memorySize: number;
    timeout: number;
    ephemeralStorage: number;
    role: string;
    runtime?: Runtime;
    handler?: string;
    environment: Record<string, string>;
    revisionId?: string;
  },
) {
  return lambdaClient(region).send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: name,
      Description: input.description,
      MemorySize: input.memorySize,
      Timeout: input.timeout,
      EphemeralStorage: { Size: input.ephemeralStorage },
      Role: input.role,
      Runtime: input.runtime,
      Handler: input.handler,
      Environment: { Variables: input.environment },
      RevisionId: input.revisionId,
    }),
  );
}

export async function invokeFunction(region: string, name: string, payload: string) {
  const response = await lambdaClient(region).send(
    new InvokeCommand({
      FunctionName: name,
      InvocationType: "RequestResponse",
      LogType: "Tail",
      Payload: encoder.encode(payload),
    }),
  );
  return {
    statusCode: response.StatusCode,
    functionError: response.FunctionError,
    requestId: response.$metadata.requestId,
    payload: response.Payload ? decoder.decode(response.Payload) : "",
    logs: response.LogResult
      ? Buffer.from(response.LogResult, "base64").toString("utf8")
      : "",
  };
}

export async function deleteFunction(region: string, name: string) {
  await lambdaClient(region).send(new DeleteFunctionCommand({ FunctionName: name }));
}

export function functionName(config?: FunctionConfiguration) {
  return config?.FunctionName ?? "";
}
