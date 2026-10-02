import type { WorktreeContext } from "./context";

import { formatError } from "./format";
import { getRepoRoot, getWorktrees, type WorktreeInfo } from "./git";
import { normalizeBranchName, pathsEqual, resolveWorktreePath } from "./paths";
import { err, ok, type ToolResult } from "./result";
import {
  forkIntoWorktree,
  openSessionsUi,
  sessionOperation,
  updateSessionTitle,
} from "./session-helpers";
import { storeSessionMapping } from "./state";
import { createWorktreeDetails } from "./worktree";
import { branchLabel, findWorktreeMatch } from "./worktree-helpers";

const firstLine = (value: string) => value.split(/\r?\n/)[0] ?? value;

const buildNextSteps = (
  sessionID: string,
  openSessionsRequested: boolean,
  openSessionsFailed: boolean,
) => {
  const openLabel = openSessionsRequested
    ? openSessionsFailed
      ? "retry with openSessions: true (or run /sessions)"
      : "requested (or run /sessions)"
    : "set openSessions: true (or run /sessions)";
  const steps = [
    "Next steps:",
    `- Open sessions UI: ${openLabel}`,
    `- Select session ${sessionID}`,
  ];
  return steps.join("\n");
};

type WorktreeSessionOptions = {
  name?: string;
  branch?: string;
  base?: string;
  path?: string;
  pathOrBranch?: string;
  openSessions?: boolean;
};

type WorktreeSessionTarget = {
  branch: string;
  worktreePath: string;
  created: boolean;
  command?: string;
  branchExists?: boolean;
  base?: string;
};

type WorktreeSessionResult = {
  branch: string;
  worktreePath: string;
  sessionID: string;
  title: string;
  created: boolean;
  command?: string;
  branchExists?: boolean;
  base?: string;
};

const buildSessionOutput = (
  result: WorktreeSessionResult,
  statePath: string,
  notes: string[],
  openSessionsRequested: boolean,
  openSessionsFailed: boolean,
  baseRequested: boolean,
) => {
  const lines = [
    "Worktree session created.",
    `Branch: ${result.branch}`,
    `Worktree: ${result.worktreePath}`,
    `Mode: ${result.created ? "created new worktree" : "existing worktree"}`,
    `Session: ${result.sessionID}`,
    `Title: ${result.title}`,
  ];

  if (result.command) {
    lines.push(`Command: ${result.command}`);
  }

  if (result.created && result.base && !result.branchExists) {
    lines.push(`Base: ${result.base}`);
  } else if (result.created && result.branchExists && baseRequested) {
    lines.push("Note: Base ignored because the branch already exists.");
  }

  lines.push(`State: ${statePath}`);

  if (notes.length > 0) {
    lines.push(`Notes:\n${notes.map((note) => `- ${note}`).join("\n")}`);
  }

  lines.push(buildNextSteps(result.sessionID, openSessionsRequested, openSessionsFailed));
  return lines.join("\n");
};

const resolveBranchInput = (options: WorktreeSessionOptions) => {
  const branchInput = options.branch?.trim();
  const nameInput = options.name?.trim();

  if (!branchInput && !nameInput) {
    return {
      ok: false as const,
      error: formatError("Name or branch is required.", {
        hint: "Provide name (for derived branch) or an explicit branch.",
      }),
    };
  }

  const branch = branchInput || normalizeBranchName(nameInput || "");
  if (!branch) {
    return {
      ok: false as const,
      error: formatError("Unable to derive a valid branch name.", {
        hint: "Provide an explicit branch name.",
      }),
    };
  }

  return { ok: true as const, branch };
};

