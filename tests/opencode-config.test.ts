import { expect, test } from "bun:test";

import { updateConfigText } from "../src/opencode-config";

test("updateConfigText creates config when missing", () => {
  const result = updateConfigText(null, "open-trees");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.changed).toBe(true);
    expect(result.plugins).toEqual(["open-trees"]);
    expect(result.updatedText).toContain("open-trees");
  }
});

test("updateConfigText adds plugin to existing config", () => {
  const input = `{
  "plugin": ["alpha"]
}\n`;
  const result = updateConfigText(input, "open-trees");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.changed).toBe(true);
    expect(result.plugins).toEqual(["alpha", "open-trees"]);
    expect(result.updatedText).toContain("open-trees");
  }
});

test("updateConfigText is stable when plugin already present", () => {
  const input = `{
  "plugin": ["open-trees"]
}\n`;
  const result = updateConfigText(input, "open-trees");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.changed).toBe(false);
    expect(result.updatedText).toBe(input);
  }
});

test("updateConfigText preserves comments in jsonc", () => {
  const input = `{
  // comment
  "plugin": ["alpha"],
}
`;
  const result = updateConfigText(input, "open-trees");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.updatedText).toContain("// comment");
    expect(result.updatedText).toContain("open-trees");
  }
});

test("updateConfigText rejects non-array plugin fields", () => {
  const input = `{
  "plugin": "alpha"
}
`;
  const result = updateConfigText(input, "open-trees");
  expect(result.ok).toBe(false);
});

test("updateConfigText creates a native V2 plugins array", () => {
  const result = updateConfigText(null, "open-trees");
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(JSON.parse(result.updatedText)).toEqual({ plugins: ["open-trees"] });
});

test("updateConfigText appends to native plugins without shadowing them with legacy plugin", () => {
  const input =
    '{"plugins":[{"package":"example-plugin","options":{"strict":true}}],"model":"example/model"}';
  const result = updateConfigText(input, "open-trees");
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(JSON.parse(result.updatedText)).toEqual({
    plugins: [{ package: "example-plugin", options: { strict: true } }, "open-trees"],
    model: "example/model",
  });
});
