import { expect, test } from "bun:test";

import { unwrapSdkResponse } from "../src/sdk";

test("unwrapSdkResponse handles envelopes and raw values", () => {
  const okEnvelope = unwrapSdkResponse<{ id: string }>({ data: { id: "abc" } }, "action");
  expect(okEnvelope.ok).toBe(true);
  if (okEnvelope.ok) {
    expect(okEnvelope.data.id).toBe("abc");
  }

  const errorEnvelope = unwrapSdkResponse({ error: { message: "boom" } }, "action");
  expect(errorEnvelope.ok).toBe(false);
  if (!errorEnvelope.ok) {
    expect(errorEnvelope.error).toContain("boom");
  }

  const raw = unwrapSdkResponse("value", "action");
  expect(raw.ok).toBe(true);
  if (raw.ok) {
    expect(raw.data).toBe("value");
  }
});
