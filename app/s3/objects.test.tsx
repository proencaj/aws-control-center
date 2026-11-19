// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ObjectBrowser, type ObjectRow } from "./objects";
import { objectAction } from "./actions";

vi.mock("./actions", () => ({ objectAction: vi.fn() }));
const rows: ObjectRow[] = [
  {
    key: "folder/a.txt",
    etag: '"a"',
    size: 10,
    storageClass: "STANDARD",
    modified: "2026-11-19T00:00:00Z",
  },
  {
    key: "folder/雪 +?.txt",
    etag: '"b"',
    size: 20,
    storageClass: "STANDARD_IA",
    modified: "",
  },
];
const show = (objects = rows) =>
  render(
    <ObjectBrowser
      bucket="test-bucket"
      prefix="folder/"
      folders={["folder/sub/"]}
      objects={objects}
      versioning="Enabled"
    />,
  );
beforeEach(() => {
  vi.mocked(objectAction).mockReset();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

it("selects objects only and opens a modal without running a mutation", async () => {
  const user = userEvent.setup();
  show();
  expect(
    (screen.getByRole("button", { name: "Actions" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(screen.getByLabelText("Select all objects on this page"));
  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(screen.getByRole("button", { name: "Delete objects" }));
  const modal = screen.getByRole("dialog", { name: "Delete objects" });
  expect(within(modal).getByText("2 selected")).toBeTruthy();
  expect(within(modal).queryByText("folder/sub/")).toBeNull();
  expect(objectAction).not.toHaveBeenCalled();
  expect(
    (
      within(modal).getByRole("button", {
        name: "Delete selected objects",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.click(within(modal).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(objectAction).not.toHaveBeenCalled();
});

it("requires typed confirmation and submits only the selected object", async () => {
  vi.mocked(objectAction).mockResolvedValue({
    results: [{ key: rows[0].key, status: "deleted" }],
  });
  const user = userEvent.setup();
  show();
  await user.click(screen.getByLabelText("Select folder/a.txt"));
  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(screen.getByRole("button", { name: "Delete objects" }));
  const modal = screen.getByRole("dialog");
  await user.type(within(modal).getByRole("textbox"), "wrong");
  expect(
    (
      within(modal).getByRole("button", {
        name: "Delete selected objects",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.clear(within(modal).getByRole("textbox"));
  await user.type(within(modal).getByRole("textbox"), rows[0].key);
  await user.click(
    within(modal).getByRole("button", { name: "Delete selected objects" }),
  );
  await waitFor(() => expect(objectAction).toHaveBeenCalledTimes(1));
  const data = vi.mocked(objectAction).mock.calls[0][1];
  expect(JSON.parse(String(data.get("payload"))).objects).toEqual([
    { key: rows[0].key, etag: rows[0].etag },
  ]);
  expect(data.get("confirm")).toBe(rows[0].key);
  expect(within(modal).getByRole("status").textContent).toContain(
    "1 succeeded",
  );
  expect(
    within(modal).queryByRole("button", { name: "Delete selected objects" }),
  ).toBeNull();
});

it("requires a target class and acknowledgement, and retains partial results", async () => {
  vi.mocked(objectAction).mockResolvedValue({
    results: [
      { key: rows[0].key, status: "updated" },
      { key: rows[1].key, status: "failed", error: "Access denied" },
    ],
  });
  const user = userEvent.setup();
  show();
  await user.click(screen.getByLabelText("Select all objects on this page"));
  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(
    screen.getByRole("button", { name: "Change storage class" }),
  );
  const modal = screen.getByRole("dialog");
  const submit = within(modal).getByRole("button", {
    name: "Change storage class",
  }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  await user.selectOptions(
    within(modal).getByLabelText("New storage class"),
    "GLACIER_IR",
  );
  expect(submit.disabled).toBe(true);
  await user.click(within(modal).getByRole("checkbox"));
  await user.click(submit);
  await waitFor(() => expect(objectAction).toHaveBeenCalledTimes(1));
  const data = vi.mocked(objectAction).mock.calls[0][1];
  expect(JSON.parse(String(data.get("payload"))).storageClass).toBe(
    "GLACIER_IR",
  );
  expect(data.get("acknowledge")).toBe("yes");
  expect(within(modal).getByRole("status").textContent).toBe(
    "1 succeeded / 1 failed",
  );
  expect(within(modal).getByText("Access denied")).toBeTruthy();
});

it("blocks oversized copies and encodes object and folder navigation", async () => {
  const user = userEvent.setup();
  show([{ ...rows[0], size: 6 * 1024 ** 3 }, rows[1]]);
  expect(screen.getByRole("link", { name: "sub/" }).getAttribute("href")).toBe(
    "/s3/test-bucket?prefix=folder%2Fsub%2F",
  );
  const target = screen
    .getByRole("link", { name: "雪 +?.txt" })
    .getAttribute("href")!;
  expect(new URL(target, "http://localhost").searchParams.get("key")).toBe(
    rows[1].key,
  );
  await user.click(screen.getByLabelText("Select folder/a.txt"));
  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(
    screen.getByRole("button", { name: "Change storage class" }),
  );
  const modal = screen.getByRole("dialog");
  await user.selectOptions(
    within(modal).getByLabelText("New storage class"),
    "STANDARD_IA",
  );
  await user.click(within(modal).getByRole("checkbox"));
  expect(
    (
      within(modal).getByRole("button", {
        name: "Change storage class",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(within(modal).getByRole("alert").textContent).toContain("5 GiB");
});

it("prevents closing or repeat submission while a mutation is pending", async () => {
  let finish!: (value: { results: [] }) => void;
  vi.mocked(objectAction).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  show();
  await user.click(screen.getByLabelText("Select folder/a.txt"));
  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(screen.getByRole("button", { name: "Delete objects" }));
  const modal = screen.getByRole("dialog");
  await user.type(within(modal).getByRole("textbox"), rows[0].key);
  await user.click(
    within(modal).getByRole("button", { name: "Delete selected objects" }),
  );
  expect(
    (within(modal).getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  const cancel = new Event("cancel", { cancelable: true });
  fireEvent(modal, cancel);
  expect(cancel.defaultPrevented).toBe(true);
  finish({ results: [] });
  await waitFor(() =>
    expect(within(modal).getByRole("button", { name: "Close" })).toBeTruthy(),
  );
});
