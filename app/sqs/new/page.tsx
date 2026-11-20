import { ActionForm } from "@/components/action-form";
import { getRegion } from "@/lib/aws/clients";
import { getCallerIdentity } from "@/lib/sts";
import { createQueueAction } from "../actions";

export default async function NewQueuePage() {
  const [region, identity] = await Promise.all([getRegion(), getCallerIdentity()]);
  return <section className="console-window"><div className="console-title">Create queue</div><ActionForm action={createQueueAction} className="space-y-5 p-5">
    <input type="hidden" name="region" value={region} /><input type="hidden" name="account" value={identity.account} />
    <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Queue name</span><input required className="w-full" name="queueName" maxLength={80} /></label><label className="space-y-1 text-sm"><span>Type</span><select className="w-full" name="queueType"><option value="standard">Standard</option><option value="fifo">FIFO</option></select></label></div>
    <QueueFields />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="contentBasedDeduplication" /> Content-based deduplication (FIFO only)</label>
    <p className="text-xs text-muted">New queues use SQS-managed server-side encryption. FIFO queue names receive the .fifo suffix automatically.</p>
    <div className="flex justify-end"><button className="font-bold">Create queue</button></div>
  </ActionForm></section>;
}

export function QueueFields({ values = {} }: { values?: Record<string, string> }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><NumberField name="visibilityTimeout" label="Visibility timeout" value={values.VisibilityTimeout ?? "30"} min={0} max={43200} /><NumberField name="messageRetentionPeriod" label="Retention seconds" value={values.MessageRetentionPeriod ?? "345600"} min={60} max={1209600} /><NumberField name="delaySeconds" label="Delivery delay" value={values.DelaySeconds ?? "0"} min={0} max={900} /><NumberField name="receiveWaitTime" label="Receive wait" value={values.ReceiveMessageWaitTimeSeconds ?? "0"} min={0} max={20} /></div>;
}
function NumberField({ name, label, value, min, max }: { name: string; label: string; value: string; min: number; max: number }) { return <label className="space-y-1 text-sm"><span>{label} (seconds)</span><input required className="w-full" type="number" name={name} defaultValue={value} min={min} max={max} /></label>; }
