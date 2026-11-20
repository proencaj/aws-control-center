"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Clipboard, Terminal } from "lucide-react";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn inline-flex items-center gap-1"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={14} /> : <Clipboard size={14} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CopyRepositoryUri({ uri }: { uri: string }) {
  return <CopyButton value={uri} label="Copy URI" />;
}

export function PushCommands({
  repositoryUri,
  region,
}: {
  repositoryUri: string;
  region: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [workflow, setWorkflow] = useState<"build" | "existing">("build");
  const [localImage, setLocalImage] = useState("my-image:latest");
  const [tag, setTag] = useState("latest");
  const [profile, setProfile] = useState("");
  const valid =
    localImage.trim() &&
    tag.trim() &&
    !/[\r\n]/.test(localImage + tag + profile) &&
    /^[\w][\w.-]{0,127}$/.test(tag);
  const commands = useMemo(() => {
    if (!valid) return [];
    const registry = repositoryUri.split("/")[0];
    const profileArg = profile.trim()
      ? ` --profile ${shellQuote(profile.trim())}`
      : "";
    const destination = `${repositoryUri}:${tag.trim()}`;
    const source = workflow === "build" ? localImage.trim() : localImage.trim();
    return [
      `aws ecr get-login-password --region ${shellQuote(region)}${profileArg} | docker login --username AWS --password-stdin ${shellQuote(registry)}`,
      ...(workflow === "build"
        ? [`docker build -t ${shellQuote(source)} .`]
        : []),
      `docker tag ${shellQuote(source)} ${shellQuote(destination)}`,
      `docker push ${shellQuote(destination)}`,
    ];
  }, [localImage, profile, region, repositoryUri, tag, valid, workflow]);

  return (
    <>
      <button
        type="button"
        className="btn inline-flex items-center gap-2 font-bold"
        onClick={() => dialog.current?.showModal()}
      >
        <Terminal size={16} /> View push commands
      </button>
      <dialog
        ref={dialog}
        className="console-window m-auto w-[min(52rem,calc(100%-2rem))] text-foreground"
      >
        <div className="console-title">
          <span>Push image to repository</span>
          <button type="button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        <div className="space-y-5 p-5">
          <p className="text-sm text-muted">
            Run these commands in a terminal where Docker and the AWS CLI are
            configured for this account.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span>Workflow</span>
              <select
                value={workflow}
                onChange={(event) =>
                  setWorkflow(event.target.value as "build" | "existing")
                }
                className="w-full"
              >
                <option value="build">Build from this directory</option>
                <option value="existing">Existing local image</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>
                {workflow === "build"
                  ? "Local image name"
                  : "Existing image reference"}
              </span>
              <input
                value={localImage}
                onChange={(event) => setLocalImage(event.target.value)}
                className="w-full"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Destination tag</span>
              <input
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                className="w-full"
              />
            </label>
          </div>
          <label className="block max-w-sm space-y-1 text-sm">
            <span>AWS CLI profile (optional)</span>
            <input
              value={profile}
              onChange={(event) => setProfile(event.target.value)}
              className="w-full"
              placeholder="sandbox"
            />
          </label>
          {!valid && (
            <p role="alert" className="text-sm font-medium">
              Enter a local image and a valid Docker tag without line breaks.
            </p>
          )}
          <ol className="space-y-3">
            {commands.map((command, index) => (
              <li key={command} className="group-box space-y-2 p-3">
                <div className="flex items-center justify-between gap-2 text-xs font-bold">
                  <span>Step {index + 1}</span>
                  <CopyButton value={command} />
                </div>
                <code className="block overflow-x-auto whitespace-pre p-2 text-xs">
                  {command}
                </code>
              </li>
            ))}
          </ol>
          {commands.length > 0 && (
            <div className="flex justify-end">
              <CopyButton value={commands.join("\n")} label="Copy all" />
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
