// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Debugger } from "./debugger";
import { sendToDebugger } from "./handoff";

const analyse = vi.fn(async () => ({ analysis: "All good", full: true, errors: false }));
vi.mock("./actions", () => ({
  analyse: (...args: unknown[]) => analyse(...(args as [])),
  fluxogram: vi.fn(async () => ({})),
}));

afterEach(cleanup);

it("fills the logs and starts analysing a request handed off from a logs page", async () => {
  sendToDebugger({ logs: "boom", full: true, errors: false, language: "en" });
  render(<Debugger />);
  await waitFor(() => expect(analyse).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Logs to analyse")).toHaveProperty("value", "boom");
  expect(screen.getByLabelText("Full Analysis")).toHaveProperty("checked", true);
  const data = (analyse.mock.calls[0] as unknown as [unknown, FormData])[1];
  expect(data.get("logs")).toBe("boom");
  expect(data.get("full")).toBe("on");
  expect(data.get("errors")).toBeNull();
  expect(await screen.findByText("All good")).toBeTruthy();
});
