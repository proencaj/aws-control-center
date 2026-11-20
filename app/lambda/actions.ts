"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import * as lambda from "@/lib/lambda";
import { getCallerIdentity } from "@/lib/sts";

export type LambdaActionState = {
  error?: string;
  message?: string;
  result?: Awaited<ReturnType<typeof lambda.invokeFunction>>;
};

const functionName = z
  .string()
  .trim()
  .min(1, "Function name is required.")
  .max(64)
  .regex(/^[A-Za-z0-9-_]+$/, "Use letters, numbers, hyphens, and underscores.");
const roleArn = z
  .string()
  .trim()
  .regex(/^arn:[^:]+:iam::\d{12}:role\/.+$/, "Enter an IAM role ARN.");
const contextSchema = z.object({
  region: z.string().min(1),
  account: z.string().regex(/^\d{12}$/),
});

function failure(error: unknown): LambdaActionState {
  if (error instanceof z.ZodError)
    return { error: error.issues.map((issue) => issue.message).join(". ") };
  return { error: toUiError(error) };
}

async function assertContext(formData: FormData) {
  const expected = contextSchema.parse({
    region: formData.get("region"),
    account: formData.get("account"),
  });
  const [region, identity] = await Promise.all([getRegion(), getCallerIdentity()]);
  if (region !== expected.region || identity.account !== expected.account)
    throw new Error(
      "The account or region changed. Refresh this page before submitting again.",
    );
  return expected;
}

const s3Code = z.object({
  bucket: z.string().trim().min(3, "S3 bucket is required."),
  key: z.string().trim().min(1, "S3 object key is required."),
  version: z.string().trim().optional(),
});

export async function createFromS3Action(
  _previous: LambdaActionState,
  formData: FormData,
): Promise<LambdaActionState> {
  let created: string | undefined;
  try {
    const { region } = await assertContext(formData);
    const code = s3Code.parse({
      bucket: formData.get("s3Bucket"),
      key: formData.get("s3Key"),
      version: formData.get("s3ObjectVersion") || undefined,
    });
    created = await lambda.createFunction(region, {
      name: functionName.parse(formData.get("functionName")),
      role: roleArn.parse(formData.get("role")),
      runtime: z.string().min(1).parse(formData.get("runtime")) as never,
      handler: z.string().trim().min(1).max(128).parse(formData.get("handler")),
      architecture: z.enum(["x86_64", "arm64"]).parse(formData.get("architecture")),
      description: z.string().max(256).parse(formData.get("description")),
      code: {
        S3Bucket: code.bucket,
        S3Key: code.key,
        S3ObjectVersion: code.version,
      },
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/lambda");
  redirect(`/lambda/functions/${encodeURIComponent(created!)}`);
}

export async function updateCodeFromS3Action(
  name: string,
  _previous: LambdaActionState,
  formData: FormData,
): Promise<LambdaActionState> {
  try {
    const { region } = await assertContext(formData);
    const code = s3Code.parse({
      bucket: formData.get("s3Bucket"),
      key: formData.get("s3Key"),
      version: formData.get("s3ObjectVersion") || undefined,
    });
    await lambda.updateFunctionCode(
      region,
      functionName.parse(name),
      {
        S3Bucket: code.bucket,
        S3Key: code.key,
        S3ObjectVersion: code.version,
      },
      z.string().optional().parse(formData.get("revisionId") || undefined),
    );
    revalidatePath(`/lambda/functions/${encodeURIComponent(name)}`);
    revalidatePath("/lambda");
    return { message: "Code deployment started. Refresh to see its status." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateConfigurationAction(
  name: string,
  isZip: boolean,
  _previous: LambdaActionState,
  formData: FormData,
): Promise<LambdaActionState> {
  try {
    const { region } = await assertContext(formData);
    const environment = z.record(z.string(), z.string()).parse(
      JSON.parse(z.string().parse(formData.get("environment"))),
    );
    await lambda.updateFunctionConfiguration(region, functionName.parse(name), {
      description: z.string().max(256).parse(formData.get("description")),
      memorySize: z.coerce.number().int().min(128).max(10240).parse(formData.get("memorySize")),
      timeout: z.coerce.number().int().min(1).max(900).parse(formData.get("timeout")),
      ephemeralStorage: z.coerce.number().int().min(512).max(10240).parse(formData.get("ephemeralStorage")),
      role: roleArn.parse(formData.get("role")),
      runtime: isZip
        ? (z.string().min(1).parse(formData.get("runtime")) as never)
        : undefined,
      handler: isZip
        ? z.string().trim().min(1).max(128).parse(formData.get("handler"))
        : undefined,
      environment,
      revisionId: z.string().optional().parse(formData.get("revisionId") || undefined),
    });
    revalidatePath(`/lambda/functions/${encodeURIComponent(name)}`);
    revalidatePath("/lambda");
    return { message: "Configuration update started. Refresh to see its status." };
  } catch (error) {
    return failure(error);
  }
}

export async function invokeFunctionAction(
  name: string,
  _previous: LambdaActionState,
  formData: FormData,
): Promise<LambdaActionState> {
  try {
    const { region } = await assertContext(formData);
    const payload = z.string().max(6 * 1024 * 1024).parse(formData.get("payload"));
    JSON.parse(payload);
    return { result: await lambda.invokeFunction(region, functionName.parse(name), payload) };
  } catch (error) {
    return failure(error instanceof SyntaxError ? new Error("Payload must be valid JSON.") : error);
  }
}

export async function deleteFunctionAction(
  name: string,
  _previous: LambdaActionState,
  formData: FormData,
): Promise<LambdaActionState> {
  try {
    const { region } = await assertContext(formData);
    const parsed = functionName.parse(name);
    if (formData.get("confirm") !== parsed)
      return { error: "Type the exact function name to confirm deletion." };
    await lambda.deleteFunction(region, parsed);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/lambda");
  redirect("/lambda");
}
