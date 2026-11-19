import { ConfirmDelete } from "@/components/confirm-delete";
import { ErrorNotice } from "@/components/error-notice";
import { attempt } from "@/lib/aws/errors";
import * as scaling from "@/lib/application-auto-scaling";
import { ecsAction } from "./actions";
import { JsonForm } from "./controls";
import { LookupHelp } from "./settings-editors";
import { JsonDetails, Pagination, Panel, Table, encoded } from "./ui";
import type { Query } from "./views";
const value = (query: Query, key: string) =>
  typeof query[key] === "string" ? (query[key] as string) : undefined;
export async function ScalingView({
  region,
  cluster,
  service,
  query,
  editable,
}: {
  region: string;
  cluster: string;
  service: string;
  query: Query;
  editable: boolean;
}) {
  const targetResult = await attempt(
    scaling.getScalingTarget(region, cluster, service),
  );
  const policiesResult = await attempt(
    scaling.listScalingPolicies(
      region,
      cluster,
      service,
      value(query, "policiesNext"),
    ),
  );
  const schedulesResult = await attempt(
    scaling.listScheduledActions(
      region,
      cluster,
      service,
      value(query, "schedulesNext"),
    ),
  );
  const activityResult = await attempt(
    scaling.listScalingActivities(
      region,
      cluster,
      service,
      value(query, "activityNext"),
    ),
  );
  const action = (operation: string) =>
    ecsAction.bind(null, region, { operation, cluster, name: service });
  const base = `/ecs/clusters/${encoded(cluster)}/services/${encoded(service)}/autoscaling`;
  const paging = Object.fromEntries(
    Object.entries(query).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const target = "data" in targetResult ? targetResult.data : undefined;
  return (
    <div className="space-y-6">
      {!editable && (
        <p className="text-sm text-muted">
          Autoscaling changes are available for active ECS rolling REPLICA
          services only.
        </p>
      )}
      <Panel title="Service capacity">
        {"error" in targetResult ? (
          <ErrorNotice message={targetResult.error} />
        ) : (
          <>
            {target ? (
              <JsonDetails value={target} label="Current scalable target" />
            ) : (
              <p className="text-sm text-muted">
                Autoscaling is not configured. Save min/max capacity first, then
                add policies or scheduled actions.
              </p>
            )}
            {editable && (
              <>
                <JsonForm
                  action={action("scalingTarget")}
                  confirmationName={service}
                  label="Save capacity and suspension"
                  initial={{
                    MinCapacity: target?.MinCapacity ?? 1,
                    MaxCapacity: target?.MaxCapacity ?? 10,
                    SuspendedState: {
                      DynamicScalingInSuspended:
                        target?.SuspendedState?.DynamicScalingInSuspended ??
                        false,
                      DynamicScalingOutSuspended:
                        target?.SuspendedState?.DynamicScalingOutSuspended ??
                        false,
                      ScheduledScalingSuspended:
                        target?.SuspendedState?.ScheduledScalingSuspended ??
                        false,
                    },
                  }}
                  hint="Changing bounds can immediately change task count. Suspend all three types before scaling a service to zero."
                />
                {target && (
                  <ConfirmDelete
                    action={action("removeScalingTarget")}
                    resourceName={service}
                    label="Remove service autoscaling"
                    impact="Deregisters the scaling target and removes all its scaling policies and scheduled actions, including policies not editable here. The service remains running."
                  />
                )}
              </>
            )}
          </>
        )}
      </Panel>
      <Panel title="Target tracking policies">
        {"error" in policiesResult ? (
          <ErrorNotice message={policiesResult.error} />
        ) : (
          <>
            <Table
              headers={["Policy", "Type", "Metric", "Target"]}
              rows={policiesResult.data.resources.map((p) => [
                p.PolicyName,
                p.PolicyType,
                p.TargetTrackingScalingPolicyConfiguration
                  ?.PredefinedMetricSpecification?.PredefinedMetricType,
                p.TargetTrackingScalingPolicyConfiguration?.TargetValue,
              ])}
            />
            {policiesResult.data.resources.map((p) => (
              <details
                key={p.PolicyARN}
                className="group-box space-y-3 p-4"
              >
                <summary className="cursor-pointer text-sm">
                  {p.PolicyName}{" "}
                  {p.PolicyType !== "TargetTrackingScaling"
                    ? "(read-only)"
                    : "— details and edit"}
                </summary>
                <JsonDetails value={p} />
                {editable &&
                  p.PolicyType === "TargetTrackingScaling" &&
                  p.TargetTrackingScalingPolicyConfiguration
                    ?.PredefinedMetricSpecification && (
                    <>
                      <JsonForm
                        action={action("scalingPolicy")}
                        label="Update policy"
                        initial={{
                          name: p.PolicyName,
                          metric:
                            p.TargetTrackingScalingPolicyConfiguration
                              .PredefinedMetricSpecification
                              .PredefinedMetricType,
                          targetValue:
                            p.TargetTrackingScalingPolicyConfiguration
                              .TargetValue,
                          scaleInCooldown:
                            p.TargetTrackingScalingPolicyConfiguration
                              .ScaleInCooldown ?? 300,
                          scaleOutCooldown:
                            p.TargetTrackingScalingPolicyConfiguration
                              .ScaleOutCooldown ?? 300,
                          disableScaleIn:
                            p.TargetTrackingScalingPolicyConfiguration
                              .DisableScaleIn ?? false,
                          ...(p.TargetTrackingScalingPolicyConfiguration
                            .PredefinedMetricSpecification
                            .PredefinedMetricType === "ALBRequestCountPerTarget"
                            ? { targetGroupArn: "" }
                            : {}),
                        }}
                        hint="For ALB policies, enter the target group ARN attached to this service; the resource label is derived on the server."
                      />
                      <ConfirmDelete
                        action={async (prev, form) => {
                          "use server";
                          form.set("itemName", p.PolicyName!);
                          return ecsAction(
                            region,
                            {
                              operation: "removePolicy",
                              cluster,
                              name: service,
                            },
                            prev,
                            form,
                          );
                        }}
                        resourceName={p.PolicyName!}
                        label="Delete policy"
                        impact="Removes this target-tracking policy. Other policies and scheduled scaling remain active."
                      />
                    </>
                  )}
              </details>
            ))}
            <Pagination
              base={base}
              tokenKey="policiesNext"
              current={value(query, "policiesNext")}
              nextToken={policiesResult.data.nextToken}
              query={paging}
            />
          </>
        )}
        {editable && target && (
          <details className="space-y-4">
            <summary className="cursor-pointer text-sm font-medium">
              Add target tracking policy
            </summary>
            <LookupHelp kind="target-groups" region={region} />
            <JsonForm
              action={action("scalingPolicy")}
              label="Save policy"
              initial={{
                name: "cpu-target",
                metric: "ECSServiceAverageCPUUtilization",
                targetValue: 60,
                scaleInCooldown: 300,
                scaleOutCooldown: 300,
                disableScaleIn: false,
              }}
              hint="Metric: ECSServiceAverageCPUUtilization, ECSServiceAverageMemoryUtilization, or ALBRequestCountPerTarget. For ALB, also set targetGroupArn."
            />
          </details>
        )}
      </Panel>
      <Panel title="Scheduled scaling">
        {"error" in schedulesResult ? (
          <ErrorNotice message={schedulesResult.error} />
        ) : (
          <>
            <Table
              headers={["Name", "Schedule", "Timezone", "Min / max"]}
              rows={schedulesResult.data.resources.map((s) => [
                s.ScheduledActionName,
                s.Schedule,
                s.Timezone ?? "UTC",
                `${s.ScalableTargetAction?.MinCapacity ?? "unchanged"} / ${s.ScalableTargetAction?.MaxCapacity ?? "unchanged"}`,
              ])}
            />
            {schedulesResult.data.resources.map((s) => (
              <details
                key={s.ScheduledActionARN}
                className="group-box space-y-4 p-4"
              >
                <summary className="cursor-pointer text-sm">
                  {s.ScheduledActionName}
                </summary>
                {editable ? (
                  <>
                    <JsonForm
                      action={action("schedule")}
                      confirmationName={service}
                      label="Update schedule"
                      initial={{
                        ScheduledActionName: s.ScheduledActionName,
                        Schedule: s.Schedule,
                        Timezone: s.Timezone ?? "UTC",
                        StartTime: s.StartTime?.toISOString(),
                        EndTime: s.EndTime?.toISOString(),
                        ScalableTargetAction: s.ScalableTargetAction,
                      }}
                      hint="Dates must be ISO 8601. Omitting existing dates preserves them."
                    />
                    <ConfirmDelete
                      resourceName={s.ScheduledActionName!}
                      label="Delete schedule"
                      impact="Removes this scheduled scaling action. Other schedules and policies remain active."
                      action={async (prev, form) => {
                        "use server";
                        form.set("itemName", s.ScheduledActionName!);
                        return ecsAction(
                          region,
                          {
                            operation: "removeSchedule",
                            cluster,
                            name: service,
                          },
                          prev,
                          form,
                        );
                      }}
                    />
                  </>
                ) : (
                  <JsonDetails value={s} />
                )}
              </details>
            ))}
            <Pagination
              base={base}
              tokenKey="schedulesNext"
              current={value(query, "schedulesNext")}
              nextToken={schedulesResult.data.nextToken}
              query={paging}
            />
          </>
        )}
        {editable && target && (
          <details className="space-y-4">
            <summary className="cursor-pointer text-sm font-medium">
              Add scheduled action
            </summary>
            <JsonForm
              action={action("schedule")}
              confirmationName={service}
              label="Save scheduled action"
              initial={{
                ScheduledActionName: "weekday-capacity",
                Schedule: "cron(0 9 ? * MON-FRI *)",
                Timezone: "UTC",
                ScalableTargetAction: { MinCapacity: 1, MaxCapacity: 10 },
              }}
              hint="Use AWS cron(...), rate(...), or at(...) syntax and an explicit IANA timezone. Saving a schedule can affect future running task counts."
            />
          </details>
        )}
      </Panel>
      <Panel title="Scaling activity">
        {"error" in activityResult ? (
          <ErrorNotice message={activityResult.error} />
        ) : (
          <>
            <Table
              headers={["Started", "Status", "Description", "Cause / message"]}
              rows={activityResult.data.resources.map((a) => [
                a.StartTime?.toISOString(),
                a.StatusCode,
                a.Description,
                a.StatusMessage ?? a.Cause,
              ])}
            />
            <Pagination
              base={base}
              tokenKey="activityNext"
              current={value(query, "activityNext")}
              nextToken={activityResult.data.nextToken}
              query={paging}
            />
          </>
        )}
      </Panel>
    </div>
  );
}
