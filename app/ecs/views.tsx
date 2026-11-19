import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ConfirmAction } from "@/components/confirm-action";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FilterSearch } from "@/components/filter-search";
import { ErrorNotice } from "@/components/error-notice";
import { attempt } from "@/lib/aws/errors";
import * as ecs from "@/lib/ecs";
import { ecsAction, type EcsTarget } from "./actions";
import { Submit } from "./controls";
import { TaskDefinitionEditor, WorkloadEditor } from "./editors";
import {
  Details,
  Failures,
  Heading,
  JsonDetails,
  Pagination,
  Panel,
  ResourceLink,
  Table,
  Tabs,
  buttonClass,
  encoded,
  inputClass,
  shortId,
} from "./ui";
import { ScalingView } from "./scaling-view";
import { ServiceActions } from "./service-actions";
import {
  ProviderEditor,
  ClusterCapacityEditor,
  DeploymentEditor,
} from "./settings-editors";
export type Query = Record<string, string | string[] | undefined>;
export const queryValue = (query: Query, key: string) =>
  typeof query[key] === "string" ? (query[key] as string) : undefined;
const action = (region: string, target: EcsTarget) =>
  ecsAction.bind(null, region, target);
const clusterBase = (cluster: string) => `/ecs/clusters/${encoded(cluster)}`;
const defaults = {
  taskDefinition: "",
  launchType: "FARGATE",
  networkConfiguration: {
    awsvpcConfiguration: {
      subnets: [],
      securityGroups: [],
      assignPublicIp: "DISABLED",
    },
  },
};
function Refresh({ href }: { href: string }) {
  return (
    <Link href={href} className={buttonClass}>
      Refresh
    </Link>
  );
}
function Destructive({
  region,
  target,
  resourceName,
  label,
  impact,
}: {
  region: string;
  target: EcsTarget;
  resourceName: string;
  label: string;
  impact: string;
}) {
  return (
    <ConfirmDelete
      action={action(region, target)}
      resourceName={resourceName}
      label={label}
      impact={impact}
    />
  );
}
export async function ClusterList({
  region,
  query,
}: {
  region: string;
  query: Query;
}) {
  const next = queryValue(query, "next");
  const result = await ecs.listClusters(region, next);
  return (
    <section className="space-y-5">
      <Heading title="Cluster directory">
        <Refresh href="/ecs" />
        <Link className={buttonClass} href="/ecs/clusters/new">
          Create cluster
        </Link>
      </Heading>
      <p className="text-sm text-muted">
        Open a cluster to inspect services, tasks, and compute capacity in{" "}
        {region}.
      </p>
      <Failures failures={result.failures} />
      <Table
        empty="No clusters returned. Create a cluster or select another region to continue."
        headers={[
          "Cluster",
          "Status",
          "Services",
          "Running / pending tasks",
          "Container instances",
          "Capacity providers",
        ]}
        rows={result.resources.map((c) => [
          <ResourceLink key="name" href={clusterBase(c.clusterName!)}>
            {c.clusterName}
          </ResourceLink>,
          c.status,
          <ResourceLink
            key="services"
            href={`${clusterBase(c.clusterName!)}/services`}
          >
            {c.activeServicesCount ?? 0}
          </ResourceLink>,
          `${c.runningTasksCount ?? 0} / ${c.pendingTasksCount ?? 0}`,
          c.registeredContainerInstancesCount,
          c.capacityProviders?.join(", "),
        ])}
      />
      <Pagination base="/ecs" current={next} nextToken={result.nextToken} />
    </section>
  );
}
export function NewCluster({ region }: { region: string }) {
  return (
    <section className="max-w-2xl space-y-6">
      <Heading title="Create cluster" />
      <ActionForm
        action={action(region, { operation: "createCluster" })}
        className="space-y-4"
      >
        <label className="block space-y-2 text-sm">
          Cluster name
          <input name="name" required className={inputClass} />
        </label>
        <label className="block space-y-2 text-sm">
          Container Insights
          <select
            name="insights"
            className={inputClass}
            defaultValue="disabled"
          >
            <option value="disabled">Disabled</option>
            <option value="enabled">Enabled</option>
            <option value="enhanced">Enhanced</option>
          </select>
        </label>
        <p className="text-sm text-muted">
          This creates an empty cluster. Add capacity providers or run tasks on
          Fargate after creation.
        </p>
        <Submit>Create cluster</Submit>
      </ActionForm>
    </section>
  );
}
export async function ClusterView({
  region,
  cluster,
  section,
  query,
}: {
  region: string;
  cluster: string;
  section: string[];
  query: Query;
}) {
  const base = clusterBase(cluster),
    tab = section[0] ?? "";
  let content: React.ReactNode;
  if (tab === "services" && section[1])
    content =
      section[1] === "new" ? (
        <NewService region={region} cluster={cluster} />
      ) : (
        await ServiceView({
          region,
          cluster,
          name: section[1],
          tab: section[2] ?? "",
          query,
        })
      );
  else if (tab === "tasks" && section[1])
    content =
      section[1] === "new" ? (
        <NewTask region={region} cluster={cluster} />
      ) : (
        await TaskView({ region, cluster, id: section[1] })
      );
  else if (tab === "container-instances" && section[1])
    content = await ContainerInstanceView({
      region,
      cluster,
      id: section[1],
      query,
    });
  else if (tab === "services")
    content = await ServiceList({ region, cluster, query });
  else if (tab === "tasks")
    content = await TaskList({ region, cluster, query });
  else if (tab === "container-instances")
    content = await ContainerInstanceList({ region, cluster, query });
  else content = await ClusterOverview({ region, cluster });
  return (
    <div className="space-y-6">
      <div className="text-sm text-muted">
        <ResourceLink href="/ecs">Clusters</ResourceLink> /{" "}
        <ResourceLink href={base}>{cluster}</ResourceLink>
      </div>
      <Tabs
        base={base}
        items={[
          ["", "Overview"],
          ["services", "Services"],
          ["tasks", "Tasks"],
          ["container-instances", "Container instances"],
        ]}
        active={tab}
      />
      {content}
    </div>
  );
}
async function ClusterOverview({
  region,
  cluster,
}: {
  region: string;
  cluster: string;
}) {
  const c = await ecs.getCluster(region, cluster);
  return (
    <section className="space-y-6">
      <Heading title={cluster}>
        <Refresh href={clusterBase(cluster)} />
      </Heading>
      <Details
        rows={[
          ["ARN", c.clusterArn],
          ["Status", c.status],
          ["Active services", c.activeServicesCount],
          [
            "Tasks running / pending",
            `${c.runningTasksCount ?? 0} / ${c.pendingTasksCount ?? 0}`,
          ],
          ["Container instances", c.registeredContainerInstancesCount],
          ["Capacity providers", c.capacityProviders?.join(", ") || "None"],
        ]}
      />
      <Panel title="Container Insights">
        <ActionForm
          action={action(region, { operation: "clusterSettings", cluster })}
          className="flex flex-wrap items-center gap-3"
        >
          <label className="text-sm">
            Monitoring
            <select
              aria-label="Container Insights"
              name="insights"
              defaultValue={
                c.settings?.find((s) => s.name === "containerInsights")
                  ?.value ?? "disabled"
              }
              className={inputClass}
            >
              <option value="disabled">Disabled</option>
              <option value="enabled">Enabled</option>
              <option value="enhanced">Enhanced</option>
            </select>
          </label>
          <Submit>Save settings</Submit>
        </ActionForm>
      </Panel>
      <Panel title="Capacity providers">
        <ClusterCapacityEditor
          region={region}
          cluster={cluster}
          providers={c.capacityProviders ?? []}
          strategy={c.defaultCapacityProviderStrategy ?? []}
          action={action(region, { operation: "clusterCapacity", cluster })}
        />
      </Panel>
      <JsonDetails value={c} />
      <Panel title="Delete cluster">
        <p className="text-sm text-muted">
          The cluster must be empty. Services, tasks, registered instances, and
          capacity provider dependencies must be handled individually.
        </p>
        <Destructive
          region={region}
          target={{ operation: "deleteCluster", cluster }}
          resourceName={cluster}
          label="Delete cluster"
          impact="Deletes this empty cluster. No child resources will be deleted automatically."
        />
      </Panel>
    </section>
  );
}
async function ServiceList({
  region,
  cluster,
  query,
}: {
  region: string;
  cluster: string;
  query: Query;
}) {
  const next = queryValue(query, "next"),
    filter = queryValue(query, "filter") ?? "",
    base = `${clusterBase(cluster)}/services`;
  const result = await ecs.listServices(region, cluster, next, filter);
  return (
    <section className="space-y-5">
      <Heading title="Services">
        <Refresh href={base} />
        <Link className={buttonClass} href={`${base}/new`}>
          Create service
        </Link>
      </Heading>
      <FilterSearch
        param="filter"
        value={filter}
        label="Service name filter"
        placeholder="Filter services by name"
      />
      <Failures failures={result.failures} />
      <Table
        headers={[
          "Service",
          "Status",
          "Scheduling",
          "Desired / running / pending",
          "Task definition",
          "Compute",
          "Actions",
        ]}
        rows={result.resources.map((s) => [
          <ResourceLink
            key="service"
            href={`${base}/${encoded(s.serviceName!)}`}
          >
            {s.serviceName}
          </ResourceLink>,
          s.status,
          s.schedulingStrategy,
          `${s.desiredCount ?? "—"} / ${s.runningCount ?? 0} / ${s.pendingCount ?? 0}`,
          <ResourceLink
            key="definition"
            href={`/ecs/task-definitions/${encoded(shortId(s.taskDefinition))}`}
          >
            {shortId(s.taskDefinition)}
          </ResourceLink>,
          s.launchType ??
            s.capacityProviderStrategy
              ?.map((c) => c.capacityProvider)
              .join(", "),
          s.status === "ACTIVE" ? (
            <ServiceActions
              key="actions"
              serviceName={s.serviceName!}
              desiredCount={s.desiredCount ?? 0}
              daemon={s.schedulingStrategy === "DAEMON"}
              setDesiredCount={action(region, {
                operation: "updateService",
                cluster,
                name: s.serviceName!,
              })}
              redeploy={action(region, {
                operation: "redeploy",
                cluster,
                name: s.serviceName!,
              })}
              stopAll={action(region, {
                operation: "scaleZero",
                cluster,
                name: s.serviceName!,
              })}
            />
          ) : null,
        ])}
      />
      <Pagination
        base={base}
        current={next}
        nextToken={result.nextToken}
        query={filter ? { filter } : {}}
      />
    </section>
  );
}
function NewService({ region, cluster }: { region: string; cluster: string }) {
  return (
    <section className="max-w-3xl space-y-5">
      <Heading title="Create service" />
      <WorkloadEditor
        action={action(region, { operation: "createService", cluster })}
        region={region}
        clientToken={randomUUID()}
        mode="create"
        initial={{
          ...defaults,
          serviceName: "",
          desiredCount: 1,
          schedulingStrategy: "REPLICA",
          deploymentConfiguration: {
            minimumHealthyPercent: 100,
            maximumPercent: 200,
            deploymentCircuitBreaker: { enable: true, rollback: true },
          },
        }}
      />
    </section>
  );
}
function NewTask({ region, cluster }: { region: string; cluster: string }) {
  return (
    <section className="max-w-3xl space-y-5">
      <Heading title="Run standalone tasks" />
      <p className="text-sm text-muted">
        Standalone tasks are not automatically replaced when they stop.
        Re-submitting this form uses the same request token; reload to start a
        separate run.
      </p>
      <WorkloadEditor
        action={action(region, { operation: "runTask", cluster })}
        region={region}
        clientToken={randomUUID()}
        mode="run"
        initial={{ ...defaults, count: 1 }}
      />
    </section>
  );
}
async function ServiceView({
  region,
  cluster,
  name,
  tab,
  query,
}: {
  region: string;
  cluster: string;
  name: string;
  tab: string;
  query: Query;
}) {
  const s = await ecs.getService(region, cluster, name),
    base = `${clusterBase(cluster)}/services/${encoded(name)}`;
  const editable =
    (!s.deploymentController?.type || s.deploymentController.type === "ECS") &&
    (!s.deploymentConfiguration?.strategy ||
      s.deploymentConfiguration.strategy === "ROLLING");
  let content: React.ReactNode;
  if (tab === "tasks")
    content = await TaskList({ region, cluster, query, serviceName: name });
  else if (tab === "autoscaling")
    content = (
      <ScalingView
        region={region}
        cluster={cluster}
        service={name}
        query={query}
        editable={
          editable && s.schedulingStrategy !== "DAEMON" && s.status === "ACTIVE"
        }
      />
    );
  else if (tab === "deployments") {
    const next = queryValue(query, "next"),
      result = await attempt(ecs.listDeployments(region, cluster, name, next));
    content = (
      <div className="space-y-6">
        {editable && (
          <Panel title="Rolling deployment settings">
            <DeploymentEditor
              region={region}
              initial={
                s.deploymentConfiguration ?? {
                  minimumHealthyPercent: 100,
                  maximumPercent: 200,
                }
              }
              action={action(region, {
                operation: "updateService",
                cluster,
                name,
              })}
              name={name}
            />
          </Panel>
        )}
        <Panel title="Deployment history">
          {"error" in result ? (
            <ErrorNotice message={result.error} />
          ) : (
            <>
              <Failures failures={result.data.failures} />
              <Table
                headers={["Deployment", "Status", "Created", "Reason"]}
                rows={result.data.resources.map((d) => [
                  shortId(d.serviceDeploymentArn),
                  d.status,
                  d.createdAt?.toISOString(),
                  d.statusReason,
                ])}
              />
              <Pagination
                base={`${base}/deployments`}
                current={next}
                nextToken={result.data.nextToken}
              />
              <JsonDetails
                value={result.data.resources}
                label="Deployment details"
              />
            </>
          )}
        </Panel>
        <Panel title="Current deployments">
          <JsonDetails value={s.deployments} label="Rollout counts and state" />
        </Panel>
        <Panel title="Service events">
          <Table
            headers={["Time", "Event"]}
            rows={(s.events ?? []).map((e) => [
              e.createdAt?.toISOString(),
              e.message,
            ])}
          />
        </Panel>
      </div>
    );
  } else {
    const initial = {
      taskDefinition: s.taskDefinition,
      ...(s.schedulingStrategy !== "DAEMON"
        ? { desiredCount: s.desiredCount }
        : {}),
      networkConfiguration: s.networkConfiguration,
      loadBalancers: s.loadBalancers?.map((l) => ({
        targetGroupArn: l.targetGroupArn,
        containerName: l.containerName,
        containerPort: l.containerPort,
      })),
      ...(s.capacityProviderStrategy?.length
        ? { capacityProviderStrategy: s.capacityProviderStrategy }
        : {}),
      healthCheckGracePeriodSeconds: s.healthCheckGracePeriodSeconds,
      platformVersion: s.platformVersion,
    };
    content = (
      <div className="space-y-6">
        <Details
          rows={[
            ["ARN", s.serviceArn],
            ["Status", s.status],
            ["Scheduling", s.schedulingStrategy],
            [
              "Desired / running / pending",
              `${s.desiredCount ?? "—"} / ${s.runningCount ?? 0} / ${s.pendingCount ?? 0}`,
            ],
            [
              "Task definition",
              <ResourceLink
                key="td"
                href={`/ecs/task-definitions/${encoded(shortId(s.taskDefinition))}`}
              >
                {shortId(s.taskDefinition)}
              </ResourceLink>,
            ],
            ["Deployment controller", s.deploymentController?.type ?? "ECS"],
            [
              "Deployment strategy",
              s.deploymentConfiguration?.strategy ?? "ROLLING",
            ],
          ]}
        />
        {editable && s.status === "ACTIVE" && (
          <>
            <Panel title="Update service">
              <WorkloadEditor
                key={JSON.stringify(initial)}
                region={region}
                initial={initial}
                mode="update"
                daemon={s.schedulingStrategy === "DAEMON"}
                resourceName={name}
                clientToken=""
                action={action(region, {
                  operation: "updateService",
                  cluster,
                  name,
                })}
              />
            </Panel>
            <Panel title="Deploy and scale">
              <div className="flex flex-wrap gap-3">
                <ActionForm
                  action={action(region, {
                    operation: "redeploy",
                    cluster,
                    name,
                  })}
                >
                  <Submit>Force new deployment</Submit>
                </ActionForm>
                {s.schedulingStrategy !== "DAEMON" && (
                  <ConfirmAction
                    action={action(region, {
                      operation: "scaleZero",
                      cluster,
                      name,
                    })}
                    label="Scale to zero"
                    impact="Stops every task managed by this service by setting its desired count to zero."
                  />
                )}
              </div>
            </Panel>
            <Panel title="Delete service">
              <p className="text-sm text-muted">
                Desired, running, and pending counts must be zero, and service
                autoscaling must be removed. Deletion does not remove load
                balancers, task definitions, or infrastructure.
              </p>
              <Destructive
                region={region}
                target={{ operation: "deleteService", cluster, name }}
                resourceName={name}
                label="Delete service"
                impact="Deletes this service after its tasks have stopped."
              />
            </Panel>
          </>
        )}
        <JsonDetails value={s} />
      </div>
    );
  }
  return (
    <section className="space-y-6">
      <Heading title={name}>
        <Refresh href={`${base}${tab ? `/${tab}` : ""}`} />
      </Heading>
      {!editable && (
        <p className="group-box p-4 text-sm">
          This deployment mode is read-only. Only ECS rolling services can be
          modified here.
        </p>
      )}
      <Tabs
        base={base}
        items={[
          ["", "Configuration"],
          ["tasks", "Tasks"],
          ["deployments", "Deployments & events"],
          ["autoscaling", "Autoscaling"],
        ]}
        active={tab}
      />
      {content}
    </section>
  );
}
async function TaskList({
  region,
  cluster,
  query,
  serviceName,
  containerInstance,
}: {
  region: string;
  cluster: string;
  query: Query;
  serviceName?: string;
  containerInstance?: string;
}) {
  const next = queryValue(query, "next"),
    family = queryValue(query, "family"),
    service = serviceName ?? queryValue(query, "service"),
    status = queryValue(query, "status") === "STOPPED" ? "STOPPED" : "RUNNING";
  const result = await ecs.listTasks(region, cluster, {
    nextToken: next,
    family: family || undefined,
    serviceName: service || undefined,
    desiredStatus: status,
    containerInstance,
  });
  const base = containerInstance
    ? `${clusterBase(cluster)}/container-instances/${encoded(containerInstance)}`
    : serviceName
      ? `${clusterBase(cluster)}/services/${encoded(serviceName)}/tasks`
      : `${clusterBase(cluster)}/tasks`;
  return (
    <section className="space-y-5">
      <Heading title="Tasks">
        <Link
          className={buttonClass}
          href={`${clusterBase(cluster)}/tasks/new`}
        >
          Run tasks
        </Link>
        <Refresh href={base} />
      </Heading>
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label>
          Status
          <select name="status" defaultValue={status} className={inputClass}>
            <option value="RUNNING">Running (desired status)</option>
            <option value="STOPPED">Stopped</option>
          </select>
        </label>
        <label>
          Family
          <input name="family" defaultValue={family} className={inputClass} />
        </label>
        {!serviceName && !containerInstance && (
          <label>
            Service
            <input
              name="service"
              defaultValue={service}
              className={inputClass}
            />
          </label>
        )}
        <button className={buttonClass}>Filter</button>
      </form>
      <Failures failures={result.failures} />
      <Table
        headers={[
          "Task",
          "Last / desired status",
          "Health",
          "Task definition",
          "Compute",
          "Started / stopped",
        ]}
        rows={result.resources.map((t) => [
          <ResourceLink
            key="task"
            href={`${clusterBase(cluster)}/tasks/${encoded(shortId(t.taskArn))}`}
          >
            {shortId(t.taskArn)}
          </ResourceLink>,
          `${t.lastStatus} / ${t.desiredStatus}`,
          t.healthStatus,
          <ResourceLink
            key="td"
            href={`/ecs/task-definitions/${encoded(shortId(t.taskDefinitionArn))}`}
          >
            {shortId(t.taskDefinitionArn)}
          </ResourceLink>,
          t.capacityProviderName ?? t.launchType,
          (t.stoppedAt ?? t.startedAt)?.toISOString(),
        ])}
      />
      <Pagination
        base={base}
        current={next}
        nextToken={result.nextToken}
        query={{
          status,
          ...(family ? { family } : {}),
          ...(!serviceName && service ? { service } : {}),
        }}
      />
    </section>
  );
}
async function TaskView({
  region,
  cluster,
  id,
}: {
  region: string;
  cluster: string;
  id: string;
}) {
  const t = await ecs.getTask(region, cluster, id);
  return (
    <section className="space-y-6">
      <Heading title={`Task ${id}`}>
        <Refresh href={`${clusterBase(cluster)}/tasks/${encoded(id)}`} />
      </Heading>
      <Details
        rows={[
          ["ARN", t.taskArn],
          ["Status", `${t.lastStatus} / desired ${t.desiredStatus}`],
          ["Health", t.healthStatus],
          [
            "Task definition",
            <ResourceLink
              key="td"
              href={`/ecs/task-definitions/${encoded(shortId(t.taskDefinitionArn))}`}
            >
              {shortId(t.taskDefinitionArn)}
            </ResourceLink>,
          ],
          ["Group", t.group],
          ["Compute", t.capacityProviderName ?? t.launchType],
          ["Stop code", t.stopCode],
          ["Stop reason", t.stoppedReason],
        ]}
      />
      <Panel title="Containers">
        <Table
          headers={[
            "Container",
            "Image",
            "Status",
            "Health",
            "Exit code",
            "Reason",
          ]}
          rows={(t.containers ?? []).map((c) => [
            c.name,
            c.image,
            c.lastStatus,
            c.healthStatus,
            c.exitCode,
            c.reason,
          ])}
        />
      </Panel>
      <JsonDetails value={t.attachments} label="Network attachments" />
      <JsonDetails value={t} />
      {t.lastStatus !== "STOPPED" && t.desiredStatus !== "STOPPED" && (
        <Destructive
          region={region}
          target={{ operation: "stopTask", cluster, name: id }}
          resourceName={id}
          label="Stop task"
          impact={
            t.group?.startsWith("service:")
              ? "Stops this task. Its service scheduler may launch a replacement to maintain desired capacity."
              : "Stops this standalone task and all its containers. It will not restart automatically."
          }
        />
      )}
    </section>
  );
}
async function ContainerInstanceList({
  region,
  cluster,
  query,
}: {
  region: string;
  cluster: string;
  query: Query;
}) {
  const next = queryValue(query, "next"),
    base = `${clusterBase(cluster)}/container-instances`;
  const result = await ecs.listContainerInstances(region, cluster, next);
  return (
    <section className="space-y-5">
      <Heading title="Container instances">
        <Refresh href={base} />
      </Heading>
      <Failures failures={result.failures} />
      <Table
        headers={[
          "Container instance",
          "EC2 instance",
          "Status",
          "Agent connected",
          "Running / pending",
          "Capacity provider",
        ]}
        rows={result.resources.map((i) => [
          <ResourceLink
            key="container"
            href={`${base}/${encoded(shortId(i.containerInstanceArn))}`}
          >
            {shortId(i.containerInstanceArn)}
          </ResourceLink>,
          <ResourceLink key="ec2" href={`/ec2/instances/${i.ec2InstanceId}`}>
            {i.ec2InstanceId}
          </ResourceLink>,
          i.status,
          i.agentConnected ? "Yes" : "No",
          `${i.runningTasksCount ?? 0} / ${i.pendingTasksCount ?? 0}`,
          i.capacityProviderName,
        ])}
      />
      <Pagination base={base} current={next} nextToken={result.nextToken} />
    </section>
  );
}
async function ContainerInstanceView({
  region,
  cluster,
  id,
  query,
}: {
  region: string;
  cluster: string;
  id: string;
  query: Query;
}) {
  const i = await ecs.getContainerInstance(region, cluster, id);
  return (
    <section className="space-y-6">
      <Heading title={`Container instance ${id}`} />
      <Details
        rows={[
          ["ARN", i.containerInstanceArn],
          [
            "EC2 instance",
            <ResourceLink key="ec2" href={`/ec2/instances/${i.ec2InstanceId}`}>
              {i.ec2InstanceId}
            </ResourceLink>,
          ],
          ["Status", i.status],
          ["Agent connected", i.agentConnected ? "Yes" : "No"],
          ["Agent version", i.versionInfo?.agentVersion],
          ["Capacity provider", i.capacityProviderName],
          [
            "Running / pending",
            `${i.runningTasksCount ?? 0} / ${i.pendingTasksCount ?? 0}`,
          ],
        ]}
      />
      <div className="flex flex-wrap gap-3">
        {i.status === "ACTIVE" && (
          <Destructive
            region={region}
            target={{ operation: "drain", cluster, name: id }}
            resourceName={id}
            label="Drain instance"
            impact="Stops new placement and replaces service tasks where capacity allows. Standalone tasks must be stopped separately."
          />
        )}
        {i.status === "DRAINING" && (
          <ActionForm
            action={action(region, {
              operation: "activate",
              cluster,
              name: id,
            })}
          >
            <Submit>Reactivate</Submit>
          </ActionForm>
        )}
        <Destructive
          region={region}
          target={{ operation: "deregisterInstance", cluster, name: id }}
          resourceName={id}
          label="Deregister instance"
          impact="Removes this empty instance from ECS. The EC2 instance keeps running."
        />
      </div>
      <JsonDetails
        value={{
          registered: i.registeredResources,
          remaining: i.remainingResources,
          health: i.healthStatus,
        }}
        label="Capacity and health"
      />
      {await TaskList({ region, cluster, query, containerInstance: id })}
      <JsonDetails value={i} />
    </section>
  );
}

