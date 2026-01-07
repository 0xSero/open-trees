import type { PluginInput } from "@opencode-ai/plugin";

import { formatError } from "./format";
import { unwrapSdkResponse } from "./sdk";
import { openSessionsUi, updateSessionTitle } from "./session-helpers";
import { storeSessionMapping } from "./state";
import { createWorktreeDetails } from "./worktree";

const firstLine = (value: string) => value.split(/\r?\n/)[0] ?? value;

const buildNextSteps = (
  sessionID: string,
  openSessionsRequested: boolean,
  openSessionsFailed: boolean,
) => {
  const openLabel = openSessionsRequested
    ? openSessionsFailed
      ? "retry with openSessions: true (or run /sessions)"
      : "already opened"
    : "set openSessions: true (or run /sessions)";
  const steps = [
    "Next steps:",
    `- Open sessions UI: ${openLabel}`,
    `- Select session ${sessionID}`,
  ];
  return steps.join("\n");
};

type WorktreeSessionOptions = {
  name: string;
  branch?: string;
  base?: string;
  path?: string;
  openSessions?: boolean;
};

type WorktreeSessionResult = {
  branch: string;
  worktreePath: string;
  sessionID: string;
  title: string;
  command: string;
};

const buildSessionOutput = (
  result: WorktreeSessionResult,
  statePath: string,
  notes: string[],
  openSessionsRequested: boolean,
  openSessionsFailed: boolean,
) => {
  const lines = [
    "Worktree session created.",
    `Branch: ${result.branch}`,
    `Worktree: ${result.worktreePath}`,
    `Session: ${result.sessionID}`,
    `Title: ${result.title}`,
    `Command: ${result.command}`,
    `State: ${statePath}`,
  ];

  if (notes.length > 0) {
    lines.push(`Notes:\n${notes.map((note) => `- ${note}`).join("\n")}`);
  }

  lines.push(buildNextSteps(result.sessionID, openSessionsRequested, openSessionsFailed));
  return lines.join("\n");
};

export const startWorktreeSession = async (ctx: PluginInput, options: WorktreeSessionOptions) => {
  const worktreeResult = await createWorktreeDetails(ctx, options);
  if (!worktreeResult.ok) return worktreeResult.error;

  const title = `wt:${worktreeResult.result.branch}`;
  const sessionResponse = await ctx.client.session.create({
    query: { directory: worktreeResult.result.worktreePath },
    body: { title },
  });
  const sessionResult = unwrapSdkResponse<{ id: string }>(sessionResponse, "Session create");
  if (!sessionResult.ok) return sessionResult.error;

  const createdAt = new Date().toISOString();
  const mappingResult = await storeSessionMapping({
    worktreePath: worktreeResult.result.worktreePath,
    branch: worktreeResult.result.branch,
    sessionID: sessionResult.data.id,
    createdAt,
  });

  if (!mappingResult.ok) {
    return `${mappingResult.error}\nSession: ${sessionResult.data.id}\nWorktree: ${worktreeResult.result.worktreePath}`;
  }

  const openSessionsRequested = Boolean(options.openSessions);
  const openSessionsError = openSessionsRequested ? await openSessionsUi(ctx) : null;
  const notes: string[] = [];
  if (openSessionsError) {
    notes.push(`Open sessions failed: ${firstLine(openSessionsError)}`);
  }

  return buildSessionOutput(
    {
      branch: worktreeResult.result.branch,
      worktreePath: worktreeResult.result.worktreePath,
      sessionID: sessionResult.data.id,
      title,
      command: worktreeResult.result.command,
    },
    mappingResult.path,
    notes,
    openSessionsRequested,
    Boolean(openSessionsError),
  );
};

export const forkWorktreeSession = async (
  ctx: PluginInput,
  sessionID: string | undefined,
  options: WorktreeSessionOptions,
) => {
  if (!sessionID) {
    return formatError("Current session ID is unavailable.", {
      hint: "Run this tool from within an OpenCode session.",
    });
  }

  const worktreeResult = await createWorktreeDetails(ctx, options);
  if (!worktreeResult.ok) return worktreeResult.error;

  const forkResponse = await ctx.client.session.fork({
    path: { id: sessionID },
    query: { directory: worktreeResult.result.worktreePath },
  });
  const forkResult = unwrapSdkResponse<{ id: string }>(forkResponse, "Session fork");
  if (!forkResult.ok) return forkResult.error;

  const title = `wt:${worktreeResult.result.branch}`;
  const titleError = await updateSessionTitle(ctx, forkResult.data.id, title);

  const createdAt = new Date().toISOString();
  const mappingResult = await storeSessionMapping({
    worktreePath: worktreeResult.result.worktreePath,
    branch: worktreeResult.result.branch,
    sessionID: forkResult.data.id,
    createdAt,
  });

  if (!mappingResult.ok) {
    return `${mappingResult.error}\nSession: ${forkResult.data.id}\nWorktree: ${worktreeResult.result.worktreePath}`;
  }

  const openSessionsRequested = Boolean(options.openSessions);
  const openSessionsError = openSessionsRequested ? await openSessionsUi(ctx) : null;
  const notes: string[] = [];
  if (titleError) {
    notes.push(`Session title update failed: ${firstLine(titleError)}`);
  }
  if (openSessionsError) {
    notes.push(`Open sessions failed: ${firstLine(openSessionsError)}`);
  }

  return buildSessionOutput(
    {
      branch: worktreeResult.result.branch,
      worktreePath: worktreeResult.result.worktreePath,
      sessionID: forkResult.data.id,
      title,
      command: worktreeResult.result.command,
    },
    mappingResult.path,
    notes,
    openSessionsRequested,
    Boolean(openSessionsError),
  );
};
