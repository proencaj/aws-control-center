"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  bucketRegion,
  changeStorageClass,
  deleteObject,
  getObjectLock,
  getOwnership,
  inspectRestore,
  presignedObjectUrl,
  requestRestore,
} from "@/lib/s3";
import { toUiError } from "@/lib/aws/errors";
import { getCallerIdentity } from "@/lib/sts";
import { storageClasses } from "./options";

const schema = z.object({
  bucket: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,253}[A-Za-z0-9]$/)
    .refine((value) => !value.endsWith("--x-s3")),
  account: z.string().regex(/^\d{12}$/),
  operation: z.enum(["delete", "storage", "restore"]),
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
  tier: z.enum(["Bulk", "Standard", "Expedited"]).optional(),
  days: z.number().int().min(1).max(365).optional(),
});

export type ObjectActionState = {
  error?: string;
  results?: {
    key: string;
    status:
      | "deleted"
      | "updated"
      | "unchanged"
      | "requested"
      | "restoring"
      | "available"
      | "not-needed"
      | "failed";
    error?: string;
  }[];
};

async function assertAccount(account: string) {
  const identity = await getCallerIdentity();
  if (identity.account !== account)
    throw new Error(
      "The account changed. Refresh this page before submitting again.",
    );
}

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
    } else if (
      input.operation === "storage" &&
      (!input.storageClass || formData.get("acknowledge") !== "yes")
    ) {
      return {
        error: "Select a storage class and acknowledge the copy operation.",
      };
    } else if (
      input.operation === "restore" &&
      (!input.tier || !input.days || formData.get("acknowledge") !== "yes")
    ) {
      return {
        error: "Select a retrieval tier and acknowledge the restore charges.",
      };
    }
  } catch {
    return { error: "Invalid selection. Select 1–100 objects and try again." };
  }

  let region: string;
  let ownerEnforced = false;
  try {
    await assertAccount(input.account);
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
            if (input.operation === "restore") {
              const status = await requestRestore(
                input.bucket,
                region,
                object,
                input.tier!,
                input.days!,
              );
              return { key: object.key, status };
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
      (result) =>
        result.status === "deleted" ||
        result.status === "updated" ||
        result.status === "requested",
    )
  )
    revalidatePath(`/s3/${encodeURIComponent(input.bucket)}`, "layout");
  return { results };
}

export type RestoreInspectionState = {
  error?: string;
  items?: {
    key: string;
    storageClass?: string;
    archiveStatus?: "ARCHIVE_ACCESS" | "DEEP_ARCHIVE_ACCESS";
    restore?: "eligible" | "restoring" | "available" | "not-needed";
    restoreExpiry?: string;
    deepArchive?: boolean;
    error?: string;
  }[];
};

const inspectionSchema = schema.pick({
  bucket: true,
  account: true,
  objects: true,
});

export async function inspectRestoreAction(
  payload: unknown,
): Promise<RestoreInspectionState> {
  try {
    const input = inspectionSchema.parse(payload);
    await assertAccount(input.account);
    const region = await bucketRegion(input.bucket);
    const items: NonNullable<RestoreInspectionState["items"]> = [];
    for (let offset = 0; offset < input.objects.length; offset += 5) {
      items.push(
        ...(await Promise.all(
          input.objects.slice(offset, offset + 5).map(async (object) => {
            try {
              const inspected = await inspectRestore(
                input.bucket,
                region,
                object.key,
                object.etag,
              );
              return {
                key: inspected.key,
                storageClass: inspected.storageClass,
                archiveStatus: inspected.archiveStatus,
                restore: inspected.restore,
                restoreExpiry: inspected.restoreExpiry,
                deepArchive: inspected.deepArchive,
              };
            } catch (error) {
              return { key: object.key, error: toUiError(error) };
            }
          }),
        )),
      );
    }
    return { items };
  } catch (error) {
    return { error: toUiError(error) };
  }
}

export type PresignedUrlState = {
  error?: string;
  url?: string;
  expiresIn?: number;
};

const linkSchema = inspectionSchema.extend({
  disposition: z.enum(["attachment", "inline"]),
  expiresIn: z.number().int().min(60).max(604_800),
});

export async function createPresignedUrlAction(
  _previous: PresignedUrlState,
  formData: FormData,
): Promise<PresignedUrlState> {
  try {
    const input = linkSchema.parse(JSON.parse(String(formData.get("payload"))));
    if (input.objects.length !== 1)
      return { error: "Select exactly one object to create a link." };
    await assertAccount(input.account);
    const region = await bucketRegion(input.bucket);
    const object = input.objects[0];
    return {
      url: await presignedObjectUrl(
        input.bucket,
        region,
        object.key,
        object.etag,
        input.expiresIn,
        input.disposition,
      ),
      expiresIn: input.expiresIn,
    };
  } catch (error) {
    return { error: toUiError(error) };
  }
}
