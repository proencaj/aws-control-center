// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./workspace";

const navigation = vi.hoisted(() => ({
  pathname: "/",
  params: new URLSearchParams("tab=directory&region=us-east-1"),
  push: vi.fn(),
  replace: vi.fn(),
}));
const setRegion = vi.hoisted(() => vi.fn(async (data: FormData) => { void data; }));
const router = { push: navigation.push, replace: navigation.replace };

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.params,
  useRouter: () => router,
}));
vi.mock("@/app/actions", () => ({ setRegion }));

const stored = {
  activeId: "directory",
  tabs: [
    { id: "directory", href: "/?tab=directory&region=us-east-1", service: "directory", title: "Directory", region: "us-east-1", lastActive: 2 },
    { id: "ec2", href: "/ec2?tab=ec2&region=us-west-2", service: "ec2", title: "EC2", region: "us-west-2", lastActive: 1 },
  ],
};

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  setRegion.mockClear();
  sessionStorage.setItem("aws-control-center.workspaces.v1", JSON.stringify(stored));
  window.history.replaceState(null, "", "/?tab=directory&region=us-east-1");
});
afterEach(cleanup);

it("restores workspaces and switches the account region before navigation", async () => {
  render(<WorkspaceShell initialRegion="us-east-1" regions={["us-east-1", "us-west-2"]} accounts={[]}><p>Directory content</p></WorkspaceShell>);

  const ec2 = await screen.findByRole("tab", { name: "EC2" });
  fireEvent.click(ec2);

  await waitFor(() => expect(setRegion).toHaveBeenCalledOnce());
  expect(setRegion.mock.calls[0][0].get("region")).toBe("us-west-2");
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/ec2?tab=ec2&region=us-west-2", { scroll: false }));
});

it("reuses the open tab for a service instead of duplicating it", async () => {
  render(<WorkspaceShell initialRegion="us-east-1" regions={["us-east-1"]} accounts={[]}><p>Directory content</p></WorkspaceShell>);

  expect(screen.queryByRole("button", { name: /Open another/ })).toBeNull();
  await screen.findByRole("tab", { name: "EC2" });
  fireEvent.click(screen.getByRole("button", { name: "EC2" }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/ec2?tab=ec2&region=us-west-2", { scroll: false }));
  expect(screen.getAllByRole("tab", { name: "EC2" })).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "Close EC2" }));
  await waitFor(() => expect(screen.queryByRole("tab", { name: "EC2" })).toBeNull());
});

it("splits into an iframe pane and unsplits keeping the left tabs", async () => {
  render(<WorkspaceShell initialRegion="us-east-1" regions={["us-east-1"]} accounts={[]}><p>Directory content</p></WorkspaceShell>);

  fireEvent.click(await screen.findByRole("button", { name: "Split screen" }));
  const frame = await screen.findByTitle("Right pane");
  expect(frame.getAttribute("src")).toBe("/");

  fireEvent.click(screen.getByRole("button", { name: "Single screen" }));
  await waitFor(() => expect(screen.queryByTitle("Right pane")).toBeNull());
  expect(sessionStorage.getItem("aws-control-center.workspaces.v1.right")).toBeNull();
  expect(screen.getByRole("tab", { name: "EC2" })).toBeTruthy();
});

it("sends sidebar clicks and region changes to the focused right pane", async () => {
  render(<WorkspaceShell initialRegion="us-east-1" regions={["us-east-1", "eu-west-1"]} accounts={[]}><p>Directory content</p></WorkspaceShell>);

  fireEvent.click(await screen.findByRole("button", { name: "Split screen" }));
  const frame = (await screen.findByTitle("Right pane")) as HTMLIFrameElement;
  const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
  const fromRight = (data: unknown) => act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin: window.location.origin, source: frame.contentWindow }));
  });

  fromRight({ type: "pane-focus" });
  fromRight({ type: "pane-state", service: "s3", region: "eu-west-1" });
  expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe("eu-west-1");

  fireEvent.click(screen.getByRole("button", { name: "S3" }));
  expect(postMessage).toHaveBeenCalledWith({ type: "open-service", href: "/s3" }, window.location.origin);
  expect(navigation.push).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "S3" }).getAttribute("aria-current")).toBe("page");

  // Messages from other windows are ignored.
  window.dispatchEvent(new MessageEvent("message", { data: { type: "pane-state", service: "ec2", region: "us-east-1" }, origin: window.location.origin, source: window }));
  expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe("eu-west-1");
});

it("uses Lambda title casing for restored service and resource tabs", async () => {
  sessionStorage.setItem("aws-control-center.workspaces.v1", JSON.stringify({
    activeId: "lambda",
    tabs: [
      { id: "lambda", href: "/lambda?tab=lambda&region=us-east-1", service: "lambda", title: "LAMBDA", region: "us-east-1", lastActive: 2 },
      { id: "function", href: "/lambda/functions/MyFunction?tab=function&region=us-east-1", service: "lambda", title: "LAMBDA · MyFunction", region: "us-east-1", lastActive: 1 },
    ],
  }));

  render(<WorkspaceShell initialRegion="us-east-1" regions={["us-east-1"]} accounts={[]}><p>Lambda content</p></WorkspaceShell>);

  expect(await screen.findByRole("tab", { name: "Lambda" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Lambda · MyFunction" })).toBeTruthy();
});

it("runs as the right pane inside an iframe: own storage, reports state, handles parent commands", async () => {
  const parent = { postMessage: vi.fn() };
  const originalTop = Object.getOwnPropertyDescriptor(window, "top")!;
  const originalParent = Object.getOwnPropertyDescriptor(window, "parent")!;
  Object.defineProperty(window, "top", { value: {}, configurable: true });
  Object.defineProperty(window, "parent", { value: parent, configurable: true });
  try {
    sessionStorage.setItem("aws-control-center.workspaces.v1.right", JSON.stringify(stored));
    render(<WorkspaceShell initialRegion="us-east-1" regions={["us-east-1"]} accounts={[]}><p>Directory content</p></WorkspaceShell>);

    await waitFor(() => expect(parent.postMessage).toHaveBeenCalledWith({ type: "pane-state", service: "directory", region: "us-east-1" }, window.location.origin));
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: "open-service", href: "/ec2" }, origin: window.location.origin, source: parent as unknown as Window }));
    });
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/ec2?tab=ec2&region=us-west-2", { scroll: false }));
    fireEvent.pointerDown(document.body);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: "pane-focus" }, window.location.origin);
  } finally {
    Object.defineProperty(window, "top", originalTop);
    Object.defineProperty(window, "parent", originalParent);
  }
});
