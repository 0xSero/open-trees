import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

import {
  createWorktree,
  listWorktrees,
  pruneWorktrees,
  removeWorktree,
  statusWorktrees,
} from "./worktree";
import { dashboardWorktrees } from "./worktree-dashboard";
import { forkWorktreeSession, startWorktreeSession } from "./worktree-session";
import { swarmWorktrees } from "./worktree-swarm";

const z = tool.schema;

export const createTools = (ctx: PluginInput) => ({
  worktree_help: tool({
    description: "Show a quick help sheet for worktree tools.",
    args: {},
    async execute() {
      return [
        "Worktree tools:",
        "- worktree_list",
        "- worktree_status { \"path\": \"/path/to/worktree\" }",
        "- worktree_create { \"name\": \"feature\" }",
        "- worktree_start { \"name\": \"feature\", \"openSessions\": true }",
        "- worktree_fork { \"name\": \"feature\", \"openSessions\": true }",
        "- worktree_dashboard",
        "- worktree_swarm { \"tasks\": [\"task-a\", \"task-b\"], \"openSessions\": true }",
        "- worktree_remove { \"pathOrBranch\": \"feature\", \"force\": true }",
        "- worktree_prune { \"dryRun\": true }",
      ].join("\n");
    },
  }),
  worktree_list: tool({
    description: "List git worktrees with branch, path, and HEAD info.",
    args: {},
    async execute() {
      return listWorktrees(ctx);
    },
  }),
  worktree_status: tool({
    description: "Show dirty/clean summaries for worktrees.",
    args: {
      path: z.string().optional().describe("Only report status for this worktree path."),
      all: z.boolean().optional().describe("Include all known worktrees."),
      porcelain: z.boolean().optional().describe("Include raw git status --porcelain output."),
    },
    async execute(args) {
      return statusWorktrees(ctx, args);
    },
  }),
  worktree_create: tool({
    description: "Create a new worktree (optionally create a branch).",
    args: {
      name: z.string().describe("Logical name used to derive branch and folder."),
      branch: z.string().optional().describe("Explicit branch name (overrides derived name)."),
      base: z.string().optional().describe("Base ref for new branch (default: HEAD)."),
      path: z.string().optional().describe("Explicit filesystem path for the worktree."),
    },
    async execute(args) {
      return createWorktree(ctx, args);
    },
  }),
  worktree_remove: tool({
    description: "Remove a worktree (guarded unless force: true).",
    args: {
      pathOrBranch: z.string().describe("Worktree path or branch name to remove."),
      force: z.boolean().optional().describe("Remove even if the worktree has local changes."),
    },
    async execute(args) {
      return removeWorktree(ctx, args);
    },
  }),
  worktree_prune: tool({
    description: "Prune stale worktree entries.",
    args: {
      dryRun: z.boolean().optional().describe("Preview prune results."),
    },
    async execute(args) {
      return pruneWorktrees(ctx, args);
    },
  }),
  worktree_dashboard: tool({
    description: "Show a dashboard of known worktree sessions.",
    args: {},
    async execute() {
      return dashboardWorktrees(ctx);
    },
  }),
  worktree_swarm: tool({
    description: "Create multiple worktrees and fork the current session into each.",
    args: {
      tasks: z.array(z.string()).describe("Task names for each worktree/session."),
      prefix: z.string().optional().describe("Branch prefix (default: wt/)."),
      openSessions: z.boolean().optional().describe("Open the sessions UI after creation."),
      force: z.boolean().optional().describe("Allow existing branches or paths without skipping."),
    },
    async execute(args, context) {
      return swarmWorktrees(ctx, context.sessionID, args);
    },
  }),
  worktree_start: tool({
    description: "Create a worktree and start a new OpenCode session in it.",
    args: {
      name: z.string().describe("Logical name used to derive branch and folder."),
      branch: z.string().optional().describe("Explicit branch name (overrides derived name)."),
      base: z.string().optional().describe("Base ref for new branch (default: HEAD)."),
      path: z.string().optional().describe("Explicit filesystem path for the worktree."),
      openSessions: z.boolean().optional().describe("Open the sessions UI after creation."),
    },
    async execute(args) {
      return startWorktreeSession(ctx, args);
    },
  }),
  worktree_fork: tool({
    description: "Create a worktree and fork the current session into it.",
    args: {
      name: z.string().describe("Logical name used to derive branch and folder."),
      branch: z.string().optional().describe("Explicit branch name (overrides derived name)."),
      base: z.string().optional().describe("Base ref for new branch (default: HEAD)."),
      path: z.string().optional().describe("Explicit filesystem path for the worktree."),
      openSessions: z.boolean().optional().describe("Open the sessions UI after creation."),
    },
    async execute(args, context) {
      return forkWorktreeSession(ctx, context.sessionID, args);
    },
  }),
});
