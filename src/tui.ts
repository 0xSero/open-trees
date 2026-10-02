import type { SessionInfo } from "@opencode/client";
import type { Plugin } from "@opencode/plugin/tui";
import { OpenTreesEvents } from "./rpc";

const plugin: Plugin.Definition = {
  id: "open-trees",
  setup(context) {
    const ui = context.client.rpc(OpenTreesEvents);
    const controller = new AbortController();
    const stop = ui.events.on("openSessions", async (event) => {
      const data = event.data as { sessionID: string };
      const isCurrent = () => {
        if (controller.signal.aborted) return false;
        const route = context.ui.router.current();
        return route.type === "session" && route.sessionID === data.sessionID;
      };
      if (!isCurrent()) return;
      try {
        const sessions: SessionInfo[] = [];
        let cursor: string | undefined;
        do {
          const page = await context.client.session.list(
            cursor === undefined ? undefined : { cursor },
            { signal: controller.signal },
          );
          if (!isCurrent()) return;
          sessions.push(...page.data);
          cursor = page.cursor?.next ?? undefined;
        } while (cursor !== undefined);
        const selected = await context.ui.dialog.select({
          title: "Worktree sessions",
          options: sessions.map((session) => ({
            title: session.title ?? session.id,
            value: session.id,
            description: session.location.directory,
          })),
        });
        if (!isCurrent()) return;
        if (selected) context.ui.router.navigate({ type: "session", sessionID: selected });
      } catch (error) {
        if (!isCurrent()) return;
        context.ui.toast.show({
          title: "Open Trees",
          message: error instanceof Error ? error.message : String(error),
          variant: "error",
        });
      }
    });
    return () => {
      // Selection dialogs have no owner-scoped close API; discard their late results instead.
      controller.abort();
      stop();
    };
  },
};

export default plugin;
