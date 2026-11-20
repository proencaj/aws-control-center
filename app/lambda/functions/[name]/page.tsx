import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ErrorNotice } from "@/components/error-notice";
import { getRegion } from "@/lib/aws/clients";
import { attempt } from "@/lib/aws/errors";
import { getFunction, getTriggers, type LambdaPermission } from "@/lib/lambda";
import { getCallerIdentity } from "@/lib/sts";
import {
  deleteFunctionAction,
  invokeFunctionAction,
  updateCodeFromS3Action,
  updateConfigurationAction,
} from "../../actions";
import { EnvironmentEditor, InvokeForm, PendingRefresh } from "../../editors";
import { UpdateZipForm, runtimes } from "../../zip-upload";

const sections = ["overview", "code", "test", "configuration", "monitoring"] as const;
type Section = (typeof sections)[number];

function functionUrl(name: string, section: Section = "overview", next?: string) {
  const base = `/lambda/functions/${encodeURIComponent(name)}`;
  const params = new URLSearchParams();
  if (section !== "overview") params.set("section", section);
  if (next) params.set("triggerNext", next);
  return `${base}${params.size ? `?${params}` : ""}`;
}

export default async function FunctionPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ name }, query, region, identity] = await Promise.all([
    params,
    searchParams,
    getRegion(),
    getCallerIdentity(),
  ]);
  const rawSection = typeof query.section === "string" ? query.section : "overview";
  const section = sections.includes(rawSection as Section) ? rawSection as Section : "overview";
  const result = await attempt(getFunction(region, name));
  if ("error" in result) return <ErrorNotice message={result.error} />;
  const configuration = result.data.Configuration;
  if (!configuration) return <ErrorNotice message="AWS did not return this function's configuration." />;
  const context = { region, account: identity.account ?? "" };
  const pending = configuration.LastUpdateStatus === "InProgress" || configuration.State === "Pending";

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="console-kicker">Lambda function</p><h2 className="console-heading break-all">{name}</h2></div>
        <Link className="btn" href={functionUrl(name, section)}>Refresh</Link>
      </div>
      <PendingRefresh pending={pending} />
      {(configuration.StateReason || configuration.LastUpdateStatusReason) && (
        <ErrorNotice message={configuration.StateReason ?? configuration.LastUpdateStatusReason!} />
      )}
      <dl className="console-window grid gap-px bg-border text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="State" value={configuration.State ?? "—"} />
        <Summary label="Last update" value={configuration.LastUpdateStatus ?? "—"} />
        <Summary label="Package / runtime" value={`${configuration.PackageType ?? "Zip"} / ${configuration.Runtime ?? "—"}`} />
        <Summary label="Last modified" value={configuration.LastModified ?? "—"} />
      </dl>
      <nav className="console-tabs text-sm" aria-label="Function sections">
        {sections.map((item) => <Link key={item} aria-current={section === item ? "page" : undefined} href={functionUrl(name, item)}>{item[0].toUpperCase() + item.slice(1)}</Link>)}
      </nav>
      {section === "overview" && <Overview name={name} region={region} context={context} configuration={configuration} tags={result.data.Tags} searchParams={query} />}
      {section === "code" && <Code name={name} context={context} configuration={configuration} />}
      {section === "test" && <InvokeForm action={invokeFunctionAction.bind(null, name)} context={context} />}
      {section === "configuration" && <Configuration name={name} context={context} configuration={configuration} />}
      {section === "monitoring" && <Monitoring name={name} logGroup={configuration.LoggingConfig?.LogGroup} />}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-surface p-4"><dt className="console-kicker">{label}</dt><dd className="mt-1 break-all">{value}</dd></div>;
}

