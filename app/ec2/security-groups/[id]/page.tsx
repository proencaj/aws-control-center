import type { SecurityGroupRule } from "@aws-sdk/client-ec2";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ErrorNotice } from "@/components/error-notice";
import { attempt } from "@/lib/aws/errors";
import { getSecurityGroup, type Direction } from "@/lib/ec2";
import {
  addRuleAction,
  deleteSecurityGroupAction,
  removeRuleAction,
} from "../../actions";

const inputClass =
  "rounded-md border border-border bg-transparent px-2 py-1.5 outline-none focus:border-foreground";

export default async function SecurityGroupPage({
  params,
}: PageProps<"/ec2/security-groups/[id]">) {
  const { id } = await params;
  const result = await attempt(getSecurityGroup(id));
  if ("error" in result) return <ErrorNotice message={result.error} />;
  if (!result.data) notFound();
  const { group, ingress, egress } = result.data;

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="console-kicker">Security group record</p>
          <h2 className="console-heading">{group.GroupName}</h2>
        </div>
        <ConfirmDelete
          action={deleteSecurityGroupAction.bind(null, id)}
          resourceName={id}
          label="Delete security group"
          impact="This deletes the security group. It fails if an instance or another group still references it."
        />
      </div>

      <section className="console-window">
        <h3 className="console-title">Group configuration</h3>
        <dl className="divide-y divide-border text-sm">
          {[
            ["Group ID", group.GroupId],
            ["Description", group.Description],
            ["VPC", group.VpcId],
            ["Owner", group.OwnerId],
          ].map(([label, value]) => (
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

      <Rules
        groupId={id}
        direction="ingress"
        title="Inbound rules"
        rules={ingress}
      />
      <Rules
        groupId={id}
        direction="egress"
        title="Outbound rules"
        rules={egress}
      />
    </section>
  );
}

function ports(rule: SecurityGroupRule) {
  if (rule.IpProtocol === "-1") return "All";
  if (rule.FromPort === rule.ToPort) return String(rule.FromPort);
  return `${rule.FromPort}-${rule.ToPort}`;
}

function Rules({
  groupId,
  direction,
  title,
  rules,
}: {
  groupId: string;
  direction: Direction;
  title: string;
  rules: SecurityGroupRule[];
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-3xl">{title}</h3>
      <p className="text-xs text-muted">
        {direction === "ingress"
          ? "Traffic allowed into resources using this group."
          : "Traffic allowed out of resources using this group."}
      </p>
      <div className="console-window overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="border-b border-border bg-surface px-4 py-2 text-left text-xs uppercase tracking-wider">
            {rules.length} {rules.length === 1 ? "rule" : "rules"} /{" "}
            {direction === "ingress" ? "Inbound" : "Outbound"}
          </caption>
          <thead className="border-b border-border text-muted">
            <tr>
              {[
                "Protocol",
                "Ports",
                direction === "ingress" ? "Source" : "Destination",
                "Description",
                "",
              ].map((heading, index) => (
                <th key={index} className="px-4 py-2 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rules.map((rule) => (
              <tr key={rule.SecurityGroupRuleId}>
                <td className="px-4 py-2">
                  {rule.IpProtocol === "-1" ? "All" : rule.IpProtocol}
                </td>
                <td className="px-4 py-2">{ports(rule)}</td>
                <td className="px-4 py-2">
                  {rule.CidrIpv4 ??
                    rule.CidrIpv6 ??
                    rule.ReferencedGroupInfo?.GroupId ??
                    rule.PrefixListId}
                </td>
                <td className="px-4 py-2">{rule.Description ?? "-"}</td>
                <td className="px-4 py-2 text-right">
                  <ActionForm
                    action={removeRuleAction.bind(
                      null,
                      groupId,
                      direction,
                      rule.SecurityGroupRuleId!,
                    )}
                  >
                    <button className="underline">Remove</button>
                  </ActionForm>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-muted">
                  No {direction === "ingress" ? "inbound" : "outbound"} rules.
                  Use the form below to add one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ActionForm
        action={addRuleAction.bind(null, groupId, direction)}
        className="flex flex-wrap items-end gap-2 text-sm"
      >
        <select name="protocol" defaultValue="tcp" className={inputClass}>
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
          <option value="icmp">ICMP</option>
          <option value="-1">All traffic</option>
        </select>
        <input
          name="fromPort"
          type="number"
          placeholder="From port"
          className={`${inputClass} w-28`}
        />
        <input
          name="toPort"
          type="number"
          placeholder="To port"
          className={`${inputClass} w-28`}
        />
        <input
          name="cidr"
          required
          placeholder="0.0.0.0/0"
          className={`${inputClass} w-40`}
        />
        <input
          name="description"
          placeholder="Description"
          className={`${inputClass} w-48`}
        />
        <button className="rounded-md border border-border px-3 py-1.5 hover:bg-surface">
          Add rule
        </button>
      </ActionForm>
    </div>
  );
}
