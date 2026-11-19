import { ActionForm } from "@/components/action-form";
import { ErrorNotice } from "@/components/error-notice";
import { attempt } from "@/lib/aws/errors";
import { getLaunchOptions } from "@/lib/ec2";
import { launchInstanceAction } from "../../actions";

const commonTypes = [
  "t3.micro",
  "t3.small",
  "t3.medium",
  "t3.large",
  "m5.large",
  "c5.large",
  "r5.large",
];
const inputClass =
  "w-full rounded-md border border-border bg-transparent px-2 py-1.5 outline-none focus:border-foreground";

export default async function LaunchInstancePage() {
  const result = await attempt(getLaunchOptions());
  if ("error" in result) return <ErrorNotice message={result.error} />;
  const { defaultImageId, keyPairs, subnets, securityGroups } = result.data;

  return (
    <section className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <p className="console-kicker">New instance / Configuration</p>
        <h2 className="console-heading">Launch instance</h2>
        <p className="text-sm text-muted">
          Choose an image and instance type, then configure access and
          networking.
        </p>
      </div>
      <ActionForm action={launchInstanceAction} className="space-y-4 text-sm">
        <section className="console-window">
          <h3 className="console-title">01 / Machine</h3>
          <div className="space-y-4 p-5">
            <Field label="Name">
              <input name="name" className={inputClass} />
            </Field>
            <Field label="AMI ID">
              <input
                name="imageId"
                defaultValue={defaultImageId}
                required
                placeholder="ami-..."
                className={inputClass}
              />
            </Field>
            <Field label="Instance type">
              <input
                name="instanceType"
                list="instance-types"
                defaultValue="t3.micro"
                required
                className={inputClass}
              />
              <datalist id="instance-types">
                {commonTypes.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </Field>
          </div>
        </section>
        <section className="console-window">
          <h3 className="console-title">02 / Access &amp; networking</h3>
          <div className="space-y-4 p-5">
            <Field label="Key pair">
              <select name="keyName" className={inputClass}>
                <option value="">None</option>
                {keyPairs.map((key) => (
                  <option key={key.KeyName} value={key.KeyName}>
                    {key.KeyName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subnet">
              <select name="subnetId" className={inputClass}>
                <option value="">Default</option>
                {subnets.map((subnet) => (
                  <option key={subnet.SubnetId} value={subnet.SubnetId}>
                    {subnet.SubnetId} ({subnet.AvailabilityZone},{" "}
                    {subnet.CidrBlock})
                  </option>
                ))}
              </select>
            </Field>
            <fieldset className="space-y-1">
              <legend className="text-muted">
                Security groups (none selects the default)
              </legend>
              {securityGroups.map((group) => (
                <label key={group.GroupId} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="securityGroupIds"
                    value={group.GroupId}
                  />
                  {group.GroupName} ({group.GroupId})
                </label>
              ))}
            </fieldset>
          </div>
        </section>
        <button className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background disabled:opacity-40">
          Launch instance
        </button>
      </ActionForm>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}
