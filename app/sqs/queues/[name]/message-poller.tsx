"use client";

import { useState } from "react";

type Message = {
  MessageId?: string;
  ReceiptHandle?: string;
  Body?: string;
  Attributes?: Record<string, string>;
  MessageAttributes?: Record<string, unknown>;
};

export function MessagePoller({ name, region, account }: { name: string; region: string; account: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [wait, setWait] = useState(20);
  const [visibility, setVisibility] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string>();
  const [typed, setTyped] = useState("");

  async function call(body: Record<string, unknown>) {
    const response = await fetch(`/sqs/queues/${encodeURIComponent(name)}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, region, account }) });
    const result = await response.json() as { error?: string; messages?: Message[] };
    if (!response.ok || result.error) throw new Error(result.error ?? "Request failed.");
    return result;
  }

  async function poll() {
    setPending(true); setError("");
    try { const result = await call({ operation: "receive", waitTimeSeconds: wait, ...(visibility ? { visibilityTimeout: Number(visibility) } : {}) }); setMessages(result.messages ?? []); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Polling failed."); }
    finally { setPending(false); }
  }

  async function remove(message: Message) {
    if (!message.ReceiptHandle || typed !== message.MessageId) return;
    setPending(true); setError("");
    try { await call({ operation: "delete", receiptHandle: message.ReceiptHandle }); setMessages((current) => current.filter((item) => item !== message)); setConfirming(undefined); setTyped(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Delete failed."); }
    finally { setPending(false); }
  }

  return <section className="space-y-4"><div className="console-window"><div className="console-title">Poll messages</div><div className="space-y-4 p-5"><p className="text-sm">Receiving can hide messages from other consumers and increases their receive count. Messages are never deleted automatically.</p><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Long-poll wait (seconds)</span><input type="number" min={0} max={20} value={wait} onChange={(event) => setWait(Number(event.target.value))} className="w-full" /></label><label className="space-y-1 text-sm"><span>Visibility override (blank uses queue default)</span><input type="number" min={0} max={43200} value={visibility} onChange={(event) => setVisibility(event.target.value)} className="w-full" /></label></div><button type="button" className="font-bold" disabled={pending} onClick={poll}>{pending ? "Polling…" : "Poll for messages"}</button>{error && <p role="alert" className="text-sm font-medium">{error}</p>}</div></div>
    <div className="space-y-3"><h3 className="text-lg font-semibold">Messages ({messages.length})</h3>{messages.map((message, index) => <article key={`${message.MessageId}-${index}`} className="console-window"><div className="console-title"><span className="break-all">{message.MessageId ?? "Unknown message"}</span><span>Receive count {message.Attributes?.ApproximateReceiveCount ?? "—"}</span></div><div className="space-y-4 p-5 text-sm"><dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-muted">Sent</dt><dd>{formatTime(message.Attributes?.SentTimestamp)}</dd></div><div><dt className="text-muted">Size</dt><dd>{new TextEncoder().encode(message.Body ?? "").byteLength.toLocaleString()} bytes</dd></div></dl><MessageBody body={message.Body ?? ""} />{Object.keys(message.MessageAttributes ?? {}).length > 0 && <pre className="sunken overflow-auto p-3 text-xs">{JSON.stringify(message.MessageAttributes, null, 2)}</pre>}{confirming === message.MessageId ? <div className="group-box space-y-2 p-3"><label className="block space-y-1"><span>Type the message ID to permanently delete it</span><input className="w-full" value={typed} onChange={(event) => setTyped(event.target.value)} /></label><div className="flex gap-2"><button type="button" disabled={pending || typed !== message.MessageId} onClick={() => remove(message)} className="font-bold">Delete message</button><button type="button" onClick={() => { setConfirming(undefined); setTyped(""); }}>Cancel</button></div></div> : <button type="button" onClick={() => { setConfirming(message.MessageId); setTyped(""); }}>Delete message</button>}</div></article>)}{!messages.length && <div className="group-box p-6 text-center text-sm text-muted">No messages in the latest poll.</div>}</div>
  </section>;
}

function formatTime(value?: string) { return value ? new Date(Number(value)).toLocaleString() : "—"; }
function MessageBody({ body }: { body: string }) { let formatted: string | undefined; try { formatted = JSON.stringify(JSON.parse(body), null, 2); } catch {} return <div className="space-y-1"><p className="text-muted">Body</p><pre className="sunken max-h-96 overflow-auto whitespace-pre-wrap break-words p-3 text-xs">{formatted ?? body}</pre></div>; }
