import { mkdir } from "node:fs/promises";

import type { WorktreeContext } from "./context";

import { formatCommand, formatError, renderTable } from "./format";
import { formatGitFailure, getRepoRoot, getWorktrees, runGit } from "./git";
import { defaultWorktreePath, normalizeBranchName, resolveWorktreePath } from "./paths";
import { err, ok, type ToolResult } from "./result";
import { summarizePorcelain } from "./status";
import {
  branchLabel,
  ensureEmptyDirectory,
  findWorktreeMatch,
  headShort,
  pathExists,
} from "./worktree-helpers";

export { statusWorktrees } from "./worktree-status";

const prepareWorktreeDirectory = async (worktreePath: string) => {
  try {
    await mkdir(worktreePath, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false as const,
      error: formatError("Unable to prepare worktree directory.", {
        details: message,
      }),
    };
  }

  const emptyCheck = await ensureEmptyDirectory(worktreePath);
  if (!emptyCheck.ok) return { ok: false as const, error: emptyCheck.error };

  return { ok: true as const };
};

export const listWorktrees = async (ctx: WorktreeContext): Promise<ToolResult> => {
  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return err(repoRoot.error);

  const worktreesResult = await getWorktrees(ctx, repoRoot.path);
  if (!worktreesResult.ok) return err(worktreesResult.error);

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

  return ok(`Worktrees (${worktreesResult.worktrees.length}):\n${table}\nCommand: ${command}`);
};

export type WorktreeCreateDetails = {
  branch: string;
  worktreePath: string;
  base: string;
  command: string;
  branchExists: boolean;
};

export const createWorktreeDetails = async (
  ctx: WorktreeContext,
  options: { name?: string; branch?: string; base?: string; path?: string },
) => {
  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return { ok: false as const, error: repoRoot.error };

  const name = options.name?.trim() ?? "";
  const branchInput = options.branch?.trim();
  if (!name && !branchInput) {
    return {
      ok: false as const,
      error: formatError("Name or branch is required.", {
        hint: "Provide a logical name to derive the branch or an explicit branch.",
      }),
    };
  }

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
  const pathResult = options.path
    ? resolveWorktreePath(repoRoot.path, options.path)
    : { ok: true as const, path: defaultWorktreePath(repoRoot.path, branch) };
  if (!pathResult.ok) {
    return { ok: false as const, error: pathResult.error };
  }
  const worktreePath = pathResult.path;

  const prepareResult = await prepareWorktreeDirectory(worktreePath);
  if (!prepareResult.ok) return prepareResult;

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
  ctx: WorktreeContext,
  options: { name?: string; branch?: string; base?: string; path?: string },
): Promise<ToolResult> => {
  const result = await createWorktreeDetails(ctx, options);
  if (!result.ok) return err(result.error);

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

  return ok(lines.join("\n"));
};

export const removeWorktree = async (
  ctx: WorktreeContext,
  options: { pathOrBranch: string; force?: boolean },
): Promise<ToolResult> => {
  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return err(repoRoot.error);

  const worktreesResult = await getWorktrees(ctx, repoRoot.path);
  if (!worktreesResult.ok) return err(worktreesResult.error);

  const input = options.pathOrBranch.trim();
  if (!input) {
    return err(
      formatError("pathOrBranch is required.", {
        hint: "Provide a worktree path or branch name.",
      }),
    );
  }

  const matchResult = findWorktreeMatch(worktreesResult.worktrees, repoRoot.path, input);
  if (!matchResult.ok) return err(matchResult.error);

  if (matchResult.matches.length === 0) {
    return err(
      formatError("No worktree matches the provided value.", {
        hint: 'Use worktree_overview { "view": "list" } to see available worktrees.',
      }),
    );
  }

  if (matchResult.matches.length > 1) {
    return err(
      formatError("Multiple worktrees match the provided value.", {
        details: matchResult.matches.map((match) => match.path).join(", "),
      }),
    );
  }

  const target = matchResult.matches[0];

  if (!(await pathExists(target.path))) {
    return err(
      formatError("Worktree path does not exist.", {
        hint: 'If it was deleted manually, run worktree_cleanup { "action": "prune" } instead.',
      }),
    );
  }

  if (!options.force) {
    const statusResult = await runGit(ctx, ["status", "--porcelain"], {
      cwd: target.path,
    });

    if (!statusResult.ok) {
      return err(formatGitFailure(statusResult, "Unable to check worktree status."));
    }

    const summary = summarizePorcelain(statusResult.stdout);
    if (!summary.clean) {
      return err(
        formatError("Worktree has uncommitted changes.", {
          hint: "Re-run with force: true to remove anyway.",
        }),
      );
    }
  }

  const args = options.force
    ? ["worktree", "remove", "--force", target.path]
    : ["worktree", "remove", target.path];
  const command = formatCommand(["git", ...args]);

  const removeResult = await runGit(ctx, args, { cwd: repoRoot.path });
  if (!removeResult.ok) return err(formatGitFailure(removeResult));

  const lines = [
    "Worktree removed.",
    `Branch: ${branchLabel(target)}`,
    `Path: ${target.path}`,
    `Command: ${command}`,
  ];

  if (options.force) {
    lines.push("Note: Removed with --force.");
  }

  return ok(lines.join("\n"));
};

export const pruneWorktrees = async (
  ctx: WorktreeContext,
  options: { dryRun?: boolean },
): Promise<ToolResult> => {
  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return err(repoRoot.error);

  const args = options.dryRun ? ["worktree", "prune", "--dry-run"] : ["worktree", "prune"];
  const command = formatCommand(["git", ...args]);

  const pruneResult = await runGit(ctx, args, { cwd: repoRoot.path });
  if (!pruneResult.ok) return err(formatGitFailure(pruneResult));

  const output = pruneResult.stdout.trim();
  const lines = [
    "Worktree prune complete.",
    `Command: ${command}`,
    output ? `Output: ${output}` : "Output: (none)",
  ];

  return ok(lines.join("\n"));
};
