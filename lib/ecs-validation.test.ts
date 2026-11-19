import { describe, expect, it } from "vitest";
import {
  taskDefinitionSchema,
  strategySchema,
  serviceSchema,
  registrationInput,
} from "./ecs-validation";
const definition = {
  family: "web",
  requiresCompatibilities: ["FARGATE"],
  networkMode: "awsvpc",
  cpu: "256",
  memory: "512",
  containerDefinitions: [{ name: "app", image: "nginx", essential: true }],
};
describe("task definition validation and cloning", () => {
  it("accepts valid Fargate and EC2 definitions", () => {
    expect(taskDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(
      taskDefinitionSchema.safeParse({
        family: "web",
        requiresCompatibilities: ["EC2"],
        networkMode: "bridge",
        containerDefinitions: definition.containerDefinitions,
      }).success,
    ).toBe(true);
  });
  it("rejects invalid resource sizing, network modes, and duplicate container names", () => {
    expect(
      taskDefinitionSchema.safeParse({ ...definition, memory: "1536" }).success,
    ).toBe(false);
    expect(
      taskDefinitionSchema.safeParse({ ...definition, networkMode: "bridge" })
        .success,
    ).toBe(false);
    expect(
      taskDefinitionSchema.safeParse({
        ...definition,
        containerDefinitions: [
          ...definition.containerDefinitions,
          ...definition.containerDefinitions,
        ],
      }).success,
    ).toBe(false);
  });
  it("clones without response metadata while preserving advanced container options", () => {
    const source = {
      ...definition,
      revision: 9,
      taskDefinitionArn: "arn",
      registeredAt: new Date(),
      status: "ACTIVE",
      compatibilities: ["FARGATE"],
      requiresAttributes: [],
      registeredBy: "identity",
      containerDefinitions: [
        {
          ...definition.containerDefinitions[0],
          healthCheck: { command: ["CMD", "true"], interval: 30 },
          secrets: [{ name: "DB", valueFrom: "secret-reference" }],
          mountPoints: [{ sourceVolume: "data", containerPath: "/data" }],
        },
      ],
      volumes: [{ name: "data" }],
    };
    const cloned = registrationInput(source);
    expect(cloned).not.toHaveProperty("revision");
    expect(cloned).not.toHaveProperty("registeredAt");
    const parsed = taskDefinitionSchema.parse(cloned);
    expect(parsed.containerDefinitions[0]).toMatchObject({
      healthCheck: { command: ["CMD", "true"] },
      mountPoints: source.containerDefinitions[0].mountPoints,
      secrets: source.containerDefinitions[0].secrets,
    });
    expect(parsed.volumes).toEqual(source.volumes);
  });
  it("rejects response-only fields in registration JSON", () => {
    expect(
      taskDefinitionSchema.safeParse({ ...definition, revision: 1 }).success,
    ).toBe(false);
  });
});
describe("compute strategies", () => {
  it("rejects mixed launch type and strategy, daemon Fargate, zero weights, mixed providers and multiple bases", () => {
    expect(
      serviceSchema.safeParse({
        serviceName: "web",
        taskDefinition: "app:1",
        launchType: "FARGATE",
        schedulingStrategy: "DAEMON",
      }).success,
    ).toBe(false);
    expect(
      serviceSchema.safeParse({
        serviceName: "web",
        taskDefinition: "app:1",
        launchType: "FARGATE",
        capacityProviderStrategy: [{ capacityProvider: "FARGATE", weight: 1 }],
      }).success,
    ).toBe(false);
    expect(
      strategySchema.safeParse([{ capacityProvider: "FARGATE", weight: 0 }])
        .success,
    ).toBe(false);
    expect(
      strategySchema.safeParse([
        { capacityProvider: "FARGATE", weight: 1 },
        { capacityProvider: "ec2", weight: 1 },
      ]).success,
    ).toBe(false);
    expect(
      strategySchema.safeParse([
        { capacityProvider: "FARGATE", weight: 1, base: 1 },
        { capacityProvider: "FARGATE_SPOT", weight: 1, base: 1 },
      ]).success,
    ).toBe(false);
  });
});
