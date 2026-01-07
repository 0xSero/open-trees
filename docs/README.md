<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/banner-dark.svg" />
  <img alt="Open Trees warm paper banner" src="assets/brand/banner-light.svg" width="100%" />
</picture>

# Open Trees

OpenCode plugin for fast, safe `git worktree` workflow management.

## Overview

Open Tree is an OpenCode plugin that extends the AI coding assistant with powerful git worktree capabilities. It enables developers to:

- Create and manage multiple git worktrees from a single repository
- Track worktree sessions with automatic state management
- Fork current sessions context into new worktrees
- Generate dashboards showing all worktrees sessions
- Batch-create multiple worktrees for parallel task workflows

### Key Features

- **Safe Worktree Operations**: Guarded deletion prevents accidental loss of uncommitted changes
- **Session Management**: Automatic tracking of worktree-to-session mappings
- **Parallel Workflows**: Swarm feature creates multiple worktrees for concurrent tasks
- **Session Forking**: Fork current conversation context into a new worktree
- **Dashboard View**: Overview of all known worktree sessions with status indicators
- **Mode Gating**: Worktree tools only run after enabling worktree mode

## Why Git Worktree?

Git worktree allows you to check out multiple branches simultaneously without stashing or creating full clones. Open Tree enhances this with:

- Session isolation for AI conversations continuity
- Automated branch naming and path resolution
- Persistent tracking of worktree↔session relationships
- Batch operations for multi-branch workflows

## Architecture

```
open-trees/
├── src/
│   ├── index.ts           # Plugin entry point and event handling
│   ├── tools.ts           # Tool definitions for OpenCode plugin system
│   ├── worktree.ts        # Core worktree CRUD operations
│   ├── worktree-session.ts # Session creation and forking
│   ├── worktree-dashboard.ts # Dashboard rendering from state
│   ├── worktree-swarm.ts  # Batch worktree creation
│   ├── worktree-status.ts # Status checking utilities
│   ├── worktree-helpers.ts # Shared helper functions
│   ├── state.ts           # Session-to-worktree mapping persistence
│   ├── mode.ts            # Worktree mode state management
│   ├── config.ts          # Config path helpers
│   ├── result.ts          # Tool result helpers
│   ├── git.ts             # Git command execution and parsing
│   ├── paths.ts           # Path normalization and resolution
│   ├── cli.ts             # CLI for plugin installation
│   ├── format.ts          # Output formatting utilities
│   ├── status.ts          # Git status parsing
│   ├── sdk.ts             # OpenCode SDK helpers
│   ├── session-helpers.ts # Session UI interactions
│   └── opencode-config.ts # OpenCode config file manipulation
├── tests/                 # Test suite
└── dist/                  # Built JavaScript output
```

## Quick Start

```bash
# Install the plugin
bun add open-trees

# Add to OpenCode config
bunx open-trees add

# Enable worktree mode
worktree_mode { "action": "on" }

# Create a worktree
worktree_make { "action": "create", "name": "feature auth" }

# Start a session in the worktree
worktree_make { "action": "start", "name": "feature auth", "openSessions": true }
```

## Brand

Warm paper visuals and SVG assets live in `docs/brand.md`.
