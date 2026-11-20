export type DebuggerRequest = {
  logs: string;
  full: boolean;
  errors: boolean;
  language: "en" | "pt-br";
};

// Client navigation keeps modules alive, so the AI Debugger tab picks this up when it activates.
let pending: DebuggerRequest | undefined;

export function sendToDebugger(request: DebuggerRequest) {
  pending = request;
}

export function takeDebuggerRequest() {
  const request = pending;
  pending = undefined;
  return request;
}
