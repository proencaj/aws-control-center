import "server-only";
import { ListRolesCommand } from "@aws-sdk/client-iam";
import { iamClient } from "@/lib/aws/clients";
export async function listRoles(region: string, marker?: string) {
  const r = await iamClient(region).send(
    new ListRolesCommand({ MaxItems: 20, Marker: marker }),
  );
  return {
    resources: r.Roles ?? [],
    nextToken: r.IsTruncated ? r.Marker : undefined,
  };
}
