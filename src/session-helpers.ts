import type { WorktreeContext } from "./context";
import { formatError } from "./format";
import { pathsEqual } from "./paths";

export async function sessionOperation<T>(
  action: string,
  operation: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return {
      ok: false,
      error: formatError(`${action} failed.`, {
        details: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function openSessionsUi(ctx: WorktreeContext): Promise<string | null> {
  const result = await sessionOperation("Open sessions UI", () =>
    ctx.openSessions(ctx.sessionID ?? ""),
  );
  return result.ok ? null : result.error;
}

export async function updateSessionTitle(
  ctx: WorktreeContext,
  sessionID: string,
  title: string,
): Promise<string | null> {
  const result = await sessionOperation("Session title update", () =>
    ctx.session.update({ sessionID, title }, { signal: ctx.signal }),
  );
  return result.ok ? null : result.error;
}

// V2 fork deliberately inherits the source location. Moving is a separate
// admitted operation: wait for it, then verify before recording a mapping.
export async function forkIntoWorktree(ctx: WorktreeContext, sessionID: string, directory: string) {
  return sessionOperation("Session fork", async () => {
    const fork = await ctx.session.fork({ sessionID }, { signal: ctx.signal });
    if (!fork?.id) throw new Error("Session fork returned no ID.");
    await ctx.session.move({ sessionID: fork.id, directory }, { signal: ctx.signal });
    await ctx.session.wait({ sessionID: fork.id }, { signal: ctx.signal });
    const moved = await ctx.session.get({ sessionID: fork.id }, { signal: ctx.signal });
    if (!pathsEqual(moved.location.directory, directory)) {
      throw new Error(
        `Fork ${fork.id} did not move to ${directory}. No worktree mapping was recorded.`,
      );
    }
    return moved;
  });
}
