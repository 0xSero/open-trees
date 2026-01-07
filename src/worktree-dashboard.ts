import type { PluginInput } from "@opencode-ai/plugin";

import { formatError, renderTable } from "./format";
import { runGit } from "./git";
import { unwrapSdkResponse } from "./sdk";
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

const resolveBranch = async (ctx: PluginInput, worktreePath: string, fallback: string) => {
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

const resolveDirty = async (ctx: PluginInput, worktreePath: string) => {
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

const resolveSessionUpdatedAt = async (ctx: PluginInput, sessionID: string, fallback: string) => {
  const response = await ctx.client.session.get({ path: { id: sessionID } });
  const result = unwrapSdkResponse<{ time?: { updated?: number } }>(response, "Session lookup");
  if (!result.ok) {
    return { updatedAt: fallback, note: firstLine(result.error) };
  }

  const updatedAt = formatTimestamp(result.data.time?.updated);
  return { updatedAt };
};

export const dashboardWorktrees = async (ctx: PluginInput) => {
  const stateResult = await readState();
  if (!stateResult.ok) return stateResult.error;

  if (stateResult.state.entries.length === 0) {
    return formatError("No worktree sessions recorded.", {
      hint: "Run worktree_start or worktree_fork to create a mapping.",
    });
  }

  const rows: string[][] = [];
  const notes: string[] = [];

  for (const entry of stateResult.state.entries) {
    const taskName = entry.branch;
    const fallbackUpdatedAt = formatTimestamp(entry.createdAt);

    if (!(await pathExists(entry.worktreePath))) {
      rows.push([
        taskName,
        entry.branch,
        entry.worktreePath,
        entry.sessionID,
        "missing",
        fallbackUpdatedAt,
      ]);
      notes.push(`${entry.worktreePath}: missing on disk`);
      continue;
    }

    const branchResult = await resolveBranch(ctx, entry.worktreePath, entry.branch);
    if (branchResult.note) {
      notes.push(`${entry.worktreePath}: ${branchResult.note}`);
    }

    const dirtyResult = await resolveDirty(ctx, entry.worktreePath);
    if (dirtyResult.note) {
      notes.push(`${entry.worktreePath}: ${dirtyResult.note}`);
    }

    const sessionResult = await resolveSessionUpdatedAt(ctx, entry.sessionID, fallbackUpdatedAt);
    if (sessionResult.note) {
      notes.push(`Session ${entry.sessionID}: ${sessionResult.note}`);
    }

    rows.push([
      taskName,
      branchResult.branch,
      entry.worktreePath,
      entry.sessionID,
      dirtyResult.dirty,
      sessionResult.updatedAt,
    ]);
  }

  const table = renderTable(
    ["task/name", "branch", "worktreePath", "sessionID", "dirty?", "updatedAt"],
    rows,
  );

  const sections = [`Worktree dashboard (${rows.length}):\n${table}`, `State: ${stateResult.path}`];

  if (notes.length > 0) {
    sections.push(`Notes:\n${notes.map((note) => `- ${note}`).join("\n")}`);
  }

  return sections.join("\n\n");
};
