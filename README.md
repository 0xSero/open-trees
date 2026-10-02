<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/banner-dark.svg" />
  <img alt="Open Trees warm paper banner" src="docs/assets/brand/banner-light.svg" width="100%" />
</picture>

# Open Trees

OpenCode plugin for fast, safe `git worktree` workflows.

This branch is the **native OpenCode V2 port** (`2.0.0-beta.1`). It requires
OpenCode V2.0.18 or newer and Git. OpenCode V1 users should stay on the existing
1.x release; the npm `open-trees@1.0.1` package does not load in V2.

## Install

Install the V2 fork while the upstream contribution is under review:

```bash
opencode plugin add 'github:balakumardev/open-trees#feat/opencode-v2'
```

This updates your global OpenCode configuration. The Git package exports its
TypeScript sources directly, so installation does not depend on a prebuilt
`dist/` directory or lifecycle scripts. Both the server tools and the native
terminal session picker load from the same package.

Optional development artifacts use `bun run bundle`, not a lifecycle `build`
script. npm Git fetchers treat `build` as a preparation trigger even without a
`prepare` script; source installation does not need that extra dependency step.
The existing `bun run build` command remains available through `build.ts` for CI
and development; it is not an npm lifecycle hook.

Manual config:

```json
{
  "plugins": ["github:balakumardev/open-trees#feat/opencode-v2"]
}
```

For local development, build the plugin and point OpenCode at the local package:

```bash
bun install
bun run bundle
```

```json
{
  "plugins": ["/absolute/path/to/open-trees/src"]
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

V2 session forks inherit the source location. Open Trees explicitly moves the
fork, waits for that operation, and checks its final location before recording a
mapping. Shared state updates are serialized across plugin location instances.

`fork` and `swarm` currently require OpenCode's **managed local background
service**, because the V2 plugin context does not expose `session.fork`. The
plugin discovers that service without starting another one and verifies the
host PID before using it. Those two actions return an explicit error under
`--standalone` or an independently started server; they do not claim to have
created a correctly located fork. Other worktree actions use the native plugin
context directly.

The V2.0.18 terminal SDK does not provide cancellation or owner-aware closing
for an already-open selection dialog. Unload cancels list requests and ignores
late dialog results; the plugin deliberately does not clear a potentially
foreign dialog. Session lists follow every pagination cursor, including swarms
larger than the API's default page size.

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

E2E tests exercise the CLI against a temporary OpenCode config file. Native V2
regressions use isolated Git repositories and temporary mode/state directories,
including dirty-removal protection, path traversal, session API contracts, event
cleanup, concurrent mappings, and terminal session selection.

Set `OPENCODE_TEST_TMPDIR` to choose the parent directory for native test fixtures;
otherwise they use the operating system's temporary directory.

```bash
bun run lint
bun run typecheck
bun run bundle
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
