import { access, readdir, stat } from "node:fs/promises";

import { formatError } from "./format";
import type { WorktreeInfo } from "./git";
import { pathsEqual, resolveWorktreePath } from "./paths";

export const headShort = (head: string) => (head ? head.slice(0, 7) : "-");

export const branchLabel = (worktree: WorktreeInfo) =>
  worktree.branch ?? (worktree.detached ? "(detached)" : "-");

export const pathExists = async (target: string) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

export const ensureEmptyDirectory = async (target: string) => {
  const stats = await stat(target);
  if (!stats.isDirectory()) {
    return {
      ok: false as const,
      error: formatError("Path exists and is not a directory.", {
        hint: `Choose a new path or remove ${target}.`,
      }),
    };
  }

  const entries = await readdir(target);
  if (entries.length > 0) {
    return {
      ok: false as const,
      error: formatError("Path exists and is not empty.", {
        hint: `Choose an empty directory or remove ${target}.`,
      }),
    };
  }

  return { ok: true as const };
};

export const findWorktreeMatch = (worktrees: WorktreeInfo[], repoRoot: string, input: string) => {
  const resolvedPath = resolveWorktreePath(repoRoot, input);
  const matches = worktrees.filter((worktree) => {
    if (pathsEqual(worktree.path, resolvedPath)) return true;
    if (worktree.branch && worktree.branch === input) return true;
    if (worktree.branch && `refs/heads/${worktree.branch}` === input) return true;
    return false;
  });

  return matches;
};
