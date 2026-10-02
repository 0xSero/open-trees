import { readFile, writeFile } from "node:fs/promises";

import { ensureConfigDir, getOpenTreesPath } from "./config";
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

export const getStatePath = () => getOpenTreesPath("state.json");

// V2 can load local sources into distinct module generations in the same host.
// Share queues across generations, keyed by the exact file being changed, and
// serialize complete read/modify/write operations rather than just writes.
const queuesKey = Symbol.for("open-trees.state-queues");
const host = globalThis as typeof globalThis & {
  [queuesKey]?: Map<string, Promise<void>>;
};
const stateQueues = host[queuesKey] ?? new Map<string, Promise<void>>();
host[queuesKey] = stateQueues;

const serializeState = <T>(operation: (statePath: string) => Promise<T>): Promise<T> => {
  const statePath = getStatePath();
  const result = (stateQueues.get(statePath) ?? Promise.resolve()).then(() => operation(statePath));
  const tail = result.then(
    () => {},
    () => {},
  );
  stateQueues.set(statePath, tail);
  void tail.then(() => {
    // A completed operation must not remove a newer operation's queue.
    if (stateQueues.get(statePath) === tail) stateQueues.delete(statePath);
  });
  return result;
};

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

const readStateFile = async (
  statePath: string,
): Promise<{ ok: true; state: WorktreeState; path: string } | { ok: false; error: string }> => {
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

export const readState = () => serializeState(readStateFile);

const writeState = async (statePath: string, state: WorktreeState) => {
  const dirResult = await ensureConfigDir(statePath);
  if (!dirResult.ok) return dirResult;

  const content = `${JSON.stringify(state, null, 2)}\n`;
  try {
    await writeFile(statePath, content, "utf8");
    return { ok: true as const };
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

export const storeSessionMapping = (entry: WorktreeSessionEntry) =>
  serializeState(async (statePath) => {
    const stateResult = await readStateFile(statePath);
    if (!stateResult.ok) return stateResult;

    const filtered = stateResult.state.entries.filter(
      (existing) =>
        existing.worktreePath !== entry.worktreePath && existing.sessionID !== entry.sessionID,
    );
    const nextState: WorktreeState = { entries: [...filtered, entry] };

    const writeResult = await writeState(stateResult.path, nextState);
    if (!writeResult.ok) return writeResult;
    return { ok: true as const, path: stateResult.path };
  });

export const removeSessionMappings = (sessionID: string) =>
  serializeState(async (statePath) => {
    const stateResult = await readStateFile(statePath);
    if (!stateResult.ok) return stateResult;

    const nextEntries = stateResult.state.entries.filter((entry) => entry.sessionID !== sessionID);
    const removedCount = stateResult.state.entries.length - nextEntries.length;

    if (removedCount === 0) {
      return { ok: true as const, removed: 0, path: stateResult.path };
    }

    const writeResult = await writeState(stateResult.path, { entries: nextEntries });
    if (!writeResult.ok) return writeResult;
    return { ok: true as const, removed: removedCount, path: stateResult.path };
  });
