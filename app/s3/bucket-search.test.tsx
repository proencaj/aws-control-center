// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BucketSearch } from "./bucket-search";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
beforeEach(() => {
  vi.useFakeTimers();
  replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("debounces typing and starts a new result page without a submit button", async () => {
  render(<BucketSearch prefix="" />);
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "p" } });
  await act(() => vi.advanceTimersByTimeAsync(200));
  fireEvent.change(input, { target: { value: "prod" } });
  await act(() => vi.advanceTimersByTimeAsync(299));
  expect(replace).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(replace).toHaveBeenCalledExactlyOnceWith("/s3?prefix=prod", {
    scroll: false,
  });
  expect(screen.queryByRole("button", { name: "Find buckets" })).toBeNull();
});

it("clears immediately and cancels a queued filter", async () => {
  render(<BucketSearch prefix="prod" />);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "staging" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(replace).toHaveBeenCalledExactlyOnceWith("/s3", { scroll: false });
});

it("does not navigate after leaving the page", async () => {
  const view = render(<BucketSearch prefix="" />);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "prod" },
  });
  view.unmount();
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(replace).not.toHaveBeenCalled();
});
