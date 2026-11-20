"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { analyseLogs, fluxogramFromLogs } from "@/lib/claude";

export type AnalyseState = {
  analysis?: string;
  full?: boolean;
  errors?: boolean;
  error?: string;
};

const logsInput = z
  .string()
  .trim()
  .min(1, "Paste some logs first.")
  .max(400_000, "Logs are too long. Paste at most 400,000 characters.");

const language = z.enum(["en", "pt-br"]);

export type FluxogramState = { mermaid?: string; error?: string };

const input = z.object({
  logs: logsInput,
  language,
  full: z.boolean(),
  errors: z.boolean(),
});

function failure(error: unknown): { error: string } {
  if (error instanceof z.ZodError)
    return { error: error.issues.map((issue) => issue.message).join(". ") };
  if (error instanceof Anthropic.AuthenticationError)
    return { error: "CLAUDE_KEY was rejected by the Anthropic API." };
  if (error instanceof Anthropic.RateLimitError)
    return { error: "Rate limited by the Anthropic API. Try again shortly." };
  if (error instanceof Anthropic.APIError)
    return { error: `Anthropic API error (${error.status}). Try again.` };
  return { error: error instanceof Error ? error.message : "Unknown error" };
}

export async function analyse(
  _previous: AnalyseState,
  formData: FormData,
): Promise<AnalyseState> {
  try {
    const { logs, full, errors, language } = input.parse({
      logs: formData.get("logs"),
      language: formData.get("language") ?? "en",
      full: formData.get("full") === "on",
      errors: formData.get("errors") === "on",
    });
    return {
      analysis: await analyseLogs(logs, { full, errors, language }),
      full,
      errors,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function fluxogram(
  _previous: FluxogramState,
  formData: FormData,
): Promise<FluxogramState> {
  try {
    const parsed = z.object({ logs: logsInput, language }).parse({
      logs: formData.get("logs"),
      language: formData.get("language") ?? "en",
    });
    return { mermaid: await fluxogramFromLogs(parsed.logs, parsed) };
  } catch (error) {
    return failure(error);
  }
}
