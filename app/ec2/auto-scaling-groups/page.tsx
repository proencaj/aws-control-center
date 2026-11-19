import { Pagination } from "@/app/ecs/ui";
import { ErrorNotice } from "@/components/error-notice";
import { FilterSearch } from "@/components/filter-search";
import { getRegion } from "@/lib/aws/clients";
import { attempt } from "@/lib/aws/errors";
import { listAutoScalingGroups } from "@/lib/auto-scaling";
import { updateCapacityAction } from "./actions";
import { EditCapacity } from "./edit-capacity";

const headings = ["Name", "Min", "Desired", "Max", "Instances", "Status", ""];

export default async function AutoScalingGroupsPage({
  searchParams,
}: PageProps<"/ec2/auto-scaling-groups">) {
  const { filter: filterParam, next } = await searchParams;
  const filter = typeof filterParam === "string" ? filterParam : "";
  const nextToken = typeof next === "string" ? next : undefined;
  const result = await attempt(
    listAutoScalingGroups(await getRegion(), nextToken, filter),
  );

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="console-heading">Auto Scaling groups</h2>
        <p className="text-sm text-muted">
          Edit a group to change its desired, minimum and maximum capacity.
        </p>
      </div>
      <div className="group-box p-3">
        <FilterSearch
          param="filter"
          value={filter}
          label="Group name filter"
          placeholder="Filter groups by name"
        />
      </div>

      {"error" in result ? (
        <ErrorNotice message={result.error} />
      ) : (
        <>
          <div className="console-window overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="border-b border-border bg-surface px-4 py-1 text-left text-xs font-bold">
                Result set / {result.data.resources.length}{" "}
                {result.data.resources.length === 1 ? "group" : "groups"} on
                this page
              </caption>
              <thead className="border-b border-border text-muted">
                <tr>
                  {headings.map((heading) => (
                    <th key={heading} className="px-4 py-2 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.data.resources.map((group) => {
                  const name = group.AutoScalingGroupName ?? "";
                  const min = group.MinSize ?? 0;
                  const desired = group.DesiredCapacity ?? 0;
                  const max = group.MaxSize ?? 0;
                  return (
                    <tr key={name}>
                      <td className="px-4 py-2">{name}</td>
                      <td className="px-4 py-2">{min}</td>
                      <td className="px-4 py-2">{desired}</td>
                      <td className="px-4 py-2">{max}</td>
                      <td className="px-4 py-2">
                        {group.Instances?.length ?? 0}
                      </td>
                      <td className="px-4 py-2">{group.Status ?? "Active"}</td>
                      <td className="px-4 py-2">
                        <EditCapacity
                          key={`${min}-${desired}-${max}`}
                          name={name}
                          min={min}
                          desired={desired}
                          max={max}
                          action={updateCapacityAction.bind(null, name)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {result.data.resources.length === 0 && (
                  <tr>
                    <td
                      colSpan={headings.length}
                      className="px-4 py-6 text-center text-muted"
                    >
                      <p className="mb-2 text-xs font-bold">
                        Empty result set
                      </p>
                      <p>
                        {filter
                          ? "No groups match this name. Clear the filter or try another name."
                          : "No Auto Scaling groups in this region."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            base="/ec2/auto-scaling-groups"
            nextToken={result.data.nextToken}
            current={nextToken}
            query={filter ? { filter } : {}}
          />
        </>
      )}
    </section>
  );
}
