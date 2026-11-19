import { beforeEach, describe, expect, it, vi } from "vitest";

const ec2 = vi.hoisted(() => ({
  terminateInstance: vi.fn(),
  addRule: vi.fn(),
  launchInstance: vi.fn(),
}));

vi.mock("@/lib/ec2", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...ec2,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { revalidatePath } from "next/cache";
import {
  addRuleAction,
  launchInstanceAction,
  terminateInstanceAction,
} from "./actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => vi.clearAllMocks());

describe("terminateInstanceAction", () => {
  it("rejects a mismatched confirmation without calling AWS", async () => {
    const result = await terminateInstanceAction(
      "i-abc",
      {},
      form({ confirm: "nope" }),
    );
    expect(result.error).toMatch(/confirm/i);
    expect(ec2.terminateInstance).not.toHaveBeenCalled();
  });

  it("terminates and revalidates on a matching confirmation", async () => {
    const result = await terminateInstanceAction(
      "i-abc",
      {},
      form({ confirm: "i-abc" }),
    );
    expect(result).toEqual({});
    expect(ec2.terminateInstance).toHaveBeenCalledWith("i-abc");
    expect(revalidatePath).toHaveBeenCalledWith("/ec2");
  });

  it("maps UnauthorizedOperation to an access denied message", async () => {
    ec2.terminateInstance.mockRejectedValue(
      Object.assign(new Error("nope"), { name: "UnauthorizedOperation" }),
    );
    const result = await terminateInstanceAction(
      "i-abc",
      {},
      form({ confirm: "i-abc" }),
    );
    expect(result.error).toMatch(/access denied/i);
  });
});

describe("addRuleAction", () => {
  it("returns a validation error for a bad CIDR", async () => {
    const result = await addRuleAction(
      "sg-1",
      "ingress",
      {},
      form({ protocol: "tcp", fromPort: "22", toPort: "22", cidr: "anywhere" }),
    );
    expect(result.error).toMatch(/CIDR/);
    expect(ec2.addRule).not.toHaveBeenCalled();
  });

  it("requires ports unless the protocol is all traffic", async () => {
    const result = await addRuleAction(
      "sg-1",
      "ingress",
      {},
      form({ protocol: "tcp", cidr: "10.0.0.0/8" }),
    );
    expect(result.error).toMatch(/port/i);
  });

  it("adds a rule", async () => {
    const result = await addRuleAction(
      "sg-1",
      "ingress",
      {},
      form({ protocol: "-1", cidr: "10.0.0.0/8" }),
    );
    expect(result).toEqual({});
    expect(ec2.addRule).toHaveBeenCalledWith(
      "sg-1",
      "ingress",
      expect.objectContaining({ protocol: "-1" }),
    );
  });
});

describe("launchInstanceAction", () => {
  it("redirects to the new instance", async () => {
    ec2.launchInstance.mockResolvedValue("i-new");
    await expect(
      launchInstanceAction(
        {},
        form({ imageId: "ami-1", instanceType: "t3.micro" }),
      ),
    ).rejects.toThrow("REDIRECT /ec2/instances/i-new");
  });

  it("rejects an invalid AMI ID", async () => {
    const result = await launchInstanceAction(
      {},
      form({ imageId: "bad", instanceType: "t3.micro" }),
    );
    expect(result.error).toMatch(/AMI/);
  });
});
