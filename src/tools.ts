import type { Info, ToolContext } from "@opencode/plugin/promise/tool";
import type { WorktreeContext } from "./context";
import { formatError } from "./format";
import { getRepoRoot } from "./git";
import { ensureModeEnabled, readMode, setMode } from "./mode";
import { getWorktreeRoot } from "./paths";
import type { ToolResult } from "./result";
import {
  createWorktree,
  listWorktrees,
  pruneWorktrees,
  removeWorktree,
  statusWorktrees,
} from "./worktree";
import { dashboardWorktrees } from "./worktree-dashboard";
import { forkWorktreeSession, openWorktreeSession, startWorktreeSession } from "./worktree-session";
import { swarmWorktrees } from "./worktree-swarm";

const TOOL_CATALOG = [
  { id: "worktree_mode", summary: "Enable/disable worktree mode and show help." },
  { id: "worktree_overview", summary: "List, status, or dashboard worktrees." },
  { id: "worktree_make", summary: "Create or open worktrees and sessions." },
  { id: "worktree_cleanup", summary: "Remove or prune worktrees safely." },
];

const EXAMPLES = [
  "worktree_mode",
  'worktree_mode { "action": "on" }',
  'worktree_mode { "action": "off" }',
  "worktree_overview",
  'worktree_overview { "view": "status" }',
  'worktree_overview { "view": "dashboard" }',
  'worktree_make { "action": "create", "name": "feature audit" }',
  'worktree_make { "action": "start", "name": "feature audit", "openSessions": true }',
  'worktree_make { "action": "open", "pathOrBranch": "feature/audit" }',
  'worktree_cleanup { "action": "remove", "pathOrBranch": "feature/audit" }',
  'worktree_cleanup { "action": "prune", "dryRun": true }',
];

function buildHelp(enabled: boolean, modePath: string, root?: string): string {
  return [
    `Worktree mode: ${enabled ? "ON" : "OFF"}`,
    `State: ${modePath}`,
    ...(root ? [`Default worktree root: ${root}`] : []),
    "",
    "Tools:",
    ...TOOL_CATALOG.map((entry) => `- ${entry.id} — ${entry.summary}`),
    "",
    "Examples:",
    ...EXAMPLES.map((example) => `- ${example}`),
  ].join("\n");
}

type ModeInput = { action?: "on" | "off" | "status" | "help" };
type OverviewInput = {
  view?: "list" | "status" | "dashboard";
  path?: string;
  all?: boolean;
  porcelain?: boolean;
};
type MakeInput = {
  action: "create" | "start" | "open" | "fork" | "swarm";
  name?: string;
  branch?: string;
  base?: string;
  path?: string;
  pathOrBranch?: string;
  openSessions?: boolean;
  tasks?: string[];
  prefix?: string;
  force?: boolean;
};
type CleanupInput = {
  action: "remove" | "prune";
  pathOrBranch?: string;
  force?: boolean;
  dryRun?: boolean;
};

