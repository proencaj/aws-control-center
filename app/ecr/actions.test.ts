import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteRepository: vi.fn(),
  deleteImage: vi.fn(),
  getRegion: vi.fn(),
  getCallerIdentity: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/ecr", () => ({
  createRepository: vi.fn(),
  updateTagMutability: vi.fn(),
  deleteRepository: mocks.deleteRepository,
  deleteImage: mocks.deleteImage,
}));
vi.mock("@/lib/aws/clients", () => ({ getRegion: mocks.getRegion }));
vi.mock("@/lib/sts", () => ({ getCallerIdentity: mocks.getCallerIdentity }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { deleteImageAction, deleteRepositoryAction } from "./actions";

const context = () => {
  const data = new FormData();
  data.set("region", "us-east-1");
  data.set("account", "123456789012");
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRegion.mockResolvedValue("us-east-1");
  mocks.getCallerIdentity.mockResolvedValue({
    account: "123456789012",
    region: "us-east-1",
  });
});

it("requires the exact repository name and never requests force deletion", async () => {
  const data = context();
  data.set("confirm", "wrong");
  await expect(deleteRepositoryAction("team/api", {}, data)).resolves.toEqual({
    error: "Type the exact repository name to confirm deletion.",
  });
  expect(mocks.deleteRepository).not.toHaveBeenCalled();

  data.set("confirm", "team/api");
  await deleteRepositoryAction("team/api", {}, data);
  expect(mocks.deleteRepository).toHaveBeenCalledWith("us-east-1", "team/api");
});

it("rejects an action after the selected account changes", async () => {
  mocks.getCallerIdentity.mockResolvedValue({
    account: "999999999999",
    region: "us-east-1",
  });
  const data = context();
  data.set("confirm", "team/api");
  await expect(deleteRepositoryAction("team/api", {}, data)).resolves.toEqual({
    error:
      "The account or region changed. Refresh this page before submitting again.",
  });
  expect(mocks.deleteRepository).not.toHaveBeenCalled();
});

it("deletes an image by its full digest", async () => {
  const imageDigest = `sha256:${"a".repeat(64)}`;
  const data = context();
  data.set("confirm", imageDigest);
  await deleteImageAction("team/api", imageDigest, {}, data);
  expect(mocks.deleteImage).toHaveBeenCalledWith(
    "us-east-1",
    "team/api",
    imageDigest,
  );
});
