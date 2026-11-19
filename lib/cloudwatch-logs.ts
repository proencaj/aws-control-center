import "server-only";
import {
  DescribeLogGroupsCommand,
  FilterLogEventsCommand,
  StartQueryCommand,
  GetQueryResultsCommand,
  StopQueryCommand,
  GetLogRecordCommand,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { cloudWatchLogsClient } from "@/lib/aws/clients";

export async function listLogGroups(
  region: string,
  prefix?: string,
  nextToken?: string,
  signal?: AbortSignal,
) {
  const result = await cloudWatchLogsClient(region).send(
    new DescribeLogGroupsCommand({
      logGroupNamePrefix: prefix || undefined,
      nextToken,
      limit: 50,
    }),
    { abortSignal: signal },
  );
  return {
    groups: (result.logGroups ?? []).flatMap((group) =>
      group.logGroupName ? [group.logGroupName] : [],
    ),
    nextToken: result.nextToken,
  };
}

export async function readLogEvents(
  region: string,
  options: {
    group: string;
    lines: number;
    start: number;
    end: number;
    direction: "older" | "newer";
    next?: string;
  },
  signal?: AbortSignal,
) {
  const result = await cloudWatchLogsClient(region).send(
    new FilterLogEventsCommand({
      logGroupName: options.group,
      limit: options.lines,
      startTime: options.start,
      endTime: options.end,
      startFromHead: options.direction === "newer",
      nextToken: options.next,
      unmask: false,
    }),
    { abortSignal: signal },
  );
  return {
    events: (result.events ?? []).map((event) => ({
      id:
        event.eventId ??
        JSON.stringify([
          event.logStreamName,
          event.timestamp,
          event.ingestionTime,
          event.message,
        ]),
      time: event.timestamp ?? 0,
      ingested: event.ingestionTime ?? 0,
      stream: event.logStreamName ?? "",
      text: event.message ?? "",
    })),
    // An empty page may still have a continuation token.
    nextToken: result.nextToken,
  };
}

export type LogGroupPage = Awaited<ReturnType<typeof listLogGroups>>;
export type LogPage = Awaited<ReturnType<typeof readLogEvents>>;

export async function startInsights(
  region: string,
  input: {
    groups: string[];
    query: string;
    start: number;
    end: number;
    limit: number;
  },
) {
  const result = await cloudWatchLogsClient(region).send(
    new StartQueryCommand({
      logGroupNames: input.groups,
      queryString: input.query,
      queryLanguage: "CWLI",
      startTime: input.start,
      endTime: input.end,
      limit: input.limit,
    }),
  );
  if (!result.queryId) throw new Error("CloudWatch did not return a query ID.");
  return { id: result.queryId };
}
export async function insightsResults(
  region: string,
  id: string,
  next?: string,
) {
  const result = await cloudWatchLogsClient(region).send(
    new GetQueryResultsCommand({ queryId: id, nextToken: next, maxItems: 200 }),
  );
  return {
    status: result.status ?? "Unknown",
    rows: (result.results ?? []).map((row) =>
      Object.fromEntries(
        row.flatMap((field) =>
          field.field ? [[field.field, field.value ?? ""]] : [],
        ),
      ),
    ),
    statistics: result.statistics,
    next: result.nextToken,
  };
}
export async function stopInsights(region: string, id: string) {
  const result = await cloudWatchLogsClient(region).send(
    new StopQueryCommand({ queryId: id }),
  );
  return { stopped: result.success ?? false };
}

function logTime(value?: string) {
  if (!value) return NaN;
  return /^\d+$/.test(value)
    ? Number(value)
    : Date.parse(
        /[zZ]|[+-]\d\d:\d\d$/.test(value)
          ? value
          : value.replace(" ", "T") + "Z",
      );
}

export async function insightsContext(
  region: string,
  pointer: string,
  before: number,
  after: number,
) {
  const client = cloudWatchLogsClient(region);
  const { logRecord: record } = await client.send(
    new GetLogRecordCommand({ logRecordPointer: pointer, unmask: false }),
  );
  const timestamp = logTime(record?.["@timestamp"]);
  const stream = record?.["@logStream"];
  const log = record?.["@log"];
  if (!record || !Number.isFinite(timestamp) || !stream || !log)
    throw new Error("This result does not identify a source log event.");
  const split = log.indexOf(":");
  const account = log.slice(0, split);
  const group = split >= 0 ? log.slice(split + 1) : log;
  const partition = region.startsWith("cn-")
    ? "aws-cn"
    : region.startsWith("us-gov-")
      ? "aws-us-gov"
      : "aws";
  const identifier = /^\d{12}$/.test(account)
    ? `arn:${partition}:logs:${region}:${account}:log-group:${group}`
    : group;
  let limited = false;
  let characters = 0;
  async function read(
    start: number,
    end: number,
    forward: boolean,
    count: number,
  ) {
    const events: { time: number; ingested: number; text: string }[] = [];
    let token: string | undefined;
    for (let page = 0; page < 5 && events.length < count; page++) {
      const result = await client.send(
        new GetLogEventsCommand({
          logGroupIdentifier: identifier,
          logStreamName: stream,
          startTime: start,
          endTime: end,
          startFromHead: forward,
          limit: Math.min(count - events.length, 1000),
          nextToken: token,
          unmask: false,
        }),
      );
      for (const item of result.events ?? []) {
        characters += (item.message ?? "").length;
        if (characters > 2_000_000) {
          limited = true;
          return events;
        }
        events.push({
          time: item.timestamp ?? 0,
          ingested: item.ingestionTime ?? 0,
          text: item.message ?? "",
        });
      }
      const next = forward ? result.nextForwardToken : result.nextBackwardToken;
      if (!next || next === token)
        return events.sort(
          (a, b) => a.time - b.time || a.ingested - b.ingested,
        );
      token = next;
      if (page === 4) limited = true;
    }
    return events.sort((a, b) => a.time - b.time || a.ingested - b.ingested);
  }
  // Resolve ties within the anchor millisecond before fetching either side.
  const tied = await read(timestamp, timestamp + 1, true, 1000);
  const ingestion = logTime(record["@ingestionTime"]);
  const matches = tied
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.text === record["@message"] &&
        (!Number.isFinite(ingestion) || event.ingested === ingestion),
    );
  if (matches.length !== 1 || tied.length === 1000 || limited)
    throw new Error(
      "Cannot uniquely locate this event within its timestamp. Context is unavailable rather than showing an incorrect anchor.",
    );
  const index = matches[0].index;
  const earlier =
    before > index ? await read(0, timestamp, false, before - index) : [];
  const laterTies = tied.slice(index + 1);
  const later =
    after > laterTies.length
      ? await read(
          timestamp + 1,
          Date.now() + 1,
          true,
          after - laterTies.length,
        )
      : [];
  const preceding = [...earlier, ...tied.slice(0, index)].slice(
    -before || undefined,
  );
  const selected = before ? preceding : [];
  return {
    group,
    stream,
    anchor: selected.length,
    events: [
      ...selected,
      tied[index],
      ...[...laterTies, ...later].slice(0, after),
    ],
    limited,
  };
}

export type InsightsPage = Awaited<ReturnType<typeof insightsResults>>;
export type InsightsContext = Awaited<ReturnType<typeof insightsContext>>;
