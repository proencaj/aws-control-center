import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  region: "us-east-1",
  ecs: {
    createCluster: vi.fn(),
    deleteCluster: vi.fn(),
    getService: vi.fn(),
    assertRolling: vi.fn(),
    createService: vi.fn(),
    updateService: vi.fn(),
    redeployService: vi.fn(),
    runTask: vi.fn(),
    stopTask: vi.fn(),
    setClusterCapacity: vi.fn(),
    deregisterTaskDefinition: vi.fn(),
  },
  scaling: {
    getScalingTarget: vi.fn(),
    saveScalingTarget: vi.fn(),
    saveScalingPolicy: vi.fn(),
    saveScheduledAction: vi.fn(),
    removeScalingPolicy: vi.fn(),
  },
}));
vi.mock("@/lib/aws/clients", async (original) => ({
  ...(await original<object>()),
  getRegion: async () => state.region,
}));
vi.mock("@/lib/ecs", () => state.ecs);
vi.mock("@/lib/application-auto-scaling", () => state.scaling);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
import { revalidatePath } from "next/cache";
import { ecsAction } from "./actions";
function form(payload?: unknown, confirmation?: string) {
  const data = new FormData();
  if (payload !== undefined) data.set("payload", JSON.stringify(payload));
  if (confirmation !== undefined) data.set("confirm", confirmation);
  data.set("clientToken", "2cc506b3-e8aa-4f42-89c1-2b3b7fd2c7c0");
  return data;
}
const region = "us-east-1";
beforeEach(() => {
  vi.resetAllMocks();
  state.region = region;
  state.ecs.getService.mockResolvedValue({
    status: "ACTIVE",
    schedulingStrategy: "REPLICA",
  });
});
describe("ECS action boundaries", () => {
  it("rejects stale regions before calling AWS", async () => {
    state.region = "eu-west-1";
    const result = await ecsAction(
      region,
      { operation: "deleteCluster", cluster: "test" },
      {},
      form(undefined, "test"),
    );
    expect(result.error).toMatch(/region changed/i);
    expect(state.ecs.deleteCluster).not.toHaveBeenCalled();
  });
  it.each(["deleteCluster", "stopTask", "deregisterDefinition"])(
    "requires typed confirmation for %s",
    async (operation) => {
      const result = await ecsAction(
        region,
        { operation, cluster: "test", name: "task" },
        {},
        form(undefined, "wrong"),
      );
      expect(result.error).toMatch(/confirm/);
      expect(state.ecs.deleteCluster).not.toHaveBeenCalled();
      expect(state.ecs.stopTask).not.toHaveBeenCalled();
      expect(state.ecs.deregisterTaskDefinition).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid payloads and reports AWS permission failures", async () => {
    expect(
      (
        await ecsAction(
          region,
          { operation: "createService", cluster: "test" },
          {},
          form({}),
        )
      ).error,
    ).toBeDefined();
    expect(state.ecs.createService).not.toHaveBeenCalled();
    state.ecs.stopTask.mockRejectedValue(
      Object.assign(new Error("ecs:StopTask denied"), {
        name: "AccessDeniedException",
      }),
    );
    expect(
      (
        await ecsAction(
          region,
          { operation: "stopTask", cluster: "test", name: "task" },
          {},
          form(undefined, "task"),
        )
      ).error,
    ).toMatch(/Access denied/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("revalidates and redirects after successful creation", async () => {
    const data = form();
    data.set("name", "test");
    data.set("insights", "disabled");
    await expect(
      ecsAction(region, { operation: "createCluster" }, {}, data),
    ).rejects.toThrow("REDIRECT /ecs/clusters/test");
    expect(state.ecs.createCluster).toHaveBeenCalledWith(
      region,
      "test",
      "disabled",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/ecs", "layout");
  });
  it("passes the same client token on repeated create and run submissions", async () => {
    const request = form({
      taskDefinition: "app:1",
      launchType: "EC2",
      count: 1,
    });
    state.ecs.runTask.mockResolvedValue({
      tasks: [{ taskArn: "arn/task/started" }],
      failures: [],
    });
    await ecsAction(
      region,
      { operation: "runTask", cluster: "test" },
      {},
      request,
    );
    await ecsAction(
      region,
      { operation: "runTask", cluster: "test" },
      {},
      request,
    );
    expect(state.ecs.runTask.mock.calls[0][1].clientToken).toBe(
      state.ecs.runTask.mock.calls[1][1].clientToken,
    );
    const service = form({
      serviceName: "web",
      taskDefinition: "app:1",
      launchType: "EC2",
      desiredCount: 1,
    });
    for (let i = 0; i < 2; i++)
      await expect(
        ecsAction(
          region,
          { operation: "createService", cluster: "test" },
          {},
          service,
        ),
      ).rejects.toThrow("REDIRECT");
    expect(state.ecs.createService.mock.calls[0][1].clientToken).toBe(
      state.ecs.createService.mock.calls[1][1].clientToken,
    );
  });
  it("reports task partial success instead of hiding successful launches", async () => {
    state.ecs.runTask.mockResolvedValue({
      tasks: [{ taskArn: "arn/task/started" }],
      failures: [{ reason: "RESOURCE:CPU" }],
    });
    const result = await ecsAction(
      region,
      { operation: "runTask", cluster: "test" },
      {},
      form({ taskDefinition: "app:1", launchType: "EC2", count: 2 }),
    );
    expect(result.message).toMatch(/1 task\(s\) accepted: started/);
    expect(result.message).toContain("RESOURCE:CPU");
    expect(revalidatePath).toHaveBeenCalled();
  });
  it("requires confirmation when removing cluster capacity associations", async () => {
    const result = await ecsAction(
      region,
      { operation: "clusterCapacity", cluster: "test" },
      {},
      form({ add: [], remove: ["old"], strategy: [] }),
    );
    expect(result.error).toMatch(/confirm/);
    expect(state.ecs.setClusterCapacity).not.toHaveBeenCalled();
  });
  it("scales to zero and accepts zero desired count without typed confirmation", async () => {
    for (const [operation, data] of [
      ["scaleZero", form()],
      ["updateService", form({ desiredCount: 0 })],
    ] as const) {
      state.ecs.updateService.mockClear();
      const result = await ecsAction(
        region,
        { operation, cluster: "test", name: "web" },
        {},
        data,
      );
      expect(result.error).toBeUndefined();
      expect(state.ecs.updateService).toHaveBeenCalledWith(
        region,
        "test",
        "web",
        { desiredCount: 0 },
      );
    }
  });
});
describe("service list actions", () => {
  it("sets a non-zero desired count without typed confirmation", async () => {
    const result = await ecsAction(
      region,
      { operation: "updateService", cluster: "test", name: "web" },
      {},
      form({ desiredCount: 3 }),
    );
    expect(result.error).toBeUndefined();
    expect(state.ecs.updateService).toHaveBeenCalledWith(
      region,
      "test",
      "web",
      { desiredCount: 3 },
    );
  });
  it("forces a new deployment", async () => {
    const result = await ecsAction(
      region,
      { operation: "redeploy", cluster: "test", name: "web" },
      {},
      form(),
    );
    expect(result.error).toBeUndefined();
    expect(state.ecs.redeployService).toHaveBeenCalledWith(
      region,
      "test",
      "web",
    );
  });
});
describe("autoscaling action validation", () => {
  it("rejects reversed bounds and daemon services", async () => {
    const target = { operation: "scalingTarget", cluster: "test", name: "web" };
    expect(
      (
        await ecsAction(
          region,
          target,
          {},
          form({ MinCapacity: 5, MaxCapacity: 2 }),
        )
      ).error,
    ).toMatch(/Minimum/);
    state.ecs.getService.mockResolvedValue({
      status: "ACTIVE",
      schedulingStrategy: "DAEMON",
    });
    expect(
      (
        await ecsAction(
          region,
          target,
          {},
          form({ MinCapacity: 1, MaxCapacity: 2 }),
        )
      ).error,
    ).toMatch(/REPLICA/);
    expect(state.scaling.saveScalingTarget).not.toHaveBeenCalled();
  });
  it("requires the scalable target before creating a policy", async () => {
    expect(
      (
        await ecsAction(
          region,
          { operation: "scalingPolicy", cluster: "test", name: "web" },
          {},
          form({
            name: "cpu",
            metric: "ECSServiceAverageCPUUtilization",
            targetValue: 60,
          }),
        )
      ).error,
    ).toMatch(/min\/max/);
    expect(state.scaling.saveScalingPolicy).not.toHaveBeenCalled();
  });
  it("validates scheduling syntax, timezone, dates, and zero bounds", async () => {
    state.scaling.getScalingTarget.mockResolvedValue({
      MinCapacity: 1,
      MaxCapacity: 10,
    });
    const target = { operation: "schedule", cluster: "test", name: "web" };
    const request = {
      ScheduledActionName: "weekday",
      Schedule: "cron(0 9 ? * MON-FRI *)",
      Timezone: "UTC",
      ScalableTargetAction: { MinCapacity: 1, MaxCapacity: 5 },
    };
    expect(
      (
        await ecsAction(
          region,
          target,
          {},
          form({ ...request, Timezone: "Not/AZone" }),
        )
      ).error,
    ).toMatch(/timezone/);
    expect(
      (
        await ecsAction(
          region,
          target,
          {},
          form({ ...request, Schedule: "every day" }),
        )
      ).error,
    ).toMatch(/expression/);
    expect(
      (
        await ecsAction(
          region,
          target,
          {},
          form({
            ...request,
            StartTime: "2030-01-02T00:00:00Z",
            EndTime: "2030-01-01T00:00:00Z",
          }),
        )
      ).error,
    ).toMatch(/after/);
    expect(
      (
        await ecsAction(
          region,
          target,
          {},
          form({
            ...request,
            ScalableTargetAction: { MinCapacity: 0, MaxCapacity: 0 },
          }),
        )
      ).error,
    ).toMatch(/confirm/);
    expect(state.scaling.saveScheduledAction).not.toHaveBeenCalled();
    expect(await ecsAction(region, target, {}, form(request))).toHaveProperty(
      "message",
    );
    expect(state.scaling.saveScheduledAction).toHaveBeenCalledWith(
      region,
      "test",
      "web",
      expect.objectContaining({ Timezone: "UTC", Schedule: request.Schedule }),
    );
  });
  it("requires matching policy name confirmation for removal", async () => {
    const request = form(undefined, "web");
    request.set("itemName", "cpu");
    const result = await ecsAction(
      region,
      { operation: "removePolicy", cluster: "test", name: "web" },
      {},
      request,
    );
    expect(result.error).toMatch(/Type cpu/);
    expect(state.scaling.removeScalingPolicy).not.toHaveBeenCalled();
  });
});
