"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export const runtimes = [
  "nodejs24.x",
  "nodejs22.x",
  "python3.14",
  "python3.13",
  "python3.12",
  "python3.11",
  "java25",
  "java21",
  "java17.al2023",
  "java11.al2023",
  "java8.al2023",
  "dotnet10",
  "ruby4.0",
  "ruby3.4",
  "provided.al2023",
] as const;

type Context = { region: string; account: string };

export function CreateZipForm({ context }: { context: Context }) {
  return (
    <ZipForm operation="create" context={context}>
      <CreateFields />
    </ZipForm>
  );
}

export function UpdateZipForm({
  context,
  functionName,
  revisionId,
}: {
  context: Context;
  functionName: string;
  revisionId?: string;
}) {
  return (
    <ZipForm
      operation="update"
      context={context}
      functionName={functionName}
      revisionId={revisionId}
    />
  );
}

function ZipForm({
  operation,
  context,
  functionName,
  revisionId,
  children,
}: {
  operation: "create" | "update";
  context: Context;
  functionName?: string;
  revisionId?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ error?: string; message?: string }>({});
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setStatus({});
        try {
          const response = await fetch("/lambda/upload", {
            method: "POST",
            body: new FormData(event.currentTarget),
          });
          const result = (await response.json()) as {
            error?: string;
            message?: string;
            functionName?: string;
          };
          if (!response.ok || result.error) setStatus({ error: result.error ?? "Upload failed." });
          else if (operation === "create" && result.functionName)
            router.push(`/lambda/functions/${encodeURIComponent(result.functionName)}`);
          else {
            setStatus({ message: result.message });
            router.refresh();
          }
        } catch (error) {
          setStatus({ error: error instanceof Error ? error.message : "Upload failed." });
        } finally {
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="region" value={context.region} />
      <input type="hidden" name="account" value={context.account} />
      {functionName && <input type="hidden" name="functionName" value={functionName} />}
      {revisionId && <input type="hidden" name="revisionId" value={revisionId} />}
      {children}
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Deployment package</span>
        <input required type="file" name="zip" accept=".zip,application/zip" className="w-full" />
        <span className="block text-xs text-muted">Maximum compressed size: 50 MB.</span>
      </label>
      <button disabled={pending} className="font-bold">
        {pending ? "Uploading…" : operation === "create" ? "Create function" : "Deploy ZIP"}
      </button>
      {status.message && <p role="status" className="text-sm">{status.message}</p>}
      {status.error && <p role="alert" className="text-sm font-medium">{status.error}</p>}
    </form>
  );
}

export function CreateFields() {
  return (
    <>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Function name</span>
        <input required name="functionName" className="w-full" maxLength={64} pattern="[A-Za-z0-9-_]+" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Execution role ARN</span>
        <input required name="role" className="w-full" placeholder="arn:aws:iam::123456789012:role/lambda-role" />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Runtime</span>
          <select name="runtime" defaultValue="nodejs24.x" className="w-full">
            {runtimes.map((runtime) => <option key={runtime}>{runtime}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Handler</span>
          <input required name="handler" defaultValue="index.handler" className="w-full" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Architecture</span>
          <select name="architecture" defaultValue="x86_64" className="w-full">
            <option value="x86_64">x86_64</option>
            <option value="arm64">arm64</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Description</span>
        <input name="description" className="w-full" maxLength={256} />
      </label>
    </>
  );
}
