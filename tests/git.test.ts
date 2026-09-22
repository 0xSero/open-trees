import { expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { $ } from "bun";

import { getWorktrees, parseWorktreeList } from "../src/git";

test("parseWorktreeList parses porcelain output", () => {
  const output = [
    "worktree /repo",
    "HEAD abcdef1",
    "branch refs/heads/main",
    "",
    "worktree /repo/.worktrees/feature",
    "HEAD 1234567",
    "branch refs/heads/feature",
    "prunable worktree prune reason",
    "",
  ].join("\n");

  const worktrees = parseWorktreeList(output);
  expect(worktrees.length).toBe(2);
  expect(worktrees[0]?.path).toBe("/repo");
  expect(worktrees[0]?.branch).toBe("main");
  expect(worktrees[1]?.path).toBe("/repo/.worktrees/feature");
  expect(worktrees[1]?.branch).toBe("feature");
  expect(worktrees[1]?.prunable).toBe(true);
});

test("getWorktrees preserves special characters in worktree paths", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "open-trees-git-"));
  const root = await realpath(temp);
  const repo = path.join(root, "repo");
  try {
    await $`git init ${repo}`.quiet();
    await $`git -C ${repo} -c user.name=Test -c user.email=test@example.com commit --allow-empty -m initial`.quiet();
    const names = ["tab\tpath", "line\nbreak", 'quoted"path', "trailing-space "];
    const expected = names.map((name) => path.join(root, name));
    for (const worktree of expected) {
      await $`git -C ${repo} worktree add --detach ${worktree} HEAD`.quiet();
    }
    const ctx = { $: $.cwd(repo) } as unknown as PluginInput;
    const result = await getWorktrees(ctx, repo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.worktrees.map((entry) => entry.path).sort()).toEqual([repo, ...expected].sort());
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
