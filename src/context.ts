import type { SessionApi } from "@opencode/client/promise/api";

// Domain context, not an OpenCode V1 PluginInput. Session operations keep their
// native V2 request/response shapes; each execution owns its cancellation signal.
export interface WorktreeContext {
  directory: string;
  worktree: string;
  session: Pick<SessionApi, "create" | "get" | "update" | "fork" | "move" | "wait">;
  openSessions: (sessionID: string) => Promise<void>;
  ensureForkAvailable?: (signal?: AbortSignal) => Promise<void>;
  sessionID?: string;
  signal?: AbortSignal;
}
