// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnalyseDialog } from "./analyse-dialog";
import { takeDebuggerRequest } from "./handoff";

const openService = vi.fn();
vi.mock("@/components/workspace", () => ({
  useWorkspace: () => ({ openService }),
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  openService.mockReset();
  takeDebuggerRequest();
});

const lines = ["one", "two", "three", "four"];

function open(onOpen = vi.fn()) {
  render(<AnalyseDialog lines={lines} onOpen={onOpen} />);
  fireEvent.click(screen.getAllByRole("button", { name: /analyse/i })[0]);
  return onOpen;
}

function submit() {
  fireEvent.click(screen.getAllByRole("button", { name: /analyse/i, hidden: true })[1]);
}

it("pauses the source and sends the last lines with the chosen options", () => {
  const onOpen = open();
  expect(onOpen).toHaveBeenCalled();
  fireEvent.change(screen.getByRole("spinbutton", { hidden: true }), { target: { value: "2" } });
  fireEvent.click(screen.getByLabelText("Filter Errors"));
  fireEvent.change(screen.getByLabelText("Language"), { target: { value: "pt-br" } });
  submit();
  expect(takeDebuggerRequest()).toEqual({
    logs: "three\nfour",
    full: false,
    errors: true,
    language: "pt-br",
  });
  expect(openService).toHaveBeenCalledWith("/ai-debugger");
});

it("sends the first lines or all lines", () => {
  open();
  fireEvent.change(screen.getByRole("spinbutton", { hidden: true }), { target: { value: "1" } });
  fireEvent.click(screen.getByLabelText("First lines"));
  submit();
  expect(takeDebuggerRequest()?.logs).toBe("one");
  fireEvent.click(screen.getByLabelText("All lines"));
  submit();
  expect(takeDebuggerRequest()?.logs).toBe(lines.join("\n"));
});

it("disables the trigger without logs", () => {
  render(<AnalyseDialog lines={[]} onOpen={vi.fn()} />);
  expect(screen.getAllByRole("button", { name: /analyse/i })[0]).toHaveProperty("disabled", true);
});
