import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ updateCapacity: vi.fn() }));
vi.mock("@/lib/aws/clients", () => ({ getRegion: async () => "us-east-1" }));
vi.mock("@/lib/auto-scaling", () => state);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { updateCapacityAction } from "./actions";

function form(min: string, desired: string, max: string) {
  const data = new FormData();
  data.set("min", min);
  data.set("desired", desired);
  data.set("max", max);
  return data;
}

beforeEach(() => vi.resetAllMocks());

describe("updateCapacityAction", () => {
  it("updates and revalidates", async () => {
    state.updateCapacity.mockResolvedValue(undefined);
    const r = await updateCapacityAction("web", {}, form("0", "2", "10"));
    expect(r.error).toBeUndefined();
    expect(state.updateCapacity).toHaveBeenCalledWith("us-east-1", "web", {
      min: 0,
      desired: 2,
      max: 10,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/ec2/auto-scaling-groups");
  });

  it.each([
    ["0", "11", "10", /less than the maximum/],
    ["3", "2", "10", /greater than the minimum/],
    ["0", "1.5", "10", /whole numbers/],
  ])("rejects %s/%s/%s", async (min, desired, max, message) => {
    const r = await updateCapacityAction("web", {}, form(min, desired, max));
    expect(r.error).toMatch(message);
    expect(state.updateCapacity).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps AWS errors", async () => {
    state.updateCapacity.mockRejectedValue(
      Object.assign(new Error("denied"), { name: "AccessDenied" }),
    );
    const r = await updateCapacityAction("web", {}, form("0", "2", "10"));
    expect(r.error).toMatch(/Access denied/i);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