const resolveExistingTarget = (repoRoot: string, worktrees: WorktreeInfo[], input: string) => {
  const matchResult = findWorktreeMatch(worktrees, repoRoot, input);
  if (!matchResult.ok) return matchResult;

  if (matchResult.matches.length === 0) {
    return {
      ok: false as const,
      error: formatError("No worktree matches the provided value.", {
        hint: 'Use worktree_overview { "view": "list" } to see available worktrees.',
      }),
    };
  }

  if (matchResult.matches.length > 1) {
    return {
      ok: false as const,
      error: formatError("Multiple worktrees match the provided value.", {
        details: matchResult.matches.map((match) => match.path).join(", "),
      }),
    };
  }

  const match = matchResult.matches[0];
  return {
    ok: true as const,
    target: {
      branch: branchLabel(match),
      worktreePath: match.path,
      created: false,
      branchExists: true,
    },
  };
};

const resolveSessionTarget = async (
  ctx: WorktreeContext,
  options: WorktreeSessionOptions,
  requireExisting: boolean,
): Promise<{ ok: true; target: WorktreeSessionTarget } | { ok: false; error: string }> => {
  const repoRoot = await getRepoRoot(ctx);
  if (!repoRoot.ok) return { ok: false as const, error: repoRoot.error };

  const worktreesResult = await getWorktrees(ctx, repoRoot.path);
  if (!worktreesResult.ok) return { ok: false as const, error: worktreesResult.error };

  const pathOrBranch = options.pathOrBranch?.trim();
  if (pathOrBranch) {
    return resolveExistingTarget(repoRoot.path, worktreesResult.worktrees, pathOrBranch);
  }

  const pathInput = options.path?.trim();
  if (pathInput) {
    const pathResult = resolveWorktreePath(repoRoot.path, pathInput);
    if (!pathResult.ok) return { ok: false as const, error: pathResult.error };

    const existing = worktreesResult.worktrees.find((worktree) =>
      pathsEqual(worktree.path, pathResult.path),
    );
    if (existing) {
      return {
        ok: true as const,
        target: {
          branch: branchLabel(existing),
          worktreePath: existing.path,
          created: false,
          branchExists: true,
        },
      };
    }

    if (requireExisting) {
      return {
        ok: false as const,
        error: formatError("Worktree path not found.", {
          hint: 'Use worktree_overview { "view": "list" } to see available worktrees.',
        }),
      };
    }
  }

  const branchResult = resolveBranchInput(options);
  if (!branchResult.ok) return branchResult;

  const existingByBranch = worktreesResult.worktrees.find(
    (worktree) => worktree.branch === branchResult.branch,
  );
  if (existingByBranch) {
    return {
      ok: true as const,
      target: {
        branch: branchLabel(existingByBranch),
        worktreePath: existingByBranch.path,
        created: false,
        branchExists: true,
      },
    };
  }

  if (requireExisting) {
    return {
      ok: false as const,
      error: formatError("No worktree matches the provided value.", {
        hint: 'Use worktree_make { "action": "create" } to create one first.',
      }),
    };
  }

  const createResult = await createWorktreeDetails(ctx, {
    name: options.name?.trim() || branchResult.branch,
    branch: branchResult.branch,
    base: options.base,
    path: options.path,
  });
  if (!createResult.ok) return createResult;

  return {
    ok: true as const,
    target: {
      branch: createResult.result.branch,
      worktreePath: createResult.result.worktreePath,
      created: true,
      command: createResult.result.command,
      branchExists: createResult.result.branchExists,
      base: createResult.result.base,
    },
  };
};

