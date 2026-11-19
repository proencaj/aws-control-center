import "server-only";

export type Result<T> = { data: T } | { error: string };

export function toUiError(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error";
  const { name, message } = error;
  if (name === "PreconditionFailed" || name === "ConditionalRequestConflict")
    return "Object changed since it was selected. Refresh and select it again.";
  if (name === "NoSuchBucket" || name === "NoSuchKey")
    return "The bucket or object no longer exists. Refresh the list.";
  if (name === "InvalidObjectState")
    return "This archived object must be restored before it can be copied.";
  if (name === "UnauthorizedOperation" || name.startsWith("AccessDenied")) {
    return `Access denied. Your IAM identity lacks permission for this action. ${message}`;
  }
  if (name === "CredentialsProviderError") {
    return "AWS credentials not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env.local.";
  }
  if (/\.NotFound$|\.Malformed$|NotFoundException$/.test(name)) {
    return `Not found in the selected region. ${message}`;
  }
  if (name === "DependencyViolation" || name === "InvalidGroup.InUse") {
    return `Resource is still in use. ${message}`;
  }
  if (name === "InvalidPermission.Duplicate") {
    return "That rule already exists.";
  }
  if (
    [
      "ClusterContainsServicesException",
      "ClusterContainsTasksException",
      "ClusterContainsContainerInstancesException",
      "ResourceInUseException",
      "UpdateInProgressException",
    ].includes(name)
  )
    return `Resource is in use or an update is in progress. ${message}`;
  if (name === "InvalidParameterException" || name === "ClientException")
    return `AWS could not accept this configuration. ${message}`;
  if (name === "ThrottlingException" || name === "TooManyRequestsException")
    return "AWS is rate limiting requests. Wait briefly, then refresh.";
  return message;
}

export async function attempt<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return { data: await promise };
  } catch (error) {
    return { error: toUiError(error) };
  }
}
