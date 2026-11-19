import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { S3Client } from "@aws-sdk/client-s3";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { IAMClient } from "@aws-sdk/client-iam";
import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";
import { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import { ApplicationAutoScalingClient } from "@aws-sdk/client-application-auto-scaling";
import { ECSClient } from "@aws-sdk/client-ecs";
import "server-only";
import { EC2Client } from "@aws-sdk/client-ec2";
import { STSClient } from "@aws-sdk/client-sts";
import { cookies } from "next/headers";
import { accountCredentials, hasAccounts } from "@/lib/aws/accounts";

export const REGION_COOKIE = "region";

export async function getRegion() {
  const stored = (await cookies()).get(REGION_COOKIE)?.value;
  return stored ?? process.env.AWS_REGION ?? "us-east-1";
}

type ClientConfig = {
  region: string;
  credentials?: typeof accountCredentials;
  followRegionRedirects?: boolean;
};

const clients = new Map<unknown, Map<string, unknown>>();

// One client per service and region. Without accounts.json the SDK default
// credential chain (AWS_* env vars) is used.
function clientFor<Client>(
  Service: new (config: ClientConfig) => Client,
  region: string,
  extra: Partial<ClientConfig> = {},
) {
  const byRegion = clients.get(Service) ?? new Map<string, unknown>();
  clients.set(Service, byRegion);
  let client = byRegion.get(region) as Client | undefined;
  if (!client) {
    client = new Service({ region, credentials: hasAccounts() ? accountCredentials : undefined, ...extra });
    byRegion.set(region, client);
  }
  return client;
}

export async function ec2Client(selectedRegion?: string) {
  return clientFor(EC2Client, selectedRegion ?? (await getRegion()));
}

export const ecsClient = (region: string) => clientFor(ECSClient, region);
export const applicationAutoScalingClient = (region: string) => clientFor(ApplicationAutoScalingClient, region);
export const autoScalingClient = (region: string) => clientFor(AutoScalingClient, region);
export const elbv2Client = (region: string) => clientFor(ElasticLoadBalancingV2Client, region);
export const iamClient = (region: string) => clientFor(IAMClient, region);
export const cloudWatchClient = (region: string) => clientFor(CloudWatchClient, region);
export const cloudWatchLogsClient = (region: string) => clientFor(CloudWatchLogsClient, region);
export const stsClient = (region: string) => clientFor(STSClient, region);
export const s3Client = (region = process.env.AWS_REGION ?? "us-east-1") =>
  clientFor(S3Client, region, { followRegionRedirects: true });
