import { describe, expect, it } from "vitest";
import { identityName } from "./sts";

describe("identityName", () => {
  it("names an IAM user", () =>
    expect(identityName("arn:aws:iam::1:user/service-user")).toBe("service-user"));
  it("names an assumed role with its session", () =>
    expect(identityName("arn:aws:sts::1:assumed-role/Admin/me@acme.com")).toBe("Admin/me@acme.com"));
  it("shows the permission set of an SSO role", () =>
    expect(identityName("arn:aws:sts::1:assumed-role/AWSReservedSSO_ReadOnlyAccess_777be786d4947d54/me@acme.com")).toBe("ReadOnlyAccess/me@acme.com"));
});
