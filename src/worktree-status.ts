import type { WorktreeContext } from "./context";

import { formatCommand, formatError, renderTable } from "./format";
import { getRepoRoot, getWorktrees, runGit } from "./git";
import { pathsEqual, resolveWorktreePath } from "./paths";
import { err, ok, type ToolResult } from "./result";
import { summarizePorcelain } from "./status";
import { branchLabel, pathExists } from "./worktree-helpers";

export const statusWorktrees = async (
  ctx: WorktreeContext,
  options: { path?: string; all?: boolean; porcelain?: boolean },
): Promise<ToolResult> => {
  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return err(repoRoot.error);

  const worktreesResult = await getWorktrees(ctx, repoRoot.path);
  if (!worktreesResult.ok) return err(worktreesResult.error);

  const includeAll = options.all ?? true;
  let targets = worktreesResult.worktrees;

  if (options.path) {
    const resolvedResult = resolveWorktreePath(repoRoot.path, options.path);
    if (!resolvedResult.ok) return err(resolvedResult.error);
    const resolved = resolvedResult.path;
    targets = worktreesResult.worktrees.filter((worktree) => pathsEqual(worktree.path, resolved));

    if (targets.length === 0) {
      return err(
        formatError("Worktree path not found.", {
          hint: 'Use worktree_overview { "view": "list" } to see available paths.',
        }),
      );
    }
  } else if (!includeAll) {
    const current = worktreesResult.worktrees.find((worktree) =>
      pathsEqual(worktree.path, ctx.worktree),
    );
    // Fall back to the first known worktree when the current one is missing.
    targets = current ? [current] : worktreesResult.worktrees.slice(0, 1);
  }

  const rows: string[][] = [];
  const details: string[] = [];
  const notes: string[] = [];

  for (const worktree of targets) {
    if (!(await pathExists(worktree.path))) {
      rows.push([
        branchLabel(worktree),
        worktree.path,
        worktree.prunable ? "prunable" : "missing",
        "-",
        "-",
        "-",
      ]);

      if (options.porcelain) {
        details.push(`${worktree.path} (${branchLabel(worktree)})`);
        details.push("```");
        details.push("(missing)");
        details.push("```");
      }

      continue;
    }

    const statusResult = await runGit(ctx, ["status", "--porcelain"], {
      cwd: worktree.path,
    });

    if (!statusResult.ok) {
      rows.push([branchLabel(worktree), worktree.path, "error", "-", "-", "-"]);

      const detailLine = statusResult.stderr || statusResult.stdout || "";
      const detailMessage = detailLine.split(/\r?\n/)[0] || "status failed";
      notes.push(`${worktree.path}: ${detailMessage}`);

      if (options.porcelain) {
        details.push(`${worktree.path} (${branchLabel(worktree)})`);
        details.push("```");
        details.push(`(error) ${detailMessage}`);
        details.push("```");
      }

      continue;
    }

    const summary = summarizePorcelain(statusResult.stdout);
    rows.push([
      branchLabel(worktree),
      worktree.path,
      summary.clean ? "clean" : "dirty",
      summary.staged.toString(),
      summary.unstaged.toString(),
      summary.untracked.toString(),
    ]);

    if (options.porcelain) {
      details.push(`${worktree.path} (${branchLabel(worktree)})`);
      details.push("```");
      details.push(summary.clean ? "(clean)" : summary.lines.join("\n"));
      details.push("```");
    }
  }

  const table = renderTable(
    ["branch", "path", "status", "staged", "unstaged", "untracked"],
    rows.length > 0 ? rows : [["-", "-", "-", "-", "-", "-"]],
  );

  const sections = [`Worktree status:\n${table}`];

  if (notes.length > 0) {
    sections.push(`Notes:\n${notes.map((note) => `- ${note}`).join("\n")}`);
  }

  if (details.length > 0) {
    sections.push(`Porcelain output:\n${details.join("\n")}`);
  }

  const listCommand = formatCommand(["git", "worktree", "list", "--porcelain"]);
  const statusCommand = formatCommand(["git", "status", "--porcelain"]);
  sections.push(`Commands:\n- ${listCommand}\n- ${statusCommand} (per worktree)`);

  return ok(sections.join("\n\n"));
};
