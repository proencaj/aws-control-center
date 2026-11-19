"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { REGION_COOKIE } from "@/lib/aws/clients";

const regionSchema = z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/);

export async function setRegion(formData: FormData) {
  const region = regionSchema.safeParse(formData.get("region"));
  if (!region.success) return;
  (await cookies()).set(REGION_COOKIE, region.data, { path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}
