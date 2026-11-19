import "server-only";
import { GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { getAccount } from "@/lib/aws/accounts";
import { getRegion, stsClient } from "@/lib/aws/clients";

export async function getCallerIdentity() {
  const region = await getRegion();
  const { Account, Arn } = await stsClient(region).send(new GetCallerIdentityCommand({}));
  const configured = await getAccount();
  if (configured && configured.id !== Account)
    throw new Error(`The keys for "${configured.name}" belong to account ${Account}, but accounts.json says ${configured.id}.`);
  return { account: Account, arn: Arn, region };
}

// "user/ci/bob" -> "bob". "assumed-role/AWSReservedSSO_ReadOnly_1a2b3c4d5e6f7a8b/me" -> "ReadOnly/me".
export function identityName(arn: string) {
  const [, , service, , , resource = ""] = arn.split(":");
  const parts = resource.split("/");
  if (service === "sts" && parts[0] === "assumed-role") {
    const [role = "", ...session] = parts.slice(1);
    const permissionSet = role.replace(/^AWSReservedSSO_(.+)_[0-9a-f]{16}$/, "$1");
    return [permissionSet, ...session].join("/");
  }
  return parts.at(-1) || resource;
}
