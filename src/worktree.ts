import { mkdir } from "node:fs/promises";

import type { PluginInput } from "@opencode-ai/plugin";

import { formatCommand, formatError, renderTable } from "./format";
import { formatGitFailure, getRepoRoot, getWorktrees, runGit } from "./git";
import { defaultWorktreePath, normalizeBranchName, resolveWorktreePath } from "./paths";
import { summarizePorcelain } from "./status";
import {
  branchLabel,
  ensureEmptyDirectory,
  findWorktreeMatch,
  headShort,
  pathExists,
} from "./worktree-helpers";

export { statusWorktrees } from "./worktree-status";

export const listWorktrees = async (ctx: PluginInput) => {
  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return repoRoot.error;

  const worktreesResult = await getWorktrees(ctx, repoRoot.path);
  if (!worktreesResult.ok) return worktreesResult.error;

  const rows = worktreesResult.worktrees.map((worktree) => [
    branchLabel(worktree),
    worktree.path,
    headShort(worktree.head),
    worktree.locked ? "yes" : "no",
    worktree.prunable ? "yes" : "no",
  ]);

  const table = renderTable(
    ["branch", "path", "head", "locked", "prunable"],
    rows.length > 0 ? rows : [["-", "-", "-", "-", "-"]],
  );

  const command = formatCommand(["git", "worktree", "list", "--porcelain"]);

  return `Worktrees (${worktreesResult.worktrees.length}):\n${table}\nCommand: ${command}`;
};

export type WorktreeCreateDetails = {
  branch: string;
  worktreePath: string;
  base: string;
  command: string;
  branchExists: boolean;
};

export const createWorktreeDetails = async (
  ctx: PluginInput,
  options: { name: string; branch?: string; base?: string; path?: string },
) => {
  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return { ok: false as const, error: repoRoot.error };

  const name = options.name.trim();
  if (!name) {
    return {
      ok: false as const,
      error: formatError("Name is required.", {
        hint: "Provide a logical name to derive the branch and directory.",
      }),
    };
  }

  const branchInput = options.branch?.trim();
  const branch = branchInput || normalizeBranchName(name);
  if (!branch) {
    return {
      ok: false as const,
      error: formatError("Unable to derive a valid branch name.", {
        hint: "Provide an explicit branch name.",
      }),
    };
  }

  const branchCheck = await runGit(ctx, ["check-ref-format", "--branch", branch], {
    cwd: repoRoot.path,
  });

  if (!branchCheck.ok) {
    return {
      ok: false as const,
      error: formatGitFailure(branchCheck, "Choose a different branch name."),
    };
  }

  const base = options.base?.trim() || "HEAD";
  const worktreePath = options.path
    ? resolveWorktreePath(repoRoot.path, options.path)
    : defaultWorktreePath(repoRoot.path, branch);

  if (await pathExists(worktreePath)) {
    const emptyCheck = await ensureEmptyDirectory(worktreePath);
    if (!emptyCheck.ok) return { ok: false as const, error: emptyCheck.error };
  } else {
    await mkdir(worktreePath, { recursive: true });
  }

  const branchExists = await runGit(
    ctx,
    ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    { cwd: repoRoot.path },
  );

  if (!branchExists.ok && branchExists.exitCode > 1) {
    return { ok: false as const, error: formatGitFailure(branchExists) };
  }

  const args = branchExists.ok
    ? ["worktree", "add", worktreePath, branch]
    : ["worktree", "add", "-b", branch, worktreePath, base];
  const command = formatCommand(["git", ...args]);

  const addResult = await runGit(ctx, args, { cwd: repoRoot.path });
  if (!addResult.ok) {
    return { ok: false as const, error: formatGitFailure(addResult) };
  }

  return {
    ok: true as const,
    result: {
      branch,
      worktreePath,
      base,
      command,
      branchExists: branchExists.ok,
    },
  };
};

export const createWorktree = async (
  ctx: PluginInput,
  options: { name: string; branch?: string; base?: string; path?: string },
) => {
  const result = await createWorktreeDetails(ctx, options);
  if (!result.ok) return result.error;

  const lines = [
    "Worktree created.",
    `Branch: ${result.result.branch}`,
    `Path: ${result.result.worktreePath}`,
    `Command: ${result.result.command}`,
  ];

  if (!result.result.branchExists) {
    lines.push(`Base: ${result.result.base}`);
  } else if (options.base) {
    lines.push("Note: Base ignored because the branch already exists.");
  }

  return lines.join("\n");
};

export const removeWorktree = async (
  ctx: PluginInput,
  options: { pathOrBranch: string; force?: boolean },
) => {
  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return repoRoot.error;

  const worktreesResult = await getWorktrees(ctx, repoRoot.path);
  if (!worktreesResult.ok) return worktreesResult.error;

  const input = options.pathOrBranch.trim();
  if (!input) {
    return formatError("pathOrBranch is required.", {
      hint: "Provide a worktree path or branch name.",
    });
  }

  const matches = findWorktreeMatch(worktreesResult.worktrees, repoRoot.path, input);

  if (matches.length === 0) {
    return formatError("No worktree matches the provided value.", {
      hint: "Use worktree_list to see available worktrees.",
    });
  }

  if (matches.length > 1) {
    return formatError("Multiple worktrees match the provided value.", {
      details: matches.map((match) => match.path).join(", "),
    });
  }

  const target = matches[0];

  if (!(await pathExists(target.path))) {
    return formatError("Worktree path does not exist.", {
      hint: "If it was deleted manually, run worktree_prune instead.",
    });
  }

  if (!options.force) {
    const statusResult = await runGit(ctx, ["status", "--porcelain"], {
      cwd: target.path,
    });

    if (!statusResult.ok) {
      return formatGitFailure(statusResult, "Unable to check worktree status.");
    }

    const summary = summarizePorcelain(statusResult.stdout);
    if (!summary.clean) {
      return formatError("Worktree has uncommitted changes.", {
        hint: "Re-run with force: true to remove anyway.",
      });
    }
  }

  const args = options.force
    ? ["worktree", "remove", "--force", target.path]
    : ["worktree", "remove", target.path];
  const command = formatCommand(["git", ...args]);

  const removeResult = await runGit(ctx, args, { cwd: repoRoot.path });
  if (!removeResult.ok) return formatGitFailure(removeResult);

  const lines = [
    "Worktree removed.",
    `Branch: ${branchLabel(target)}`,
    `Path: ${target.path}`,
    `Command: ${command}`,
  ];

  if (options.force) {
    lines.push("Note: Removed with --force.");
  }

  return lines.join("\n");
};

export const pruneWorktrees = async (ctx: PluginInput, options: { dryRun?: boolean }) => {
  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return repoRoot.error;

  const args = options.dryRun ? ["worktree", "prune", "--dry-run"] : ["worktree", "prune"];
  const command = formatCommand(["git", ...args]);

  const pruneResult = await runGit(ctx, args, { cwd: repoRoot.path });
  if (!pruneResult.ok) return formatGitFailure(pruneResult);

  const output = pruneResult.stdout.trim();
  const lines = [
    "Worktree prune complete.",
    `Command: ${command}`,
    output ? `Output: ${output}` : "Output: (none)",
  ];

  return lines.join("\n");
};