export async function DefinitionList({
  region,
  query,
}: {
  region: string;
  query: Query;
}) {
  const next = queryValue(query, "next"),
    family = queryValue(query, "family"),
    status = queryValue(query, "status") === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  const result = await ecs.listTaskDefinitions(region, {
    nextToken: next,
    familyPrefix: family,
    status,
  });
  return (
    <section className="space-y-5">
      <Heading title="Task definition revisions">
        <Link className={buttonClass} href="/ecs/task-definitions/new">
          Create task definition
        </Link>
      </Heading>
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label>
          Family prefix
          <input className={inputClass} name="family" defaultValue={family} />
        </label>
        <label>
          Status
          <select className={inputClass} name="status" defaultValue={status}>
            <option>ACTIVE</option>
            <option>INACTIVE</option>
          </select>
        </label>
        <button className={buttonClass}>Filter</button>
      </form>
      <Table
        headers={["Family:revision", "ARN"]}
        rows={result.resources.map((arn) => [
          <ResourceLink
            key="td"
            href={`/ecs/task-definitions/${encoded(shortId(arn))}`}
          >
            {shortId(arn)}
          </ResourceLink>,
          arn,
        ])}
      />
      <Pagination
        base="/ecs/task-definitions"
        current={next}
        nextToken={result.nextToken}
        query={{ status, ...(family ? { family } : {}) }}
      />
    </section>
  );
}
export async function DefinitionView({
  region,
  id,
  query,
}: {
  region: string;
  id: string;
  query: Query;
}) {
  if (id === "new") {
    const clone = queryValue(query, "clone");
    const source = clone
      ? await ecs.getTaskDefinition(region, clone)
      : undefined;
    const initial = source
      ? ecs.cloneTaskDefinition(source.taskDefinition, source.tags)
      : {
          family: "",
          requiresCompatibilities: ["FARGATE"],
          networkMode: "awsvpc",
          cpu: "256",
          memory: "512",
          runtimePlatform: {
            cpuArchitecture: "X86_64",
            operatingSystemFamily: "LINUX",
          },
          containerDefinitions: [
            { name: "app", image: "", essential: true, portMappings: [] },
          ],
        };
    return (
      <section className="max-w-3xl space-y-6">
        <Heading
          title={
            clone ? `New revision from ${clone}` : "Create task definition"
          }
        />
        <TaskDefinitionEditor
          initial={initial}
          region={region}
          action={action(region, { operation: "registerDefinition" })}
        />
      </section>
    );
  }
  const result = await ecs.getTaskDefinition(region, id),
    d = result.taskDefinition;
  return (
    <section className="space-y-6">
      <Heading title={`${d.family}:${d.revision}`}>
        <Link
          href={`/ecs/task-definitions/new?${new URLSearchParams({ clone: id })}`}
          className={buttonClass}
        >
          Create new revision
        </Link>
        <Refresh href={`/ecs/task-definitions/${encoded(id)}`} />
      </Heading>
      <Details
        rows={[
          ["ARN", d.taskDefinitionArn],
          ["Status", d.status],
          ["Compatibility", d.compatibilities?.join(", ")],
          [
            "CPU / memory",
            `${d.cpu ?? "Container-level"} / ${d.memory ?? "Container-level"}`,
          ],
          ["Network", d.networkMode],
          ["Task role", d.taskRoleArn],
          ["Execution role", d.executionRoleArn],
        ]}
      />
      <Table
        headers={["Container", "Image", "Essential", "Ports"]}
        rows={(d.containerDefinitions ?? []).map((c) => [
          c.name,
          c.image,
          c.essential !== false ? "Yes" : "No",
          c.portMappings
            ?.map((p) => `${p.containerPort}/${p.protocol ?? "tcp"}`)
            .join(", "),
        ])}
      />
      <JsonDetails value={d} label="Task definition configuration" />
      <JsonDetails value={result.tags ?? []} label="Tags" />
      {d.status === "ACTIVE" && (
        <Destructive
          region={region}
          target={{ operation: "deregisterDefinition", name: id }}
          resourceName={id}
          label="Deregister revision"
          impact="Prevents this revision from being used for new services/tasks. Existing workloads continue to run."
        />
      )}
      {d.status === "INACTIVE" && (
        <Destructive
          region={region}
          target={{ operation: "deleteDefinition", name: id }}
          resourceName={id}
          label="Delete revision"
          impact="Permanently requests deletion of this inactive revision. AWS may keep it in DELETE_IN_PROGRESS while workloads reference it."
        />
      )}
    </section>
  );
}
export async function ProviderList({
  region,
  query,
}: {
  region: string;
  query: Query;
}) {
  const next = queryValue(query, "next"),
    result = await ecs.listCapacityProviders(region, next);
  return (
    <section className="space-y-5">
      <Heading title="Capacity providers">
        <Link href="/ecs/capacity-providers/new" className={buttonClass}>
          Create capacity provider
        </Link>
      </Heading>
      <Failures failures={result.failures} />
      <Table
        headers={[
          "Provider",
          "Status",
          "Update status",
          "Type",
          "Managed scaling",
        ]}
        rows={result.resources.map((p) => [
          <ResourceLink
            key="provider"
            href={`/ecs/capacity-providers/${encoded(p.name!)}`}
          >
            {p.name}
          </ResourceLink>,
          p.status,
          p.updateStatus,
          p.autoScalingGroupProvider
            ? "EC2 Auto Scaling group"
            : ["FARGATE", "FARGATE_SPOT"].includes(p.name ?? "")
              ? "Fargate"
              : "Managed Instances",
          p.autoScalingGroupProvider?.managedScaling?.status,
        ])}
      />
      <Pagination
        base="/ecs/capacity-providers"
        current={next}
        nextToken={result.nextToken}
      />
    </section>
  );
}
export async function ProviderView({
  region,
  name,
}: {
  region: string;
  name: string;
}) {
  if (name === "new")
    return (
      <section className="max-w-3xl space-y-6">
        <Heading title="Create capacity provider" />
        <p className="text-sm text-muted">
          Use an existing Auto Scaling group. This console does not create or
          modify the group itself.
        </p>
        <ProviderEditor
          region={region}
          action={action(region, { operation: "createProvider" })}
          initial={{
            autoScalingGroupArn: "",
            managedDraining: "ENABLED",
            managedTerminationProtection: "DISABLED",
            managedScaling: {
              status: "ENABLED",
              targetCapacity: 100,
              minimumScalingStepSize: 1,
              maximumScalingStepSize: 10,
              instanceWarmupPeriod: 300,
            },
          }}
        />
      </section>
    );
  const p = await ecs.getCapacityProvider(region, name);
  return (
    <section className="space-y-6">
      <Heading title={name}>
        <Refresh href={`/ecs/capacity-providers/${encoded(name)}`} />
      </Heading>
      <Details
        rows={[
          ["ARN", p.capacityProviderArn],
          ["Status", p.status],
          ["Update", p.updateStatus],
          ["Update reason", p.updateStatusReason],
          [
            "Auto Scaling group",
            p.autoScalingGroupProvider?.autoScalingGroupArn,
          ],
        ]}
      />
      {p.autoScalingGroupProvider ? (
        <>
          <Panel title="Managed capacity">
            <ProviderEditor
              region={region}
              name={name}
              action={action(region, { operation: "updateProvider", name })}
              initial={
                p.autoScalingGroupProvider as unknown as Record<string, unknown>
              }
            />
          </Panel>
          <Destructive
            region={region}
            target={{ operation: "deleteProvider", name }}
            resourceName={name}
            label="Delete capacity provider"
            impact="Deletes the provider association with its Auto Scaling group. Remove cluster/service dependencies first. The Auto Scaling group is not deleted."
          />
        </>
      ) : (
        <p className="text-sm text-muted">
          This provider is read-only. Fargate providers can be associated with
          clusters; Managed Instances configuration is not editable here.
        </p>
      )}
      <JsonDetails value={p} />
    </section>
  );
}