async function Overview({
  name,
  region,
  context,
  configuration,
  tags,
  searchParams,
}: {
  name: string;
  region: string;
  context: { region: string; account: string };
  configuration: NonNullable<Awaited<ReturnType<typeof getFunction>>["Configuration"]>;
  tags?: Record<string, string>;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const marker = typeof searchParams.triggerNext === "string" ? searchParams.triggerNext : undefined;
  const triggers = await attempt(getTriggers(region, name, marker));
  return (
    <div className="space-y-5">
      <section className="console-window">
        <div className="console-title">Function details</div>
        <dl className="divide-y divide-border text-sm">
          <Row label="Function ARN" value={configuration.FunctionArn} />
          <Row label="Description" value={configuration.Description || "—"} />
          <Row label="Execution role" value={configuration.Role} />
          <Row label="Handler" value={configuration.Handler ?? "—"} />
          <Row label="Architecture" value={configuration.Architectures?.join(", ") ?? "—"} />
          <Row label="Memory / timeout" value={`${configuration.MemorySize ?? "—"} MB / ${configuration.Timeout ?? "—"} seconds`} />
          <Row label="Ephemeral storage" value={`${configuration.EphemeralStorage?.Size ?? 512} MB`} />
          <Row label="Code size" value={configuration.CodeSize === undefined ? "—" : `${configuration.CodeSize.toLocaleString()} bytes`} />
          <Row label="Tags" value={tags && Object.keys(tags).length ? Object.entries(tags).map(([key, value]) => `${key}=${value}`).join(", ") : "—"} />
        </dl>
      </section>
      <section className="space-y-3">
        <div><h3 className="text-lg font-semibold">Triggers and invocation permissions</h3><p className="text-xs text-muted">Event-source mappings are active Lambda integrations. Resource-policy permissions allow a service or account to invoke the function but do not prove the external trigger still exists.</p></div>
        {"error" in triggers ? <ErrorNotice message={triggers.error} /> : (
          <>
            <div className="console-window overflow-x-auto"><table className="w-full text-left text-sm">
              <caption className="border-b border-border bg-surface px-4 py-1 text-left text-xs font-bold">Event-source mappings</caption>
              <thead className="border-b border-border text-muted"><tr><th className="px-4 py-3">Source</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Batch size</th><th className="px-4 py-3">Last result</th></tr></thead>
              <tbody className="divide-y divide-border">
                {triggers.data.mappings.map((mapping) => <tr key={mapping.UUID}><td className="break-all px-4 py-3">{mapping.EventSourceArn ?? (mapping.SelfManagedEventSource?.Endpoints ? JSON.stringify(mapping.SelfManagedEventSource.Endpoints) : "Managed source")}</td><td className="px-4 py-3">{mapping.State ?? "—"}</td><td className="px-4 py-3">{mapping.BatchSize ?? "—"}</td><td className="px-4 py-3">{mapping.LastProcessingResult ?? "—"}</td></tr>)}
                {!triggers.data.mappings.length && <tr><td colSpan={4} className="p-6 text-center text-muted">No event-source mappings on this page.</td></tr>}
              </tbody>
            </table></div>
            <div className="flex justify-end gap-4 text-xs">{marker && <Link className="underline" href={functionUrl(name)}>First trigger page</Link>}{triggers.data.nextToken && <Link className="underline" href={functionUrl(name, "overview", triggers.data.nextToken)}>Next trigger page →</Link>}</div>
            {triggers.data.policyError && <ErrorNotice message={`Invocation permissions could not be loaded. ${triggers.data.policyError}`} />}
            {!triggers.data.policyError && <Permissions permissions={triggers.data.permissions} />}
          </>
        )}
      </section>
      <section className="console-window">
        <div className="console-title">Danger zone</div>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 text-sm"><p>Deleting a function removes its versions and aliases. Log groups and external event sources can remain.</p><ConfirmDelete action={deleteFunctionAction.bind(null, name)} resourceName={name} label="Delete function" impact="This permanently deletes the function, published versions, and aliases. External resources and CloudWatch logs are not deleted." hiddenFields={context} /></div>
      </section>
    </div>
  );
}

function Permissions({ permissions }: { permissions: LambdaPermission[] }) {
  return <div className="console-window overflow-x-auto"><table className="w-full text-left text-sm">
    <caption className="border-b border-border bg-surface px-4 py-1 text-left text-xs font-bold">Resource-policy invocation permissions</caption>
    <thead className="border-b border-border text-muted"><tr><th className="px-4 py-3">Statement</th><th className="px-4 py-3">Principal</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Source condition</th></tr></thead>
    <tbody className="divide-y divide-border">{permissions.map((permission, index) => <tr key={permission.Sid ?? index}><td className="px-4 py-3">{permission.Sid ?? "—"}</td><td className="break-all px-4 py-3">{formatPolicy(permission.Principal)}</td><td className="break-all px-4 py-3">{formatPolicy(permission.Action)}</td><td className="break-all px-4 py-3">{formatPolicy(permission.Condition)}</td></tr>)}{!permissions.length && <tr><td colSpan={4} className="p-6 text-center text-muted">No resource-policy invocation permissions.</td></tr>}</tbody>
  </table></div>;
}

function formatPolicy(value: unknown) {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

function Code({ name, context, configuration }: { name: string; context: { region: string; account: string }; configuration: NonNullable<Awaited<ReturnType<typeof getFunction>>["Configuration"]> }) {
  if (configuration.PackageType === "Image") return <section className="console-window"><div className="console-title">Container image</div><div className="space-y-2 p-5 text-sm"><p>This function uses a container image. ZIP deployment is unavailable.</p><p className="text-muted">Image URI changes are outside this release.</p></div></section>;
  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="console-window"><div className="console-title">Upload local ZIP</div><div className="p-5"><UpdateZipForm context={context} functionName={name} revisionId={configuration.RevisionId} /></div></section>
    <section className="console-window"><div className="console-title">Deploy ZIP from S3</div><ActionForm action={updateCodeFromS3Action.bind(null, name)} className="space-y-4 p-5"><ContextFields context={context} revisionId={configuration.RevisionId} /><label className="block space-y-1 text-sm"><span>S3 bucket</span><input required className="w-full" name="s3Bucket" /></label><label className="block space-y-1 text-sm"><span>Object key</span><input required className="w-full" name="s3Key" placeholder="releases/function.zip" /></label><label className="block space-y-1 text-sm"><span>Object version (optional)</span><input className="w-full" name="s3ObjectVersion" /></label><p className="text-xs text-muted">The bucket must be in {context.region}. This updates $LATEST without publishing a version.</p><button className="font-bold">Deploy from S3</button></ActionForm></section>
  </div>;
}

function Configuration({ name, context, configuration }: { name: string; context: { region: string; account: string }; configuration: NonNullable<Awaited<ReturnType<typeof getFunction>>["Configuration"]> }) {
  const environmentError = configuration.Environment?.Error;
  return <div className="space-y-5">
    {environmentError ? <ErrorNotice message={`Environment variables could not be read, so configuration saving is disabled to prevent overwriting them. ${environmentError.Message ?? environmentError.ErrorCode ?? ""}`} /> : (
      <section className="console-window"><div className="console-title">General configuration</div><ActionForm action={updateConfigurationAction.bind(null, name, configuration.PackageType !== "Image")} className="space-y-4 p-5"><ContextFields context={context} revisionId={configuration.RevisionId} /><label className="block space-y-1 text-sm"><span>Description</span><input className="w-full" name="description" maxLength={256} defaultValue={configuration.Description} /></label><div className="grid gap-4 sm:grid-cols-3"><NumberField name="memorySize" label="Memory (MB)" value={configuration.MemorySize ?? 128} min={128} max={10240} /><NumberField name="timeout" label="Timeout (seconds)" value={configuration.Timeout ?? 3} min={1} max={900} /><NumberField name="ephemeralStorage" label="Ephemeral storage (MB)" value={configuration.EphemeralStorage?.Size ?? 512} min={512} max={10240} /></div><label className="block space-y-1 text-sm"><span>Execution role ARN</span><input required className="w-full" name="role" defaultValue={configuration.Role} /></label>{configuration.PackageType !== "Image" && <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Runtime</span><select className="w-full" name="runtime" defaultValue={configuration.Runtime}>{configuration.Runtime && !runtimes.includes(configuration.Runtime as never) && <option>{configuration.Runtime}</option>}{runtimes.map((runtime) => <option key={runtime}>{runtime}</option>)}</select></label><label className="space-y-1 text-sm"><span>Handler</span><input required className="w-full" name="handler" defaultValue={configuration.Handler} /></label></div>}<EnvironmentEditor variables={configuration.Environment?.Variables ?? {}} /><div className="flex justify-end"><button className="font-bold">Save configuration</button></div></ActionForm></section>
    )}
    <section className="console-window"><div className="console-title">Read-only settings</div><dl className="divide-y divide-border text-sm"><Row label="Layers" value={configuration.Layers?.map((layer) => layer.Arn).join(", ") || "—"} /><Row label="VPC" value={configuration.VpcConfig?.VpcId ?? "Not connected"} /><Row label="Subnets" value={configuration.VpcConfig?.SubnetIds?.join(", ") || "—"} /><Row label="Security groups" value={configuration.VpcConfig?.SecurityGroupIds?.join(", ") || "—"} /><Row label="Log group" value={configuration.LoggingConfig?.LogGroup ?? `/aws/lambda/${name}`} /><Row label="Log format" value={configuration.LoggingConfig?.LogFormat ?? "Text"} /></dl></section>
  </div>;
}

function ContextFields({ context, revisionId }: { context: { region: string; account: string }; revisionId?: string }) { return <><input type="hidden" name="region" value={context.region} /><input type="hidden" name="account" value={context.account} />{revisionId && <input type="hidden" name="revisionId" value={revisionId} />}</>; }
function NumberField({ name, label, value, min, max }: { name: string; label: string; value: number; min: number; max: number }) { return <label className="space-y-1 text-sm"><span>{label}</span><input required type="number" className="w-full" name={name} defaultValue={value} min={min} max={max} /></label>; }
function Row({ label, value }: { label: string; value?: string }) { return <div className="grid gap-2 px-4 py-3 sm:grid-cols-[10rem_1fr]"><dt className="text-muted">{label}</dt><dd className="break-all">{value ?? "—"}</dd></div>; }

function Monitoring({ name, logGroup }: { name: string; logGroup?: string }) {
  const group = logGroup ?? `/aws/lambda/${name}`;
  return <section className="console-window"><div className="console-title">CloudWatch logs</div><div className="space-y-4 p-5 text-sm"><p>Open the configured function log group in the app&apos;s live Logs Monitor.</p><p className="break-all font-mono text-xs">{group}</p><Link className="btn font-bold" href={`/logs-monitor?${new URLSearchParams({ group })}`}>Open Logs Monitor</Link></div></section>;
}
