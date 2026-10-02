// Native V2 port of 0xSero/open-trees 1.0.1, upstream commit
// 924b279b4aa153f806d6e18b0bde217499d1a24b. Pure domain helpers retain MIT license.
import { Plugin } from "@opencode/plugin";
import type { WorktreeContext } from "./context";
import { verifyForkClient } from "./fork-client";
import { OpenTreesEvents } from "./rpc";
import { removeSessionMappings } from "./state";
import { createTools } from "./tools";

export default Plugin.define({
  id: "open-trees",
  async setup(ctx) {
    const ui = await ctx.rpc.register(OpenTreesEvents, {});
    // Most native methods are available in the plugin context. Fork is exposed
    // by the full public V2 client; discover the existing service, never start
    // another server, and verify it is this host before using it.
    const getClient = async (signal?: AbortSignal) => {
      signal?.throwIfAborted();
      const [{ OpenCode }, { Service }] = await Promise.all([
        import("@opencode/client"),
        import("@opencode/client/service"),
      ]);
      signal?.throwIfAborted();
      const endpoint = await Service.discover();
      signal?.throwIfAborted();
      if (!endpoint)
        throw new Error("No managed OpenCode V2 service is available for session fork.");
      const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
      return verifyForkClient(client, process.pid, signal);
    };
    const runtime: WorktreeContext = {
      directory: ctx.location.directory,
      worktree: ctx.location.project.directory,
      session: {
        create: (input, options) => ctx.session.create(input, options),
        get: (input, options) => ctx.session.get(input, options),
        update: (input, options) => ctx.session.update(input, options),
        move: (input, options) => ctx.session.move(input, options),
        wait: (input, options) => ctx.session.wait(input, options),
        fork: async (input, options) =>
          (await getClient(options?.signal)).session.fork(input, options),
      },
      ensureForkAvailable: async (signal) => {
        await getClient(signal);
      },
      openSessions: async (sessionID) => {
        await ui.events.emit("openSessions", { sessionID });
      },
    };
    await ctx.tool.transform((editor) => {
      for (const tool of createTools(runtime)) editor.add(tool);
    });
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event.type !== "session.deleted") continue;
          // State is shared across locations. The operation is idempotent, so
          // cleanup also works for a mapped session deleted from another tab.
          await removeSessionMappings(event.data.sessionID);
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn("open-trees session cleanup stopped:", error);
      }
    })();
    return () => controller.abort();
  },
});
