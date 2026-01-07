import { expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const fileExists = async (value: string) => {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
};

const resolveCliPath = async (root: string) => {
  const distCli = path.join(root, "dist", "cli.js");
  if (await fileExists(distCli)) return distCli;
  return path.join(root, "src", "cli.ts");
};

const runCli = async (args: string[], cwd: string) => {
  const proc = Bun.spawn([process.execPath, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
};

test("open-trees add writes config when missing", async () => {
  const root = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "open-trees-e2e-"));
  const configPath = path.join(tempDir, "opencode.json");
  const cliPath = await resolveCliPath(root);

  try {
    const result = await runCli([cliPath, "add", "--config", configPath], root);
    expect(result.exitCode).toBe(0);
    expect(result.stderr.trim()).toBe("");
    expect(result.stdout).toContain("Added plugin");

    const text = await readFile(configPath, "utf8");
    expect(text).toContain("\"plugin\"");
    expect(text).toContain("open-trees");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("open-trees add dry-run does not write config", async () => {
  const root = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "open-trees-e2e-"));
  const configPath = path.join(tempDir, "opencode.json");
  const cliPath = await resolveCliPath(root);
  const original = `{\n  \"plugin\": [\"alpha\"]\n}\n`;

  try {
    await writeFile(configPath, original, "utf8");
    const result = await runCli(
      [cliPath, "add", "--config", configPath, "--dry-run"],
      root,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr.trim()).toBe("");
    expect(result.stdout).toContain("Dry run");

    const after = await readFile(configPath, "utf8");
    expect(after).toBe(original);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
