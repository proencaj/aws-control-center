export function repositoryUrl(repositoryName: string) {
  return `/ecr/repositories/${repositoryName
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