export function createTools(base: WorktreeContext): Info[] {
  function define<Input>(
    index: number,
    input: Info["input"],
    execute: (args: Input, ctx: WorktreeContext, context: ToolContext) => Promise<string>,
    gated = true,
  ): Info {
    return {
      name: TOOL_CATALOG[index].id,
      description: TOOL_CATALOG[index].summary,
      input,
      options: { codemode: false },
      async execute(args, context) {
        if (gated) {
          const mode = await ensureModeEnabled();
          if (!mode.ok) return { content: mode.error };
        }
        const ctx = { ...base, signal: context.signal, sessionID: context.sessionID };
        return { content: await execute(args as Input, ctx, context) };
      },
    };
  }
  const render = (result: ToolResult): string => (result.ok ? result.output : result.error);
  return [
    define<ModeInput>(
      0,
      {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["on", "off", "status", "help"],
            description: "Enable/disable worktree mode or show help.",
          },
        },
        additionalProperties: false,
      },
      async (args, ctx) => {
        const action = args.action ?? "status";
        if (action === "on" || action === "off") {
          const result = await setMode(action === "on");
          if (!result.ok) return result.error;
        }
        const mode = await readMode();
        if (!mode.ok) return mode.error;
        const repo = await getRepoRoot(ctx);
        const help = buildHelp(
          mode.state.enabled,
          mode.path,
          repo.ok ? getWorktreeRoot(repo.path) : undefined,
        );
        return action === "on" || action === "off"
          ? `Worktree mode is now ${mode.state.enabled ? "ON" : "OFF"}.\n\n${help}`
          : help;
      },
      false,
    ),
    define<OverviewInput>(
      1,
      {
        type: "object",
        properties: {
          view: {
            type: "string",
            enum: ["list", "status", "dashboard"],
            description: "Overview to show (default: list).",
          },
          path: { type: "string", description: "Filter to a worktree path (status view)." },
          all: { type: "boolean", description: "Include all worktrees (status view)." },
          porcelain: { type: "boolean", description: "Include raw Git status." },
        },
        additionalProperties: false,
      },
      async (args, ctx) =>
        render(
          args.view === "dashboard"
            ? await dashboardWorktrees(ctx)
            : args.view === "status"
              ? await statusWorktrees(ctx, args)
              : await listWorktrees(ctx),
        ),
    ),
    define<MakeInput>(
      2,
      {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "start", "open", "fork", "swarm"] },
          name: { type: "string", description: "Logical name used to derive branch and folder." },
          branch: { type: "string", description: "Explicit branch (overrides derived name)." },
          base: { type: "string", description: "Base ref for a new branch (default: HEAD)." },
          path: { type: "string", description: "Explicit filesystem path." },
          pathOrBranch: { type: "string", description: "Existing worktree path or branch." },
          openSessions: {
            type: "boolean",
            description: "Request the native sessions picker after creation.",
          },
          tasks: {
            type: "array",
            items: { type: "string" },
            description: "Task names for swarm worktrees.",
          },
          prefix: { type: "string", description: "Swarm branch prefix (default: wt/)." },
          force: {
            type: "boolean",
            description: "Allow existing swarm branches/paths instead of skipping.",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
      async (args, ctx, context) => {
        if (args.action === "fork" || args.action === "swarm") {
          try {
            await ctx.ensureForkAvailable?.(context.signal);
          } catch (error) {
            return formatError("Session fork unavailable.", {
              details: error instanceof Error ? error.message : String(error),
            });
          }
        }
        if (args.action === "create") return render(await createWorktree(ctx, args));
        if (args.action === "start") return render(await startWorktreeSession(ctx, args));
        if (args.action === "open") {
          if (!args.pathOrBranch && !args.path && !args.name && !args.branch)
            return formatError("Path or branch is required.", {
              hint: "Provide pathOrBranch, path, name, or branch to open.",
            });
          return render(await openWorktreeSession(ctx, args));
        }
        if (args.action === "fork")
          return render(await forkWorktreeSession(ctx, context.sessionID, args));
        if (!args.tasks?.length)
          return formatError("Tasks array is required.", {
            hint: "Provide one or more task names.",
          });
        return render(
          await swarmWorktrees(ctx, context.sessionID, {
            tasks: args.tasks,
            prefix: args.prefix,
            openSessions: args.openSessions,
            force: args.force,
          }),
        );
      },
    ),
    define<CleanupInput>(
      3,
      {
        type: "object",
        properties: {
          action: { type: "string", enum: ["remove", "prune"] },
          pathOrBranch: { type: "string", description: "Worktree path or branch to remove." },
          force: { type: "boolean", description: "Remove even if the worktree has local changes." },
          dryRun: { type: "boolean", description: "Preview prune results." },
        },
        required: ["action"],
        additionalProperties: false,
      },
      async (args, ctx) => {
        if (args.action === "prune") return render(await pruneWorktrees(ctx, args));
        if (!args.pathOrBranch)
          return formatError("pathOrBranch is required.", {
            hint: "Provide a worktree path or branch name.",
          });
        return render(
          await removeWorktree(ctx, { pathOrBranch: args.pathOrBranch, force: args.force }),
        );
      },
    ),
  ];
}
