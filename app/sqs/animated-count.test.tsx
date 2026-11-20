// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AnimatedCount } from "./animated-count";

beforeEach(() => {
  sessionStorage.clear();
  document.documentElement.dataset.theme = "apple";
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

it("renders the previous and current values when an Apple count changes", async () => {
  sessionStorage.setItem(
    "aws-control-center.sqs-count.sa-east-1.orders.available",
    "4",
  );
  const { container } = render(
    <AnimatedCount
      region="sa-east-1"
      queueName="orders"
      metric="available"
      value="7"
    />,
  );

  await waitFor(() =>
    expect(container.querySelector(".sqs-count-changing")).not.toBeNull(),
  );
  expect(container.querySelector(".sqs-count-current")?.textContent).toBe("7");
  expect(container.querySelector(".sqs-count-previous")?.textContent).toBe("4");
  expect(screen.getByLabelText("7")).toBeTruthy();
});

it("stays static outside the Apple theme", async () => {
  document.documentElement.dataset.theme = "default";
  sessionStorage.setItem(
    "aws-control-center.sqs-count.sa-east-1.orders.in-flight",
    "2",
  );
  const { container } = render(
    <AnimatedCount
      region="sa-east-1"
      queueName="orders"
      metric="in-flight"
      value="3"
    />,
  );

  await Promise.resolve();
  expect(container.querySelector(".sqs-count-changing")).toBeNull();
  expect(container.querySelector(".sqs-count-previous")).toBeNull();
  expect(container.querySelector(".sqs-count-current")?.textContent).toBe("3");
});
