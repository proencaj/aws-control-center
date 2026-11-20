import { beforeEach, expect, it, vi } from "vitest";

const stream = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { stream } };
  },
}));

import { analyseLogs, fluxogramFromLogs } from "./claude";

function reply(content: unknown[], stop_reason = "end_turn") {
  stream.mockReturnValue({
    finalMessage: async () => ({ content, stop_reason }),
  });
}

beforeEach(() => {
  stream.mockReset();
  process.env.CLAUDE_KEY = "test-key";
});

it("joins text blocks and ignores thinking blocks", async () => {
  reply([
    { type: "thinking", thinking: "" },
    { type: "text", text: "one" },
    { type: "text", text: "two" },
  ]);
  expect(
    await analyseLogs("boom", { full: false, errors: false, language: "en" }),
  ).toBe("one\ntwo");
});

it("asks for a longer, higher effort analysis when full", async () => {
  reply([{ type: "text", text: "ok" }]);
  await analyseLogs("boom", { full: false, errors: false, language: "en" });
  await analyseLogs("boom", { full: true, errors: false, language: "en" });
  const [summary, full] = stream.mock.calls.map(([params]) => params);
  expect(summary.output_config.effort).toBe("medium");
  expect(full.output_config.effort).toBe("high");
  expect(full.max_tokens).toBeGreaterThan(summary.max_tokens);
  expect(full.system).toContain("long and thorough");
  expect(summary.messages[0].content).toContain("<logs>\nboom\n</logs>");
});

it("picks the model from CLAUDE_MODEL, defaulting to opus", async () => {
  reply([{ type: "text", text: "ok" }]);
  delete process.env.CLAUDE_MODEL;
  await analyseLogs("boom", { full: false, errors: false, language: "en" });
  process.env.CLAUDE_MODEL = "sonnet";
  await analyseLogs("boom", { full: false, errors: false, language: "en" });
  process.env.CLAUDE_MODEL = "haiku";
  await analyseLogs("boom", { full: false, errors: false, language: "en" });
  expect(stream.mock.calls.map(([params]) => params.model)).toEqual([
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "claude-haiku-5-5",
  ]);
  expect(stream.mock.calls[2][0].fallbacks).toBeUndefined();
  process.env.CLAUDE_MODEL = "gpt";
  await expect(
    analyseLogs("boom", { full: false, errors: false, language: "en" }),
  ).rejects.toThrow("CLAUDE_MODEL");
  delete process.env.CLAUDE_MODEL;
});

it("throws when Claude refuses", async () => {
  reply([], "refusal");
  await expect(
    analyseLogs("boom", { full: false, errors: false, language: "en" }),
  ).rejects.toThrow("declined");
});

it("throws when CLAUDE_KEY is missing", async () => {
  delete process.env.CLAUDE_KEY;
  await expect(
    analyseLogs("boom", { full: false, errors: false, language: "en" }),
  ).rejects.toThrow("CLAUDE_KEY");
});

it("adds the errors-only instructions only when Filter Errors is on", async () => {
  reply([{ type: "text", text: "ok" }]);
  await analyseLogs("boom", { full: false, errors: false, language: "en" });
  await analyseLogs("boom", { full: true, errors: true, language: "en" });
  const [plain, filtered] = stream.mock.calls.map(([params]) => params);
  expect(plain.system).not.toContain("No errors found.");
  expect(filtered.system).toContain("No errors found.");
  expect(filtered.system).toContain("long and thorough");
});

it("asks for the analysis in Brazilian Portuguese when selected", async () => {
  reply([{ type: "text", text: "ok" }]);
  await analyseLogs("boom", { full: false, errors: false, language: "pt-br" });
  expect(stream.mock.calls[0][0].system).toContain("Brazilian Portuguese");
});

it("sends the logs again for the fluxogram and strips code fences", async () => {
  reply([{ type: "text", text: "```mermaid\nflowchart TD\n  A-->B\n```" }]);
  const mermaid = await fluxogramFromLogs("boom", { language: "pt-br" });
  const [params] = stream.mock.calls[0];
  expect(mermaid).toBe("flowchart TD\n  A-->B");
  expect(params.system).toContain("Mermaid");
  expect(params.system).toContain("Brazilian Portuguese");
  expect(params.messages[0].content).toContain("<logs>\nboom\n</logs>");
});
