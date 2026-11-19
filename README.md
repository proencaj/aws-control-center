# AWS Control Center

Local Next.js console for one AWS account. EC2 and ECS operations use the AWS SDK on the server. Credentials stay in `.env.local`, injected into Docker at runtime.

## Run and verify

Copy `.env.example` to `.env.local`, supply your sandbox account credentials and default region, then run:

```sh
docker compose up --build
# http://localhost:3000/ecs
docker compose exec app npm run lint
docker compose exec app npm test
docker compose exec app npm run build
```

After pulling dependency changes, use `docker compose up --build -V` to refresh the dependency volumes. Tests mock AWS clients and do not contact an account. Development and production use real AWS APIs only.

## Themes and local fonts

Set `APP_THEME` in `.env.local` to select the complete visual theme:

```dotenv
APP_THEME=default # default, apple, win95, or wow
```

The value controls typography, colors, surfaces, controls, favicon, and cursor. Missing, empty, or unsupported values use `default`. After changing it, recreate the app container so Docker Compose reloads the environment file:

```sh
docker compose up -d --force-recreate app
```

The default theme uses locally installed Berkeley Mono when available and falls back to the system monospace stack. Private font files are not required. VT323, Cinzel, and Crimson Text are self-hosted with their open-font licenses. Apple system fonts are referenced locally and are never bundled.

## ECS console

- Clusters: create, inspect, Container Insights settings, capacity provider associations/default strategy, delete empty clusters.
- Services: Fargate or existing EC2 capacity; replica or EC2 daemon scheduling; task definition, task count, networking, existing target-group attachments, rolling deployment settings, force redeploy, scale to zero, delete.
- Tasks: running/stopped filters, container/network details and stop reasons, run standalone tasks, stop individual tasks. Standalone run forms retain a client token across submissions to avoid duplicate launches. Reload to make a new independent run.
- Task definitions: revision listing, guided and JSON registration, cloning with advanced settings preserved, deregistration and inactive revision deletion. New revisions do not automatically deploy to services.
- Capacity: create/update EC2 Auto Scaling group providers from existing groups, cluster associations and defaults, instance draining/reactivation and empty-instance deregistration. Managed Instances providers and Fargate provider configuration are read-only.
- Autoscaling: min/max tasks, suspension, CPU/memory/ALB target tracking, scheduled scaling with IANA timezones, and activity history. Save a scalable target before adding policies/schedules. Step, predictive, and custom-metric policies are displayed read-only.

Service deployments using other controllers or non-rolling strategies are read-only. Infrastructure creation, Service Connect configuration, log streaming, and ECS Exec terminals are outside this console's scope. Existing advanced settings are retained when supported fields are changed.

All list operations and resource selectors use bounded pages. Lookup failures are isolated and selectors allow direct identifier entry. Changing regions resets the ECS forms; submissions from a stale region are rejected on the server. Resource state is eventually consistent: successful operations show an accepted message or navigate to the affected resource; use **Refresh** to see subsequent AWS changes.

Deletion, stopping tasks, draining, scaling to zero, and removal of scaling configuration require typed confirmation. Cluster, service, and instance deletion do not cascade. Suspend all autoscaling before scaling a service to zero, and remove its scalable target before deletion. Removing a scalable target also removes its associated scaling policies and schedules; the confirmation explains this AWS behavior. Existing infrastructure such as load balancers and Auto Scaling groups remains intact.

## S3 console

Open **S3** from the sidebar or directory to list general purpose buckets across all regions. The global region selector does not filter this list. Bucket listing and prefix searches are paginated at 100 buckets; opening a bucket resolves its actual region with `HeadBucket`. Directory buckets, access points, and S3 on Outposts are outside this page's scope.

Browse objects with folder prefixes, breadcrumbs, prefix search, and 100-entry pages. Object names open a properties page. Select individual objects or all objects on the current page, then use **Actions → Delete objects** or **Actions → Change storage class**. Folders are navigational and are never recursively selected or deleted. Dialogs list the exact keys, sizes, and current storage classes before any write.

Deletion requires typing the full key for one object or the bucket name for multiple objects. Requests use the selected ETag as a precondition and never specify a version ID or bypass Object Lock. With versioning enabled S3 creates delete markers; without versioning deletion is permanent; suspended versioning can permanently remove null versions. The dialog reports the bucket's versioning state when readable and explains the possible outcomes when it is not.

