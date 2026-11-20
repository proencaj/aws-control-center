// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AppearanceControls } from "./appearance-controls";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.accountDetails;
  delete document.documentElement.dataset.colorMode;
});

afterEach(cleanup);

it("hides and restores account details", () => {
  render(<AppearanceControls />);

  fireEvent.click(screen.getByRole("button", { name: "Hide account and identity details" }));
  expect(document.documentElement.dataset.accountDetails).toBe("hidden");
  expect(localStorage.getItem("aws-control-center.account-details")).toBe("hidden");
  expect(screen.getByRole("button", { name: "Show account and identity details" }).getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(screen.getByRole("button", { name: "Show account and identity details" }));
  expect(document.documentElement.dataset.accountDetails).toBeUndefined();
  expect(localStorage.getItem("aws-control-center.account-details")).toBe("visible");
});

it("sets a saved color mode independently from the system preference", () => {
  localStorage.setItem("aws-control-center.color-mode", "light");
  render(<AppearanceControls />);

  fireEvent.click(screen.getByRole("switch", { name: "Use dark mode" }));
  expect(document.documentElement.dataset.colorMode).toBe("dark");
  expect(localStorage.getItem("aws-control-center.color-mode")).toBe("dark");
  expect(screen.getByRole("switch", { name: "Use light mode" }).getAttribute("aria-checked")).toBe("true");
});

it("restores saved privacy and color preferences", () => {
  localStorage.setItem("aws-control-center.account-details", "hidden");
  localStorage.setItem("aws-control-center.color-mode", "dark");
  render(<AppearanceControls />);

  expect(document.documentElement.dataset.accountDetails).toBe("hidden");
  expect(document.documentElement.dataset.colorMode).toBe("dark");
  expect(screen.getByRole("button", { name: "Show account and identity details" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Use light mode" })).toBeTruthy();
});
