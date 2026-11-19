"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import {
  ConfirmSubmit,
  Picker,
  Submit,
  buttonClass,
  inputClass,
  type FormAction,
} from "./controls";

type Document = Record<string, unknown>;
function object(value: unknown): Document {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Document)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function Label({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted">{title}</div>
      {children}
    </div>
  );
}
function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        aria-label={label}
        className={inputClass}
        value={text(value)}
        type={type}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Select({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: unknown;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      <select
        aria-label={label}
        className={inputClass}
        value={text(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {v || "Unspecified"}
          </option>
        ))}
      </select>
    </label>
  );
}
function PickField({
  label,
  value,
  onChange,
  kind,
  region,
  multiple = false,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  kind: string;
  region: string;
  multiple?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Input label={label} value={value} onChange={onChange} />
      <Picker
        region={region}
        kind={kind}
        onSelect={(id) =>
          onChange(
            multiple
              ? [
                  ...new Set([
                    ...text(value)
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                    id,
                  ]),
                ].join(", ")
              : id,
          )
        }
      />
    </div>
  );
}
function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState("");
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      <textarea
        aria-label={label}
        className={`${inputClass} font-mono`}
        rows={5}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError("");
            e.target.setCustomValidity("");
          } catch {
            setError("Enter valid JSON.");
            e.target.setCustomValidity("Enter valid JSON.");
          }
        }}
      />
      {error && <span role="alert">{error}</span>}
    </label>
  );
}