const createSessionFromTarget = async (
  ctx: WorktreeContext,
  target: WorktreeSessionTarget,
  options: WorktreeSessionOptions,
): Promise<ToolResult> => {
  const title = `wt:${target.branch}`;
  const sessionResult = await sessionOperation("Session create", () =>
    ctx.session.create(
      {
        location: { directory: target.worktreePath },
        title,
      },
      { signal: ctx.signal },
    ),
  );
  if (!sessionResult.ok) return err(sessionResult.error);
  if (!sessionResult.data?.id) {
    return err(formatError("Session create returned no ID."));
  }

  const createdAt = new Date().toISOString();
  const mappingResult = await storeSessionMapping({
    worktreePath: target.worktreePath,
    branch: target.branch,
    sessionID: sessionResult.data.id,
    createdAt,
  });

  if (!mappingResult.ok) {
    return err(
      `${mappingResult.error}\nSession: ${sessionResult.data.id}\nWorktree: ${target.worktreePath}`,
    );
  }

  const openSessionsRequested = Boolean(options.openSessions);
  const openSessionsError = openSessionsRequested ? await openSessionsUi(ctx) : null;
  const notes: string[] = [];
  if (openSessionsRequested && openSessionsError) {
    notes.push(`Open sessions failed: ${firstLine(openSessionsError)}`);
  }

  return ok(
    buildSessionOutput(
      {
        branch: target.branch,
        worktreePath: target.worktreePath,
        sessionID: sessionResult.data.id,
        title,
        created: target.created,
        command: target.command,
        branchExists: target.branchExists,
        base: target.base,
      },
      mappingResult.path,
      notes,
      openSessionsRequested,
      Boolean(openSessionsError),
      Boolean(options.base),
    ),
  );
};

export const startWorktreeSession = async (
  ctx: WorktreeContext,
  options: WorktreeSessionOptions,
): Promise<ToolResult> => {
  const targetResult = await resolveSessionTarget(ctx, options, false);
  if (!targetResult.ok) return err(targetResult.error);
  return createSessionFromTarget(ctx, targetResult.target, options);
};

export const openWorktreeSession = async (
  ctx: WorktreeContext,
  options: WorktreeSessionOptions,
): Promise<ToolResult> => {
  const targetResult = await resolveSessionTarget(ctx, options, true);
  if (!targetResult.ok) return err(targetResult.error);
  return createSessionFromTarget(ctx, targetResult.target, options);
};

export const forkWorktreeSession = async (
  ctx: WorktreeContext,
  sessionID: string | undefined,
  options: WorktreeSessionOptions,
): Promise<ToolResult> => {
  if (!sessionID) {
    return err(
      formatError("Current session ID is unavailable.", {
        hint: "Run this tool from within an OpenCode session.",
      }),
    );
  }

  const targetResult = await resolveSessionTarget(ctx, options, false);
  if (!targetResult.ok) return err(targetResult.error);

  const forkResult = await forkIntoWorktree(ctx, sessionID, targetResult.target.worktreePath);
  if (!forkResult.ok) return err(forkResult.error);
  if (!forkResult.data?.id) {
    return err(formatError("Session fork returned no ID."));
  }

  const title = `wt:${targetResult.target.branch}`;
  const titleError = await updateSessionTitle(ctx, forkResult.data.id, title);

  const createdAt = new Date().toISOString();
  const mappingResult = await storeSessionMapping({
    worktreePath: targetResult.target.worktreePath,
    branch: targetResult.target.branch,
    sessionID: forkResult.data.id,
    createdAt,
  });

  if (!mappingResult.ok) {
    return err(
      `${mappingResult.error}\nSession: ${forkResult.data.id}\nWorktree: ${targetResult.target.worktreePath}`,
    );
  }

  const openSessionsRequested = Boolean(options.openSessions);
  const openSessionsError = openSessionsRequested ? await openSessionsUi(ctx) : null;
  const notes: string[] = [];
  if (titleError) {
    notes.push(`Session title update failed: ${firstLine(titleError)}`);
  }
  if (openSessionsRequested && openSessionsError) {
    notes.push(`Open sessions failed: ${firstLine(openSessionsError)}`);
  }

  return ok(
    buildSessionOutput(
      {
        branch: targetResult.target.branch,
        worktreePath: targetResult.target.worktreePath,
        sessionID: forkResult.data.id,
        title,
        created: targetResult.target.created,
        command: targetResult.target.command,
        branchExists: targetResult.target.branchExists,
        base: targetResult.target.base,
      },
      mappingResult.path,
      notes,
      openSessionsRequested,
      Boolean(openSessionsError),
      Boolean(options.base),
    ),
  );
};
