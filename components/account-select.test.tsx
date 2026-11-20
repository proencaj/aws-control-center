// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AccountSelect } from "./account-select";

it("provides a disabled masked selector for privacy mode", () => {
  render(<AccountSelect accounts={[{ id: "123456789012", name: "pacs-dev" }]} current="123456789012" onChange={vi.fn()} />);

  const masked = screen.getByRole("combobox", { name: "Account hidden" });
  expect(masked.hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("option", { name: "****" })).toBeTruthy();
});
