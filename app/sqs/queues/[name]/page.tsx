import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ErrorNotice } from "@/components/error-notice";
import { getRegion } from "@/lib/aws/clients";
import { attempt } from "@/lib/aws/errors";
import { getCallerIdentity } from "@/lib/sts";
import { getQueue, getRedriveInfo, listQueues, queueNameFromUrl } from "@/lib/sqs";
import {
  cancelRedriveAction,
  deleteQueueAction,
  sendMessageAction,
  startRedriveAction,
  updateDeadLetterQueueAction,
  updateQueueAction,
  updateRedriveAllowPolicyAction,
} from "../../actions";
import { QueueFields } from "../../new/page";
import { MessagePoller } from "./message-poller";

export default async function QueuePage({ params }: { params: Promise<{ name: string }> }) {
  const [{ name }, region, identity] = await Promise.all([params, getRegion(), getCallerIdentity()]);
  const result = await attempt(getQueue(region, name));
  if ("error" in result) return <ErrorNotice message={result.error} />;
  const { attributes, queueUrl } = result.data; const fifo = attributes.FifoQueue === "true"; const context = { region, account: identity.account ?? "" };
  const [queuesResult, redriveResult] = await Promise.all([
    attempt(listQueues(region)),
    attempt(getRedriveInfo(region, name)),
  ]);
  const queues = "data" in queuesResult ? queuesResult.data.queues : [];
  const compatibleQueues = queues.filter((queue) => {
    const candidate = queueNameFromUrl(queue.queueUrl);
    const candidateFifo = queue.attributes?.FifoQueue === "true" || candidate.endsWith(".fifo");
    return candidate !== name && candidateFifo === fifo;
  });
  const redrivePolicy = parseRedrivePolicy(attributes.RedrivePolicy);
  const redriveAllowPolicy = parseRedriveAllowPolicy(attributes.RedriveAllowPolicy);
  return <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="console-kicker">SQS queue / {fifo ? "FIFO" : "Standard"}</p><h2 className="console-heading break-all">{name}</h2></div><Link className="btn" href={`/sqs/queues/${encodeURIComponent(name)}`}>Refresh</Link></div>
    <dl className="console-window divide-y divide-border text-sm"><Row label="Queue URL" value={queueUrl} /><Row label="Queue ARN" value={attributes.QueueArn} /><Row label="Available / in flight / delayed" value={`${attributes.ApproximateNumberOfMessages ?? "—"} / ${attributes.ApproximateNumberOfMessagesNotVisible ?? "—"} / ${attributes.ApproximateNumberOfMessagesDelayed ?? "—"}`} /><Row label="Encryption" value={attributes.SqsManagedSseEnabled === "true" ? "SQS-managed encryption" : "Queue configuration"} /><Row label="Dead-letter policy" value={attributes.RedrivePolicy ?? "Not configured"} /></dl>
    <div className="grid gap-5 xl:grid-cols-2"><section className="console-window"><div className="console-title">Send message</div><ActionForm action={sendMessageAction.bind(null, name, fifo)} className="space-y-4 p-5"><Context context={context} /><label className="block space-y-1 text-sm"><span>Message body</span><textarea required className="min-h-40 w-full" name="body" /></label>{fifo ? <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Message group ID</span><input required className="w-full" name="messageGroupId" /></label><label className="space-y-1 text-sm"><span>Deduplication ID (optional with content deduplication)</span><input className="w-full" name="messageDeduplicationId" /></label></div> : <label className="block space-y-1 text-sm"><span>Delivery delay (seconds)</span><input type="number" min={0} max={900} defaultValue={0} className="w-full" name="messageDelay" /></label>}<AttributesField /><button className="font-bold">Send message</button></ActionForm></section>
      <section className="console-window"><div className="console-title">Queue configuration</div><ActionForm action={updateQueueAction.bind(null, name, fifo)} className="space-y-4 p-5"><Context context={context} /><QueueFields values={attributes} />{fifo && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="contentBasedDeduplication" defaultChecked={attributes.ContentBasedDeduplication === "true"} /> Content-based deduplication</label>}<button className="font-bold">Save configuration</button></ActionForm></section></div>
    <section className="space-y-3"><div><h3 className="text-lg font-semibold">Dead-letter queue and redrive</h3><p className="text-xs text-muted">Route repeatedly unsuccessful messages to a DLQ, control which queues may use this queue as a DLQ, and move DLQ messages back for processing.</p></div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="console-window"><div className="console-title">Dead-letter queue</div><ActionForm action={updateDeadLetterQueueAction.bind(null, name, fifo)} className="space-y-4 p-5"><Context context={context} /><label className="block space-y-1 text-sm"><span>Dead-letter queue</span><select className="w-full" name="deadLetterQueue" defaultValue={redrivePolicy ? queueNameFromArn(redrivePolicy.deadLetterTargetArn) : ""}><option value="">Disabled</option>{compatibleQueues.map(({ queueUrl }) => { const candidate = queueNameFromUrl(queueUrl); return <option key={queueUrl} value={candidate}>{candidate}</option>; })}</select></label><label className="block space-y-1 text-sm"><span>Maximum receives</span><input className="w-full" type="number" name="maxReceiveCount" min={1} max={1000} defaultValue={redrivePolicy?.maxReceiveCount ?? "10"} /></label><p className="text-xs text-muted">After this many receives without deletion, SQS moves the message to the selected same-type queue.</p>{"error" in queuesResult && <ErrorNotice message={`Queue choices could not be loaded. ${queuesResult.error}`} />}<button className="font-bold">Save dead-letter settings</button></ActionForm></section>
        <section className="console-window"><div className="console-title">Redrive allow policy</div><ActionForm action={updateRedriveAllowPolicyAction.bind(null, name)} className="space-y-4 p-5"><Context context={context} /><label className="block space-y-1 text-sm"><span>Source queue permission</span><select className="w-full" name="redrivePermission" defaultValue={redriveAllowPolicy.redrivePermission}><option value="allowAll">Allow all queues in this account and region</option><option value="byQueue">Allow specific queues</option><option value="denyAll">Deny all</option></select></label><label className="block space-y-1 text-sm"><span>Allowed source queue ARNs (one per line, maximum 10)</span><textarea className="min-h-28 w-full font-mono text-xs" name="sourceQueueArns" defaultValue={redriveAllowPolicy.sourceQueueArns.join("\n")} /></label><p className="text-xs text-muted">The ARN list is used only when “Allow specific queues” is selected.</p><button className="font-bold">Save allow policy</button></ActionForm></section>
      </div>
      {"error" in redriveResult ? <ErrorNotice message={`Redrive status could not be loaded. ${redriveResult.error}`} /> : <>
        {redriveResult.data.sourceQueueUrls.length > 0 && <section className="console-window"><div className="console-title">Start DLQ redrive</div><ActionForm action={startRedriveAction.bind(null, name, fifo)} className="space-y-4 p-5"><Context context={context} /><p className="text-sm">This queue is a DLQ for: <strong>{redriveResult.data.sourceQueueUrls.map(queueNameFromUrl).join(", ")}</strong></p><label className="block space-y-1 text-sm"><span>Message destination</span><select className="w-full" name="destinationQueue"><option value="">Original source queue(s)</option>{compatibleQueues.map(({ queueUrl }) => { const candidate = queueNameFromUrl(queueUrl); return <option key={queueUrl} value={candidate}>Custom: {candidate}</option>; })}</select></label><label className="block space-y-1 text-sm"><span>Custom maximum velocity (messages/second)</span><input className="w-full" type="number" name="maxVelocity" min={1} max={500} placeholder="Blank uses system-optimized velocity" /></label><p className="text-xs text-muted">Redriven messages receive a new message ID and enqueue time. Messages already moved remain at the destination if the task is cancelled.</p><button className="font-bold">Redrive messages</button></ActionForm></section>}
        <RedriveTasks name={name} context={context} tasks={redriveResult.data.tasks} />
      </>}
    </section>
    <MessagePoller name={name} region={region} account={context.account} />
    <section className="console-window"><div className="console-title">Danger zone</div><div className="flex flex-wrap items-center justify-between gap-4 p-5 text-sm"><p>Deleting this queue permanently removes all queued messages.</p><ConfirmDelete action={deleteQueueAction.bind(null, name)} resourceName={name} label="Delete queue" impact="This permanently deletes the queue and every message it contains. Producers and consumers using its URL will fail." hiddenFields={context} /></div></section>
  </section>;
}
function Context({ context }: { context: { region: string; account: string } }) { return <><input type="hidden" name="region" value={context.region} /><input type="hidden" name="account" value={context.account} /></>; }
function Row({ label, value }: { label: string; value?: string }) { return <div className="grid gap-2 px-4 py-3 sm:grid-cols-[13rem_1fr]"><dt className="text-muted">{label}</dt><dd className="break-all">{value ?? "—"}</dd></div>; }
function AttributesField() { return <label className="block space-y-1 text-sm"><span>Message attributes (JSON)</span><textarea className="min-h-24 w-full font-mono text-xs" name="messageAttributes" defaultValue="{}" /><span className="block text-xs text-muted">Example: {`{"event":{"DataType":"String","StringValue":"created"}}`}</span></label>; }

