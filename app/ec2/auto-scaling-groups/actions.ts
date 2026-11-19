"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRegion } from "@/lib/aws/clients";
import { updateCapacity } from "@/lib/auto-scaling";
import { toUiError } from "@/lib/aws/errors";

type State = { error?: string; message?: string };

const capacity = z.coerce.number().int("Use whole numbers").min(0).max(10000);
const schema = z
  .object({ min: capacity, desired: capacity, max: capacity })
  .refine((c) => c.min <= c.desired, {
    message: "Desired capacity must be equal to or greater than the minimum",
  })
  .refine((c) => c.desired <= c.max, {
    message: "Desired capacity must be equal to or less than the maximum",
  });

export async function updateCapacityAction(
  name: string,
  _prev: State,
  formData: FormData,
): Promise<State> {
  try {
    const input = schema.parse({
      min: formData.get("min"),
      desired: formData.get("desired"),
      max: formData.get("max"),
    });
    await updateCapacity(await getRegion(), name, input);
  } catch (error) {
    if (error instanceof z.ZodError)
      return { error: error.issues.map((issue) => issue.message).join(". ") };
    return { error: toUiError(error) };
  }
  revalidatePath("/ec2/auto-scaling-groups");
  return { message: "Group size updated." };
}
