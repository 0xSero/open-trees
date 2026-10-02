import { describe, expect, test } from "bun:test";
import type { RpcClient, RpcEventPayload, SessionApi, SessionInfo } from "@opencode/client";
import type { Plugin } from "@opencode/plugin/tui";
import type {
  Destination,
  DialogSelectOptions,
  Route,
  ToastOptions,
} from "@opencode/plugin/tui/context";
import type { OpenTreesEvents } from "../src/rpc";
import tui from "../src/tui";

type SessionPage = Awaited<ReturnType<SessionApi["list"]>>;
type PickerEvent = RpcEventPayload<typeof OpenTreesEvents, "openSessions">;
type PickerHandler = (event: PickerEvent) => Promise<void> | void;
type PickerOptions = DialogSelectOptions<string>;

const fixtureDirectory = "/fixture/picker-lifecycle";

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function session(id: string, title?: string): SessionInfo {
  return {
    id,
    title,
    projectID: "project_picker",
    location: { directory: `${fixtureDirectory}/${id}` },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 2 },
  };
}

async function pickerFixture(
  options: {
    list?: SessionApi["list"];
    select?: (options: PickerOptions) => Promise<string | undefined>;
  } = {},
) {
  let handler: PickerHandler | undefined;
  let route: Route = { type: "session", sessionID: "ses_parent" };
  let unsubscribed = false;
  let activeDialog: "picker" | "foreign" | undefined;
  let cleared = 0;
  const opened = deferred<void>();
  const requests: Array<{
    input: Parameters<SessionApi["list"]>[0];
    signal: AbortSignal | undefined;
  }> = [];
  const dialogs: PickerOptions[] = [];
  const navigations: Destination[] = [];
  const toasts: ToastOptions[] = [];
  const events: Pick<RpcClient<typeof OpenTreesEvents>["events"], "on"> = {
    on: (_name, callback) => {
      handler = callback;
      return () => {
        unsubscribed = true;
      };
    },
  };
  const api: Pick<SessionApi, "list"> = {
    list: async (input, requestOptions) => {
      requests.push({ input, signal: requestOptions?.signal });
      return options.list
        ? options.list(input, requestOptions)
        : { data: [session("ses_target", "wt:target")], cursor: {} };
    },
  };
  const cleanup = await tui.setup({
    client: { rpc: () => ({ events }), session: api },
    ui: {
      router: {
        current: () => route,
        navigate: (destination: Destination) => {
          navigations.push(destination);
          if (destination.type !== "plugin") route = destination;
        },
      },
      dialog: {
        select: (input: PickerOptions) => {
          dialogs.push(input);
          activeDialog = "picker";
          opened.resolve();
          return options.select ? options.select(input) : Promise.resolve(undefined);
        },
        clear: () => {
          cleared++;
          activeDialog = undefined;
        },
      },
      toast: { show: (input: ToastOptions) => toasts.push(input) },
    },
  } as unknown as Plugin.Context);
  if (typeof cleanup !== "function" || !handler) {
    throw new Error("The native picker must register a listener and return cleanup");
  }
  const callback = handler;
  return {
    cleanup,
    requests,
    dialogs,
    navigations,
    toasts,
    opened: opened.promise,
    unsubscribed: () => unsubscribed,
    cleared: () => cleared,
    activeDialog: () => activeDialog,
    foreignDialog: () => {
      activeDialog = "foreign";
    },
    routeTo: (next: Route) => {
      route = next;
    },
    emit: (sessionID = "ses_parent") =>
      Promise.resolve(
        callback({
          id: "event_picker",
          created: 1,
          type: "rpc.open-trees.openSessions",
          location: { directory: fixtureDirectory },
          data: { sessionID },
        }),
      ),
  };
}

