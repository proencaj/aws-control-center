// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Results } from "./results";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("renders ANSI logs safely in grayscale and opens their context", () => {
  const onContext = vi.fn();
  const { container } = render(
    <Results
      rows={[
        {
          "@message": "\u001b[31mERROR <img src=x>\u001b[0m",
          "@ptr": "pointer",
        },
      ]}
      onContext={onContext}
    />,
  );
  expect(
    container.querySelector('[data-severity="error"]')?.textContent,
  ).toContain("ERROR <img src=x>");
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).not.toContain("\u001b");
  fireEvent.click(screen.getByRole("button", { name: "View context" }));
  expect(onContext).toHaveBeenCalledWith("pointer");
});
it("falls back to a table for aggregates without context actions", () => {
  render(
    <Results rows={[{ count: "4", level: "ERROR" }]} onContext={vi.fn()} />,
  );
  expect(screen.getByRole("table").textContent).toContain("4");
  expect(screen.queryByRole("button", { name: "View context" })).toBeNull();
});
it("highlights worker matches, navigates, and clears stale results", async () => {
  vi.useFakeTimers();
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  class WorkerMock {
    onmessage?: (event: { data: unknown }) => void;
    postMessage() {
      this.onmessage?.({
        data: {
          matches: [
            { row: 0, cell: 0, start: 0, end: 5 },
            { row: 0, cell: 0, start: 6, end: 11 },
          ],
        },
      });
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", WorkerMock);
  const view = render(
    <Results rows={[{ "@message": "hello hello" }]} onContext={vi.fn()} />,
  );
  fireEvent.change(screen.getByLabelText("Find in loaded results"), {
    target: { value: "hello" },
  });
  await act(() => vi.advanceTimersByTimeAsync(150));
  expect(view.container.querySelectorAll("mark")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Next match" }));
  expect(scroll).toHaveBeenCalled();
  view.rerender(
    <Results rows={[{ "@message": "different" }]} onContext={vi.fn()} />,
  );
  expect(view.container.querySelectorAll("mark")).toHaveLength(0);
});
