<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/pattern-dark.svg" />
  <img alt="Warm paper pattern" src="assets/brand/pattern-light.svg" width="100%" />
</picture>

# Usage Guide

## Enable Worktree Mode

Worktree tools only run after enabling worktree mode:

```text
worktree_mode { "action": "on" }
```

Disable when you are done:

```text
worktree_mode { "action": "off" }
```

## Worktree Overview

### List All Worktrees

```text
worktree_overview
```

Lists all git worktrees in the repository with branch, path, HEAD, and lock status.

### Check Worktree Status

```text
worktree_overview { "view": "status" }
```

Filter status to a specific worktree path:

```text
worktree_overview { "view": "status", "path": "/path/to/repo/.worktrees/feature-a" }
```

**Status Options:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Only report status for this worktree path |
| `all` | boolean | Include all known worktrees |
| `porcelain` | boolean | Include raw git status --porcelain output |

### Worktree Dashboard

```text
worktree_overview { "view": "dashboard" }
```

Shows task name, branch, worktree path, session ID, dirty status, and last updated time.

## Create and Open Worktrees

All creation and session actions go through `worktree_make`.

### Create a Worktree

```text
worktree_make { "action": "create", "name": "feature audit" }
```

Create with explicit branch and base:

```text
worktree_make { "action": "create", "name": "audit", "branch": "feature/audit", "base": "main" }
```

### Start a Session (Create or Reuse)

```text
worktree_make { "action": "start", "name": "feature auth", "openSessions": true }
```

### Open a Session in an Existing Worktree

```text
worktree_make { "action": "open", "pathOrBranch": "feature/auth", "openSessions": true }
```

### Fork Current Session

```text
worktree_make { "action": "fork", "name": "feature auth", "openSessions": true }
```

### Create Worktree Swarm

```text
worktree_make { "action": "swarm", "tasks": ["refactor-auth", "docs-refresh"] }
```

With custom branch prefix:

```text
worktree_make { "action": "swarm", "tasks": ["refactor-auth"], "prefix": "wt/" }
```

**worktree_make Options:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | string | One of `create`, `start`, `open`, `fork`, `swarm` |
| `name` | string | Logical name used to derive branch and folder |
| `branch` | string | Explicit branch name (overrides derived name) |
| `base` | string | Base ref for new branch (default: `HEAD`) |
| `path` | string | Explicit filesystem path for the worktree |
| `pathOrBranch` | string | Existing worktree path or branch to open |
| `openSessions` | boolean | Open the sessions UI after creation |
| `tasks` | string[] | Task names for swarm worktrees |
| `prefix` | string | Branch prefix (default: `wt/`) |
| `force` | boolean | Allow existing branches or paths without skipping |

## Cleanup

### Remove a Worktree

```text
worktree_cleanup { "action": "remove", "pathOrBranch": "feature/audit" }
```

Force remove a worktree with uncommitted changes:

```text
worktree_cleanup { "action": "remove", "pathOrBranch": "feature/audit", "force": true }
```

### Prune Stale Worktrees

```text
worktree_cleanup { "action": "prune" }
```

Preview without making changes:

```text
worktree_cleanup { "action": "prune", "dryRun": true }
```

**Cleanup Options:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `pathOrBranch` | string | Worktree path or branch name to remove |
| `force` | boolean | Remove even if the worktree has local changes |
| `dryRun` | boolean | Preview prune results |

## Default Behavior

| Operation | Default |
|----------|---------|
| Worktree path | `<repo>/.worktrees/<branch>` |
| Branch name | Derived from `name` (lowercased, spaces to `-`) |
| Delete guard | Refuses dirty worktrees unless `force: true` |

Relative `path` inputs are resolved under `.worktrees/` to prevent traversal.

## State Management

All session mappings are stored in:

```
~/.config/opencode/open-trees/state.json
# or
${XDG_CONFIG_HOME}/opencode/open-trees/state.json
```

Each entry records:
- `worktreePath`: Filesystem path to the worktree
- `branch`: Git branch name
- `sessionID`: OpenCode session identifier
- `createdAt`: ISO timestamp

When a session is deleted, the plugin automatically removes the mapping from state.

## Optional Slash Commands

Add these files to your `.opencode/command` directory for quick access:

```text
# .opencode/command/worktree-on.md
worktree_mode { "action": "on" }
```

```text
# .opencode/command/worktree-overview.md
worktree_overview
```

```text
# .opencode/command/worktree-make.md
worktree_make { "action": "create", "name": "$1" }
```

```text
# .opencode/command/worktree-clean.md
worktree_cleanup { "action": "remove", "pathOrBranch": "$1" }
```

Usage:

```text
/worktree-make feature-auth
/worktree-clean feature-auth
```
