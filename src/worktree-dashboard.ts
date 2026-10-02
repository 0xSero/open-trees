import type { WorktreeContext } from "./context";

import { formatError, renderTable } from "./format";
import { runGit } from "./git";
import { err, ok, type ToolResult } from "./result";
import { sessionOperation } from "./session-helpers";
import { readState } from "./state";
import { summarizePorcelain } from "./status";
import { pathExists } from "./worktree-helpers";

const firstLine = (value: string) => value.split(/\r?\n/)[0] ?? value;

const formatTimestamp = (value: number | string | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return "-";
};

const resolveBranch = async (ctx: WorktreeContext, worktreePath: string, fallback: string) => {
  const result = await runGit(ctx, ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: worktreePath,
  });

  if (!result.ok) {
    return {
      branch: fallback,
      note: firstLine(result.stderr || result.stdout || "branch lookup failed"),
    };
  }

  const name = result.stdout.trim();
  if (!name) return { branch: fallback };
  if (name === "HEAD") return { branch: "(detached)" };
  return { branch: name };
};

const resolveDirty = async (ctx: WorktreeContext, worktreePath: string) => {
  const result = await runGit(ctx, ["status", "--porcelain"], { cwd: worktreePath });
  if (!result.ok) {
    return {
      dirty: "error",
      note: firstLine(result.stderr || result.stdout || "status failed"),
    };
  }

  const summary = summarizePorcelain(result.stdout);
  return { dirty: summary.clean ? "clean" : "dirty" };
};

const resolveSessionUpdatedAt = async (
  ctx: WorktreeContext,
  sessionID: string,
  fallback: string,
) => {
  const result = await sessionOperation("Session lookup", () =>
    ctx.session.get({ sessionID }, { signal: ctx.signal }),
  );
  if (!result.ok) {
    return { updatedAt: fallback, note: firstLine(result.error) };
  }

  const updatedAt = formatTimestamp(result.data.time?.updated);
  return { updatedAt };
};

export const dashboardWorktrees = async (ctx: WorktreeContext): Promise<ToolResult> => {
  const stateResult = await readState();
  if (!stateResult.ok) return err(stateResult.error);

  if (stateResult.state.entries.length === 0) {
    return err(
      formatError("No worktree sessions recorded.", {
        hint: 'Run worktree_make { "action": "start" } to create a mapping.',
      }),
    );
  }

  const results = await Promise.all(
    stateResult.state.entries.map(async (entry) => {
      const taskName = entry.branch;
      const fallbackUpdatedAt = formatTimestamp(entry.createdAt);
      const entryNotes: string[] = [];

      if (!(await pathExists(entry.worktreePath))) {
        return {
          row: [
            taskName,
            entry.branch,
            entry.worktreePath,
            entry.sessionID,
            "missing",
            fallbackUpdatedAt,
          ],
          notes: [`${entry.worktreePath}: missing on disk`],
        };
      }

      const [branchResult, dirtyResult, sessionResult] = await Promise.all([
        resolveBranch(ctx, entry.worktreePath, entry.branch),
        resolveDirty(ctx, entry.worktreePath),
        resolveSessionUpdatedAt(ctx, entry.sessionID, fallbackUpdatedAt),
      ]);

      if (branchResult.note) {
        entryNotes.push(`${entry.worktreePath}: ${branchResult.note}`);
      }
      if (dirtyResult.note) {
        entryNotes.push(`${entry.worktreePath}: ${dirtyResult.note}`);
      }
      if (sessionResult.note) {
        entryNotes.push(`Session ${entry.sessionID}: ${sessionResult.note}`);
      }

      return {
        row: [
          taskName,
          branchResult.branch,
          entry.worktreePath,
          entry.sessionID,
          dirtyResult.dirty,
          sessionResult.updatedAt,
        ],
        notes: entryNotes,
      };
    }),
  );

  const rows = results.map((result) => result.row);
  const notes = results.flatMap((result) => result.notes);

  const table = renderTable(
    ["task/name", "branch", "worktreePath", "sessionID", "dirty?", "updatedAt"],
    rows,
  );

  const sections = [`Worktree dashboard (${rows.length}):\n${table}`, `State: ${stateResult.path}`];

  if (notes.length > 0) {
    sections.push(`Notes:\n${notes.map((note) => `- ${note}`).join("\n")}`);
  }

  return ok(sections.join("\n\n"));
};
