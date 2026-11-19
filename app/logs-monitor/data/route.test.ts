import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { mockClient } from "aws-sdk-client-mock";
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "us-east-1" }) }),
}));
const mock = mockClient(CloudWatchLogsClient);
beforeEach(() => mock.reset());
const params = {
  kind: "events",
  region: "us-east-1",
  group: "/aws/lambda/test",
  lines: "100",
  start: "1704067200000",
  end: "1704067260000",
  direction: "older",
};
const req = (changes = {}) =>
  new NextRequest(
    `http://localhost/logs-monitor/data?${new URLSearchParams({ ...params, ...changes })}`,
  );

it.each([
  { lines: "0" },
  { lines: "1001" },
  { lines: "1.5" },
  { start: "0" },
  { end: "1704067100000" },
  { end: "1804067260000" },
  { group: "" },
])("rejects invalid requests before contacting AWS: %j", async (changes) => {
  expect((await GET(req(changes))).status).toBe(400);
  expect(mock.calls()).toHaveLength(0);
});

it("rejects requests for a stale region", async () => {
  expect((await GET(req({ region: "eu-west-1" }))).status).toBe(409);
  expect(mock.calls()).toHaveLength(0);
});

it("returns no-store responses and maps access denied", async () => {
  mock
    .on(FilterLogEventsCommand)
    .rejects({
      name: "AccessDeniedException",
      message: "logs:FilterLogEvents denied",
    });
  const result = await GET(req());
  expect(result.status).toBe(502);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect((await result.json()).error).toContain("Access denied");
});
