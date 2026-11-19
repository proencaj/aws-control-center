import "server-only";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { getRegion } from "@/lib/aws/clients";

export async function getCallerIdentity() {
  const region = await getRegion();
  const sts = new STSClient({ region });
  const { Account, Arn } = await sts.send(new GetCallerIdentityCommand({}));
  return { account: Account, arn: Arn, region };
}
