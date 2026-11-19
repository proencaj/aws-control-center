// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContextDialog } from "./context";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows the selected event, expands context, and aborts when closed", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  Element.prototype.scrollIntoView = vi.fn();
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      group: "/app",
      stream: "stream",
      anchor: 1,
      limited: false,
      events: [
        { time: 1000, ingested: 1000, text: "before" },
        { time: 2000, ingested: 2000, text: "selected" },
        { time: 3000, ingested: 3000, text: "after" },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <ContextDialog region="us-east-1" pointer="ptr" close={vi.fn()} />,
    );
  });
  expect(screen.getByText(/SELECTED EVENT/).textContent).toContain("selected");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    pointer: "ptr",
    before: 10,
    after: 10,
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Load earlier" }));
  });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
    before: 20,
    after: 10,
  });
  view.unmount();
  expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
});
