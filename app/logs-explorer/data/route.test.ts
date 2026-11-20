import {
  CloudWatchLogsClient,
  StartQueryCommand,
  StopQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { mockClient } from "aws-sdk-client-mock";
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "us-east-1" }) }),
}));
const mock = mockClient(CloudWatchLogsClient);
beforeEach(() => mock.reset());
const input = {
  kind: "start",
  region: "us-east-1",
  groups: ["/app"],
  query: "fields @message",
  start: 100,
  end: 200,
  limit: 100,
};
const request = (changes = {}, origin = "http://localhost") =>
  new NextRequest("http://localhost/logs-explorer/data", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ ...input, ...changes }),
  });
it.each([
  { groups: [] },
  { groups: Array(51).fill("/app") },
  { limit: 5001 },
  { query: "" },
  { end: 99 },
  { end: 99999999999 },
])("rejects invalid input before AWS: %j", async (changes) => {
  expect((await POST(request(changes))).status).toBe(400);
  expect(mock.calls()).toHaveLength(0);
});
it("rejects stale regions and cross-origin submissions", async () => {
  expect((await POST(request({ region: "eu-west-1" }))).status).toBe(409);
  expect((await POST(request({}, "https://other.example"))).status).toBe(403);
  expect(mock.calls()).toHaveLength(0);
});
it("allows cancelling a query from the previous region", async () => {
  mock.on(StopQueryCommand).resolves({ success: true });
  const result = await POST(
    request({ kind: "stop", region: "eu-west-1", id: "query" }),
  );
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
});
it.each(["localhost:3000", "127.0.0.1:3000", "192.168.1.20:3000"])(
  "accepts the browser origin for host %s behind Docker",
  async (host) => {
    mock.on(StartQueryCommand).resolves({ queryId: "query" });
    const result = await POST(
      new NextRequest("http://0.0.0.0:3000/logs-explorer/data", {
        method: "POST",
        headers: {
          host,
          origin: `http://${host}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    );
    expect(result.status).toBe(200);
    expect(mock.commandCalls(StartQueryCommand)).toHaveLength(1);
  },
);
it.each([
  "https://other.example",
  "http://localhost:4000",
  "https://localhost:3000",
  "http://0.0.0.0:3000",
  "null",
])(
  "rejects origin %s when Host differs from the internal URL",
  async (origin) => {
    const result = await POST(
      new NextRequest("http://0.0.0.0:3000/logs-explorer/data", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    );
    expect(result.status).toBe(403);
    expect(mock.calls()).toHaveLength(0);
  },
);
it("maps permission errors without crashing", async () => {
  mock
    .on(StartQueryCommand)
    .rejects({ name: "AccessDeniedException", message: "Denied" });
  const result = await POST(request());
  expect(result.status).toBe(502);
  expect((await result.json()).error).toContain("Access denied");
});
