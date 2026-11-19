import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ErrorNotice } from "@/components/error-notice";
import { attempt } from "@/lib/aws/errors";
import { getInstance } from "@/lib/ec2";
import {
  rebootInstanceAction,
  startInstanceAction,
  stopInstanceAction,
  terminateInstanceAction,
} from "../../actions";
import { InstanceState, instanceName } from "../../instance-state";

export default async function InstancePage({
  params,
}: PageProps<"/ec2/instances/[id]">) {
  const { id } = await params;
  const result = await attempt(getInstance(id));
  if ("error" in result) return <ErrorNotice message={result.error} />;
  const instance = result.data;
  if (!instance) notFound();

  const state = instance.State?.Name;
  const canTerminate = state !== "terminated" && state !== "shutting-down";

  const rows: [string, React.ReactNode][] = [
    ["Instance ID", instance.InstanceId],
    ["State", <InstanceState key="state" state={state} />],
    ["Type", instance.InstanceType],
    ["AMI", instance.ImageId],
    ["Key pair", instance.KeyName ?? "-"],
    ["VPC", instance.VpcId ?? "-"],
    ["Subnet", instance.SubnetId ?? "-"],
    ["Availability zone", instance.Placement?.AvailabilityZone],
    ["Public IPv4", instance.PublicIpAddress ?? "-"],
    ["Private IPv4", instance.PrivateIpAddress ?? "-"],
    ["Public DNS", instance.PublicDnsName || "-"],
    ["Architecture", instance.Architecture],
    ["Platform", instance.PlatformDetails],
    ["Launched", instance.LaunchTime?.toISOString()],
    [
      "Security groups",
      instance.SecurityGroups?.length ? (
        <span key="sg" className="flex flex-wrap gap-x-3">
          {instance.SecurityGroups.map((group) => (
            <Link
              key={group.GroupId}
              href={`/ec2/security-groups/${group.GroupId}`}
              className="underline"
            >
              {group.GroupName} ({group.GroupId})
            </Link>
          ))}
        </span>
      ) : (
        "-"
      ),
    ],
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="console-kicker">Instance record</p>
          <h2 className="console-heading">
            {instanceName(instance.Tags) ?? instance.InstanceId}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/ec2/instances/${id}`}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface"
          >
            Refresh
          </Link>
          {state === "stopped" && (
            <StateButton
              action={startInstanceAction.bind(null, id)}
              label="Start"
            />
          )}
          {state === "running" && (
            <StateButton
              action={stopInstanceAction.bind(null, id)}
              label="Stop"
            />
          )}
          {state === "running" && (
            <StateButton
              action={rebootInstanceAction.bind(null, id)}
              label="Reboot"
            />
          )}
          {canTerminate && (
            <ConfirmDelete
              action={terminateInstanceAction.bind(null, id)}
              resourceName={id}
              label="Terminate instance"
              impact="This permanently terminates the instance. Instance store data and the root volume (if set to delete on termination) are lost."
            />
          )}
        </div>
      </div>

      <section className="console-window">
        <h3 className="console-title">Configuration / {instance.InstanceId}</h3>
        <dl className="divide-y divide-border text-sm">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4"
            >
              <dt className="text-muted">{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {instance.Tags && instance.Tags.length > 0 && (
        <div className="console-window">
          <h3 className="console-title">
            Tags / {instance.Tags.length} entries
          </h3>
          <dl className="divide-y divide-border text-sm">
            {instance.Tags.map((tag) => (
              <div
                key={tag.Key}
                className="grid gap-2 px-4 py-2 sm:grid-cols-[10rem_1fr] sm:gap-4"
              >
                <dt className="text-muted">{tag.Key}</dt>
                <dd className="break-all">{tag.Value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

function StateButton({
  action,
  label,
}: {
  action: (previous: { error?: string }) => Promise<{ error?: string }>;
  label: string;
}) {
  return (
    <ActionForm action={action}>
      <button className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface">
        {label}
      </button>
    </ActionForm>
  );
}
