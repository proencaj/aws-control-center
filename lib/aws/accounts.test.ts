import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { parseAccounts } from "./accounts";

const entry = { id: "123456789012", name: "sandbox", accessKeyId: "AKIA", secretAccessKey: "secret" };

describe("parseAccounts", () => {
  it("accepts valid accounts with an optional session token", () => {
    expect(parseAccounts(JSON.stringify([entry, { ...entry, id: "210987654321", sessionToken: "" }]))).toHaveLength(2);
  });

  it("rejects an id that is not 12 digits", () => {
    expect(() => parseAccounts(JSON.stringify([{ ...entry, id: "abc" }]))).toThrow("12-digit");
  });

  it("does not leak file contents when the JSON is broken", () => {
    expect(() => parseAccounts('[{"secretAccessKey": "hunter2" oops')).toThrow(/^accounts.json is not valid JSON$/);
  });
});
