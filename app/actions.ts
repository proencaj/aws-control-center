"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { ACCOUNT_COOKIE, listAccounts } from "@/lib/aws/accounts";
import { REGION_COOKIE } from "@/lib/aws/clients";

const regionSchema = z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/);

export async function setRegion(formData: FormData) {
  const region = regionSchema.safeParse(formData.get("region"));
  if (!region.success) return;
  (await cookies()).set(REGION_COOKIE, region.data, { path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function setAccount(formData: FormData) {
  const id = z.string().safeParse(formData.get("account"));
  if (!id.success || !listAccounts().some((account) => account.id === id.data)) return;
  (await cookies()).set(ACCOUNT_COOKIE, id.data, { path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}
