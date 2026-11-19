// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Explorer } from "./explorer";
vi.mock("./results", () => ({
  Results: ({ rows }: { rows: unknown[] }) => (
    <div data-testid="rows">{JSON.stringify(rows)}</div>
  ),
}));
vi.mock("./context", () => ({ ContextDialog: () => null }));
const fetchMock = vi.fn();
const response = (body: unknown) => ({ ok: true, json: async () => body });
const show = () =>
  render(
    <Explorer
      region="us-east-1"
      initialGroups={{ groups: ["/app", "/other"], nextToken: undefined }}
    />,
  );
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};
const starts = () =>
  fetchMock.mock.calls.filter(
    ([, init]) => init?.body && JSON.parse(init.body).kind === "start",
  );
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("waits for Run and sends all selected groups", async () => {
  fetchMock
    .mockResolvedValueOnce(response({ id: "q" }))
    .mockResolvedValueOnce(
      response({ status: "Complete", rows: [{ "@message": "hello" }] }),
    );
  show();
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("/app"));
  fireEvent.click(screen.getByLabelText("/other"));
  await click("Run query");
  expect(JSON.parse(starts()[0][1].body)).toMatchObject({
    groups: ["/app", "/other"],
    limit: 1000,
    kind: "start",
  });
  expect(screen.getByTestId("rows").textContent).toContain("hello");
});
it("cancels a late StartQuery response instead of leaving it running", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue(response({ stopped: true }));
  show();
  fireEvent.click(screen.getByLabelText("/app"));
  await click("Run query");
  await click("Cancel");
  await act(async () => {
    resolve(response({ id: "late" }));
  });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
    kind: "stop",
    id: "late",
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("auto-refresh waits for completion and replaces the result snapshot", async () => {
  let polls = 0;
  fetchMock.mockImplementation(async (_url, init) => {
    const kind = init?.body ? JSON.parse(init.body).kind : "results";
    if (kind === "start") return response({ id: "q" });
    if (kind === "stop") return response({ stopped: true });
    polls++;
    return response({
      status: polls === 1 ? "Running" : "Complete",
      rows: [{ count: String(polls) }],
    });
  });
  show();
  fireEvent.click(screen.getByLabelText("/app"));
  fireEvent.click(screen.getByLabelText("Tail / auto-refresh rolling window"));
  await click("Run query");
  expect(starts()).toHaveLength(1);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(screen.getByTestId("rows").textContent).toBe('[{"count":"2"}]');
  await act(() => vi.advanceTimersByTimeAsync(29999));
  expect(starts()).toHaveLength(1);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(starts()).toHaveLength(2);
  expect(screen.getByTestId("rows").textContent).toBe('[{"count":"3"}]');
  await click("Cancel");
  await act(() => vi.advanceTimersByTimeAsync(60000));
  expect(starts()).toHaveLength(2);
});
it("loads the next page and retains the first page", async () => {
  fetchMock
    .mockResolvedValueOnce(response({ id: "q" }))
    .mockResolvedValueOnce(
      response({ status: "Complete", rows: [{ count: "1" }], next: "next" }),
    )
    .mockResolvedValueOnce(
      response({ status: "Complete", rows: [{ count: "2" }] }),
    );
  show();
  fireEvent.click(screen.getByLabelText("/app"));
  await click("Run query");
  await click("Load more results");
  expect(
    new URL(fetchMock.mock.calls[2][0], "http://localhost").searchParams.get(
      "next",
    ),
  ).toBe("next");
  expect(screen.getByTestId("rows").textContent).toBe(
    '[{"count":"1"},{"count":"2"}]',
  );
});
it("stops the remote query when leaving the page", async () => {
  fetchMock
    .mockResolvedValueOnce(response({ id: "q" }))
    .mockResolvedValueOnce(response({ status: "Running", rows: [] }))
    .mockResolvedValue(response({ stopped: true }));
  const view = show();
  fireEvent.click(screen.getByLabelText("/app"));
  await click("Run query");
  await act(async () => view.unmount());
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
    kind: "stop",
    id: "q",
  });
  expect(fetchMock.mock.calls[2][1].keepalive).toBe(true);
});
