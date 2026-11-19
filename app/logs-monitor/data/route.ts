import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { listLogGroups, readLogEvents } from "@/lib/cloudwatch-logs";

export const runtime = "nodejs";
const token = z.string().min(1).max(10000).optional();
const common = { region: z.string().min(1).max(100), next: token };
const querySchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("groups"),
    prefix: z.string().max(512).optional(),
  }),
  z.object({
    ...common,
    kind: z.literal("events"),
    group: z.string().regex(/^[A-Za-z0-9_./#-]{1,512}$/),
    lines: z.coerce.number().int().min(1).max(1000),
    start: z.coerce
      .number()
      .int()
      .min(Date.UTC(2024, 0, 1)),
    end: z.coerce.number().int().max(8640000000000000),
    direction: z.enum(["older", "newer"]),
  }),
]);
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success)
    return json(
      { error: "Invalid log request. Choose a log group and 1–1,000 lines." },
      400,
    );
  const query = parsed.data;
  if (
    query.kind === "events" &&
    (query.end < query.start || query.end - query.start > 7 * 86400000)
  ) {
    return json({ error: "Choose a time range of up to seven days." }, 400);
  }
  try {
    const region = await getRegion();
    if (region !== query.region)
      return json(
        { error: "Region changed. Reload Logs Monitor to continue." },
        409,
      );
    return json(
      query.kind === "groups"
        ? await listLogGroups(region, query.prefix, query.next, request.signal)
        : await readLogEvents(region, query, request.signal),
    );
  } catch (error) {
    return json({ error: toUiError(error) }, 502);
  }
}
