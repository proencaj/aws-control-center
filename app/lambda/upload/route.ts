import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getRegion } from "@/lib/aws/clients";
import { toUiError } from "@/lib/aws/errors";
import * as lambda from "@/lib/lambda";
import { getCallerIdentity } from "@/lib/sts";

export const runtime = "nodejs";

const MAX_ZIP_SIZE = 50 * 1024 * 1024;
const name = z.string().min(1).max(64).regex(/^[A-Za-z0-9-_]+$/);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return !!origin && !!host && new URL(origin).host === host;
}

function isZip(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(bytes[2]) &&
    [0x04, 0x06, 0x08].includes(bytes[3])
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request))
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_ZIP_SIZE + 1024 * 1024)
      return NextResponse.json(
        { error: "ZIP uploads are limited to 50 MB." },
        { status: 413 },
      );

    const formData = await request.formData();
    const file = formData.get("zip");
    if (!(file instanceof File) || !file.size)
      return NextResponse.json({ error: "Choose a ZIP file." }, { status: 400 });
    if (file.size > MAX_ZIP_SIZE)
      return NextResponse.json(
        { error: "ZIP uploads are limited to 50 MB. Use S3 for larger packages." },
        { status: 413 },
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isZip(bytes))
      return NextResponse.json(
        { error: "The selected file is not a valid ZIP archive." },
        { status: 400 },
      );

    const [region, identity] = await Promise.all([getRegion(), getCallerIdentity()]);
    if (
      formData.get("region") !== region ||
      formData.get("account") !== identity.account
    )
      return NextResponse.json(
        { error: "The account or region changed. Refresh before uploading." },
        { status: 409 },
      );

    const operation = z.enum(["create", "update"]).parse(formData.get("operation"));
    const functionName = name.parse(formData.get("functionName"));
    if (operation === "create") {
      await lambda.createFunction(region, {
        name: functionName,
        role: z.string().regex(/^arn:[^:]+:iam::\d{12}:role\/.+$/).parse(formData.get("role")),
        runtime: z.string().min(1).parse(formData.get("runtime")) as never,
        handler: z.string().min(1).max(128).parse(formData.get("handler")),
        architecture: z.enum(["x86_64", "arm64"]).parse(formData.get("architecture")),
        description: z.string().max(256).parse(formData.get("description")),
        code: { ZipFile: bytes },
      });
    } else {
      await lambda.updateFunctionCode(
        region,
        functionName,
        { ZipFile: bytes },
        z.string().optional().parse(formData.get("revisionId") || undefined),
      );
    }
    return NextResponse.json({
      message: operation === "create" ? "Function created." : "Code deployment started.",
      functionName,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join(". ")
        : toUiError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
