// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PushCommands } from "./push-commands";

afterEach(cleanup);

it("builds AWS login, Docker build, tag, and push commands", () => {
  render(
    <PushCommands
      repositoryUri="123456789012.dkr.ecr.us-east-1.amazonaws.com/team/api"
      region="us-east-1"
    />,
  );
  fireEvent.change(screen.getByLabelText("AWS CLI profile (optional)"), {
    target: { value: "sandbox" },
  });
  expect(screen.getByText(/aws ecr get-login-password/).textContent).toContain(
    "--region 'us-east-1' --profile 'sandbox'",
  );
  expect(screen.getByText(/docker build/).textContent).toContain(
    "docker build -t 'my-image:latest' .",
  );
  expect(screen.getByText(/docker push/).textContent).toContain(
    "docker push '123456789012.dkr.ecr.us-east-1.amazonaws.com/team/api:latest'",
  );
});

it("switches to an existing image and shell-quotes user input", () => {
  render(
    <PushCommands
      repositoryUri="123456789012.dkr.ecr.us-east-1.amazonaws.com/team/api"
      region="us-east-1"
    />,
  );
  fireEvent.change(screen.getByLabelText("Workflow"), {
    target: { value: "existing" },
  });
  fireEvent.change(screen.getByLabelText("Existing image reference"), {
    target: { value: "local/api:v1" },
  });
  expect(screen.queryByText(/docker build/)).toBeNull();
  expect(screen.getByText(/docker tag/).textContent).toContain(
    "docker tag 'local/api:v1' '123456789012.dkr.ecr.us-east-1.amazonaws.com/team/api:latest'",
  );
});
