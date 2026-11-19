import "server-only";
import {
  ListBucketsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetBucketVersioningCommand,
  GetBucketOwnershipControlsCommand,
  GetObjectAclCommand,
  GetObjectLockConfigurationCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  type CopyObjectCommandInput,
  type StorageClass,
} from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/aws/clients";

export async function listBuckets(prefix?: string, next?: string) {
  // No BucketRegion filter: list general-purpose buckets across all regions.
  const result = await s3Client().send(
    new ListBucketsCommand({
      MaxBuckets: 100,
      Prefix: prefix || undefined,
      ContinuationToken: next,
    }),
  );
  return { buckets: result.Buckets ?? [], next: result.ContinuationToken };
}

export async function bucketRegion(bucket: string) {
  const result = await s3Client().send(
    new HeadBucketCommand({ Bucket: bucket }),
  );
  if (!result.BucketRegion)
    throw new Error(
      "S3 did not return this bucket's region. Refresh and try again.",
    );
  return result.BucketRegion;
}

export async function listObjects(
  bucket: string,
  region: string,
  prefix = "",
  next?: string,
) {
  const result = await s3Client(region).send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: "/",
      MaxKeys: 100,
      ContinuationToken: next,
      EncodingType: "url",
    }),
  );
  // URL encoding allows keys containing XML-unsafe characters to be listed safely.
  const decode = (value: string) =>
    result.EncodingType === "url" ? decodeURIComponent(value) : value;
  return {
    folders: (result.CommonPrefixes ?? []).flatMap((item) =>
      item.Prefix ? [decode(item.Prefix)] : [],
    ),
    objects: (result.Contents ?? [])
      .flatMap((item) =>
        item.Key === undefined ? [] : [{ ...item, Key: decode(item.Key) }],
      )
      .filter((item) => item.Key !== prefix),
    next: result.IsTruncated ? result.NextContinuationToken : undefined,
  };
}

export async function getVersioning(bucket: string, region: string) {
  return s3Client(region).send(
    new GetBucketVersioningCommand({ Bucket: bucket }),
  );
}
export async function getOwnership(bucket: string, region: string) {
  return s3Client(region).send(
    new GetBucketOwnershipControlsCommand({ Bucket: bucket }),
  );
}
export async function getObjectLock(bucket: string, region: string) {
  return s3Client(region).send(
    new GetObjectLockConfigurationCommand({ Bucket: bucket }),
  );
}
export async function getObject(bucket: string, region: string, key: string) {
  return s3Client(region).send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
}

export async function deleteObject(
  bucket: string,
  region: string,
  key: string,
  etag: string,
) {
  // Deliberately omit VersionId: no permanent purge of historical versions.
  await s3Client(region).send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key, IfMatch: etag }),
  );
}

export async function changeStorageClass(
  bucket: string,
  region: string,
  key: string,
  etag: string,
  storageClass: StorageClass,
  ownerEnforced: boolean,
) {
  const client = s3Client(region);
  const source = await getObject(bucket, region, key);
  if (source.ETag !== etag)
    throw new Error(
      "Object changed since it was selected. Refresh and select it again.",
    );
  if (
    source.ContentLength === undefined ||
    source.ContentLength > 5 * 1024 ** 3
  )
    throw new Error(
      "Objects larger than 5 GiB require multipart copy or an S3 Lifecycle rule.",
    );
  if (source.SSECustomerAlgorithm)
    throw new Error(
      "SSE-C encrypted objects require a customer key and cannot be changed here.",
    );
  if (
    (source.StorageClass === "GLACIER" ||
      source.StorageClass === "DEEP_ARCHIVE" ||
      source.ArchiveStatus) &&
    !source.Restore?.includes('ongoing-request="false"')
  ) {
    throw new Error(
      "Restore this archived object before changing its storage class.",
    );
  }
  if ((source.StorageClass ?? "STANDARD") === storageClass)
    return "unchanged" as const;

  const grants: Partial<CopyObjectCommandInput> = {};
  if (!ownerEnforced) {
    const acl = await client.send(
      new GetObjectAclCommand({
        Bucket: bucket,
        Key: key,
        VersionId: source.VersionId,
      }),
    );
    if (!acl.Grants?.length)
      throw new Error(
        "Could not verify this object's access permissions. No change was made.",
      );
    const permissions = {
      FULL_CONTROL: "GrantFullControl",
      READ: "GrantRead",
      READ_ACP: "GrantReadACP",
      WRITE_ACP: "GrantWriteACP",
    } as const;
    for (const grant of acl.Grants) {
      const field =
        grant.Permission &&
        permissions[grant.Permission as keyof typeof permissions];
      const grantee = grant.Grantee;
      const value =
        grantee?.Type === "CanonicalUser" && grantee.ID
          ? `id="${grantee.ID}"`
          : grantee?.Type === "Group" && grantee.URI
            ? `uri="${grantee.URI}"`
            : undefined;
      if (!field || !value)
        throw new Error(
          "This object has an ACL grant that cannot be preserved here. No change was made.",
        );
      grants[field] = grants[field] ? `${grants[field]}, ${value}` : value;
    }
  }
  // Encode the entire source path (including reserved characters in the key).
  const copySource = `${encodeURIComponent(bucket)}/${encodeURIComponent(key)}${source.VersionId ? `?versionId=${encodeURIComponent(source.VersionId)}` : ""}`;
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: copySource,
      CopySourceIfMatch: etag,
      IfMatch: etag,
      StorageClass: storageClass,
      MetadataDirective: "COPY",
      TaggingDirective: "COPY",
      WebsiteRedirectLocation: source.WebsiteRedirectLocation,
      ServerSideEncryption: source.ServerSideEncryption,
      SSEKMSKeyId: source.SSEKMSKeyId,
      BucketKeyEnabled: source.BucketKeyEnabled,
      ...grants,
    }),
  );
  return "updated" as const;
}
