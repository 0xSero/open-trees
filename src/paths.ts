import path from "node:path";

export const normalizeBranchName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const normalized = trimmed
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9./-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+/, "")
    .replace(/[-/]+$/, "");

  return normalized;
};

export const defaultWorktreePath = (repoRoot: string, branch: string) => {
  const parent = path.dirname(repoRoot);
  const repoName = path.basename(repoRoot);
  return path.join(parent, `${repoName}.worktrees`, branch);
};

export const resolveWorktreePath = (repoRoot: string, inputPath: string) =>
  path.isAbsolute(inputPath) ? path.normalize(inputPath) : path.resolve(repoRoot, inputPath);

export const pathsEqual = (left: string, right: string) =>
  path.resolve(left) === path.resolve(right);
