import { z } from "zod";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import { getCallerIdentity } from "@/lib/sts";
import { deleteMessage, receiveMessages } from "@/lib/sqs";

const requestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("receive"), region: z.string(), account: z.string().regex(/^\d{12}$/), waitTimeSeconds: z.number().int().min(0).max(20), visibilityTimeout: z.number().int().min(0).max(43200).optional() }),
  z.object({ operation: z.literal("delete"), region: z.string(), account: z.string().regex(/^\d{12}$/), receiptHandle: z.string().min(1) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const [body, currentRegion, identity, route] = await Promise.all([request.json().then((value) => requestSchema.parse(value)), getRegion(), getCallerIdentity(), params]);
    if (body.region !== currentRegion || body.account !== identity.account) return Response.json({ error: "The account or region changed. Refresh before polling again." }, { status: 409 });
    if (body.operation === "delete") {
      await deleteMessage(currentRegion, route.name, body.receiptHandle);
      return Response.json({ ok: true });
    }
    const messages = await receiveMessages(currentRegion, route.name, body.waitTimeSeconds, body.visibilityTimeout);
    return Response.json({ messages });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "Invalid polling request." : toUiError(error) }, { status: 400 });
  }
}
