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
import { cookies } from "next/headers";

export const REGION_COOKIE = "region";

export async function getRegion() {
  const stored = (await cookies()).get(REGION_COOKIE)?.value;
  return stored ?? process.env.AWS_REGION ?? "us-east-1";
}

const ec2Clients = new Map<string, EC2Client>();

export async function ec2Client(selectedRegion?: string) {
  const region = selectedRegion ?? (await getRegion());
  let client = ec2Clients.get(region);
  if (!client) {
    client = new EC2Client({ region });
    ec2Clients.set(region, client);
  }
  return client;
}

const ecsClientCache = new Map<string, ECSClient>();
export function ecsClient(region: string) {
  let client = ecsClientCache.get(region);
  if (!client) {
    client = new ECSClient({ region });
    ecsClientCache.set(region, client);
  }
  return client;
}

const applicationAutoScalingClientCache = new Map<
  string,
  ApplicationAutoScalingClient
>();
export function applicationAutoScalingClient(region: string) {
  let client = applicationAutoScalingClientCache.get(region);
  if (!client) {
    client = new ApplicationAutoScalingClient({ region });
    applicationAutoScalingClientCache.set(region, client);
  }
  return client;
}

const autoScalingClientCache = new Map<string, AutoScalingClient>();
export function autoScalingClient(region: string) {
  let client = autoScalingClientCache.get(region);
  if (!client) {
    client = new AutoScalingClient({ region });
    autoScalingClientCache.set(region, client);
  }
  return client;
}

const elbv2ClientCache = new Map<string, ElasticLoadBalancingV2Client>();
export function elbv2Client(region: string) {
  let client = elbv2ClientCache.get(region);
  if (!client) {
    client = new ElasticLoadBalancingV2Client({ region });
    elbv2ClientCache.set(region, client);
  }
  return client;
}

const iamClientCache = new Map<string, IAMClient>();
export function iamClient(region: string) {
  let client = iamClientCache.get(region);
  if (!client) {
    client = new IAMClient({ region });
    iamClientCache.set(region, client);
  }
  return client;
}

const cloudWatchClientCache = new Map<string, CloudWatchClient>();
export function cloudWatchClient(region: string) {
  let client = cloudWatchClientCache.get(region);
  if (!client) {
    client = new CloudWatchClient({ region });
    cloudWatchClientCache.set(region, client);
  }
  return client;
}

const logsClients = new Map<string, CloudWatchLogsClient>();
export function cloudWatchLogsClient(region: string) {
  let client = logsClients.get(region);
  if (!client) {
    client = new CloudWatchLogsClient({ region });
    logsClients.set(region, client);
  }
  return client;
}

const s3Clients = new Map<string, S3Client>();
export function s3Client(region = process.env.AWS_REGION ?? "us-east-1") {
  let client = s3Clients.get(region);
  if (!client) {
    client = new S3Client({ region, followRegionRedirects: true });
    s3Clients.set(region, client);
  }
  return client;
}
