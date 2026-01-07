<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/pattern-dark.svg" />
  <img alt="Warm paper pattern" src="assets/brand/pattern-light.svg" width="100%" />
</picture>

# Installation

## Prerequisites

- [Bun](https://bun.sh/) runtime (for package management and CLI)
- [Git](https://git-scm.com/) 2.15+ with worktree support
- [OpenCode](https://opencode.ai/) AI assistant

## Install via Bun

```bash
bun add open-trees
```

## Configure OpenCode

Add the plugin to your OpenCode configuration file (typically `~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["open-trees"]
}
```

Or use the built-in CLI helper:

```bash
bunx open-trees add
```

### CLI Options

```bash
bunx open-trees add --help
```

| Option | Description |
|--------|-------------|
| `--config <path>` | Path to opencode.json/opencode.jsonc |
| `--plugin <name>` | Plugin name to add (default: `open-trees`) |
| `--dry-run` | Print result without writing |

## Local Development Installation

For development or testing with local changes:

```bash
git clone https://github.com/your-org/open-trees.git
cd open-trees
bun install
bun run build
```

Add the plugin using the absolute path:

```json
{
  "plugin": ["/absolute/path/to/open-trees"]
}
```

## Verify Installation

Run the mode command to confirm installation and view the tool list:

```bash
worktree_mode
```

Expected output includes the current mode status, default worktree root, and examples for:

- `worktree_mode`
- `worktree_overview`
- `worktree_make`
- `worktree_cleanup`