export function TaskDefinitionEditor({
  action,
  initial,
  region,
}: {
  action: FormAction;
  initial: Document;
  region: string;
}) {
  const [document, setDocument] = useState(initial);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [draft, setDraft] = useState(JSON.stringify(initial, null, 2));
  const [error, setError] = useState("");
  const put = (key: string, value: unknown) =>
    setDocument((d) => ({ ...d, [key]: value === "" ? undefined : value }));
  const containers = Array.isArray(document.containerDefinitions)
    ? document.containerDefinitions.map(object)
    : [];
  const updateContainer = (index: number, patch: Document) =>
    put(
      "containerDefinitions",
      containers.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  function switchMode(event: React.MouseEvent<HTMLButtonElement>) {
    if (mode === "form") {
      if (
        event.currentTarget.form &&
        !event.currentTarget.form.reportValidity()
      )
        return;
      setDraft(JSON.stringify(document, null, 2));
      setMode("json");
    } else {
      try {
        const parsed = JSON.parse(draft);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error();
        setDocument(parsed);
        setError("");
        setMode("form");
      } catch {
        setError("Enter a JSON object before switching to the guided form.");
      }
    }
  }
  return (
    <ActionForm action={action} className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          Every save registers a new revision. Existing services keep their
          current revision.
        </p>
        <button className={buttonClass} type="button" onClick={switchMode}>
          {mode === "form" ? "Edit JSON" : "Guided form"}
        </button>
      </div>
      <input
        type="hidden"
        name="payload"
        value={mode === "json" ? draft : JSON.stringify(document)}
      />
      {mode === "json" ? (
        <label className="block space-y-2 text-sm">
          Registration JSON
          <textarea
            aria-label="Registration JSON"
            className={`${inputClass} font-mono`}
            rows={28}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
        </label>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Family"
              value={document.family}
              onChange={(v) => put("family", v)}
            />
            <Select
              label="Compute compatibility"
              value={
                Array.isArray(document.requiresCompatibilities)
                  ? document.requiresCompatibilities.join(",")
                  : "EC2"
              }
              values={["FARGATE", "EC2", "EC2,FARGATE", "EXTERNAL"]}
              onChange={(v) => {
                put("requiresCompatibilities", v.split(","));
                if (v.includes("FARGATE")) put("networkMode", "awsvpc");
              }}
            />
            <Input
              label="CPU units"
              value={document.cpu}
              onChange={(v) => put("cpu", v)}
            />
            <Input
              label="Memory (MiB)"
              value={document.memory}
              onChange={(v) => put("memory", v)}
            />
            <Select
              label="Network mode"
              value={document.networkMode}
              values={["awsvpc", "bridge", "host", "none"]}
              onChange={(v) => put("networkMode", v)}
            />
            <Select
              label="Architecture"
              value={
                object(document.runtimePlatform).cpuArchitecture ?? "X86_64"
              }
              values={["X86_64", "ARM64"]}
              onChange={(v) =>
                put("runtimePlatform", {
                  ...object(document.runtimePlatform),
                  cpuArchitecture: v,
                })
              }
            />
            <Input
              label="Operating system family"
              value={
                object(document.runtimePlatform).operatingSystemFamily ??
                "LINUX"
              }
              onChange={(v) =>
                put("runtimePlatform", {
                  ...object(document.runtimePlatform),
                  operatingSystemFamily: v,
                })
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <PickField
              label="Task role ARN (optional)"
              value={document.taskRoleArn}
              region={region}
              kind="roles"
              onChange={(v) => put("taskRoleArn", v)}
            />
            <PickField
              label="Execution role ARN (optional)"
              value={document.executionRoleArn}
              region={region}
              kind="roles"
              onChange={(v) => put("executionRoleArn", v)}
            />
          </div>
          <div className="space-y-4">
            <h3 className="font-medium">Containers</h3>
            {containers.map((c, index) => (
              <section
                key={index}
                className="group-box space-y-4 p-4"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label={`Container ${index + 1} name`}
                    value={c.name}
                    onChange={(v) => updateContainer(index, { name: v })}
                  />
                  <Input
                    label="Image URI"
                    value={c.image}
                    onChange={(v) => updateContainer(index, { image: v })}
                  />
                  <Input
                    label="Container CPU (optional)"
                    type="number"
                    value={c.cpu}
                    onChange={(v) =>
                      updateContainer(index, {
                        cpu: v === "" ? undefined : Number(v),
                      })
                    }
                  />
                  <Input
                    label="Container memory MiB (optional)"
                    type="number"
                    value={c.memory}
                    onChange={(v) =>
                      updateContainer(index, {
                        memory: v === "" ? undefined : Number(v),
                      })
                    }
                  />
                </div>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={c.essential !== false}
                    onChange={(e) =>
                      updateContainer(index, { essential: e.target.checked })
                    }
                  />
                  Essential container
                </label>
                <JsonField
                  label="Port mappings"
                  value={c.portMappings ?? []}
                  onChange={(v) => updateContainer(index, { portMappings: v })}
                />
                <JsonField
                  label="Environment variables"
                  value={c.environment ?? []}
                  onChange={(v) => updateContainer(index, { environment: v })}
                />
                <JsonField
                  label="Secret references (name / valueFrom)"
                  value={c.secrets ?? []}
                  onChange={(v) => updateContainer(index, { secrets: v })}
                />
                <JsonField
                  label="Logging configuration (null disables)"
                  value={c.logConfiguration ?? null}
                  onChange={(v) =>
                    updateContainer(index, {
                      logConfiguration: v === null ? undefined : v,
                    })
                  }
                />
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() =>
                    put(
                      "containerDefinitions",
                      containers.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove container
                </button>
              </section>
            ))}
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                put("containerDefinitions", [
                  ...containers,
                  {
                    name: `container-${containers.length + 1}`,
                    image: "",
                    essential: true,
                  },
                ])
              }
            >
              Add container
            </button>
          </div>
          <p className="text-sm text-muted">
            Use JSON for volumes, health checks, commands, dependencies, and
            other advanced settings. Existing advanced fields are preserved when
            using the form.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <Submit>Register revision</Submit>
    </ActionForm>
  );
}

export function WorkloadEditor({
  action,
  initial,
  region,
  mode,
  clientToken,
  resourceName,
  daemon = false,
}: {
  action: FormAction;
  initial: Document;
  region: string;
  mode: "create" | "update" | "run";
  clientToken: string;
  resourceName?: string;
  daemon?: boolean;
}) {
  const [document, setDocument] = useState(initial);
  const [requestToken] = useState(clientToken);
  const [json, setJson] = useState(false);
  const [draft, setDraft] = useState(JSON.stringify(initial, null, 2));
  const [error, setError] = useState("");
  const put = (key: string, value: unknown) =>
    setDocument((d) => ({ ...d, [key]: value === "" ? undefined : value }));
  const network = object(
    object(document.networkConfiguration).awsvpcConfiguration,
  );
  const networkPut = (key: string, value: unknown) =>
    put("networkConfiguration", {
      awsvpcConfiguration: { ...network, [key]: value },
    });
  const isDaemon = daemon || document.schedulingStrategy === "DAEMON";
  let zeroServiceName: string | undefined;
  if (mode === "create") {
    try {
      const current = json ? JSON.parse(draft) : document;
      if (current.desiredCount === 0)
        zeroServiceName = text(current.serviceName);
    } catch {
      /* Server validation reports invalid JSON. */
    }
  }
  const split = (v: string) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const lb = Array.isArray(document.loadBalancers)
    ? document.loadBalancers.map(object)
    : [];
  return (
    <ActionForm action={action} className="space-y-5">
      <input
        type="hidden"
        name="payload"
        value={json ? draft : JSON.stringify(document)}
      />
      <input type="hidden" name="clientToken" value={requestToken} />
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          if (json) {
            try {
              const value = JSON.parse(draft);
              if (!value || typeof value !== "object" || Array.isArray(value))
                throw new Error();
              setDocument(value);
              setJson(false);
              setError("");
            } catch {
              setError(
                "Enter a JSON object before switching to the guided form.",
              );
            }
          } else {
            setDraft(JSON.stringify(document, null, 2));
            setJson(true);
          }
        }}
      >
        {json ? "Guided form" : "Advanced JSON"}
      </button>
      {json ? (
        <label className="block space-y-2 text-sm">
          Workload configuration
          <textarea
            aria-label="Workload configuration"
            rows={25}
            className={`${inputClass} font-mono`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
      ) : (
        <>
          {mode === "create" && (
            <Input
              label="Service name"
              value={document.serviceName}
              onChange={(v) => put("serviceName", v)}
            />
          )}
          <PickField
            label="Task definition revision or ARN"
            kind="task-definitions"
            region={region}
            value={document.taskDefinition}
            onChange={(v) => put("taskDefinition", v)}
          />
          {mode !== "update" && (
            <Select
              label="Compute"
              value={document.launchType ?? "Capacity providers"}
              values={["FARGATE", "EC2", "Capacity providers"]}
              onChange={(v) => {
                put("launchType", v === "Capacity providers" ? undefined : v);
                if (v !== "Capacity providers")
                  put("capacityProviderStrategy", undefined);
                if (v === "EC2") put("platformVersion", undefined);
              }}
            />
          )}
          {(!document.launchType || mode === "update") && (
            <Label title="Capacity provider strategy (omit to preserve existing)">
              <JsonField
                label="Provider strategy"
                value={document.capacityProviderStrategy ?? []}
                onChange={(v) => put("capacityProviderStrategy", v)}
              />
              <Picker
                kind="capacity-providers"
                region={region}
                onSelect={(id) =>
                  put("capacityProviderStrategy", [
                    ...(Array.isArray(document.capacityProviderStrategy)
                      ? document.capacityProviderStrategy
                      : []),
                    { capacityProvider: id, weight: 1, base: 0 },
                  ])
                }
              />
            </Label>
          )}
          {mode === "create" && (
            <Select
              label="Scheduling"
              value={document.schedulingStrategy ?? "REPLICA"}
              values={["REPLICA", "DAEMON"]}
              onChange={(v) => {
                put("schedulingStrategy", v);
                put("desiredCount", v === "DAEMON" ? undefined : 1);
              }}
            />
          )}
          {!isDaemon && (
            <Input
              label={
                mode === "run" ? "Task count (1–10)" : "Desired task count"
              }
              type="number"
              value={mode === "run" ? document.count : document.desiredCount}
              onChange={(v) =>
                put(
                  mode === "run" ? "count" : "desiredCount",
                  v === "" ? undefined : Number(v),
                )
              }
            />
          )}
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!document.networkConfiguration}
              onChange={(e) =>
                put(
                  "networkConfiguration",
                  e.target.checked
                    ? {
                        awsvpcConfiguration: {
                          subnets: [],
                          securityGroups: [],
                          assignPublicIp: "DISABLED",
                        },
                      }
                    : undefined,
                )
              }
            />
            Configure awsvpc networking (required by Fargate)
          </label>
          {!!document.networkConfiguration && (
            <div className="group-box space-y-4 p-4">
              <PickField
                label="Subnet IDs (comma separated)"
                region={region}
                kind="subnets"
                multiple
                value={
                  Array.isArray(network.subnets)
                    ? network.subnets.join(", ")
                    : ""
                }
                onChange={(v) => networkPut("subnets", split(v))}
              />
              <PickField
                label="Security group IDs (comma separated)"
                region={region}
                kind="security-groups"
                multiple
                value={
                  Array.isArray(network.securityGroups)
                    ? network.securityGroups.join(", ")
                    : ""
                }
                onChange={(v) => networkPut("securityGroups", split(v))}
              />
              <Select
                label="Public IP"
                value={network.assignPublicIp ?? "DISABLED"}
                values={["DISABLED", "ENABLED"]}
                onChange={(v) => networkPut("assignPublicIp", v)}
              />
            </div>
          )}
          {mode !== "run" && (
            <section className="space-y-4">
              <h3 className="font-medium">Load balancer attachments</h3>
              {lb.map((entry, i) => (
                <div
                  key={i}
                  className="group-box space-y-3 p-4"
                >
                  <PickField
                    label="Target group ARN"
                    region={region}
                    kind="target-groups"
                    value={entry.targetGroupArn}
                    onChange={(v) =>
                      put(
                        "loadBalancers",
                        lb.map((l, j) =>
                          j === i ? { ...l, targetGroupArn: v } : l,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Container name"
                    value={entry.containerName}
                    onChange={(v) =>
                      put(
                        "loadBalancers",
                        lb.map((l, j) =>
                          j === i ? { ...l, containerName: v } : l,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Container port"
                    type="number"
                    value={entry.containerPort}
                    onChange={(v) =>
                      put(
                        "loadBalancers",
                        lb.map((l, j) =>
                          j === i ? { ...l, containerPort: Number(v) } : l,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() =>
                      put(
                        "loadBalancers",
                        lb.filter((_, j) => j !== i),
                      )
                    }
                  >
                    Remove attachment
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={buttonClass}
                onClick={() =>
                  put("loadBalancers", [
                    ...lb,
                    {
                      targetGroupArn: "",
                      containerName: "",
                      containerPort: 80,
                    },
                  ])
                }
              >
                Add target group
              </button>
            </section>
          )}
          {mode === "run" && (
            <JsonField
              label="Container overrides (optional)"
              value={document.overrides ?? { containerOverrides: [] }}
              onChange={(v) => put("overrides", v)}
            />
          )}
          <p className="text-sm text-muted">
            Use advanced JSON for deployment health thresholds, circuit breaker,
            alarm rollback, platform version, and EC2 placement settings.
            Updates preserve omitted settings.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {mode === "update" ? (
        <ConfirmSubmit resourceName={resourceName!} label="Update service" />
      ) : zeroServiceName ? (
        <ConfirmSubmit
          resourceName={zeroServiceName}
          label="Create service at zero capacity"
        />
      ) : (
        <Submit>{mode === "run" ? "Run tasks" : "Create service"}</Submit>
      )}
    </ActionForm>
  );
}
