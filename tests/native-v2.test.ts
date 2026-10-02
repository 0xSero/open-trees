import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const nativeRoot = fileURLToPath(new URL("../", import.meta.url));
const tempRoot = process.env.OPENCODE_TEST_TMPDIR ?? tmpdir();
const fixtures: Array<{
  root: string;
  cleanup: () => Promise<void>;
  env: Record<string, string | undefined>;
}> = [];
type SessionRequest = { sessionID: string };
type TestSession = {
  id: string;
  location: { directory: string };
  title: string;
  time: { created: number; updated: number };
};
type TestContext = {
  sessionID: string;
  agent: string;
  messageID: string;
  id: string;
  signal: AbortSignal;
  progress: () => Promise<void>;
};
type TestTool = {
  name: string;
  execute: (input: unknown, context: TestContext) => Promise<{ content: string }>;
};
type TestEvent = { type: string; location: { directory: string }; data: SessionRequest };
type PickerEvent = { data: SessionRequest };

afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    await f.cleanup();
    for (const [key, value] of Object.entries(f.env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(f.root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = mkdtempSync(join(tempRoot, "open-trees-v2-test-"));
  const repo = join(root, "repo");
  const config = join(root, "config");
  mkdirSync(repo);
  mkdirSync(config);
  const env = Object.fromEntries(
    ["XDG_CONFIG_HOME", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"].map((name) => [
      name,
      process.env[name],
    ]),
  );
  process.env.XDG_CONFIG_HOME = config;
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  process.env.GIT_CONFIG_SYSTEM = "/dev/null";
  let cleanup: (() => void | Promise<void>) | undefined;
  fixtures.push({
    root,
    env,
    cleanup: async () => {
      await cleanup?.();
    },
  });
  const module = await import(pathToFileURL(join(nativeRoot, "src", "index.ts")).href);
  expect(typeof module.default?.setup).toBe("function");
  expect(module.default.id).toBe("open-trees");
  const git = (...args: string[]) => {
    const result = spawnSync("git", ["-C", repo, "-c", "core.hooksPath=/dev/null", ...args], {
      encoding: "utf8",
    });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  git("init", "--initial-branch=main");
  writeFileSync(join(repo, "tracked.txt"), "original\n");
  git("add", "tracked.txt");
  git(
    "-c",
    "user.name=Plugin Tests",
    "-c",
    "user.email=plugin-tests@example.invalid",
    "commit",
    "-m",
    "Fixture",
  );
  const requests: Array<{ operation: string; input: unknown }> = [];
  const notices: SessionRequest[] = [];
  const sessions = new Map<string, TestSession>();
  sessions.set("ses_parent", {
    id: "ses_parent",
    location: { directory: repo },
    title: "Parent",
    time: { created: 1, updated: 2 },
  });
  const requireSession = (sessionID: string) => {
    const session = sessions.get(sessionID);
    if (!session) throw new Error(`Unknown fixture session: ${sessionID}`);
    return session;
  };
  let nextID = 0;
  const sessionApi = {
    create: async (input: { location: { directory: string }; title: string }) => {
      requests.push({ operation: "create", input });
      const result = {
        id: `ses_created_${++nextID}`,
        location: input.location,
        title: input.title,
        time: { created: 1, updated: 2 },
      };
      sessions.set(result.id, result);
      return result;
    },
    get: async (input: SessionRequest) => {
      requests.push({ operation: "get", input });
      return sessions.get(input.sessionID);
    },
    update: async (input: SessionRequest & { title: string }) => {
      requests.push({ operation: "update", input });
      const value = { ...requireSession(input.sessionID), title: input.title };
      sessions.set(input.sessionID, value);
      return value;
    },
    fork: async (input: SessionRequest) => {
      requests.push({ operation: "fork", input });
      const value = { ...requireSession(input.sessionID), id: `ses_fork_${++nextID}` };
      sessions.set(value.id, value);
      return value;
    },
    move: async (input: SessionRequest & { directory: string }) => {
      requests.push({ operation: "move", input });
      requireSession(input.sessionID).location = { directory: input.directory };
      return { type: "move" };
    },
    wait: async (input: SessionRequest) => {
      requests.push({ operation: "wait", input });
      return sessions.get(input.sessionID);
    },
  };
  const runtime = {
    directory: repo,
    worktree: repo,
    session: sessionApi,
    ensureForkAvailable: async () => {},
    openSessions: async (sessionID: string) => {
      notices.push({ sessionID });
    },
  };
  const { createTools } = await import(pathToFileURL(join(nativeRoot, "src", "tools.ts")).href);
  const tools = new Map<string, TestTool>(
    createTools(runtime).map((tool: TestTool) => [tool.name, tool]),
  );
  const call = async (name: string, input: unknown = {}, options: Partial<TestContext> = {}) => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`Native tool was not registered: ${name}`);
    const result = await tool.execute(input, {
      sessionID: "ses_parent",
      agent: "build",
      messageID: "msg_test",
      id: "call_test",
      signal: new AbortController().signal,
      progress: async () => {},
      ...options,
    });
    expect(typeof result.content).toBe("string");
    return result.content as string;
  };
  const queue: Array<{ event: TestEvent; done: () => void }> = [];
  let wake: (() => void) | undefined;
  let eventSignal: AbortSignal | undefined;
  const register = async () => {
    const catalog: TestTool[] = [];
    cleanup = await module.default.setup({
      app: { version: "2.0.18" },
      options: {},
      location: {
        directory: repo,
        project: { id: "project_test", directory: repo, canonical: repo },
      },
      session: sessionApi,
      tool: {
        transform: async (callback: (editor: { add: (tool: TestTool) => void }) => void) => {
          callback({ add: (tool: TestTool) => catalog.push(tool) });
          return { dispose: async () => {} };
        },
      },
      rpc: {
        register: async () => ({ events: { emit: async () => {} }, dispose: async () => {} }),
      },
      event: {
        subscribe: ({ signal }: { signal: AbortSignal }) => {
          eventSignal = signal;
          signal.addEventListener("abort", () => wake?.(), { once: true });
          return (async function* () {
            while (!signal.aborted) {
              if (!queue.length)
                await new Promise<void>((resolve) => {
                  wake = resolve;
                });
              if (signal.aborted) return;
              const item = queue.shift();
              if (!item) continue;
              yield item.event;
              item.done();
            }
          })();
        },
      },
    });
    return catalog;
  };
  return {
    root,
    repo,
    config,
    git,
    call,
    tools,
    requests,
    notices,
    sessions,
    runtime,
    register,
    state: () =>
      JSON.parse(readFileSync(join(config, "opencode", "open-trees", "state.json"), "utf8")),
    emit: (event: TestEvent) =>
      new Promise<void>((resolve) => {
        queue.push({ event, done: resolve });
        wake?.();
      }),
    cleanup: async () => {
      await cleanup?.();
    },
    signal: () => eventSignal,
  };
}

