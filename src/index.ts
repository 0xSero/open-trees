import type { Plugin } from "@opencode-ai/plugin";

import { removeSessionMappings } from "./state";
import { createTools } from "./tools";

const OpenTreesPlugin: Plugin = async (ctx) => ({
  tool: createTools(ctx),
  event: async ({ event }) => {
    if (event.type !== "session.deleted") return;
    const sessionID =
      typeof event === "object" &&
      event !== null &&
      "properties" in event &&
      typeof event.properties === "object" &&
      event.properties !== null &&
      "info" in event.properties &&
      typeof event.properties.info === "object" &&
      event.properties.info !== null &&
      "id" in event.properties.info
        ? String((event.properties.info as { id?: string }).id ?? "")
        : "";

    if (!sessionID) return;
    await removeSessionMappings(sessionID);
  },
});

export default OpenTreesPlugin;
