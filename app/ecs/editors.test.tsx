// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDefinitionEditor, WorkloadEditor } from "./editors";
import { JsonForm, Picker } from "./controls";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const definition = {
  family: "web",
  requiresCompatibilities: ["FARGATE"],
  networkMode: "awsvpc",
  cpu: "256",
  memory: "512",
  containerDefinitions: [
    {
      name: "app",
      image: "nginx",
      healthCheck: { command: ["CMD", "true"], interval: 30 },
      environment: [],
      secrets: [{ name: "DB", valueFrom: "arn:secret:reference" }],
    },
  ],
  volumes: [{ name: "data", host: { sourcePath: "/data" } }],
};
const payload = (container: HTMLElement) =>
  JSON.parse(
    (container.querySelector('input[name="payload"]') as HTMLInputElement)
      .value,
  );
describe("guided task definition editor", () => {
  it("retains advanced fields through guided edits and JSON round trips", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TaskDefinitionEditor
        action={async () => ({})}
        initial={definition}
        region="us-east-1"
      />,
    );
    await user.clear(screen.getByLabelText("Image URI"));
    await user.type(screen.getByLabelText("Image URI"), "nginx:stable");
    await user.click(screen.getByRole("button", { name: "Edit JSON" }));
    const json = screen.getByLabelText(
      "Registration JSON",
    ) as HTMLTextAreaElement;
    expect(JSON.parse(json.value).containerDefinitions[0].healthCheck).toEqual(
      definition.containerDefinitions[0].healthCheck,
    );
    const updated = JSON.parse(json.value);
    updated.containerDefinitions[0].command = ["serve", "--port=80"];
    fireEvent.change(json, { target: { value: JSON.stringify(updated) } });
    await user.click(screen.getByRole("button", { name: "Guided form" }));
    expect(payload(container).containerDefinitions[0]).toMatchObject({
      image: "nginx:stable",
      command: ["serve", "--port=80"],
      healthCheck: definition.containerDefinitions[0].healthCheck,
      secrets: definition.containerDefinitions[0].secrets,
    });
    expect(payload(container).volumes).toEqual(definition.volumes);
  });
  it("does not discard invalid JSON when switching modes", async () => {
    const user = userEvent.setup();
    render(
      <TaskDefinitionEditor
        action={async () => ({})}
        initial={definition}
        region="us-east-1"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit JSON" }));
    fireEvent.change(screen.getByLabelText("Registration JSON"), {
      target: { value: "{invalid" },
    });
    await user.click(screen.getByRole("button", { name: "Guided form" }));
    expect(screen.getByRole("alert").textContent).toContain("JSON object");
    expect(
      (screen.getByLabelText("Registration JSON") as HTMLTextAreaElement).value,
    ).toBe("{invalid");
  });
  it("marks invalid nested JSON as invalid instead of silently submitting the last good value", async () => {
    render(
      <TaskDefinitionEditor
        action={async () => ({})}
        initial={definition}
        region="us-east-1"
      />,
    );
    const ports = screen.getByLabelText("Port mappings") as HTMLTextAreaElement;
    fireEvent.change(ports, { target: { value: "[invalid" } });
    expect(ports.checkValidity()).toBe(false);
    fireEvent.change(ports, { target: { value: "[]" } });
    expect(ports.checkValidity()).toBe(true);
  });
});
describe("workload request identity", () => {
  it("retains its client token across rerenders after actions", () => {
    const action = async () => ({});
    const initial = { taskDefinition: "web:1", launchType: "EC2", count: 1 };
    const { container, rerender } = render(
      <WorkloadEditor
        action={action}
        initial={initial}
        mode="run"
        region="us-east-1"
        clientToken="first"
      />,
    );
    rerender(
      <WorkloadEditor
        action={action}
        initial={initial}
        mode="run"
        region="us-east-1"
        clientToken="second"
      />,
    );
    expect(
      (container.querySelector('input[name="clientToken"]') as HTMLInputElement)
        .value,
    ).toBe("first");
  });
  it("preserves confirmation text in submitted FormData when the dialog closes", async () => {
    const user = userEvent.setup();
    let received: FormData | undefined;
    render(
      <JsonForm
        initial={{ desiredCount: 0 }}
        confirmationName="web"
        action={async (_previous, data) => {
          received = data;
          return { message: "Accepted" };
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    const buttons = screen.getAllByRole("button", { name: "Save" });
    expect((buttons[buttons.length - 1] as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.type(screen.getByLabelText("Confirmation"), "web");
    await user.click(screen.getAllByRole("button", { name: "Save" }).at(-1)!);
    await waitFor(() => expect(received?.get("confirm")).toBe("web"));
    expect(received?.get("payload")).toContain('"desiredCount": 0');
    expect(screen.getByRole("status").textContent).toBe("Accepted");
  });
});
describe("bounded resource picker", () => {
  it("replaces pages rather than accumulating an unbounded list", async () => {
    const user = userEvent.setup(),
      select = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resources: [{ id: "one", label: "First" }],
          nextToken: "page2",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: [{ id: "two", label: "Second" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<Picker region="us-east-1" kind="subnets" onSelect={select} />);
    await user.click(screen.getByRole("button", { name: "Browse existing" }));
    await user.click(await screen.findByRole("button", { name: "Next page" }));
    await screen.findByRole("option", { name: "Second" });
    expect(screen.queryByRole("option", { name: "First" })).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toContain("next=page2");
    await user.selectOptions(screen.getByRole("combobox"), "two");
    expect(select).toHaveBeenCalledWith("two");
  });
  it("shows access errors with manual-entry guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Access denied" }),
      }),
    );
    render(<Picker region="us-east-1" kind="roles" onSelect={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Browse existing" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "enter the identifier directly",
    );
  });
});

describe("pending submissions", () => {
  it("disables the form while a request is pending and shows errors after completion", async () => {
    const user = userEvent.setup();
    let resolve: (state: { error: string }) => void = () => {};
    const response = new Promise<{ error: string }>((done) => {
      resolve = done;
    });
    render(
      <JsonForm
        initial={{ count: 1 }}
        action={async () => response}
        label="Run"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(
      (
        screen.getByLabelText("Configuration JSON") as HTMLTextAreaElement
      ).closest("fieldset")?.disabled,
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Submitting");
    resolve({ error: "Access denied" });
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toBe("Access denied");
  });
});
