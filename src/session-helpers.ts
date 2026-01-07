import type { PluginInput } from "@opencode-ai/plugin";

import { unwrapSdkResponse } from "./sdk";

export const openSessionsUi = async (ctx: PluginInput) => {
  const response = await ctx.client.tui.openSessions();
  const result = unwrapSdkResponse<unknown>(response, "Open sessions UI");
  if (!result.ok) {
    return result.error;
  }
  return null;
};

export const updateSessionTitle = async (ctx: PluginInput, sessionID: string, title: string) => {
  const response = await ctx.client.session.update({
    path: { id: sessionID },
    body: { title },
  });
  const result = unwrapSdkResponse<unknown>(response, "Session title update");
  if (!result.ok) {
    return result.error;
  }
  return null;
};