Storage changes copy each object onto its existing key. The implementation re-reads metadata, checks the selected ETag, pins a source version when present, and conditions both source and destination writes on the ETag. Metadata, tags, redirects, encryption algorithm/KMS key, and supported ACL grants are carried forward. A new version is created in versioned buckets. Same-class objects are left unchanged. Objects larger than 5 GiB need multipart copy; SSE-C and Object Lock buckets require a separate workflow. Archived objects must first be restored. Request, retrieval, and minimum storage charges may apply. All operations return individual outcomes, so a partial failure does not hide successful writes. Up to 100 selected objects are processed with at most five concurrent writes.

IAM access:

- Browse: `s3:ListAllMyBuckets`, `s3:ListBucket`, `s3:GetObject`; `s3:GetBucketVersioning` is optional for displaying versioning status.
- Delete: `s3:DeleteObject` on selected keys.
- Change storage class: `s3:PutObject`, source object/version and tagging read permissions, `s3:GetBucketOwnershipControls`, and `s3:GetBucketObjectLockConfiguration`. Legacy ACL-enabled buckets also require object/version ACL reads and `s3:PutObjectAcl`. Existing annotations may require annotation read/write permissions. KMS-encrypted objects may require `kms:Decrypt` and `kms:GenerateDataKey` on their key.

If ownership or Object Lock settings cannot be inspected, storage changes stop before copying. The app does not change IAM policies, restore archives, purge versions, or create/delete buckets. Tests mock the S3 SDK and do not perform real AWS writes.

API references: [ListBuckets](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListBuckets.html), [CopyObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html), [conditional deletes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-deletes.html).

## Logs Monitor

Open **Logs Monitor** from the sidebar or service directory. Choose a log group (use a prefix search and **Next groups** for large accounts), a time range, and **Lines per fetch**, then press **Monitor**. Configuration is saved in the URL; reloading never automatically starts fetching log events.

The first request retrieves up to the selected number of newest events across the group's streams. The console displays them oldest to newest, with UTC timestamps and message text only; per-line stream names and ANSI formatting are removed. Errors use bold, high-contrast gray, warnings medium-emphasis gray, and other events normal gray, with corresponding contrast in dark mode. Explicit NestJS, prefixed, or JSON log levels take priority over ANSI red/yellow foreground hints, so a yellow NestJS context label does not turn a normal message into a warning. A line means one CloudWatch event; multiline messages are kept together. AWS can return fewer events, or an empty page with a continuation token. Scroll to the top or use **Load older events** to continue through history.

**Tail** polls every two seconds, like `aws logs tail --follow`, and drains paginated results before starting another poll. It rechecks the previous minute and deduplicates event IDs to accommodate delayed ingestion. Events arriving with timestamps older than that overlap can require a fresh Monitor request. **Stop**, navigation, and region changes cancel monitoring. Scrolling away from the bottom suspends auto-scroll; **Jump to latest** resumes it.

The viewer retains up to 5,000 events or 2 million characters. Tailing removes the oldest entries at the limit; loading history removes the newest entries. The selected fetch size is 1–1,000 events, and the initial time range is at most seven days. AWS credentials stay on the server. This page performs read operations only and does not request unmasked log data.

Required IAM actions: `logs:DescribeLogGroups` for the picker and `logs:FilterLogEvents` for reading and tailing. Access-denied messages are shown in the page. SDK, request-validation, buffer, and polling tests use mocks and do not contact AWS.

