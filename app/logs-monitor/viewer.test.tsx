// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LogsViewer } from "./viewer";

vi.mock("@/app/ai-debugger/analyse-dialog", () => ({ AnalyseDialog: () => null }));

const fetchMock = vi.fn();
const now = Date.UTC(2026, 10, 19);
const log = (id: string, time = now, text = id) => ({
  id,
  time,
  ingested: time,
  stream: "stream",
  text,
});
const response = (events: ReturnType<typeof log>[], nextToken?: string) => ({
  ok: true,
  json: async () => ({ events, nextToken }),
});
const show = () =>
  render(
    <LogsViewer
      region="us-east-1"
      initialGroups={{
        groups: ["/aws/test", "/aws/other"],
        nextToken: undefined,
      }}
    />,
  );
const start = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Monitor" }));
  });
};
const output = () =>
  screen.getByRole("region", { name: "CloudWatch log output" });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("waits for Monitor, sends the line limit, and renders log text safely", async () => {
  fetchMock.mockResolvedValue(
    response([log("1", now, "<img src=x onerror=alert(1)>\nmessage")]),
  );
  show();
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Lines per fetch"), {
    target: { value: "25" },
  });
  await start();
  const query = new URL(fetchMock.mock.calls[0][0], "http://localhost")
    .searchParams;
  expect(query.get("lines")).toBe("25");
  expect(query.get("direction")).toBe("older");
  expect(output().textContent).toContain("<img src=x onerror=alert(1)>");
  expect(output().querySelector("img")).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("renders grayscale severity styles with no ANSI codes or stream prefixes", async () => {
  fetchMock.mockResolvedValue(
    response([
      log("info", now, "\u001b[32mINFO Ready\u001b[39m"),
      log("warn", now + 1, "\u001b[33mWARN Slow request\u001b[39m"),
      log("error", now + 2, "\u001b[31mERROR Failed\u001b[39m\n  at handler"),
    ]),
  );
  show();
  await start();
  const box = output();
  expect(box.querySelector('[data-severity="normal"]')?.textContent).toContain(
    "INFO Ready",
  );
  expect(box.querySelector('[data-severity="warning"]')?.textContent).toContain(
    "WARN Slow request",
  );
  expect(box.querySelector('[data-severity="error"]')?.textContent).toContain(
    "ERROR Failed\n  at handler",
  );
  expect(box.textContent).not.toContain("[stream]");
  expect(box.textContent).not.toContain("\u001b");
});

it("tails through empty paginated pages, deduplicates, and stops polling", async () => {
  fetchMock
    .mockResolvedValueOnce(response([log("initial")]))
    .mockResolvedValueOnce(response([], "tail-page"))
    .mockResolvedValueOnce(response([log("initial"), log("new", now + 1000)]));
  show();
  fireEvent.click(screen.getByLabelText("Tail"));
  await start();
  await act(() => vi.advanceTimersByTimeAsync(2250));
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const query = new URL(fetchMock.mock.calls[2][0], "http://localhost")
    .searchParams;
  expect(query.get("next")).toBe("tail-page");
  expect(query.get("direction")).toBe("newer");
  expect(output().textContent?.match(/initial/g)).toHaveLength(1);
  expect(output().textContent).toContain("new");
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("loads older pages even when the first page is empty", async () => {
  fetchMock
    .mockResolvedValueOnce(response([], "older-page"))
    .mockResolvedValueOnce(response([log("older", now - 5000)]));
  show();
  await start();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Load older events" }));
  });
  expect(
    new URL(fetchMock.mock.calls[1][0], "http://localhost").searchParams.get(
      "next",
    ),
  ).toBe("older-page");
  expect(output().textContent).toContain("older");
});

it("discards a response that completes after Stop", async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  fetchMock.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  show();
  await start();
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolve(response([log("stale-response")]));
  });
  expect(output().textContent).not.toContain("stale-response");
});

it("stops on a region/error response and retains previous output", async () => {
  fetchMock
    .mockResolvedValueOnce(response([log("existing")]))
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Region changed. Reload." }),
    });
  show();
  fireEvent.click(screen.getByLabelText("Tail"));
  await start();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByRole("alert").textContent).toContain("Region changed");
  expect(output().textContent).toContain("existing");
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("cancels polling on unmount", async () => {
  fetchMock.mockResolvedValue(response([]));
  const view = show();
  fireEvent.click(screen.getByLabelText("Tail"));
  await start();
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
