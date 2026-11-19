import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetBucketOwnershipControlsCommand,
  GetObjectLockConfigurationCommand,
  GetObjectAclCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { objectAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const mock = mockClient(S3Client);
const selection = [{ key: "folder/a.txt", etag: '"a"' }];
const payload = {
  bucket: "test-bucket",
  operation: "delete",
  objects: selection,
};
function form(input: object = payload, fields: Record<string, string> = {}) {
  const data = new FormData();
  data.set("payload", JSON.stringify(input));
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.reset();
  mock.on(HeadBucketCommand).resolves({ BucketRegion: "us-west-2" });
  mock.on(DeleteObjectCommand).resolves({});
  mock.on(HeadObjectCommand).resolves({ ETag: '"a"', ContentLength: 10 });
  mock
    .on(GetBucketOwnershipControlsCommand)
    .resolves({
      OwnershipControls: {
        Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
      },
    });
  mock
    .on(GetObjectLockConfigurationCommand)
    .rejects({
      name: "ObjectLockConfigurationNotFoundError",
      message: "No configuration",
    });
  mock.on(CopyObjectCommand).resolves({});
});

it("requires the exact object key before contacting AWS", async () => {
  expect(
    (await objectAction({}, form(payload, { confirm: "test-bucket" }))).error,
  ).toContain("confirm");
  expect(mock.calls()).toHaveLength(0);
});

it.each([
  { ...payload, objects: [] },
  { ...payload, objects: [...selection, ...selection] },
  { ...payload, objects: [{ key: "a", etag: "*" }] },
  { ...payload, objects: [{ key: "雪".repeat(400), etag: '"a"' }] },
  {
    ...payload,
    objects: Array.from({ length: 101 }, (_, i) => ({
      key: String(i),
      etag: '"a"',
    })),
  },
])("rejects invalid or unbounded selection: %j", async (input) => {
  expect(
    (await objectAction({}, form(input, { confirm: "test-bucket" }))).error,
  ).toBeDefined();
  expect(mock.calls()).toHaveLength(0);
});

it("returns partial delete outcomes and refreshes after successful writes", async () => {
  mock
    .on(DeleteObjectCommand, { Key: "b" })
    .rejects({ name: "AccessDenied", message: "Denied" });
  const result = await objectAction(
    {},
    form(
      { ...payload, objects: [...selection, { key: "b", etag: '"b"' }] },
      { confirm: "test-bucket" },
    ),
  );
  expect(result.results?.map((item) => item.status)).toEqual([
    "deleted",
    "failed",
  ]);
  expect(result.results?.[1].error).toContain("Access denied");
  expect(revalidatePath).toHaveBeenCalledWith("/s3/test-bucket", "layout");
  expect(mock.commandCalls(DeleteObjectCommand)).toHaveLength(2);
});

it("requires storage acknowledgement before contacting AWS", async () => {
  expect(
    (
      await objectAction(
        {},
        form({ ...payload, operation: "storage", storageClass: "STANDARD_IA" }),
      )
    ).error,
  ).toContain("acknowledge");
  expect(mock.calls()).toHaveLength(0);
});

it("changes storage class using the discovered bucket region", async () => {
  const result = await objectAction(
    {},
    form(
      { ...payload, operation: "storage", storageClass: "STANDARD_IA" },
      { acknowledge: "yes" },
    ),
  );
  expect(result.results).toEqual([{ key: "folder/a.txt", status: "updated" }]);
  expect(mock.commandCalls(CopyObjectCommand)).toHaveLength(1);
});

it("does not silently drop object locks or bypass unreadable configuration", async () => {
  mock
    .on(GetObjectLockConfigurationCommand)
    .resolves({ ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" } });
  const data = () =>
    form(
      { ...payload, operation: "storage", storageClass: "STANDARD_IA" },
      { acknowledge: "yes" },
    );
  expect((await objectAction({}, data())).error).toContain("Object Lock");
  mock
    .on(GetObjectLockConfigurationCommand)
    .rejects({ name: "AccessDenied", message: "Cannot read configuration" });
  expect((await objectAction({}, data())).error).toContain("Access denied");
  expect(mock.commandCalls(CopyObjectCommand)).toHaveLength(0);
});

it("supports legacy buckets without ownership controls and preserves their ACL", async () => {
  mock
    .on(GetBucketOwnershipControlsCommand)
    .rejects({
      name: "OwnershipControlsNotFoundError",
      message: "Legacy bucket",
    });
  mock
    .on(GetObjectAclCommand)
    .resolves({
      Grants: [
        {
          Permission: "FULL_CONTROL",
          Grantee: { Type: "CanonicalUser", ID: "owner" },
        },
      ],
    });
  const result = await objectAction(
    {},
    form(
      { ...payload, operation: "storage", storageClass: "GLACIER_IR" },
      { acknowledge: "yes" },
    ),
  );
  expect(result.results?.[0].status).toBe("updated");
  expect(
    mock.commandCalls(CopyObjectCommand)[0].args[0].input.GrantFullControl,
  ).toBe('id="owner"');
});
