<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/banner-dark.svg" />
  <img alt="Open Trees warm paper banner" src="docs/assets/brand/banner-light.svg" width="100%" />
</picture>

# Open Trees

OpenCode plugin for fast, safe `git worktree` workflows.

## Install

Single command (recommended):

```bash
bunx open-trees add
```

This updates your OpenCode config (default: `~/.config/opencode/opencode.json`).
OpenCode installs npm plugins automatically at startup (cached in `~/.cache/opencode/node_modules`).

Manual config:

```json
{
  "plugin": ["open-trees"]
}
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

## Worktree mode

Worktree tools are gated behind worktree mode so they do not clutter the default tool list.
Enable it when you want to work with worktrees, then disable it when you are done.

```text
worktree_mode { "action": "on" }
worktree_mode { "action": "off" }
```

`worktree_mode` also prints a help sheet (tools + examples) so the model has the usage context.

Slash-native toggle (see `.opencode/command/worktree.md`):

```text
/worktree on
/worktree off
```

`/worktree on` enables the tools and emits the help sheet into the session.
`/worktree off` disables them and keeps them off for the next session.

## Tools

- `worktree_mode` — enable/disable worktree mode and show help.
- `worktree_overview` — list, status, or dashboard worktrees.
- `worktree_make` — create/open/fork worktrees and sessions.
- `worktree_cleanup` — remove or prune worktrees safely.

### Examples

Enable worktree mode:

```text
worktree_mode { "action": "on" }
```

List worktrees:

```text
worktree_overview
```

Status for all worktrees:

```text
worktree_overview { "view": "status" }
```

Show the worktree/session dashboard:

```text
worktree_overview { "view": "dashboard" }
```

Create a worktree (branch derived from name):

```text
worktree_make { "action": "create", "name": "feature audit" }
```

Start a new session (creates or reuses a worktree):

```text
worktree_make { "action": "start", "name": "feature audit", "openSessions": true }
```

Open a session in an existing worktree:

```text
worktree_make { "action": "open", "pathOrBranch": "feature/audit", "openSessions": true }
```

Fork the current session into a worktree:

```text
worktree_make { "action": "fork", "name": "feature audit", "openSessions": true }
```

Create a swarm of worktrees/sessions:

```text
worktree_make { "action": "swarm", "tasks": ["refactor-auth", "docs-refresh"], "openSessions": true }
```

Remove a worktree:

```text
worktree_cleanup { "action": "remove", "pathOrBranch": "feature/audit" }
```

Prune stale worktree entries:

```text
worktree_cleanup { "action": "prune", "dryRun": true }
```

## Defaults and safety

- Default worktree path (when `path` is omitted):
  - `<repo>/.worktrees/<branch>`
- Relative `path` inputs are resolved under `.worktrees/` to prevent traversal.
- Branch name is derived from `name` when `branch` is omitted (lowercased, spaces to `-`).
- `worktree_cleanup` refuses to delete dirty worktrees unless `force: true`.
- All tools return readable output with explicit paths and git commands.

## Session workflow

`worktree_make` actions (`start`, `open`, `fork`) create or reuse a worktree, then create a session in that directory.
Each action records a mapping entry at:

- `~/.config/opencode/open-trees/state.json` (or `${XDG_CONFIG_HOME}/opencode/open-trees/state.json`)

The session title defaults to `wt:<branch>`, and the output includes the session ID plus next steps.

Swarm safety notes:

- `worktree_make` with `action: "swarm"` refuses to reuse existing branches or paths unless `force: true`.
- It never deletes existing worktrees; it only creates new ones.

Optional command file examples:

```text
# .opencode/command/worktree.md
worktree_mode { "action": "$1" }
```

```text
# .opencode/command/worktree-start.md
worktree_make { "action": "start", "name": "$1", "openSessions": true }
```

```text
# .opencode/command/worktree-open.md
worktree_make { "action": "open", "pathOrBranch": "$1", "openSessions": true }
```

Slash commands (drop these files into `.opencode/command`):

```text
/worktree on
/worktree off
/worktree-overview
/worktree-make <name>
/worktree-clean <pathOrBranch>
```

## Development

E2E tests exercise the CLI against a temporary OpenCode config file.

```bash
bun run lint
bun run typecheck
bun run build
bun run test
bun run test:e2e
bun pm scan
npm audit --omit=dev
```

## Versioning

Open Trees follows Semantic Versioning and tracks notable changes in `CHANGELOG.md`.

## Brand

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/release-dark.svg" />
  <img alt="Open Trees release card" src="docs/assets/brand/release-light.svg" width="100%" />
</picture>

Brand visuals, SVG assets, and usage guidelines live in `docs/brand.md`.

## Contributing

See `CONTRIBUTING.md` for setup, testing, and release guidelines.
