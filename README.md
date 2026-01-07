# Open Trees

OpenCode plugin for fast, safe `git worktree` workflows.

## Install

```bash
bun add open-trees
```

Add the plugin to your OpenCode config (usually `~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["open-trees"]
}
```

Or run the helper CLI:

```bash
bunx open-trees add
```

For local development, build the plugin and point OpenCode at the local package:

```bash
bun install
bun run build
```

```json
{
  "plugin": ["/absolute/path/to/open-trees"]
}
```

## Tools

- `worktree_list` — list worktrees with branch/path/HEAD info.
- `worktree_status` — summarize dirty/clean status per worktree.
- `worktree_create` — create a worktree (optionally create a branch).
- `worktree_start` — create a worktree and start a new session.
- `worktree_fork` — create a worktree and fork the current session into it.
- `worktree_dashboard` — overview of known worktrees/sessions.
- `worktree_swarm` — create multiple worktrees and fork sessions.
- `worktree_remove` — remove a worktree (guarded unless `force: true`).
- `worktree_prune` — run `git worktree prune` (optionally `dryRun`).
- `worktree_help` — show a quick help sheet.

### Examples

List worktrees:

```text
worktree_list
```

Status for all worktrees:

```text
worktree_status
```

Status for a single worktree path:

```text
worktree_status { "path": "/path/to/repo.worktrees/feature-a" }
```

Create a worktree (branch derived from name):

```text
worktree_create { "name": "feature audit" }
```

Create a worktree with explicit branch and base:

```text
worktree_create { "name": "audit", "branch": "feature/audit", "base": "main" }
```

Start a new session in a worktree:

```text
worktree_start { "name": "feature audit", "openSessions": true }
```

Fork the current session into a worktree:

```text
worktree_fork { "name": "feature audit", "openSessions": true }
```

Show the worktree/session dashboard:

```text
worktree_dashboard
```

Create a swarm of worktrees/sessions:

```text
worktree_swarm { "tasks": ["refactor-auth", "docs-refresh"], "openSessions": true }
```

Create a swarm with a custom branch prefix:

```text
worktree_swarm { "tasks": ["refactor-auth"], "prefix": "wt/" }
```

Remove a worktree:

```text
worktree_remove { "pathOrBranch": "feature/audit" }
```

Force remove a dirty worktree:

```text
worktree_remove { "pathOrBranch": "feature/audit", "force": true }
```

Prune stale worktree entries:

```text
worktree_prune { "dryRun": true }
```

## Defaults and safety

- Default worktree path (when `path` is omitted):
  - `<parent-of-repo>/<repo-name>.worktrees/<branch>`
- Branch name is derived from `name` when `branch` is omitted (lowercased, spaces to `-`).
- `worktree_remove` refuses to delete dirty worktrees unless `force: true`.
- All tools return readable output with explicit paths and git commands.

## Session workflow

`worktree_start` and `worktree_fork` create a worktree, then create a session in that directory.
Each action records a mapping entry at:

- `~/.config/opencode/open-trees/state.json` (or `${XDG_CONFIG_HOME}/opencode/open-trees/state.json`)

The session title defaults to `wt:<branch>`, and the output includes the session ID plus next steps.

Swarm safety notes:

- `worktree_swarm` refuses to reuse existing branches or paths unless `force: true`.
- It never deletes existing worktrees; it only creates new ones.

Optional command file examples:

```text
# .opencode/command/wt-start.md
worktree_start { "name": "$1", "openSessions": true }
```

```text
# .opencode/command/wt-fork.md
worktree_fork { "name": "$1", "openSessions": true }
```

Slash commands (drop these files into `.opencode/command`):

```text
/wt-help
/wt-list
/wt-status
/wt-status-path <path>
/wt-create <name>
/wt-start <name>
/wt-fork <name>
/wt-dashboard
/wt-swarm <task>
/wt-remove <pathOrBranch>
/wt-remove-force <pathOrBranch>
/wt-prune
/wt-prune-dry
```

## Development

E2E tests exercise the CLI against a temporary OpenCode config file.

```bash
bun run lint
bun run typecheck
bun run build
bun run test
bun run test:e2e
```
