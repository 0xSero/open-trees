import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { formatError } from "./format";

export type WorktreeSessionEntry = {
  worktreePath: string;
  branch: string;
  sessionID: string;
  createdAt: string;
};

type WorktreeState = {
  entries: WorktreeSessionEntry[];
};

const getConfigRoot = () => {
  const envPath = process.env.XDG_CONFIG_HOME;
  return envPath ? path.resolve(envPath) : path.join(os.homedir(), ".config");
};

export const getStatePath = () =>
  path.join(getConfigRoot(), "opencode", "open-trees", "state.json");

const isValidEntry = (value: unknown): value is WorktreeSessionEntry => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.worktreePath === "string" &&
    typeof record.branch === "string" &&
    typeof record.sessionID === "string" &&
    typeof record.createdAt === "string"
  );
};

const normalizeState = (value: unknown): WorktreeState => {
  if (!value || typeof value !== "object") return { entries: [] };
  const record = value as Record<string, unknown>;
  const entries = Array.isArray(record.entries) ? record.entries.filter(isValidEntry) : [];
  return { entries };
};

const ensureStateDir = async (statePath: string) => {
  await mkdir(path.dirname(statePath), { recursive: true });
};

export const readState = async (): Promise<
  { ok: true; state: WorktreeState; path: string } | { ok: false; error: string }
> => {
  const statePath = getStatePath();

  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return { ok: true, state: normalizeState(parsed), path: statePath };
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

    if (errorCode === "ENOENT") {
      return { ok: true, state: { entries: [] }, path: statePath };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: formatError("Unable to read state file.", {
        details: message,
        hint: "Fix or remove the state file to recreate it.",
      }),
    };
  }
};

const writeState = async (statePath: string, state: WorktreeState) => {
  await ensureStateDir(statePath);
  const content = `${JSON.stringify(state, null, 2)}\n`;
  await writeFile(statePath, content, "utf8");
};

export const storeSessionMapping = async (entry: WorktreeSessionEntry) => {
  const stateResult = await readState();
  if (!stateResult.ok) return stateResult;

  const filtered = stateResult.state.entries.filter(
    (existing) =>
      existing.worktreePath !== entry.worktreePath && existing.sessionID !== entry.sessionID,
  );
  const nextState: WorktreeState = { entries: [...filtered, entry] };

  try {
    await writeState(stateResult.path, nextState);
    return { ok: true as const, path: stateResult.path };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false as const,
      error: formatError("Unable to write state file.", {
        details: message,
      }),
    };
  }
};

export const removeSessionMappings = async (sessionID: string) => {
  const stateResult = await readState();
  if (!stateResult.ok) return stateResult;

  const nextEntries = stateResult.state.entries.filter((entry) => entry.sessionID !== sessionID);
  const removedCount = stateResult.state.entries.length - nextEntries.length;

  if (removedCount === 0) {
    return { ok: true as const, removed: 0, path: stateResult.path };
  }

  try {
    await writeState(stateResult.path, { entries: nextEntries });
    return { ok: true as const, removed: removedCount, path: stateResult.path };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false as const,
      error: formatError("Unable to write state file.", {
        details: message,
      }),
    };
  }
};
