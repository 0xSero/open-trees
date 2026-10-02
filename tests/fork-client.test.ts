import { expect, test } from "bun:test";
import { existsSync } from "node:fs";

test("fork service verification cancels a stalled server.info request", async () => {
  const file = new URL("../src/fork-client.ts", import.meta.url);
  const module = existsSync(file) ? await import(file.href) : {};
  expect(typeof module.verifyForkClient).toBe("function");
  const controller = new AbortController();
  const client = {
    server: {
      info: ({ signal }: { signal?: AbortSignal }) =>
        new Promise<{ pid: number }>((_resolve, reject) => {
          if (!signal) throw new Error("No request cancellation signal was forwarded");
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    },
  };
  const pending = module.verifyForkClient(client, 123, controller.signal);
  controller.abort(new Error("Test cancellation"));
  await expect(pending).rejects.toThrow("Test cancellation");
});
