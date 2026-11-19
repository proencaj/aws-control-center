"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  bucketRegion,
  changeStorageClass,
  deleteObject,
  getObjectLock,
  getOwnership,
} from "@/lib/s3";
import { toUiError } from "@/lib/aws/errors";
import { storageClasses } from "./options";

const schema = z.object({
  bucket: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,253}[A-Za-z0-9]$/)
    .refine((value) => !value.endsWith("--x-s3")),
  operation: z.enum(["delete", "storage"]),
  objects: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .refine(
            (value) => new TextEncoder().encode(value).length <= 1024,
            "Object key exceeds 1,024 bytes.",
          ),
        etag: z
          .string()
          .min(1)
          .max(256)
          .refine(
            (value) => value !== "*" && !/[\r\n]/.test(value),
            "A specific object ETag is required.",
          ),
      }),
    )
    .min(1)
    .max(100)
    .refine(
      (items) => new Set(items.map((item) => item.key)).size === items.length,
      "Duplicate object keys.",
    ),
  storageClass: z.enum(storageClasses).optional(),
});

export type ObjectActionState = {
  error?: string;
  results?: {
    key: string;
    status: "deleted" | "updated" | "unchanged" | "failed";
    error?: string;
  }[];
};

export async function objectAction(
  _previous: ObjectActionState,
  formData: FormData,
): Promise<ObjectActionState> {
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(JSON.parse(String(formData.get("payload"))));
    if (input.operation === "delete") {
      const required =
        input.objects.length === 1 ? input.objects[0].key : input.bucket;
      if (formData.get("confirm") !== required)
        return { error: "Type the exact resource name to confirm deletion." };
    } else if (!input.storageClass || formData.get("acknowledge") !== "yes") {
      return {
        error: "Select a storage class and acknowledge the copy operation.",
      };
    }
  } catch {
    return { error: "Invalid selection. Select 1–100 objects and try again." };
  }

  let region: string;
  let ownerEnforced = false;
  try {
    region = await bucketRegion(input.bucket);
    if (input.operation === "storage") {
      try {
        const result = await getOwnership(input.bucket, region);
        ownerEnforced =
          result.OwnershipControls?.Rules?.some(
            (rule) => rule.ObjectOwnership === "BucketOwnerEnforced",
          ) ?? false;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.name !== "OwnershipControlsNotFoundError"
        )
          throw error;
      }
      try {
        const result = await getObjectLock(input.bucket, region);
        if (result.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled")
          return {
            error:
              "Storage-class changes for Object Lock buckets are not supported here. Use S3 Lifecycle or a copy workflow that preserves retention and legal holds.",
          };
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.name !== "ObjectLockConfigurationNotFoundError"
        )
          throw error;
      }
    }
  } catch (error) {
    return { error: toUiError(error) };
  }

  const results: NonNullable<ObjectActionState["results"]> = [];
  // Bound write concurrency and return every individual outcome, including failures.
  for (let offset = 0; offset < input.objects.length; offset += 5) {
    results.push(
      ...(await Promise.all(
        input.objects.slice(offset, offset + 5).map(async (object) => {
          try {
            if (input.operation === "delete") {
              await deleteObject(input.bucket, region, object.key, object.etag);
              return { key: object.key, status: "deleted" as const };
            }
            const status = await changeStorageClass(
              input.bucket,
              region,
              object.key,
              object.etag,
              input.storageClass!,
              ownerEnforced,
            );
            return { key: object.key, status };
          } catch (error) {
            return {
              key: object.key,
              status: "failed" as const,
              error: toUiError(error),
            };
          }
        }),
      )),
    );
  }
  if (
    results.some(
      (result) => result.status === "deleted" || result.status === "updated",
    )
  )
    revalidatePath(`/s3/${encodeURIComponent(input.bucket)}`, "layout");
  return { results };
}
