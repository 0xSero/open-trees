import { applyEdits, modify, type ParseError, parse, printParseErrorCode } from "jsonc-parser";

import { formatError } from "./format";

type ConfigObject = Record<string, unknown>;
type PluginEntry = string | { package: string; options?: Record<string, unknown> };

type ParsedConfig = {
  config: ConfigObject;
  errors: ParseError[];
  isObject: boolean;
};

const parseConfigText = (text: string): ParsedConfig => {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });

  if (!value) {
    return { config: {}, errors, isObject: true };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { config: {}, errors, isObject: false };
  }

  return { config: value as ConfigObject, errors, isObject: true };
};

const coercePluginList = (value: unknown, field: "plugin" | "plugins") => {
  if (value === undefined) return { ok: true as const, plugins: [] as PluginEntry[] };
  if (!Array.isArray(value)) {
    return {
      ok: false as const,
      error: formatError(`Config field '${field}' must be an array.`, {
        hint: "Update opencode.json to use a plugin array.",
      }),
    };
  }

  for (const item of value) {
    if (
      typeof item !== "string" &&
      !(field === "plugins" && item && typeof item === "object" && typeof item.package === "string")
    ) {
      return {
        ok: false as const,
        error: formatError(`Config field '${field}' contains an invalid plugin entry.`),
      };
    }
  }

  return { ok: true as const, plugins: value as PluginEntry[] };
};

export type ConfigUpdateResult =
  | { ok: true; changed: boolean; updatedText: string; plugins: PluginEntry[] }
  | { ok: false; error: string };

export const updateConfigText = (text: string | null, pluginName: string): ConfigUpdateResult => {
  if (text === null) {
    const plugins = [pluginName];
    return {
      ok: true,
      changed: true,
      updatedText: `${JSON.stringify({ plugins }, null, 2)}\n`,
      plugins,
    };
  }

  const parsed = parseConfigText(text);
  if (parsed.errors.length > 0) {
    const errorMessage = parsed.errors.map((error) => printParseErrorCode(error.error)).join(", ");
    return {
      ok: false,
      error: formatError("Unable to parse OpenCode config.", {
        details: errorMessage,
        hint: "Check opencode.json for syntax errors.",
      }),
    };
  }

  if (!parsed.isObject) {
    return {
      ok: false,
      error: formatError("OpenCode config must be a JSON object.", {
        hint: "Fix opencode.json to use an object with a plugin array.",
      }),
    };
  }

  const field =
    parsed.config.plugins !== undefined
      ? "plugins"
      : parsed.config.plugin !== undefined
        ? "plugin"
        : "plugins";
  const pluginResult = coercePluginList(parsed.config[field], field);
  if (!pluginResult.ok) return pluginResult;

  const plugins = [...pluginResult.plugins];
  const hasPlugin = plugins.some((entry) =>
    typeof entry === "string" ? entry === pluginName : entry.package === pluginName,
  );
  if (!hasPlugin) plugins.push(pluginName);

  if (hasPlugin) {
    return { ok: true, changed: false, updatedText: text, plugins };
  }

  const edits = modify(text, [field], plugins, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
  });
  const updatedText = applyEdits(text, edits);

  return { ok: true, changed: true, updatedText, plugins };
};
