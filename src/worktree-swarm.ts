import type { PluginInput } from "@opencode-ai/plugin";

import { formatError, renderTable } from "./format";
import { formatGitFailure, getRepoRoot, runGit } from "./git";
import { defaultWorktreePath, normalizeBranchName } from "./paths";
import { unwrapSdkResponse } from "./sdk";
import { openSessionsUi, updateSessionTitle } from "./session-helpers";
import { getStatePath, storeSessionMapping } from "./state";
import { createWorktreeDetails } from "./worktree";
import { pathExists } from "./worktree-helpers";

const firstLine = (value: string) => value.split(/\r?\n/)[0] ?? value;

const buildBranchName = (prefix: string, task: string) => {
  const trimmedPrefix = prefix.trim();
  return `${trimmedPrefix}${task}`;
};

const checkBranchExists = async (ctx: PluginInput, repoRoot: string, branch: string) => {
  const result = await runGit(ctx, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    cwd: repoRoot,
  });

  if (result.ok) return { ok: true as const, exists: true };
  if (result.exitCode === 1) return { ok: true as const, exists: false };
  return { ok: false as const, error: formatGitFailure(result) };
};

type SwarmOptions = {
  tasks: string[];
  prefix?: string;
  openSessions?: boolean;
  force?: boolean;
};

export const swarmWorktrees = async (
  ctx: PluginInput,
  sessionID: string | undefined,
  options: SwarmOptions,
) => {
  if (!sessionID) {
    return formatError("Current session ID is unavailable.", {
      hint: "Run this tool from within an OpenCode session.",
    });
  }

  if (!options.tasks || options.tasks.length === 0) {
    return formatError("Tasks array is required.", {
      hint: "Provide one or more task names.",
    });
  }

  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return repoRoot.error;

  const prefix = options.prefix ?? "wt/";
  const allowExisting = Boolean(options.force);

  const rows: string[][] = [];
  const notes: string[] = [];
  let createdCount = 0;

  for (const task of options.tasks) {
    const rawTask = task.trim();
    if (!rawTask) {
      rows.push([task, "-", "-", "-", "skipped: empty task"]);
      continue;
    }

    const normalizedTask = normalizeBranchName(rawTask);
    if (!normalizedTask) {
      rows.push([rawTask, "-", "-", "-", "skipped: invalid task name"]);
      continue;
    }

    const branch = buildBranchName(prefix, normalizedTask);
    const worktreePath = defaultWorktreePath(repoRoot.path, branch);

    const branchCheck = await checkBranchExists(ctx, repoRoot.path, branch);
    if (!branchCheck.ok) {
      rows.push([rawTask, branch, worktreePath, "-", "error"]);
      notes.push(`${branch}: ${firstLine(branchCheck.error)}`);
      continue;
    }

    if (branchCheck.exists && !allowExisting) {
      rows.push([rawTask, branch, worktreePath, "-", "skipped: branch exists"]);
      continue;
    }

    if ((await pathExists(worktreePath)) && !allowExisting) {
      rows.push([rawTask, branch, worktreePath, "-", "skipped: path exists"]);
      continue;
    }

    const worktreeResult = await createWorktreeDetails(ctx, {
      name: rawTask,
      branch,
    });
    if (!worktreeResult.ok) {
      rows.push([rawTask, branch, worktreePath, "-", "error"]);
      notes.push(`${branch}: ${firstLine(worktreeResult.error)}`);
      continue;
    }

    const forkResponse = await ctx.client.session.fork({
      path: { id: sessionID },
      query: { directory: worktreeResult.result.worktreePath },
    });
    const forkResult = unwrapSdkResponse<{ id: string }>(forkResponse, "Session fork");
    if (!forkResult.ok) {
      rows.push([rawTask, branch, worktreePath, "-", "error"]);
      notes.push(`${branch}: ${firstLine(forkResult.error)}`);
      continue;
    }

    const title = `wt:${worktreeResult.result.branch}`;
    const titleError = await updateSessionTitle(ctx, forkResult.data.id, title);
    if (titleError) {
      notes.push(`Session ${forkResult.data.id}: ${firstLine(titleError)}`);
    }

    const createdAt = new Date().toISOString();
    const mappingResult = await storeSessionMapping({
      worktreePath: worktreeResult.result.worktreePath,
      branch: worktreeResult.result.branch,
      sessionID: forkResult.data.id,
      createdAt,
    });

    if (!mappingResult.ok) {
      notes.push(`${branch}: ${firstLine(mappingResult.error)}`);
    }

    const statusParts = ["created"];
    if (titleError) statusParts.push("title update failed");
    if (!mappingResult.ok) statusParts.push("state write failed");

    rows.push([rawTask, branch, worktreePath, forkResult.data.id, statusParts.join(", ")]);
    createdCount += 1;
  }

  const table = renderTable(
    ["task", "branch", "worktreePath", "sessionID", "status"],
    rows.length > 0 ? rows : [["-", "-", "-", "-", "-"]],
  );

  const sections = [`Swarm results (${createdCount}/${options.tasks.length} created):\n${table}`];

  if (options.openSessions) {
    const openError = await openSessionsUi(ctx);
    if (openError) {
      notes.push(`Open sessions failed: ${firstLine(openError)}`);
    }
  }

  sections.push(`State: ${getStatePath()}`);
  sections.push("Next steps:\n- Open sessions UI and pick a task session");

  if (notes.length > 0) {
    sections.push(`Notes:\n${notes.map((note) => `- ${note}`).join("\n")}`);
  }

  return sections.join("\n\n");
};
