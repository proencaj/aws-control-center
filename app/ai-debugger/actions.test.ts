import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, expect, it, vi } from "vitest";

const analyseLogs = vi.hoisted(() => vi.fn());
const fluxogramFromLogs = vi.hoisted(() => vi.fn());
vi.mock("@/lib/claude", () => ({ analyseLogs, fluxogramFromLogs }));

import { analyse, fluxogram } from "./actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  analyseLogs.mockReset();
  fluxogramFromLogs.mockReset();
});

it("rejects empty logs without calling Claude", async () => {
  const result = await analyse({}, form({ logs: "   " }));
  expect(result.error).toContain("Paste some logs");
  expect(analyseLogs).not.toHaveBeenCalled();
});

it("returns the analysis and passes the Full Analysis and Filter Errors flags", async () => {
  analyseLogs.mockResolvedValue("## Result");
  const result = await analyse(
    {},
    form({ logs: "boom", full: "on", errors: "on" }),
  );
  expect(analyseLogs).toHaveBeenCalledWith("boom", {
    full: true,
    errors: true,
    language: "en",
  });
  expect(result).toEqual({ analysis: "## Result", full: true, errors: true });
});

it("maps API errors to a message instead of throwing", async () => {
  analyseLogs.mockRejectedValue(
    new Anthropic.RateLimitError(429, undefined, "slow down", new Headers()),
  );
  const result = await analyse({}, form({ logs: "boom" }));
  expect(result.error).toContain("Rate limited");
});

it("passes the selected language and rejects unknown ones", async () => {
  analyseLogs.mockResolvedValue("ok");
  await analyse({}, form({ logs: "boom", language: "pt-br" }));
  expect(analyseLogs).toHaveBeenCalledWith("boom", {
    full: false,
    errors: false,
    language: "pt-br",
  });
  const result = await analyse({}, form({ logs: "boom", language: "fr" }));
  expect(result.error).toBeDefined();
});

it("returns the fluxogram mermaid source", async () => {
  fluxogramFromLogs.mockResolvedValue("flowchart TD\n  A-->B");
  const result = await fluxogram({}, form({ logs: "boom", language: "pt-br" }));
  expect(fluxogramFromLogs).toHaveBeenCalledWith("boom", {
    logs: "boom",
    language: "pt-br",
  });
  expect(result).toEqual({ mermaid: "flowchart TD\n  A-->B" });
});

it("maps fluxogram errors instead of throwing", async () => {
  const empty = await fluxogram({}, form({ logs: " " }));
  expect(empty.error).toContain("Paste some logs");
  fluxogramFromLogs.mockRejectedValue(
    new Anthropic.RateLimitError(429, undefined, "slow", new Headers()),
  );
  const limited = await fluxogram({}, form({ logs: "boom" }));
  expect(limited.error).toContain("Rate limited");
});
