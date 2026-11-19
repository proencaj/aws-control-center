import { afterEach, expect, it, vi } from "vitest";
afterEach(() => vi.unstubAllGlobals());
it("supports literal, regex and case-sensitive matches and rejects invalid regex", async () => {
  const postMessage = vi.fn();
  const worker = {
    postMessage,
    onmessage: (event: { data: unknown }) => {
      void event;
    },
  };
  vi.stubGlobal("self", worker);
  await import("./search.worker");
  const search = (term: string, regex = false, sensitive = false) => {
    worker.onmessage({
      data: { cells: [["a.b A.B axb"]], term, regex, sensitive },
    });
    return postMessage.mock.lastCall![0];
  };
  expect(search("a.b").matches).toHaveLength(2);
  expect(search("a.b", true).matches).toHaveLength(3);
  expect(search("a.b", false, true).matches).toHaveLength(1);
  expect(search("[", true).error).toBe("Invalid regular expression.");
});
