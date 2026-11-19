import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  StopQueryCommand,
  GetLogRecordCommand,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, expect, it, vi } from "vitest";
import {
  startInsights,
  insightsResults,
  stopInsights,
  insightsContext,
} from "./cloudwatch-logs";
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const mock = mockClient(CloudWatchLogsClient);
beforeEach(() => mock.reset());
it("starts QL with selected groups, epoch seconds and a bounded limit", async () => {
  mock.on(StartQueryCommand).resolves({ queryId: "query" });
  expect(
    await startInsights("us-east-1", {
      groups: ["/app"],
      query: "fields @message",
      start: 100,
      end: 200,
      limit: 50,
    }),
  ).toEqual({ id: "query" });
  expect(mock.commandCalls(StartQueryCommand)[0].args[0].input).toEqual({
    logGroupNames: ["/app"],
    queryString: "fields @message",
    queryLanguage: "CWLI",
    startTime: 100,
    endTime: 200,
    limit: 50,
  });
});
it("preserves result pointers, custom fields, statistics and pagination", async () => {
  mock.on(GetQueryResultsCommand).resolves({
    status: "Complete",
    results: [
      [
        { field: "count", value: "3" },
        { field: "@ptr", value: "pointer" },
      ],
    ],
    nextToken: "next",
    statistics: { bytesScanned: 512 },
  });
  expect(await insightsResults("us-east-1", "query", "previous")).toEqual({
    status: "Complete",
    rows: [{ count: "3", "@ptr": "pointer" }],
    next: "next",
    statistics: { bytesScanned: 512 },
  });
  expect(mock.commandCalls(GetQueryResultsCommand)[0].args[0].input).toEqual({
    queryId: "query",
    nextToken: "previous",
    maxItems: 200,
  });
});
it("cancels the specified query and surfaces AWS errors", async () => {
  mock.on(StopQueryCommand).resolves({ success: true });
  expect(await stopInsights("us-east-1", "query")).toEqual({ stopped: true });
  expect(mock.commandCalls(StopQueryCommand)[0].args[0].input).toEqual({
    queryId: "query",
  });
  mock.on(StartQueryCommand).rejects(new Error("Denied"));
  await expect(
    startInsights("us-east-1", {
      groups: ["/app"],
      query: "fields @message",
      start: 100,
      end: 200,
      limit: 50,
    }),
  ).rejects.toThrow("Denied");
});
const event = (message: string, timestamp = 1000, ingestionTime = 2000) => ({
  message,
  timestamp,
  ingestionTime,
});
function anchor() {
  mock
    .on(GetLogRecordCommand)
    .resolves({
      logRecord: {
        "@timestamp": "1000",
        "@ingestionTime": "2000",
        "@message": "target",
        "@logStream": "stream",
        "@log": "123456789012:/app",
      },
    });
}
it("centers the exact event and includes unfiltered same-timestamp context", async () => {
  anchor();
  mock
    .on(GetLogEventsCommand)
    .resolvesOnce({
      events: [
        event("tie before", 1000, 1999),
        event("target"),
        event("tie after", 1000, 2001),
      ],
    })
    .resolvesOnce({ events: [event("older", 900)] })
    .resolvesOnce({ events: [event("later", 1100)] });
  const result = await insightsContext("us-east-1", "pointer", 2, 2);
  expect(result.anchor).toBe(2);
  expect(result.events.map((e) => e.text)).toEqual([
    "older",
    "tie before",
    "target",
    "tie after",
    "later",
  ]);
  const calls = mock
    .commandCalls(GetLogEventsCommand)
    .map((c) => c.args[0].input);
  expect(calls[0]).toMatchObject({
    logGroupIdentifier: "arn:aws:logs:us-east-1:123456789012:log-group:/app",
    logStreamName: "stream",
    startTime: 1000,
    endTime: 1001,
    unmask: false,
  });
  expect(calls[1]).toMatchObject({
    endTime: 1000,
    startFromHead: false,
    limit: 1,
  });
  expect(calls[2]).toMatchObject({
    startTime: 1001,
    startFromHead: true,
    limit: 1,
  });
});
it("continues through empty pages and stops on a repeated token", async () => {
  anchor();
  mock
    .on(GetLogEventsCommand)
    .resolvesOnce({ events: [], nextForwardToken: "a" })
    .resolvesOnce({ events: [event("target")], nextForwardToken: "b" })
    .resolvesOnce({ events: [], nextForwardToken: "b" });
  const result = await insightsContext("us-east-1", "pointer", 0, 0);
  expect(result.events.map((e) => e.text)).toEqual(["target"]);
  expect(result.anchor).toBe(0);
  expect(mock.commandCalls(GetLogEventsCommand)).toHaveLength(3);
});
it("refuses ambiguous anchors instead of showing incorrect context", async () => {
  anchor();
  mock
    .on(GetLogEventsCommand)
    .resolves({ events: [event("target"), event("target")] });
  await expect(insightsContext("us-east-1", "pointer", 10, 10)).rejects.toThrow(
    "Cannot uniquely locate",
  );
});
it("bounds sparse pagination rather than looping forever", async () => {
  anchor();
  let index = 0;
  mock
    .on(GetLogEventsCommand)
    .callsFake(() => ({ events: [], nextForwardToken: String(++index) }));
  await expect(insightsContext("us-east-1", "pointer", 10, 10)).rejects.toThrow(
    "Cannot uniquely locate",
  );
  expect(mock.commandCalls(GetLogEventsCommand)).toHaveLength(5);
});
