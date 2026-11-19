import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectAclCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, expect, it, vi } from "vitest";
import {
  bucketRegion,
  changeStorageClass,
  deleteObject,
  listBuckets,
  listObjects,
} from "./s3";
import { s3Client } from "./aws/clients";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "eu-west-1" }) }),
}));
const mock = mockClient(S3Client);
const bucket = "test-bucket";
const region = "ap-southeast-2";
beforeEach(() => {
  mock.reset();
  mock
    .on(HeadObjectCommand)
    .resolves({
      ETag: '"etag"',
      ContentLength: 100,
      ServerSideEncryption: "AES256",
    });
  mock.on(CopyObjectCommand).resolves({});
});

it("lists a bounded global bucket page without applying a region filter", async () => {
  mock.on(ListBucketsCommand).resolves({
    Buckets: [
      { Name: "one", BucketRegion: "us-east-1" },
      { Name: "two", BucketRegion: region },
    ],
    ContinuationToken: "next",
  });
  const result = await listBuckets("test", "previous");
  expect(result.buckets).toHaveLength(2);
  expect(result.next).toBe("next");
  expect(mock.commandCalls(ListBucketsCommand)[0].args[0].input).toEqual({
    MaxBuckets: 100,
    Prefix: "test",
    ContinuationToken: "previous",
  });
});

it("resolves bucket location independently of the UI region", async () => {
  mock.on(HeadBucketCommand).resolves({ BucketRegion: region });
  expect(await bucketRegion(bucket)).toBe(region);
  expect(await s3Client(region).config.region()).toBe(region);
  expect(s3Client(region).config.followRegionRedirects).toBe(true);
});

it("preserves encoded object keys, folder prefixes, and pagination", async () => {
  mock
    .on(ListObjectsV2Command)
    .resolves({
      EncodingType: "url",
      IsTruncated: true,
      NextContinuationToken: "opaque%token",
      CommonPrefixes: [{ Prefix: "photos%2Fa%20b%2F" }],
      Contents: [
        { Key: "photos%2F" },
        { Key: "photos%2Fa%2B%25%26%3F%E9%9B%AA.txt", Size: 5 },
      ],
    });
  const result = await listObjects(bucket, region, "photos/", "previous");
  expect(result.folders).toEqual(["photos/a b/"]);
  expect(result.objects[0].Key).toBe("photos/a+%&?雪.txt");
  expect(result.objects).toHaveLength(1);
  expect(result.next).toBe("opaque%token");
  expect(mock.commandCalls(ListObjectsV2Command)[0].args[0].input).toEqual({
    Bucket: bucket,
    Prefix: "photos/",
    Delimiter: "/",
    EncodingType: "url",
    MaxKeys: 100,
    ContinuationToken: "previous",
  });
});

it("deletes only the exact key and ETag without purging versions or bypassing locks", async () => {
  mock.on(DeleteObjectCommand).resolves({});
  await deleteObject(bucket, region, "a/b.txt", '"etag"');
  expect(mock.commandCalls(DeleteObjectCommand)[0].args[0].input).toEqual({
    Bucket: bucket,
    Key: "a/b.txt",
    IfMatch: '"etag"',
  });
});

it("copies to the same key with metadata, tags, encryption, and source/destination preconditions", async () => {
  mock
    .on(HeadObjectCommand)
    .resolves({
      ETag: '"etag"',
      ContentLength: 100,
      VersionId: "version+/?",
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: "key-id",
      BucketKeyEnabled: true,
      WebsiteRedirectLocation: "/redirect",
    });
  expect(
    await changeStorageClass(
      bucket,
      region,
      "a/space +雪?.txt",
      '"etag"',
      "STANDARD_IA",
      true,
    ),
  ).toBe("updated");
  expect(mock.commandCalls(CopyObjectCommand)[0].args[0].input).toMatchObject({
    Bucket: bucket,
    Key: "a/space +雪?.txt",
    CopySource:
      "test-bucket/a%2Fspace%20%2B%E9%9B%AA%3F.txt?versionId=version%2B%2F%3F",
    CopySourceIfMatch: '"etag"',
    IfMatch: '"etag"',
    StorageClass: "STANDARD_IA",
    MetadataDirective: "COPY",
    TaggingDirective: "COPY",
    ServerSideEncryption: "aws:kms",
    SSEKMSKeyId: "key-id",
    BucketKeyEnabled: true,
    WebsiteRedirectLocation: "/redirect",
  });
  expect(mock.commandCalls(GetObjectAclCommand)).toHaveLength(0);
});

it("preserves legacy ACL grants when ACLs are enabled", async () => {
  mock.on(GetObjectAclCommand).resolves({
    Grants: [
      {
        Permission: "FULL_CONTROL",
        Grantee: { Type: "CanonicalUser", ID: "owner-id" },
      },
      {
        Permission: "READ",
        Grantee: { Type: "CanonicalUser", ID: "reader-id" },
      },
      {
        Permission: "READ",
        Grantee: {
          Type: "Group",
          URI: "http://acs.amazonaws.com/groups/global/AllUsers",
        },
      },
    ],
  });
  await changeStorageClass(
    bucket,
    region,
    "object",
    '"etag"',
    "STANDARD_IA",
    false,
  );
  expect(mock.commandCalls(CopyObjectCommand)[0].args[0].input).toMatchObject({
    GrantFullControl: 'id="owner-id"',
    GrantRead:
      'id="reader-id", uri="http://acs.amazonaws.com/groups/global/AllUsers"',
  });
});

it.each([
  [{ ETag: '"new"', ContentLength: 10 }, "changed"],
  [{ ETag: '"etag"', ContentLength: 5 * 1024 ** 3 + 1 }, "multipart"],
  [
    { ETag: '"etag"', ContentLength: 10, SSECustomerAlgorithm: "AES256" },
    "SSE-C",
  ],
  [
    { ETag: '"etag"', ContentLength: 10, StorageClass: "GLACIER" as const },
    "Restore",
  ],
  [
    {
      ETag: '"etag"',
      ContentLength: 10,
      StorageClass: "INTELLIGENT_TIERING" as const,
      ArchiveStatus: "ARCHIVE_ACCESS" as const,
    },
    "Restore",
  ],
])(
  "refuses unsafe or unsupported copies without writing: %j",
  async (head, message) => {
    mock.on(HeadObjectCommand).resolves(head);
    await expect(
      changeStorageClass(
        bucket,
        region,
        "object",
        '"etag"',
        "STANDARD_IA",
        true,
      ),
    ).rejects.toThrow(message);
    expect(mock.commandCalls(CopyObjectCommand)).toHaveLength(0);
  },
);

it("permits a restored archive and skips an already matching class", async () => {
  mock
    .on(HeadObjectCommand)
    .resolves({
      ETag: '"etag"',
      ContentLength: 1,
      StorageClass: "GLACIER",
      Restore:
        'ongoing-request="false", expiry-date="Fri, 20 Nov 2026 00:00:00 GMT"',
    });
  await changeStorageClass(
    bucket,
    region,
    "archived",
    '"etag"',
    "STANDARD",
    true,
  );
  expect(mock.commandCalls(CopyObjectCommand)).toHaveLength(1);
  mock.on(HeadObjectCommand).resolves({ ETag: '"etag"', ContentLength: 1 });
  expect(
    await changeStorageClass(
      bucket,
      region,
      "standard",
      '"etag"',
      "STANDARD",
      true,
    ),
  ).toBe("unchanged");
  expect(mock.commandCalls(CopyObjectCommand)).toHaveLength(1);
});
