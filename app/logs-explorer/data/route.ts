import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import {
  listLogGroups,
  startInsights,
  stopInsights,
  insightsResults,
  insightsContext,
} from "@/lib/cloudwatch-logs";

export const runtime = "nodejs";
const region = z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/);
const id = z.string().min(1).max(256);
const getSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("groups"),
    region,
    prefix: z.string().max(512).optional(),
    next: z.string().max(10000).optional(),
  }),
  z.object({
    kind: z.literal("results"),
    region,
    id,
    next: z.string().max(1024).optional(),
  }),
]);
const postSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("start"),
    region,
    groups: z
      .array(z.string().regex(/^[A-Za-z0-9_./#-]{1,512}$/))
      .min(1)
      .max(50),
    query: z.string().trim().min(1).max(10000),
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    limit: z.number().int().min(1).max(5000),
  }),
  z.object({ kind: z.literal("stop"), region, id }),
  z.object({
    kind: z.literal("context"),
    region,
    pointer: z.string().min(1).max(10000),
    before: z.number().int().min(0).max(100),
    after: z.number().int().min(0).max(100),
  }),
]);
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  const parsed = getSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return json({ error: "Invalid Explorer request." }, 400);
  const input = parsed.data;
  try {
    if (input.region !== (await getRegion()))
      return json({ error: "Region changed. Reload Explorer." }, 409);
    return json(
      input.kind === "groups"
        ? await listLogGroups(input.region, input.prefix, input.next)
        : await insightsResults(input.region, input.id, input.next),
    );
  } catch (error) {
    return json({ error: toUiError(error) }, 502);
  }
}
export async function POST(request: NextRequest) {
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return json({ error: "Cross-origin requests are not allowed." }, 403);
  try {
    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success)
      return json(
        { error: "Check the query, log groups, time range, and limits." },
        400,
      );
    const input = parsed.data;
    // Stop must remain possible after the user changes the region selector.
    if (input.kind !== "stop" && input.region !== (await getRegion()))
      return json({ error: "Region changed. Reload Explorer." }, 409);
    if (input.kind === "start") {
      if (
        input.end <= input.start ||
        input.end > Math.floor(Date.now() / 1000) + 60
      )
        return json(
          { error: "Choose a valid time range ending no later than now." },
          400,
        );
      return json(await startInsights(input.region, input));
    }
    if (input.kind === "stop")
      return json(await stopInsights(input.region, input.id));
    return json(
      await insightsContext(
        input.region,
        input.pointer,
        input.before,
        input.after,
      ),
    );
  } catch (error) {
    return json({ error: toUiError(error) }, 502);
  }
}