describe("native worktree session picker lifecycle", () => {
  test("keeps native selection, titles, fallback IDs, and worktree directories", async () => {
    const f = await pickerFixture({
      list: async () => ({
        data: [session("ses_named", "wt:named"), session("ses_untitled")],
        cursor: {},
      }),
      select: async () => "ses_untitled",
    });
    await f.emit();
    expect(f.dialogs[0]).toEqual({
      title: "Worktree sessions",
      options: [
        {
          title: "wt:named",
          value: "ses_named",
          description: `${fixtureDirectory}/ses_named`,
        },
        {
          title: "ses_untitled",
          value: "ses_untitled",
          description: `${fixtureDirectory}/ses_untitled`,
        },
      ],
    });
    expect(f.navigations).toEqual([{ type: "session", sessionID: "ses_untitled" }]);
    expect(f.toasts).toEqual([]);
    await f.cleanup();
    expect(f.unsubscribed()).toBe(true);
  });

  test("ignores events for a different session or a non-session route", async () => {
    const f = await pickerFixture();
    await f.emit("ses_other");
    f.routeTo({ type: "home" });
    await f.emit();
    expect(f.requests).toEqual([]);
    expect(f.dialogs).toEqual([]);
  });

  test("unload prevents a delayed session response from opening a picker", async () => {
    const response = deferred<SessionPage>();
    const f = await pickerFixture({ list: () => response.promise });
    const pending = f.emit();
    await f.cleanup();
    response.resolve({ data: [session("ses_late")], cursor: {} });
    await pending;
    expect(f.dialogs).toEqual([]);
    expect(f.navigations).toEqual([]);
    expect(f.toasts).toEqual([]);
  });

  test("unload aborts the signal forwarded to the native session API", async () => {
    const response = deferred<SessionPage>();
    const f = await pickerFixture({ list: () => response.promise });
    const pending = f.emit();
    await f.cleanup();
    response.resolve({ data: [], cursor: {} });
    await pending;
    expect(f.requests[0].signal).toBeInstanceOf(AbortSignal);
    expect(f.requests[0].signal?.aborted).toBe(true);
  });

  test("switching sessions while listing prevents both pagination and the dialog", async () => {
    const response = deferred<SessionPage>();
    const f = await pickerFixture({ list: () => response.promise });
    const pending = f.emit();
    f.routeTo({ type: "session", sessionID: "ses_other" });
    response.resolve({ data: [session("ses_late")], cursor: { next: "unused-next-page" } });
    await pending;
    expect(f.requests).toHaveLength(1);
    expect(f.dialogs).toEqual([]);
    expect(f.navigations).toEqual([]);
  });

  test("unload discards a delayed selection without clearing a foreign dialog", async () => {
    const selection = deferred<string | undefined>();
    const f = await pickerFixture({ select: () => selection.promise });
    const pending = f.emit();
    await f.opened;
    f.foreignDialog();
    await f.cleanup();
    selection.resolve("ses_target");
    await pending;
    expect(f.navigations).toEqual([]);
    expect(f.cleared()).toBe(0);
    expect(f.activeDialog()).toBe("foreign");
    expect(f.toasts).toEqual([]);
  });

  test("switching sessions while selecting does not navigate back to a stale choice", async () => {
    const selection = deferred<string | undefined>();
    const f = await pickerFixture({ select: () => selection.promise });
    const pending = f.emit();
    await f.opened;
    f.routeTo({ type: "session", sessionID: "ses_other" });
    selection.resolve("ses_target");
    await pending;
    expect(f.navigations).toEqual([]);
    expect(f.toasts).toEqual([]);
  });

  test("unload suppresses a delayed API failure instead of showing a stale toast", async () => {
    const response = deferred<SessionPage>();
    const f = await pickerFixture({ list: () => response.promise });
    const pending = f.emit();
    await f.cleanup();
    response.reject(new Error("Request was cancelled"));
    await pending;
    expect(f.toasts).toEqual([]);
    expect(f.dialogs).toEqual([]);
  });

  test("leaving the session suppresses a delayed selection failure", async () => {
    const selection = deferred<string | undefined>();
    const f = await pickerFixture({ select: () => selection.promise });
    const pending = f.emit();
    await f.opened;
    f.routeTo({ type: "home" });
    selection.reject(new Error("Dialog was replaced"));
    await pending;
    expect(f.toasts).toEqual([]);
    expect(f.navigations).toEqual([]);
  });

  test("still reports a session API failure when the requesting session is active", async () => {
    const f = await pickerFixture({
      list: async () => {
        throw new Error("Session service unavailable");
      },
    });
    await f.emit();
    expect(f.toasts).toEqual([
      { title: "Open Trees", message: "Session service unavailable", variant: "error" },
    ]);
    expect(f.dialogs).toEqual([]);
    expect(f.navigations).toEqual([]);
  });
});

