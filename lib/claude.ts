import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `You are an SRE debugging application logs from AWS workloads.
Identify errors, root causes, affected components, a timeline of events, and concrete next steps.
Only state what the logs support. Say so when evidence is missing.
Format the answer as Markdown with short headings and bullet lists.`;

const LENGTH = {
  summary:
    "Write a clear summary: not very short, not too long. Aim for roughly 300 to 500 words in a few short sections.",
  full: "Write a full, long and thorough analysis: every distinct error, root-cause reasoning, a timeline, correlations between events, severity, and a prioritized remediation plan.",
} as const;

const ERRORS_ONLY = `Focus only on errors, failures and exceptions. Ignore normal or informational lines.
For each distinct error: explain what it means, its likely cause, and possible solutions or suggestions.
Close with open questions or points worth investigating further.
If the logs contain no errors, reply with exactly: "No errors found."`;

const LANGUAGE = {
  en: "Write the answer in English.",
  "pt-br": "Write the answer in Brazilian Portuguese (pt-BR).",
} as const;

export type Language = keyof typeof LANGUAGE;

const FLUXOGRAM = `You turn application logs into a flow diagram that helps explain an incident to people who have not read the logs.
Return a Mermaid flowchart (flowchart TD) showing the sequence of events, the components involved, where it failed and the likely cause.
Use short plain-language labels, always wrapped in double quotes. Mark failing nodes with a class named "error".
Return only the Mermaid source. No code fences, no commentary.
Only draw what the logs support.`;

const MODELS = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
} as const;

function selectedModel() {
  const name = process.env.CLAUDE_MODEL?.trim().toLowerCase() || "opus";
  if (name !== "opus" && name !== "sonnet" && name !== "haiku")
    throw new Error('CLAUDE_MODEL must be "opus", "sonnet" or "haiku".');
  return { name, id: MODELS[name] };
}

async function complete({
  system,
  logs,
  prompt,
  maxTokens,
  effort,
}: {
  system: string;
  logs: string;
  prompt: string;
  maxTokens: number;
  effort: "medium" | "high";
}) {
  const apiKey = process.env.CLAUDE_KEY;
  if (!apiKey)
    throw new Error("Set CLAUDE_KEY in .env.local to use the AI Debugger.");
  const { name, id: model } = selectedModel();

  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages
    .stream({
      model,
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort },
      // Haiku has no server-side fallback.
      ...(name !== "haiku" && {
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as const,
      }),
      system,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\n<logs>\n${logs}\n</logs>`,
        },
      ],
    })
    .finalMessage();

  if (response.stop_reason === "refusal")
    throw new Error("Claude declined to analyse these logs.");

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim();
  return { text, truncated: response.stop_reason === "max_tokens" };
}

export async function analyseLogs(
  logs: string,
  {
    full,
    errors,
    language,
  }: { full: boolean; errors: boolean; language: Language },
) {
  const { text, truncated } = await complete({
    system: [
      SYSTEM,
      LENGTH[full ? "full" : "summary"],
      errors && ERRORS_ONLY,
      LANGUAGE[language],
    ]
      .filter(Boolean)
      .join("\n\n"),
    logs,
    prompt: "Analyse these logs.",
    maxTokens: full ? 32000 : 8000,
    effort: full ? "high" : "medium",
  });
  return truncated
    ? `${text}\n\n_Output was cut off at the length limit._`
    : text;
}

export async function fluxogramFromLogs(
  logs: string,
  { language }: { language: Language },
) {
  const { text, truncated } = await complete({
    system: `${FLUXOGRAM}\n\n${LANGUAGE[language]} Node labels must use that language.`,
    logs,
    prompt: "Draw the fluxogram for these logs.",
    maxTokens: 8000,
    effort: "medium",
  });
  if (truncated) throw new Error("The fluxogram was cut off. Try again.");
  return text
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}
