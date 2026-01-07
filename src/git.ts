import type { PluginInput } from "@opencode-ai/plugin";

import { formatCommand, formatError } from "./format";

export type GitCommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
};

export type WorktreeInfo = {
  path: string;
  head: string;
  branch: string | null;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
  lockReason?: string;
  prunableReason?: string;
};

const firstNonEmptyLine = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

export const runGit = async (
  ctx: PluginInput,
  args: string[],
  options: { cwd?: string } = {},
): Promise<GitCommandResult> => {
  const shell = options.cwd ? ctx.$.cwd(options.cwd) : ctx.$;
  const result = await shell`git ${args}`.nothrow().quiet();
  const stdout = result.text().trimEnd();
  const stderr = result.stderr.toString().trimEnd();
  const command = formatCommand(["git", ...args]);

  return {
    ok: result.exitCode === 0,
    stdout,
    stderr,
    exitCode: result.exitCode,
    command,
  };
};

export const formatGitFailure = (result: GitCommandResult, hint?: string) => {
  const stderrLine = firstNonEmptyLine(result.stderr || result.stdout) || "";
  const lowerStderr = stderrLine.toLowerCase();

  if (
    lowerStderr.includes("not a git repository") ||
    lowerStderr.includes("fatal: not a git repository")
  ) {
    return formatError("Not a git repository.", {
      hint: "Run this tool from inside a git repository.",
      command: result.command,
    });
  }

  if (
    result.exitCode === 127 ||
    lowerStderr.includes("command not found") ||
    lowerStderr.includes("no such file or directory")
  ) {
    return formatError("Git is not installed or not on PATH.", {
      hint: "Install git and ensure it is available on your PATH.",
      command: result.command,
    });
  }

  return formatError("Git command failed.", {
    hint,
    command: result.command,
    details: stderrLine,
  });
};

export const getRepoRoot = async (ctx: PluginInput) => {
  const result = await runGit(ctx, ["rev-parse", "--show-toplevel"]);

  if (!result.ok) {
    return { ok: false as const, error: formatGitFailure(result) };
  }

  const root = result.stdout.trim();
  if (!root) {
    return {
      ok: false as const,
      error: formatError("Unable to resolve git repository root.", {
        command: result.command,
      }),
    };
  }

  return { ok: true as const, path: root };
};

export const getWorktrees = async (ctx: PluginInput, repoRoot: string) => {
  const result = await runGit(ctx, ["worktree", "list", "--porcelain"], {
    cwd: repoRoot,
  });

  if (!result.ok) {
    return { ok: false as const, error: formatGitFailure(result) };
  }

  return { ok: true as const, worktrees: parseWorktreeList(result.stdout) };
};

const normalizeBranchRef = (value: string) =>
  value.startsWith("refs/heads/") ? value.slice("refs/heads/".length) : value;

export const parseWorktreeList = (output: string): WorktreeInfo[] => {
  const lines = output.split(/\r?\n/);
  const worktrees: WorktreeInfo[] = [];
  let current: WorktreeInfo | null = null;

  const commitCurrent = () => {
    if (current) worktrees.push(current);
    current = null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      commitCurrent();
      continue;
    }

    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ").trim();

    if (key === "worktree") {
      commitCurrent();
      current = {
        path: value,
        head: "",
        branch: null,
        detached: false,
        locked: false,
        prunable: false,
      };
      continue;
    }

    if (!current) continue;

    switch (key) {
      case "HEAD":
        current.head = value;
        break;
      case "branch":
        current.branch = normalizeBranchRef(value);
        break;
      case "detached":
        current.detached = true;
        break;
      case "locked":
        current.locked = true;
        current.lockReason = value || undefined;
        break;
      case "prunable":
        current.prunable = true;
        current.prunableReason = value || undefined;
        break;
      default:
        break;
    }
  }

  commitCurrent();
  return worktrees;
};
