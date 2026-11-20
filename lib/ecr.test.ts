import {
  BatchDeleteImageCommand,
  CreateRepositoryCommand,
  DescribeImagesCommand,
  DescribeRepositoriesCommand,
  ECRClient,
  PutImageTagMutabilityCommand,
} from "@aws-sdk/client-ecr";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, expect, it, vi } from "vitest";
import {
  createRepository,
  deleteImage,
  listImages,
  listRepositories,
  updateTagMutability,
} from "./ecr";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const mock = mockClient(ECRClient);
beforeEach(() => mock.reset());

it("searches up to five repository pages and returns a continuation", async () => {
  for (let page = 0; page < 5; page += 1) {
    mock
      .on(DescribeRepositoriesCommand, {
        nextToken: page ? `p${page}` : undefined,
      })
      .resolves({
        repositories: [
          {
            repositoryName:
              page === 3 ? "team/matching-api" : `team/service-${page}`,
          },
        ],
        nextToken: `p${page + 1}`,
      });
  }
  await expect(listRepositories("us-east-1", "MATCHING")).resolves.toEqual({
    repositories: [{ repositoryName: "team/matching-api" }],
    nextToken: "p5",
  });
  expect(mock.commandCalls(DescribeRepositoriesCommand)).toHaveLength(5);
});

it("matches image tags and digests across otherwise empty search pages", async () => {
  mock
    .on(DescribeImagesCommand, { nextToken: undefined })
    .resolves({ imageDetails: [], nextToken: "next" })
    .on(DescribeImagesCommand, { nextToken: "next" })
    .resolves({
      imageDetails: [{ imageDigest: "sha256:abc", imageTags: ["Release-42"] }],
    });
  await expect(
    listImages("us-east-1", "team/api", "release", undefined, "TAGGED"),
  ).resolves.toEqual({
    images: [{ imageDigest: "sha256:abc", imageTags: ["Release-42"] }],
    nextToken: undefined,
  });
  expect(
    mock.commandCalls(DescribeImagesCommand)[0].args[0].input.filter,
  ).toEqual({ tagStatus: "TAGGED" });
});

it("creates AES-256 repositories and preserves mutability exclusions", async () => {
  mock
    .on(CreateRepositoryCommand)
    .resolves({ repository: { repositoryName: "team/api" } });
  await createRepository("us-east-1", "team/api", "IMMUTABLE");
  expect(
    mock.commandCalls(CreateRepositoryCommand)[0].args[0].input,
  ).toMatchObject({
    repositoryName: "team/api",
    imageTagMutability: "IMMUTABLE",
    encryptionConfiguration: { encryptionType: "AES256" },
  });
  mock.on(PutImageTagMutabilityCommand).resolves({});
  await updateTagMutability(
    "us-east-1",
    "team/api",
    "IMMUTABLE_WITH_EXCLUSION",
    [{ filterType: "WILDCARD", filter: "latest*" }],
  );
  expect(
    mock.commandCalls(PutImageTagMutabilityCommand)[0].args[0].input
      .imageTagMutabilityExclusionFilters,
  ).toEqual([{ filterType: "WILDCARD", filter: "latest*" }]);
});

it("surfaces per-image deletion failures from a successful batch response", async () => {
  mock.on(BatchDeleteImageCommand).resolves({
    failures: [
      { failureCode: "ImageNotFound", failureReason: "Digest is gone" },
    ],
  });
  await expect(
    deleteImage("us-east-1", "team/api", `sha256:${"a".repeat(64)}`),
  ).rejects.toThrow("Digest is gone");
});
