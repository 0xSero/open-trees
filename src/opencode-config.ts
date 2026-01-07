import { type ParseError, applyEdits, modify, parse, printParseErrorCode } from "jsonc-parser";

import { formatError } from "./format";

type ConfigObject = Record<string, unknown>;

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

const coercePluginList = (value: unknown) => {
  if (value === undefined) return { ok: true as const, plugins: [] as string[] };
  if (!Array.isArray(value)) {
    return {
      ok: false as const,
      error: formatError("Config field 'plugin' must be an array.", {
        hint: "Update opencode.json to use a plugin array.",
      }),
    };
  }

  for (const item of value) {
    if (typeof item !== "string") {
      return {
        ok: false as const,
        error: formatError("Config field 'plugin' must contain strings only."),
      };
    }
  }

  return { ok: true as const, plugins: value as string[] };
};

export type ConfigUpdateResult =
  | { ok: true; changed: boolean; updatedText: string; plugins: string[] }
  | { ok: false; error: string };

export const updateConfigText = (text: string | null, pluginName: string): ConfigUpdateResult => {
  if (text === null) {
    const plugins = [pluginName];
    return {
      ok: true,
      changed: true,
      updatedText: `${JSON.stringify({ plugin: plugins }, null, 2)}\n`,
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

  const pluginResult = coercePluginList(parsed.config.plugin);
  if (!pluginResult.ok) return pluginResult;

  const plugins = [...pluginResult.plugins];
  const hasPlugin = plugins.includes(pluginName);
  if (!hasPlugin) plugins.push(pluginName);

  if (hasPlugin) {
    return { ok: true, changed: false, updatedText: text, plugins };
  }

  const edits = modify(text, ["plugin"], plugins, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
  });
  const updatedText = applyEdits(text, edits);

  return { ok: true, changed: true, updatedText, plugins };
};
