<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/pattern-dark.svg" />
  <img alt="Warm paper pattern" src="assets/brand/pattern-light.svg" width="100%" />
</picture>

# File Structure

## Source Directory (`src/`)

```
src/
├── index.ts              # Plugin entry point
├── tools.ts              # Tool definitions
├── worktree.ts           # Core worktree operations
├── worktree-session.ts  # Session management
├── worktree-dashboard.ts # Dashboard rendering
├── worktree-swarm.ts    # Batch creation
├── worktree-status.ts   # Status utilities
├── worktree-helpers.ts  # Shared helpers
├── state.ts             # State persistence
├── mode.ts              # Worktree mode persistence
├── config.ts            # Config path helpers
├── result.ts            # Tool result helpers
├── git.ts               # Git operations
├── paths.ts             # Path utilities
├── cli.ts               # CLI entry point
├── format.ts            # Output formatting
├── status.ts            # Git status parsing
├── sdk.ts               # SDK utilities
├── session-helpers.ts  # Session UI helpers
└── opencode-config.ts   # Config manipulation
```

### `index.ts` — Plugin Entry Point

**Purpose:** OpenCode plugin initialization and event handling

**Key Exports:**
- `OpenTreesPlugin`: Main plugin function that registers tools and handles events

**Responsibilities:**
- Initialize all worktree management tools
- Listen for `session.deleted` events to clean up state mappings

**Code Flow:**
```
User session deleted → Event handler → removeSessionMapping() → Update state.json
```

### `tools.ts` — Tool Definitions

**Purpose:** Register all worktree tools with OpenCode plugin system

**Exported Tools:**
| Tool | Description |
|------|-------------|
| `worktree_mode` | Enable/disable worktree mode and show help |
| `worktree_overview` | List/status/dashboard worktrees |
| `worktree_make` | Create/open worktrees and sessions |
| `worktree_cleanup` | Remove/prune worktrees |

**Pattern:** Each tool wraps a handler function with schema validation using `@opencode-ai/plugin` types

### `worktree.ts` — Core Worktree Operations

**Purpose:** Low-level worktree CRUD operations

**Key Functions:**
- `listWorktrees(ctx)`: Enumerate all worktrees with metadata
- `createWorktreeDetails(ctx, options)`: Validate and prepare worktree creation
- `createWorktree(ctx, options)`: Execute worktree creation
- `removeWorktree(ctx, options)`: Safely remove worktree
- `pruneWorktrees(ctx, options)`: Remove stale references

**State Flow:**
```
Input validation → Repo root check → Branch validation → Path resolution → Git command execution → Output formatting
```

### `worktree-session.ts` — Session Management

**Purpose:** Integrate worktree creation with OpenCode session lifecycle

**Key Functions:**
- `startWorktreeSession(ctx, options)`: Create or reuse worktree + new session
- `openWorktreeSession(ctx, options)`: Open session in existing worktree
- `forkWorktreeSession(ctx, sessionID, options)`: Fork current session into worktree

**State Management:**
```
Session created → Store session mapping → Return worktree + session info
```

**Session Title Convention:** `wt:<branch>` for easy identification

### `worktree-dashboard.ts` — Dashboard Rendering

**Purpose:** Aggregate state data into human-readable dashboard

**Dashboard Columns:**
| Column | Source |
|--------|--------|
| task/name | State entry branch |
| branch | Git branch lookup |
| worktreePath | State entry path |
| sessionID | State entry ID |
| dirty? | Git status check |
| updatedAt | Session timestamp |

**Validation per Entry:**
- Path exists on disk
- Branch resolves correctly
- Status is clean/dirty
- Session is accessible

### `worktree-swarm.ts` — Batch Creation

**Purpose:** Create multiple worktrees/sessions for parallel workflows

**Key Logic:**
- Validate all task names uniqueness
- Prevent branch path collision
- Create sequentially or with `--force` to skip existing
- Record each new session mapping

**Safety:** Never deletes existing worktree, only creates new

### `worktree-helpers.ts` — Shared Utilities

**Purpose:** Reusable utilities for worktree operations

