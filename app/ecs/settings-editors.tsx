"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import {
  ConfirmSubmit,
  Picker,
  Submit,
  inputClass,
  type FormAction,
} from "./controls";

export function LookupHelp({ region, kind }: { region: string; kind: string }) {
  const [selected, setSelected] = useState("");
  return (
    <details className="group-box space-y-3 p-3 text-sm">
      <summary className="cursor-pointer">
        Browse existing {kind.replaceAll("-", " ")}
      </summary>
      <Picker region={region} kind={kind} onSelect={setSelected} />
      {selected && (
        <label className="block space-y-1">
          Selected identifier (copy into configuration)
          <input
            className={inputClass}
            readOnly
            value={selected}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
    </details>
  );
}
export function ProviderEditor({
  region,
  name,
  initial,
  action,
}: {
  region: string;
  name?: string;
  initial: Record<string, unknown>;
  action: FormAction;
}) {
  const [value, setValue] = useState(JSON.stringify(initial, null, 2));
  const [error, setError] = useState("");
  return (
    <ActionForm action={action} className="space-y-4">
      {!name && (
        <label className="block space-y-2 text-sm">
          Provider name
          <input name="name" required className={inputClass} />
        </label>
      )}
      {!name && (
        <Picker
          kind="auto-scaling-groups"
          region={region}
          onSelect={(id) => {
            try {
              setValue(
                JSON.stringify(
                  { ...JSON.parse(value), autoScalingGroupArn: id },
                  null,
                  2,
                ),
              );
              setError("");
            } catch {
              setError("Fix the JSON before selecting a group.");
            }
          }}
        />
      )}
      <label className="block space-y-2 text-sm">
        Auto Scaling group configuration
        <textarea
          name="payload"
          className={`${inputClass} font-mono`}
          rows={18}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <p className="text-sm text-muted">
        Managed termination protection requires managed scaling and scale-in
        protection on the existing group. The group ARN cannot change after
        creation.
      </p>
      {error && <p role="alert">{error}</p>}
      {name ? (
        <ConfirmSubmit resourceName={name} label="Update capacity provider" />
      ) : (
        <Submit>Create capacity provider</Submit>
      )}
    </ActionForm>
  );
}
export function ClusterCapacityEditor({
  region,
  cluster,
  providers,
  strategy,
  action,
}: {
  region: string;
  cluster: string;
  providers: string[];
  strategy: unknown[];
  action: FormAction;
}) {
  const [value, setValue] = useState(
    JSON.stringify({ add: [], remove: [], strategy }, null, 2),
  );
  const [error, setError] = useState("");
  return (
    <ActionForm action={action} className="space-y-4">
      <p className="text-sm text-muted">
        Associated: {providers.join(", ") || "none"}. Existing associations are
        preserved. List names in remove to explicitly detach them. Strategy
        replaces the default strategy; use [] for none.
      </p>
      <Picker
        region={region}
        kind="capacity-providers"
        onSelect={(id) => {
          try {
            const data = JSON.parse(value);
            setValue(
              JSON.stringify(
                { ...data, add: [...new Set([...(data.add ?? []), id])] },
                null,
                2,
              ),
            );
            setError("");
          } catch {
            setError("Fix the JSON before selecting a provider.");
          }
        }}
      />
      <label className="block space-y-2 text-sm">
        Provider associations and strategy
        <textarea
          name="payload"
          rows={14}
          className={`${inputClass} font-mono`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <ConfirmSubmit resourceName={cluster} label="Save capacity providers" />
    </ActionForm>
  );
}
export function DeploymentEditor({
  region,
  initial,
  action,
  name,
}: {
  region: string;
  initial: unknown;
  action: FormAction;
  name: string;
}) {
  const source = initial as Record<string, unknown>;
  const [value, setValue] = useState(
    JSON.stringify(
      {
        deploymentConfiguration: {
          minimumHealthyPercent: source.minimumHealthyPercent,
          maximumPercent: source.maximumPercent,
          deploymentCircuitBreaker: source.deploymentCircuitBreaker,
          alarms: source.alarms,
        },
      },
      null,
      2,
    ),
  );
  return (
    <ActionForm action={action} className="space-y-4">
      <p className="text-sm text-muted">
        Set minimumHealthyPercent, maximumPercent, deploymentCircuitBreaker
        (enable/rollback), and alarms (alarmNames/enable/rollback). Unspecified
        settings are preserved.
      </p>
      <LookupHelp kind="alarms" region={region} />
      <label className="block space-y-2 text-sm">
        Rolling deployment configuration
        <textarea
          name="payload"
          rows={18}
          className={`${inputClass} font-mono`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <ConfirmSubmit resourceName={name} label="Save deployment settings" />
    </ActionForm>
  );
}
