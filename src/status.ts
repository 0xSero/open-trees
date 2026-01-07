export type StatusSummary = {
  staged: number;
  unstaged: number;
  untracked: number;
  total: number;
  clean: boolean;
  lines: string[];
};

export const summarizePorcelain = (porcelain: string): StatusSummary => {
  const lines = porcelain
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const line of lines) {
    if (line.startsWith("??")) {
      untracked += 1;
      continue;
    }

    const stagedFlag = line[0];
    const unstagedFlag = line[1];

    if (stagedFlag && stagedFlag !== " ") staged += 1;
    if (unstagedFlag && unstagedFlag !== " ") unstaged += 1;
  }

  const total = lines.length;
  const clean = total === 0;

  return { staged, unstaged, untracked, total, clean, lines };
};
