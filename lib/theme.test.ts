import { afterEach, describe, expect, it, vi } from "vitest";
import { getTheme, resolveTheme, themeIcon } from "@/lib/theme";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("theme configuration", () => {
  it.each(["default", "apple", "win95", "win7", "wow"] as const)(
    "accepts %s",
    (theme) => expect(resolveTheme(theme)).toBe(theme),
  );

  it("normalizes whitespace and case", () => {
    expect(resolveTheme("  WoW ")).toBe("wow");
  });

  it.each([undefined, "", "unknown"])(
    "falls back to default for %s",
    (value) => expect(resolveTheme(value)).toBe("default"),
  );

  it("returns the selected theme icon", () => {
    expect(themeIcon("win95")).toBe("/themes/win95/icon.svg");
    expect(themeIcon("win7")).toBe("/themes/win7/icon.svg");
  });

  it("warns and uses default for an unsupported environment value", () => {
    vi.stubEnv("APP_THEME", "not-a-theme");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getTheme()).toBe("default");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not-a-theme"));
  });
});