type MoveTask = Awaited<ReturnType<typeof getRedriveInfo>>["tasks"][number];
function RedriveTasks({ name, context, tasks }: { name: string; context: { region: string; account: string }; tasks: MoveTask[] }) {
  if (!tasks.length) return null;
  return <div className="console-window overflow-x-auto"><table className="w-full text-left text-sm"><caption className="border-b border-border bg-surface px-4 py-1 text-left text-xs font-bold">Recent redrive tasks</caption><thead className="border-b border-border text-muted"><tr><th className="px-4 py-3">Status</th><th className="px-4 py-3">Destination</th><th className="px-4 py-3">Moved / total</th><th className="px-4 py-3">Velocity</th><th className="px-4 py-3">Started</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-border">{tasks.map((task, index) => <tr key={task.TaskHandle ?? `${task.StartedTimestamp}-${index}`}><td className="px-4 py-3">{task.Status ?? "—"}{task.FailureReason && <span className="block text-xs text-muted">{task.FailureReason}</span>}</td><td className="break-all px-4 py-3">{task.DestinationArn ?? "Original source queue(s)"}</td><td className="px-4 py-3 tabular-nums">{task.ApproximateNumberOfMessagesMoved ?? 0} / {task.ApproximateNumberOfMessagesToMove ?? "—"}</td><td className="px-4 py-3">{task.MaxNumberOfMessagesPerSecond ?? "System optimized"}</td><td className="px-4 py-3">{task.StartedTimestamp ? new Date(task.StartedTimestamp).toLocaleString() : "—"}</td><td className="px-4 py-3">{task.Status === "RUNNING" && task.TaskHandle ? <ActionForm action={cancelRedriveAction.bind(null, name, task.TaskHandle)}><Context context={context} /><button>Cancel redrive</button></ActionForm> : "—"}</td></tr>)}</tbody></table></div>;
}