describe("open-trees native V2", () => {
  test("registers all four native tools and keeps worktree mode gating", async () => {
    const f = await fixture();
    expect((await f.register()).map((tool) => tool.name)).toEqual([
      "worktree_mode",
      "worktree_overview",
      "worktree_make",
      "worktree_cleanup",
    ]);
    expect(await f.call("worktree_overview")).toContain("Worktree mode is off");
    expect(await f.call("worktree_mode", { action: "on" })).toContain("Worktree mode is now ON");
    expect(await f.call("worktree_mode", { action: "help" })).toContain("worktree_cleanup");
    expect(await f.call("worktree_mode", { action: "off" })).toContain("Worktree mode is now OFF");
    expect(await f.call("worktree_mode")).toContain("Worktree mode: OFF");
  });

  test("lists worktrees and their dirty status using the real Git repository", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    expect(await f.call("worktree_overview")).toContain(f.repo);
    writeFileSync(join(f.repo, "tracked.txt"), "changed\n");
    expect(await f.call("worktree_overview", { view: "status", porcelain: true })).toContain(
      "dirty",
    );
  });

  test("creates a normalized branch and default worktree without changing the source", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    expect(await f.call("worktree_make", { action: "create", name: "Feature Audit" })).toContain(
      "Branch: feature-audit",
    );
    expect(readFileSync(join(f.repo, ".worktrees", "feature-audit", "tracked.txt"), "utf8")).toBe(
      "original\n",
    );
    expect(f.git("branch", "--show-current")).toBe("main");
  });

  test("refuses path traversal and leaves the outside path absent", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    expect(
      await f.call("worktree_make", { action: "create", name: "safe", path: "../../escape" }),
    ).toContain("Worktree path must stay within");
    expect(existsSync(join(f.root, "escape"))).toBe(false);
  });

  test("refuses an occupied worktree directory without overwriting its files", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    const target = join(f.repo, ".worktrees", "occupied");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "keep.txt"), "keep");
    expect(await f.call("worktree_make", { action: "create", name: "occupied" })).toContain(
      "not empty",
    );
    expect(readFileSync(join(target, "keep.txt"), "utf8")).toBe("keep");
  });

  test("refuses dirty removal unless force is explicitly supplied", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    await f.call("worktree_make", { action: "create", name: "dirty" });
    const path = join(f.repo, ".worktrees", "dirty");
    writeFileSync(join(path, "uncommitted.txt"), "must not disappear");
    expect(await f.call("worktree_cleanup", { action: "remove", pathOrBranch: "dirty" })).toContain(
      "uncommitted changes",
    );
    expect(readFileSync(join(path, "uncommitted.txt"), "utf8")).toBe("must not disappear");
    expect(
      await f.call("worktree_cleanup", { action: "remove", pathOrBranch: "dirty", force: true }),
    ).toContain("Worktree removed");
    expect(existsSync(path)).toBe(false);
  });

  test("starts a native session in its worktree and preserves the state-file format", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    expect(
      await f.call("worktree_make", { action: "start", name: "session", openSessions: true }),
    ).toContain("Worktree session created");
    const path = join(f.repo, ".worktrees", "session");
    expect(f.requests[0]).toEqual({
      operation: "create",
      input: { location: { directory: path }, title: "wt:session" },
    });
    expect(f.state().entries[0]).toMatchObject({
      worktreePath: path,
      branch: "session",
      sessionID: "ses_created_1",
    });
    expect(f.notices[0]).toEqual({ sessionID: "ses_parent" });
  });

  test("opens an existing worktree without creating a second branch or checkout", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    await f.call("worktree_make", { action: "create", name: "existing" });
    expect(await f.call("worktree_make", { action: "open", pathOrBranch: "existing" })).toContain(
      "existing worktree",
    );
    expect(f.git("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(2);
  });

  test("forks through V2 then moves and waits for the fork's target location", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    expect(await f.call("worktree_make", { action: "fork", name: "forked" })).toContain(
      "Worktree session created",
    );
    const path = join(f.repo, ".worktrees", "forked");
    expect(f.requests.slice(0, 3)).toEqual([
      { operation: "fork", input: { sessionID: "ses_parent" } },
      { operation: "move", input: { sessionID: "ses_fork_1", directory: path } },
      { operation: "wait", input: { sessionID: "ses_fork_1" } },
    ]);
    expect(f.sessions.get("ses_fork_1")?.location.directory).toBe(path);
    expect(f.state().entries[0]).toMatchObject({ worktreePath: path, sessionID: "ses_fork_1" });
  });

  test("swarm skips existing branches and still forks every new task into its own worktree", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    await f.call("worktree_make", { action: "create", branch: "wt/existing" });
    const output = await f.call("worktree_make", {
      action: "swarm",
      tasks: ["existing", "new task"],
    });
    expect(output).toContain("1/2 created");
    expect(output).toContain("skipped: branch exists");
    expect(f.requests.filter((request) => request.operation === "fork")).toHaveLength(1);
    expect(f.state().entries[0]).toMatchObject({
      branch: "wt/new-task",
      worktreePath: join(f.repo, ".worktrees", "wt", "new-task"),
    });
  });

  test("unavailable fork capability leaves no new swarm branch or worktree", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    f.runtime.ensureForkAvailable = async () => {
      throw new Error("No matching managed service");
    };
    expect(await f.call("worktree_make", { action: "swarm", tasks: ["unavailable"] })).toContain(
      "No matching managed service",
    );
    expect(existsSync(join(f.repo, ".worktrees", "wt", "unavailable"))).toBe(false);
    expect(f.git("branch", "--list", "wt/unavailable")).toBe("");
  });

  test("dashboard resolves session timestamps through the native session API", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    await f.call("worktree_make", { action: "start", name: "dashboard" });
    const output = await f.call("worktree_overview", { view: "dashboard" });
    expect(output).toContain("ses_created_1");
    expect(output).toContain("clean");
    expect(f.requests.find((request) => request.operation === "get")).toEqual({
      operation: "get",
      input: { sessionID: "ses_created_1" },
    });
  });

  test("retains prune dry-run and validation errors", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    expect(await f.call("worktree_cleanup", { action: "prune", dryRun: true })).toContain(
      "git worktree prune --dry-run",
    );
    expect(await f.call("worktree_make", { action: "create" })).toContain(
      "Name or branch is required",
    );
    expect(await f.call("worktree_make", { action: "swarm", tasks: [] })).toContain(
      "Tasks array is required",
    );
    expect(await f.call("worktree_cleanup", { action: "remove" })).toContain(
      "pathOrBranch is required",
    );
  });

  test("reports native session creation errors instead of inventing a mapping", async () => {
    const f = await fixture();
    f.runtime.session.create = async () => {
      throw new Error("Native session service unavailable");
    };
    await f.call("worktree_mode", { action: "on" });
    expect(await f.call("worktree_make", { action: "start", name: "failed-session" })).toContain(
      "Native session service unavailable",
    );
    expect(existsSync(join(f.config, "opencode", "open-trees", "state.json"))).toBe(false);
  });

  test("native session deletion removes matching mappings and unload aborts the event stream", async () => {
    const f = await fixture();
    await f.call("worktree_mode", { action: "on" });
    await f.call("worktree_make", { action: "start", name: "deleted-session" });
    await f.register();
    await f.emit({
      type: "session.deleted",
      location: { directory: f.repo },
      data: { sessionID: "ses_created_1" },
    });
    expect(f.state().entries).toHaveLength(0);
    await f.cleanup();
    expect(f.signal()?.aborted).toBe(true);
  });

  test("parallel V2 location handlers retain every shared session mapping", async () => {
    const f = await fixture();
    const { storeSessionMapping } = await import(
      pathToFileURL(join(nativeRoot, "src", "state.ts")).href
    );
    await Promise.all([
      storeSessionMapping({
        worktreePath: join(f.repo, ".worktrees", "first"),
        branch: "first",
        sessionID: "ses_first",
        createdAt: "2026-10-02T00:00:00Z",
      }),
      storeSessionMapping({
        worktreePath: join(f.repo, ".worktrees", "second"),
        branch: "second",
        sessionID: "ses_second",
        createdAt: "2026-10-02T00:00:00Z",
      }),
    ]);
    expect(
      f
        .state()
        .entries.map((entry: SessionRequest) => entry.sessionID)
        .sort(),
    ).toEqual(["ses_first", "ses_second"]);
  });

  test("native CLI companion shows the requested session picker and navigates to the selection", async () => {
    const f = await fixture();
    const { default: tui } = await import(pathToFileURL(join(nativeRoot, "src", "tui.ts")).href);
    let handler: ((event: PickerEvent) => Promise<void>) | undefined;
    let stopped = false;
    const routes: Array<{ type: string; sessionID: string }> = [];
    const dialogs: Array<{ options: Array<{ title: string; value: string }> }> = [];
    const stop = await tui.setup({
      client: {
        rpc: () => ({
          events: {
            on: (_name: string, callback: (event: PickerEvent) => Promise<void>) => {
              handler = callback;
              return () => {
                stopped = true;
              };
            },
          },
        }),
        session: {
          list: async () => ({
            data: [{ id: "ses_created", title: "wt:created", location: { directory: f.repo } }],
          }),
        },
      },
      ui: {
        router: {
          current: () => ({ type: "session", sessionID: "ses_parent" }),
          navigate: (route: { type: string; sessionID: string }) => routes.push(route),
        },
        dialog: {
          select: async (options: { options: Array<{ title: string; value: string }> }) => {
            dialogs.push(options);
            return "ses_created";
          },
        },
        toast: { show: () => {} },
      },
    });
    if (!handler) throw new Error("The native session picker listener was not registered");
    await handler({ data: { sessionID: "ses_other" } });
    expect(dialogs).toHaveLength(0);
    await handler({ data: { sessionID: "ses_parent" } });
    expect(dialogs[0].options[0]).toMatchObject({ title: "wt:created", value: "ses_created" });
    expect(routes).toEqual([{ type: "session", sessionID: "ses_created" }]);
    stop();
    expect(stopped).toBe(true);
  });
});