**Functions:**
- `headShort(head)`: Abbreviate commit hash (7 chars)
- `branchLabel(worktree)`: Format branch display name
- `pathExists(path)`: Check filesystem existence
- `ensureEmptyDirectory(path)`: Validate empty directory
- `findWorktreeMatch(worktrees, repoRoot, input)`: Match by path or branch

### `state.ts` — State Persistence

**Purpose:** Persist session-to-worktree mappings across sessions

**State Location:**
```
~/.config/opencode/open-trees/state.json
```

**Data Model:**
```typescript
type WorktreeState = {
  entries: WorktreeSessionEntry[];
}

type WorktreeSessionEntry = {
  worktreePath: string;
  branch: string;
  sessionID: string;
  createdAt: string;
}
```

**Key Functions:**
- `readState()`: Load state from filesystem
- `writeState(path, state)`: Save state to filesystem
- `storeSessionMapping(entry)`: Add new session mapping
- `removeSessionMappings(sessionID)`: Clean up deleted sessions

**Event Handling:** Plugin listens for session deletion to automatically remove mappings

### `git.ts` — Git Operations

**Purpose:** Abstract git command execution and output parsing

**Key Functions:**
- `runGit(ctx, args, options)`: Execute git command with error handling
- `getRepoRoot(ctx)`: Resolve repository root
- `getWorktrees(ctx, repoRoot)`: Parse `git worktree list --porcelain`
- `parseWorktreeList(output)`: Convert porcelain output to structured data

**GitCommandResult Type:**
```typescript
type GitCommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
}
```

**Error Handling:** Context-aware error messages for common git failures modes

### `paths.ts` — Path Utilities

**Purpose:** Normalize and resolve worktree paths

**Functions:**
- `normalizeBranchName(name)`: Convert logical name to valid git branch
  - Lowercases, replaces spaces/underscore with `-`
  - Removes invalid characters sequences
  - Trims leading/trailing `/` and `-`
- `defaultWorktreePath(repoRoot, branch)`: Derive default path pattern
- `resolveWorktreePath(repoRoot, input)`: Resolve relative to `.worktrees/`
- `pathsEqual(left, right)`: Compare normalized paths

**Default Path Pattern:**
```
<repo>/.worktrees/<branch>
```

### `cli.ts` — CLI Entry Point

**Purpose:** Standalone CLI for plugin installation

**Commands:**
- `open-trees add`: Add plugin to OpenCode config
- `open-trees help`: Show usage

**Options:**
| Flag | Description |
|------|-------------|
| `--config` | Config file path |
| `--plugin` | Plugin name |
| `--dry-run` | Preview without writing |

### `format.ts` — Output Formatting

**Purpose:** Consistent output formatting across all tools

**Functions:**
- `formatCommand(command)`: Format git command for display
- `formatError(message, context)`: Standardized error messages
- `renderTable(headers, rows)`: ASCII table rendering

### `status.ts` — Git Status Parsing

**Purpose:** Parse `git status --porcelain` output

**Function:**
- `summarizePorcelain(output)`: Count modified, new, deleted files
- Returns `clean` boolean and file counts

### `sdk.ts` — SDK Utilities

**Purpose:** Wrapper for OpenCode SDK responses

**Function:**
- `unwrapSdkResponse(response, operation)`: Handle SDK result or error

### `session-helpers.ts` — Session UI Interaction

**Purpose:** Interact with OpenCode session UI

**Functions:**
- `openSessionsUi(ctx)`: Open sessions selector UI
- `updateSessionTitle(ctx, sessionID, title)`: Rename session

### `opencode-config.ts` — Config Manipulation

**Purpose:** Modify OpenCode configuration files

**Function:**
- `updateConfigText(existingText, pluginName)`: Add plugin to array

## Test Directory (`tests/`)

```
tests/
├── state.test.ts          # State persistence tests
├── sdk.test.ts            # SDK wrapper tests
├── e2e.test.ts            # End-to-end CLI tests
└── opencode-config.test.ts # Config manipulation tests
```

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Project metadata, dependencies, scripts |
| `tsconfig.json` | TypeScript configuration |
| `biome.json` | Biome linter/format configuration |
| `.gitignore` | Git ignore patterns |

## Distribution (`dist/`)

Compiled JavaScript output (generated by build):
- `index.js`: Plugin entry
- `cli.js`: CLI executable
- `index.d.ts`: TypeScript declarations