function parseRedrivePolicy(value?: string) {
  if (!value) return undefined;
  try { const parsed = JSON.parse(value) as { deadLetterTargetArn?: unknown; maxReceiveCount?: unknown }; if (typeof parsed.deadLetterTargetArn === "string" && (typeof parsed.maxReceiveCount === "string" || typeof parsed.maxReceiveCount === "number")) return { deadLetterTargetArn: parsed.deadLetterTargetArn, maxReceiveCount: String(parsed.maxReceiveCount) }; } catch {}
  return undefined;
}
function parseRedriveAllowPolicy(value?: string) {
  if (!value) return { redrivePermission: "allowAll", sourceQueueArns: [] as string[] };
  try { const parsed = JSON.parse(value) as { redrivePermission?: unknown; sourceQueueArns?: unknown }; const permission = parsed.redrivePermission === "denyAll" || parsed.redrivePermission === "byQueue" ? parsed.redrivePermission : "allowAll"; return { redrivePermission: permission, sourceQueueArns: Array.isArray(parsed.sourceQueueArns) ? parsed.sourceQueueArns.filter((item): item is string => typeof item === "string") : [] }; } catch { return { redrivePermission: "allowAll", sourceQueueArns: [] as string[] }; }
}
function queueNameFromArn(arn: string) { return arn.split(":").at(-1) ?? arn; }
