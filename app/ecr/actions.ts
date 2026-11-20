"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { getCallerIdentity } from "@/lib/sts";
import * as ecr from "@/lib/ecr";
import { repositoryUrl } from "./urls";

export type EcrActionState = { error?: string; message?: string };

const repositoryName = z
  .string()
  .trim()
  .min(2)
  .max(256)
  .regex(
    /^[a-z0-9]+(?:[._-]+[a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-]+[a-z0-9]+)*)*$/,
    "Use lowercase letters, numbers, separators (.-_), and optional / namespaces.",
  );
const mutability = z.enum([
  "MUTABLE",
  "IMMUTABLE",
  "MUTABLE_WITH_EXCLUSION",
  "IMMUTABLE_WITH_EXCLUSION",
]);
const digest = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, "Invalid image digest.");
const contextSchema = z.object({
  region: z.string().min(1),
  account: z.string().regex(/^\d{12}$/),
});

function failure(error: unknown): EcrActionState {
  if (error instanceof z.ZodError)
    return { error: error.issues.map((issue) => issue.message).join(". ") };
  return { error: toUiError(error) };
}

async function assertContext(formData: FormData) {
  const expected = contextSchema.parse({
    region: formData.get("region"),
    account: formData.get("account"),
  });
  const [currentRegion, identity] = await Promise.all([
    getRegion(),
    getCallerIdentity(),
  ]);
  if (
    currentRegion !== expected.region ||
    identity.account !== expected.account
  )
    throw new Error(
      "The account or region changed. Refresh this page before submitting again.",
    );
  return expected;
}

export async function createRepositoryAction(
  _previous: EcrActionState,
  formData: FormData,
): Promise<EcrActionState> {
  let created: string | undefined;
  try {
    const { region } = await assertContext(formData);
    const name = repositoryName.parse(formData.get("repositoryName"));
    const setting = z
      .enum(["MUTABLE", "IMMUTABLE"])
      .parse(formData.get("imageTagMutability"));
    created = (await ecr.createRepository(region, name, setting))
      .repositoryName;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/ecr");
  redirect(created ? repositoryUrl(created) : "/ecr");
}

export async function updateMutabilityAction(
  name: string,
  exclusionsJson: string,
  _previous: EcrActionState,
  formData: FormData,
): Promise<EcrActionState> {
  try {
    const { region } = await assertContext(formData);
    const parsedName = repositoryName.parse(name);
    const setting = mutability.parse(formData.get("imageTagMutability"));
    const exclusions = z
      .array(
        z.object({
          filterType: z.literal("WILDCARD"),
          filter: z.string().min(1).max(128),
        }),
      )
      .max(5)
      .parse(JSON.parse(exclusionsJson));
    await ecr.updateTagMutability(region, parsedName, setting, exclusions);
    revalidatePath(repositoryUrl(parsedName));
    revalidatePath("/ecr");
    return { message: "Tag mutability updated." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteRepositoryAction(
  name: string,
  _previous: EcrActionState,
  formData: FormData,
): Promise<EcrActionState> {
  try {
    const { region } = await assertContext(formData);
    const parsedName = repositoryName.parse(name);
    if (formData.get("confirm") !== parsedName)
      return { error: "Type the exact repository name to confirm deletion." };
    await ecr.deleteRepository(region, parsedName);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/ecr");
  redirect("/ecr");
}

export async function deleteImageAction(
  name: string,
  imageDigest: string,
  _previous: EcrActionState,
  formData: FormData,
): Promise<EcrActionState> {
  try {
    const { region } = await assertContext(formData);
    const parsedName = repositoryName.parse(name);
    const parsedDigest = digest.parse(imageDigest);
    if (formData.get("confirm") !== parsedDigest)
      return { error: "Type the exact image digest to confirm deletion." };
    await ecr.deleteImage(region, parsedName, parsedDigest);
    revalidatePath(repositoryUrl(parsedName));
    return { message: "Image deleted." };
  } catch (error) {
    return failure(error);
  }
}
