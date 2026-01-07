import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { readState, removeSessionMappings, storeSessionMapping } from "../src/state";

test("state mapping roundtrip", async () => {
  const originalConfigHome = process.env.XDG_CONFIG_HOME;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "open-trees-"));
  process.env.XDG_CONFIG_HOME = tempDir;

  try {
    const storeResult = await storeSessionMapping({
      worktreePath: "/tmp/worktree",
      branch: "wt/example",
      sessionID: "session-1",
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    expect(storeResult.ok).toBe(true);

    const readResult = await readState();
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.state.entries).toHaveLength(1);
      expect(readResult.state.entries[0]?.sessionID).toBe("session-1");
    }

    const removeResult = await removeSessionMappings("session-1");
    expect(removeResult.ok).toBe(true);
    if (removeResult.ok) {
      expect(removeResult.removed).toBe(1);
    }

    const afterResult = await readState();
    expect(afterResult.ok).toBe(true);
    if (afterResult.ok) {
      expect(afterResult.state.entries).toHaveLength(0);
    }
  } finally {
    process.env.XDG_CONFIG_HOME = originalConfigHome;
    await rm(tempDir, { recursive: true, force: true });
  }
});
