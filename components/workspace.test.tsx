// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

it("opens another workspace for the same service and closes it", async () => {
  render(<WorkspaceShell initialRegion="us-east-1" regions={["us-east-1"]} accounts={[]}><p>Directory content</p></WorkspaceShell>);

  const open = await screen.findByRole("button", { name: "Open another EC2 tab" });
  fireEvent.click(open);
  await waitFor(() => expect(screen.getAllByRole("tab", { name: "EC2" })).toHaveLength(2));

  const closeButtons = screen.getAllByRole("button", { name: "Close EC2" });
  fireEvent.click(closeButtons.at(-1)!);
  await waitFor(() => expect(screen.getAllByRole("tab", { name: "EC2" })).toHaveLength(1));
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
