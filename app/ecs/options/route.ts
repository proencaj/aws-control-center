import { NextRequest, NextResponse } from "next/server";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { listEcsNetworkOptions } from "@/lib/ec2";
import { listRoles } from "@/lib/iam";
import { listTargetGroups } from "@/lib/elbv2";
import { listAutoScalingGroups } from "@/lib/auto-scaling";
import { listAlarms } from "@/lib/cloudwatch";
import { listCapacityProviders, listTaskDefinitions } from "@/lib/ecs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  try {
    const region = await getRegion();
    if (query.get("region") !== region)
      return NextResponse.json(
        { error: "Region changed. Refresh the page." },
        { status: 409 },
      );
    const next = query.get("next") || undefined;
    let result: {
      resources: { id: string; label: string }[];
      nextToken?: string;
    };
    switch (query.get("kind")) {
      case "subnets":
      case "security-groups":
        result = await listEcsNetworkOptions(
          region,
          query.get("kind") as "subnets" | "security-groups",
          next,
        );
        break;
      case "roles": {
        const r = await listRoles(region, next);
        result = {
          resources: r.resources.map((x) => ({
            id: x.Arn!,
            label: x.RoleName!,
          })),
          nextToken: r.nextToken,
        };
        break;
      }
      case "target-groups": {
        const r = await listTargetGroups(region, next);
        result = {
          resources: r.resources.map((x) => ({
            id: x.TargetGroupArn!,
            label: `${x.TargetGroupName} · ${x.TargetType} · ${x.VpcId}`,
          })),
          nextToken: r.nextToken,
        };
        break;
      }
      case "auto-scaling-groups": {
        const r = await listAutoScalingGroups(region, next);
        result = {
          resources: r.resources.map((x) => ({
            id: x.AutoScalingGroupARN!,
            label: x.AutoScalingGroupName!,
          })),
          nextToken: r.nextToken,
        };
        break;
      }
      case "alarms": {
        const r = await listAlarms(region, next);
        result = {
          resources: r.resources.map((x) => ({
            id: x.AlarmName!,
            label: `${x.AlarmName} · ${x.StateValue}`,
          })),
          nextToken: r.nextToken,
        };
        break;
      }
      case "task-definitions": {
        const r = await listTaskDefinitions(region, {
          nextToken: next,
          status: "ACTIVE",
        });
        result = {
          resources: r.resources.map((x) => ({
            id: x,
            label: x.split("/").pop()!,
          })),
          nextToken: r.nextToken,
        };
        break;
      }
      case "capacity-providers": {
        const r = await listCapacityProviders(region, next);
        result = {
          resources: r.resources.map((x) => ({
            id: x.name!,
            label: `${x.name} · ${x.status}`,
          })),
          nextToken: r.nextToken,
        };
        break;
      }
      default:
        return NextResponse.json(
          { error: "Unknown resource type." },
          { status: 400 },
        );
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: toUiError(error) }, { status: 400 });
  }
}
