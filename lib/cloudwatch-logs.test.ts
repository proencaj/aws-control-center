import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, expect, it, vi } from "vitest";
import { listLogGroups, readLogEvents } from "./cloudwatch-logs";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const mock = mockClient(CloudWatchLogsClient);
beforeEach(() => mock.reset());
const options = {
  group: "/aws/lambda/test",
  lines: 25,
  start: 1704067200000,
  end: 1704067260000,
  direction: "older" as const,
};

it("lists a bounded group page with prefix and continuation", async () => {
  mock
    .on(DescribeLogGroupsCommand)
    .resolves({
      logGroups: [{ logGroupName: "/aws/lambda/test" }, {}],
      nextToken: "next",
    });
  expect(await listLogGroups("us-east-1", "/aws/", "previous")).toEqual({
    groups: ["/aws/lambda/test"],
    nextToken: "next",
  });
  expect(mock.commandCalls(DescribeLogGroupsCommand)[0].args[0].input).toEqual({
    limit: 50,
    logGroupNamePrefix: "/aws/",
    nextToken: "previous",
  });
});

it("fetches latest events across streams without unmasking data", async () => {
  mock
    .on(FilterLogEventsCommand)
    .resolves({
      events: [
        {
          eventId: "1",
          timestamp: options.end,
          ingestionTime: options.end,
          logStreamName: "stream",
          message: "first\nsecond",
        },
      ],
      nextToken: "older",
    });
  const result = await readLogEvents("us-east-1", options);
  expect(result.events[0]).toMatchObject({
    id: "1",
    text: "first\nsecond",
    stream: "stream",
  });
  expect(result.nextToken).toBe("older");
  expect(mock.commandCalls(FilterLogEventsCommand)[0].args[0].input).toEqual({
    logGroupName: options.group,
    limit: 25,
    startTime: options.start,
    endTime: options.end,
    startFromHead: false,
    nextToken: undefined,
    unmask: false,
  });
});

it("preserves continuation on an empty page and uses forward ordering for tail", async () => {
  mock
    .on(FilterLogEventsCommand)
    .resolves({ events: [], nextToken: "keep-going" });
  expect(
    await readLogEvents("us-east-1", {
      ...options,
      direction: "newer",
      next: "page",
    }),
  ).toEqual({ events: [], nextToken: "keep-going" });
  expect(
    mock.commandCalls(FilterLogEventsCommand)[0].args[0].input,
  ).toMatchObject({ startFromHead: true, nextToken: "page" });
});

it("leaves SDK failures to the request boundary", async () => {
  mock
    .on(FilterLogEventsCommand)
    .rejects({ name: "AccessDeniedException", message: "Denied" });
  await expect(readLogEvents("us-east-1", options)).rejects.toThrow("Denied");
});