API references: [FilterLogEvents](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_FilterLogEvents.html), [AWS CLI tail](https://docs.aws.amazon.com/cli/latest/reference/logs/tail.html).

## IAM permissions

Grant only the operations you intend to use, scoped to sandbox resource ARNs where AWS supports resource-level authorization. The console does not install an IAM policy. Missing permissions are displayed inline.

| Area                                  | Required API actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account and region                    | `sts:GetCallerIdentity`, `ec2:DescribeRegions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ECS reads                             | `ecs:ListClusters`, `ecs:DescribeClusters`, `ecs:ListServices`, `ecs:DescribeServices`, `ecs:ListTasks`, `ecs:DescribeTasks`, `ecs:ListTaskDefinitions`, `ecs:DescribeTaskDefinition`, `ecs:DescribeCapacityProviders`, `ecs:ListContainerInstances`, `ecs:DescribeContainerInstances`, `ecs:ListServiceDeployments`, `ecs:DescribeServiceDeployments`, `ecs:ListTagsForResource`                                                                                                                             |
| Clusters                              | `ecs:CreateCluster`, `ecs:UpdateClusterSettings`, `ecs:PutClusterCapacityProviders`, `ecs:DeleteCluster`                                                                                                                                                                                                                                                                                                                                                                                                      |
| Services/tasks                        | `ecs:CreateService`, `ecs:UpdateService`, `ecs:DeleteService`, `ecs:RunTask`, `ecs:StopTask`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Task definitions                      | `ecs:RegisterTaskDefinition`, `ecs:DeregisterTaskDefinition`, `ecs:DeleteTaskDefinitions`, `ecs:TagResource` when registering tags                                                                                                                                                                                                                                                                                                                                                                            |
| Capacity providers and instances      | `ecs:CreateCapacityProvider`, `ecs:UpdateCapacityProvider`, `ecs:DeleteCapacityProvider`, `ecs:UpdateContainerInstancesState`, `ecs:DeregisterContainerInstance`                                                                                                                                                                                                                                                                                                                                              |
| Service autoscaling                   | `application-autoscaling:DescribeScalableTargets`, `application-autoscaling:DescribeScalingPolicies`, `application-autoscaling:DescribeScheduledActions`, `application-autoscaling:DescribeScalingActivities`, `application-autoscaling:RegisterScalableTarget`, `application-autoscaling:DeregisterScalableTarget`, `application-autoscaling:PutScalingPolicy`, `application-autoscaling:DeleteScalingPolicy`, `application-autoscaling:PutScheduledAction`, `application-autoscaling:DeleteScheduledAction` |
| Supporting resource lookup/validation | `ec2:DescribeSubnets`, `ec2:DescribeSecurityGroups`, `elasticloadbalancing:DescribeTargetGroups`, `autoscaling:DescribeAutoScalingGroups`, `iam:ListRoles`, `cloudwatch:DescribeAlarms`                                                                                                                                                                                                                                                                                                                       |

Workload registration/launch may require `iam:PassRole` on the selected task role and execution role, restricted with `iam:PassedToService = ecs-tasks.amazonaws.com`. AWS may require service-linked roles for ECS, ECS capacity providers, and Application Auto Scaling. Provision those beforehand or grant narrowly scoped `iam:CreateServiceLinkedRole` permissions to the relevant services. Managed scaling and target tracking may also require the associated Auto Scaling and CloudWatch policy/alarm permissions documented by AWS. Execution roles separately need the appropriate ECR image-pull, logging, and referenced-secret permissions; the console never fetches secret values.

Networking validation needs EC2 describe access even when IDs are entered manually. ALB validation needs ELBv2 describe access. The IAM picker is optional: direct role ARN input works without `iam:ListRoles`.

API references: [ECS SDK v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-ecs/), [ECS operations](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/OperationList-query.html), [service autoscaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html).

## Logs Explorer

Open `/logs-explorer` from the sidebar. The implementation follows four steps: server-only Insights calls and validation; query controls and paginated results; match navigation and source context; mocked SDK and UI lifecycle tests.

- Select up to 50 log groups in the current region, enter Logs Insights QL, choose a relative or custom time range, and run or cancel the query. Custom times accept UTC or browser-local time.
- Event results use the grayscale console; aggregate results automatically use a table. ANSI formatting is removed, with warnings and errors distinguished by grayscale intensity and weight.
- Tail / auto-refresh reruns the query every 15, 30, or 60 seconds after completion over a rolling time window. It replaces the snapshot to preserve query sorting and aggregate results. It is not a live Insights stream; every refresh can incur additional scan charges. Cancellation and leaving the page attempt to stop the AWS query.
- Results load in pages of 200, bounded to 5,000 rows or two million characters. Find searches loaded results only, supports literal/regex and case-sensitive searches, highlights up to 2,000 matches, and provides previous/next navigation. Regex runs in a worker with a timeout.
- View context opens a modal with up to 100 unfiltered events before and after the selected event in its original stream. Multiline messages stay together. Context reads are bounded by page and size caps; unavailable or ambiguous source events produce an explicit message. Aggregate rows have no context action.

Required permissions: `logs:DescribeLogGroups`, `logs:StartQuery`, `logs:GetQueryResults`, `logs:StopQuery`, `logs:GetLogRecord`, and `logs:GetLogEvents`. Credentials remain on the server.

References: [StartQuery](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_StartQuery.html), [GetQueryResults](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_GetQueryResults.html), [GetLogEvents](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_GetLogEvents.html).
