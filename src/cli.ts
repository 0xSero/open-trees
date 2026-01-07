#!/usr/bin/env bun
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { formatError } from "./format";
import { updateConfigText } from "./opencode-config";

const DEFAULT_PLUGIN = "open-trees";
const CONFIG_FILES = ["opencode.json", "opencode.jsonc"] as const;

type CliOptions = {
  command: "add" | "help";
  configPath?: string;
  pluginName: string;
  dryRun: boolean;
};

const usage = () => `Usage:
  open-trees add [--config <path>] [--plugin <name>] [--dry-run]

Options:
  --config   Path to opencode.json/opencode.jsonc
  --plugin   Plugin name to add (default: ${DEFAULT_PLUGIN})
  --dry-run  Print result without writing
  --help     Show this help
`;

const parseArgs = (argv: string[]): CliOptions | { error: string } => {
  const args = [...argv];
  const first = args[0];
  const command = first && !first.startsWith("-") ? (args.shift() as string) : "add";

  if (command !== "add" && command !== "help") {
    return { error: formatError("Unknown command.", { hint: usage() }) };
  }

  let configPath: string | undefined;
  let pluginName = DEFAULT_PLUGIN;
  let dryRun = false;

  while (args.length > 0) {
    const token = args.shift();
    if (!token) continue;

    if (token === "--help" || token === "-h") {
      return { command: "help", pluginName, dryRun, configPath };
    }

    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (token === "--config" || token === "-c") {
      const value = args.shift();
      if (!value) return { error: formatError("Missing value for --config.") };
      configPath = value;
      continue;
    }

    if (token === "--plugin" || token === "-p") {
      const value = args.shift();
      if (!value) return { error: formatError("Missing value for --plugin.") };
      pluginName = value;
      continue;
    }

    return { error: formatError(`Unknown option: ${token}`, { hint: usage() }) };
  }

  return { command: command as CliOptions["command"], configPath, pluginName, dryRun };
};

const fileExists = async (value: string) => {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
};

const resolveConfigPath = async (explicitPath?: string) => {
  if (explicitPath) return path.resolve(explicitPath);

  const configRoot = process.env.XDG_CONFIG_HOME
    ? path.resolve(process.env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), ".config");
  const baseDir = path.join(configRoot, "opencode");

  for (const filename of CONFIG_FILES) {
    const candidate = path.join(baseDir, filename);
    if (await fileExists(candidate)) return candidate;
  }

  return path.join(baseDir, CONFIG_FILES[0]);
};

const readConfig = async (configPath: string) => {
  if (!(await fileExists(configPath))) return null;
  return readFile(configPath, "utf8");
};

const writeConfig = async (configPath: string, text: string) => {
  await mkdir(path.dirname(configPath), { recursive: true });
  const normalized = text.endsWith("\n") ? text : `${text}\n`;
  await writeFile(configPath, normalized, "utf8");
};

const run = async () => {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exitCode = 1;
    return;
  }

  if (parsed.command === "help") {
    console.log(usage());
    return;
  }

  const configPath = await resolveConfigPath(parsed.configPath);
  const existingText = await readConfig(configPath);

  const updateResult = updateConfigText(existingText, parsed.pluginName);
  if (!updateResult.ok) {
    console.error(updateResult.error);
    process.exitCode = 1;
    return;
  }

  if (!parsed.dryRun && updateResult.changed) {
    await writeConfig(configPath, updateResult.updatedText);
  }

  const lines = [
    `Config: ${configPath}`,
    updateResult.changed
      ? `Added plugin: ${parsed.pluginName}`
      : `Plugin already present: ${parsed.pluginName}`,
    parsed.dryRun ? "Dry run: no changes written" : "",
  ].filter(Boolean);

  console.log(lines.join("\n"));
};

await run();