describe("native worktree session picker pagination", () => {
  test("includes all 51 swarm sessions and can select the session beyond the default page", async () => {
    const swarm = Array.from({ length: 51 }, (_, index) =>
      session(`ses_task_${index + 1}`, `wt:task-${index + 1}`),
    );
    const f = await pickerFixture({
      list: async (input) => {
        if (input?.cursor === undefined) {
          return { data: swarm.slice(0, 50), cursor: { next: "opaque-page-2" } };
        }
        if (input.cursor === "opaque-page-2") {
          return { data: swarm.slice(50), cursor: { previous: "opaque-page-1", next: null } };
        }
        throw new Error(`Unexpected cursor: ${input.cursor}`);
      },
      select: async (input) =>
        input.options.find((option) => option.value === "ses_task_51")?.value,
    });
    await f.emit();
    expect(f.dialogs[0].options).toHaveLength(51);
    expect(f.dialogs[0].options[50]).toEqual({
      title: "wt:task-51",
      value: "ses_task_51",
      description: `${fixtureDirectory}/ses_task_51`,
    });
    expect(f.navigations).toEqual([{ type: "session", sessionID: "ses_task_51" }]);
    expect(f.requests.map((request) => request.input?.cursor)).toEqual([
      undefined,
      "opaque-page-2",
    ]);
    expect(f.toasts).toEqual([]);
  });

  test("uses opaque next cursors even for short or empty intermediate pages", async () => {
    const pages = new Map<string | undefined, SessionPage>([
      [undefined, { data: [session("ses_first")], cursor: { next: "opaque:second/+=" } }],
      ["opaque:second/+=", { data: [], cursor: { next: "opaque:third/+=", previous: "back" } }],
      ["opaque:third/+=", { data: [session("ses_last")], cursor: { previous: "back-again" } }],
    ]);
    const f = await pickerFixture({
      list: async (input) => {
        const page = pages.get(input?.cursor);
        if (!page) throw new Error(`Unexpected cursor: ${input?.cursor}`);
        return page;
      },
    });
    await f.emit();
    expect(f.requests.map((request) => request.input?.cursor)).toEqual([
      undefined,
      "opaque:second/+=",
      "opaque:third/+=",
    ]);
    expect(f.dialogs[0].options.map((option) => option.value)).toEqual(["ses_first", "ses_last"]);
    expect(f.requests[0].signal).toBeInstanceOf(AbortSignal);
    expect(f.requests.every((request) => request.signal === f.requests[0].signal)).toBe(true);
    expect(f.toasts).toEqual([]);
  });

  test("unload during a later page aborts loading and never presents partial sessions", async () => {
    const response = deferred<SessionPage>();
    const requested = deferred<void>();
    const f = await pickerFixture({
      list: async (input) => {
        if (input?.cursor === undefined) {
          return { data: [session("ses_first")], cursor: { next: "second-page" } };
        }
        if (input.cursor !== "second-page") throw new Error("Fetched a stale third page");
        requested.resolve();
        return response.promise;
      },
    });
    const pending = f.emit();
    await Promise.race([requested.promise, pending]);
    expect(f.requests).toHaveLength(2);
    await f.cleanup();
    response.resolve({ data: [session("ses_second")], cursor: { next: "stale-third-page" } });
    await pending;
    expect(f.requests).toHaveLength(2);
    expect(f.requests.every((request) => request.signal?.aborted)).toBe(true);
    expect(f.dialogs).toEqual([]);
    expect(f.navigations).toEqual([]);
    expect(f.toasts).toEqual([]);
  });

  test("leaving the requesting session during a later page stops the remaining pages", async () => {
    const response = deferred<SessionPage>();
    const requested = deferred<void>();
    const f = await pickerFixture({
      list: async (input) => {
        if (input?.cursor === undefined) {
          return { data: [session("ses_first")], cursor: { next: "second-page" } };
        }
        if (input.cursor !== "second-page") throw new Error("Fetched a stale third page");
        requested.resolve();
        return response.promise;
      },
    });
    const pending = f.emit();
    await Promise.race([requested.promise, pending]);
    expect(f.requests).toHaveLength(2);
    f.routeTo({ type: "home" });
    response.resolve({ data: [session("ses_second")], cursor: { next: "stale-third-page" } });
    await pending;
    expect(f.requests).toHaveLength(2);
    expect(f.dialogs).toEqual([]);
    expect(f.navigations).toEqual([]);
    expect(f.toasts).toEqual([]);
  });
});
