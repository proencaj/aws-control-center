import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ErrorNotice } from "@/components/error-notice";
import { attempt } from "@/lib/aws/errors";
import { listSecurityGroups, listVpcs } from "@/lib/ec2";
import { createSecurityGroupAction } from "../actions";

const inputClass =
  "w-full";

export default async function SecurityGroupsPage({
  searchParams,
}: PageProps<"/ec2/security-groups">) {
  const { next } = await searchParams;
  const nextToken = typeof next === "string" ? next : undefined;
  const [groups, vpcs] = await Promise.all([
    attempt(listSecurityGroups({ nextToken })),
    attempt(listVpcs()),
  ]);

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="console-heading">Security group directory</h2>
        <p className="text-sm text-muted">
          Open a group to inspect inbound and outbound rules for its VPC.
        </p>
      </div>
      <details className="group-box p-4">
        <summary className="text-sm font-bold">
          Create security group
        </summary>
        <ActionForm
          action={createSecurityGroupAction}
          className="mt-4 max-w-md space-y-3 text-sm"
        >
          <label className="block space-y-1">
            <span className="text-muted">Name</span>
            <input name="groupName" required className={inputClass} />
          </label>
          <label className="block space-y-1">
            <span className="text-muted">Description</span>
            <input name="description" required className={inputClass} />
          </label>
          <label className="block space-y-1">
            <span className="text-muted">VPC</span>
            <select name="vpcId" className={inputClass}>
              <option value="">Default</option>
              {"data" in vpcs &&
                vpcs.data.map((vpc) => (
                  <option key={vpc.VpcId} value={vpc.VpcId}>
                    {vpc.VpcId} ({vpc.CidrBlock})
                  </option>
                ))}
            </select>
          </label>
          <button className="font-bold">
            Create
          </button>
        </ActionForm>
      </details>

      {"error" in groups ? (
        <ErrorNotice message={groups.error} />
      ) : (
        <>
          <div className="console-window overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="border-b border-border bg-surface px-4 py-1 text-left text-xs font-bold">
                Result set / {groups.data.securityGroups.length}{" "}
                {groups.data.securityGroups.length === 1 ? "group" : "groups"}{" "}
                on this page
              </caption>
              <thead className="border-b border-border text-muted">
                <tr>
                  {["Name", "Group ID", "VPC", "Description"].map((heading) => (
                    <th key={heading} className="px-4 py-2 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.data.securityGroups.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted">
                      <p className="mb-2 text-xs font-bold">
                        Empty result set
                      </p>
                      <p>
                        No security groups returned. Create a group or select
                        another region.
                      </p>
                    </td>
                  </tr>
                )}
                {groups.data.securityGroups.map((group) => (
                  <tr key={group.GroupId}>
                    <td className="px-4 py-2">{group.GroupName}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/ec2/security-groups/${group.GroupId}`}
                        className="underline"
                      >
                        {group.GroupId}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{group.VpcId}</td>
                    <td className="px-4 py-2">{group.Description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-xs">
            <span className="mr-auto text-muted">
              {groups.data.nextToken
                ? "More groups available"
                : "End of result set"}
            </span>
            {nextToken && (
              <Link href="/ec2/security-groups" className="underline">
                First page
              </Link>
            )}
            {groups.data.nextToken && (
              <Link
                href={`/ec2/security-groups?${new URLSearchParams({ next: groups.data.nextToken })}`}
                className="underline"
              >
                Next page
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
