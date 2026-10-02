import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Host } from "@opencode/plugin/host";
import { prepareSource } from "@opencode/plugin/source.bun";
import type { WorktreeSessionEntry } from "../src/state";

type StateModule = typeof import("../src/state");

const firstMapping: WorktreeSessionEntry = {
  worktreePath: "/repo/.worktrees/first",
  branch: "first",
  sessionID: "ses_first",
  createdAt: "2026-10-02T00:00:00Z",
};
const secondMapping: WorktreeSessionEntry = {
  worktreePath: "/repo/.worktrees/second",
  branch: "second",
  sessionID: "ses_second",
  createdAt: "2026-10-02T00:00:00Z",
};

const entrypoint = new URL("../src/state.ts", import.meta.url).href;
const tempRoot = process.env.OPENCODE_TEST_TMPDIR ?? os.tmpdir();

async function loadGeneration(): Promise<StateModule> {
  // Use the SDK's real source invalidation and Host importer, not a cache-busted
  // direct import that might leave transitive modules shared accidentally.
  await prepareSource(entrypoint, () => {});
  return Host.load(entrypoint) as Promise<StateModule>;
}

async function withGenerations(
  run: (first: StateModule, second: StateModule, statePath: string, root: string) => Promise<void>,
) {
  const root = await mkdtemp(path.join(tempRoot, "open-trees-state-generations-"));
  const original = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = root;

  try {
    const first = await loadGeneration();
    const second = await loadGeneration();
    const statePath = path.join(root, "opencode", "open-trees", "state.json");
    expect(first).not.toBe(second);
    expect(first.storeSessionMapping).not.toBe(second.storeSessionMapping);
    expect(first.getStatePath()).toBe(statePath);
    expect(second.getStatePath()).toBe(statePath);
    await run(first, second, statePath, root);
  } finally {
    if (original === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = original;
    await rm(root, { recursive: true, force: true });
  }
}

test("real native source generations retain both concurrent session mappings", async () => {
  await withGenerations(async (first, second, statePath) => {
    const entries = [firstMapping, secondMapping];

    const results = await Promise.all([
      first.storeSessionMapping(entries[0]),
      second.storeSessionMapping(entries[1]),
    ]);
    expect(results).toEqual([
      { ok: true, path: statePath },
      { ok: true, path: statePath },
    ]);

    const stored = JSON.parse(await readFile(statePath, "utf8"));
    expect(stored).toEqual({ entries });
  });
});

test("cross-generation reads and deletion serialize behind earlier mapping stores", async () => {
  await withGenerations(async (first, second, statePath) => {
    expect(await first.storeSessionMapping(firstMapping)).toEqual({ ok: true, path: statePath });

    const [stored, removed, read] = await Promise.all([
      first.storeSessionMapping(secondMapping),
      second.removeSessionMappings("ses_first"),
      second.readState(),
    ]);
    expect(stored).toEqual({ ok: true, path: statePath });
    expect(removed).toEqual({ ok: true, removed: 1, path: statePath });
    expect(read).toEqual({ ok: true, state: { entries: [secondMapping] }, path: statePath });
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual({ entries: [secondMapping] });
  });
});

test("queued state operations retain the exact config path selected when called", async () => {
  await withGenerations(async (first, second, statePath, root) => {
    const otherConfig = path.join(root, "second-config");
    const otherStatePath = path.join(otherConfig, "opencode", "open-trees", "state.json");

    const firstStore = first.storeSessionMapping(firstMapping);
    process.env.XDG_CONFIG_HOME = otherConfig;
    const secondStore = second.storeSessionMapping(secondMapping);
    expect(await Promise.all([firstStore, secondStore])).toEqual([
      { ok: true, path: statePath },
      { ok: true, path: otherStatePath },
    ]);

    process.env.XDG_CONFIG_HOME = root;
    const firstRead = second.readState();
    const removal = second.removeSessionMappings("ses_first");
    process.env.XDG_CONFIG_HOME = otherConfig;
    const secondRead = first.readState();
    expect(await Promise.all([firstRead, removal, secondRead])).toEqual([
      { ok: true, state: { entries: [firstMapping] }, path: statePath },
      { ok: true, removed: 1, path: statePath },
      { ok: true, state: { entries: [secondMapping] }, path: otherStatePath },
    ]);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual({ entries: [] });
    expect(JSON.parse(await readFile(otherStatePath, "utf8"))).toEqual({
      entries: [secondMapping],
    });
  });
});
