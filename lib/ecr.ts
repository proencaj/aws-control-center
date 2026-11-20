import "server-only";
import {
  BatchDeleteImageCommand,
  CreateRepositoryCommand,
  DeleteRepositoryCommand,
  DescribeImagesCommand,
  DescribeRepositoriesCommand,
  PutImageTagMutabilityCommand,
  type ImageDetail,
  type ImageTagMutability,
  type ImageTagMutabilityExclusionFilter,
  type Repository,
} from "@aws-sdk/client-ecr";
import { ecrClient } from "@/lib/aws/clients";

const PAGE_SIZE = 100;
const SEARCH_PAGES = 5;

export async function listRepositories(
  region: string,
  query = "",
  nextToken?: string,
) {
  const client = ecrClient(region);
  const repositories: Repository[] = [];
  let token = nextToken;
  const needle = query.trim().toLowerCase();
  const pages = needle ? SEARCH_PAGES : 1;
  for (let page = 0; page < pages; page += 1) {
    const response = await client.send(
      new DescribeRepositoriesCommand({
        maxResults: PAGE_SIZE,
        nextToken: token,
      }),
    );
    repositories.push(
      ...(response.repositories ?? []).filter((repository) =>
        needle
          ? repository.repositoryName?.toLowerCase().includes(needle)
          : true,
      ),
    );
    token = response.nextToken;
    if (!token) break;
  }
  return { repositories, nextToken: token };
}

export async function getRepository(region: string, repositoryName: string) {
  const response = await ecrClient(region).send(
    new DescribeRepositoriesCommand({ repositoryNames: [repositoryName] }),
  );
  const repository = response.repositories?.[0];
  if (!repository)
    throw new Error("ECR did not return the requested repository.");
  return repository;
}

export async function listImages(
  region: string,
  repositoryName: string,
  query = "",
  nextToken?: string,
  tagStatus?: "TAGGED" | "UNTAGGED" | "ANY",
) {
  const client = ecrClient(region);
  const images: ImageDetail[] = [];
  let token = nextToken;
  const needle = query.trim().toLowerCase();
  const pages = needle ? SEARCH_PAGES : 1;
  for (let page = 0; page < pages; page += 1) {
    const response = await client.send(
      new DescribeImagesCommand({
        repositoryName,
        maxResults: PAGE_SIZE,
        nextToken: token,
        filter: tagStatus && tagStatus !== "ANY" ? { tagStatus } : undefined,
      }),
    );
    images.push(
      ...(response.imageDetails ?? []).filter(
        (image) =>
          !needle ||
          Boolean(image.imageDigest?.toLowerCase().includes(needle)) ||
          Boolean(
            image.imageTags?.some((tag) => tag.toLowerCase().includes(needle)),
          ),
      ),
    );
    token = response.nextToken;
    if (!token) break;
  }
  return { images, nextToken: token };
}

export async function createRepository(
  region: string,
  repositoryName: string,
  imageTagMutability: ImageTagMutability,
) {
  const response = await ecrClient(region).send(
    new CreateRepositoryCommand({
      repositoryName,
      imageTagMutability,
      encryptionConfiguration: { encryptionType: "AES256" },
    }),
  );
  if (!response.repository)
    throw new Error("ECR did not return the created repository.");
  return response.repository;
}

export async function updateTagMutability(
  region: string,
  repositoryName: string,
  imageTagMutability: ImageTagMutability,
  imageTagMutabilityExclusionFilters?: ImageTagMutabilityExclusionFilter[],
) {
  await ecrClient(region).send(
    new PutImageTagMutabilityCommand({
      repositoryName,
      imageTagMutability,
      imageTagMutabilityExclusionFilters,
    }),
  );
}

export async function deleteRepository(region: string, repositoryName: string) {
  await ecrClient(region).send(
    new DeleteRepositoryCommand({ repositoryName, force: false }),
  );
}

export async function deleteImage(
  region: string,
  repositoryName: string,
  imageDigest: string,
) {
  const response = await ecrClient(region).send(
    new BatchDeleteImageCommand({
      repositoryName,
      imageIds: [{ imageDigest }],
    }),
  );
  if (response.failures?.length) {
    throw new Error(
      response.failures
        .map(
          (failure) =>
            failure.failureReason ??
            failure.failureCode ??
            "Image deletion failed",
        )
        .join("; "),
    );
  }
  if (!response.imageIds?.length)
    throw new Error("ECR did not confirm that the image was deleted.");
}
