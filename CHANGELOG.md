# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [2.0.0-beta.1] - Unreleased

### Changed
- Port the server plugin to native OpenCode V2 registration APIs; V1 users remain on 1.x.
- Register the same four worktree tools with native schemas, structured results, and cancellation signals.
- Use native session APIs and verify fork moves before recording worktree/session mappings.
- Export source entrypoints for Git installation without a prebuilt distribution.

### Added
- Native terminal session selection via the package's `./tui` entrypoint and typed RPC events.
- Portable native V2 regression tests using isolated Git repositories and configuration.

### Fixed
- Serialize shared session mapping operations across V2 location instances.
- Dispose session-event subscriptions when the plugin unloads.
- Share state locks across native source generations and capture each operation's state path.
- Cancel and guard asynchronous terminal callbacks and follow session-list pagination.
- Forward service-verification cancellation and reject unavailable forks before Git mutation.
- Prefer native installer configuration arrays without shadowing existing plugin options.

## [1.0.1] - 2026-01-08

### Changed
- Patch release following 1.0.0.

## [1.0.0] - 2026-01-08

### Added
- Stable 1.0.0 release with full worktree management capabilities.
- Published to npm for public installation.
- Comprehensive documentation and brand assets.
- Native `/worktree on|off` slash command for toggling worktree mode and emitting help.

### Changed
- Optional command examples now use `/worktree on` and `/worktree off` instead of `/worktree-on`.

## [0.2.0] - 2026-01-07

### Added
- Worktree mode gating with four primary tools for a tighter UX.
- Worktree mode state tracking and tests for mode persistence.
- CI workflow, Dependabot configuration, and contributor docs.
- Bun security scanner configuration and npm audit in CI.

### Changed
- Default worktree root is now `<repo>/.worktrees/<branch>`.
- Session creation reuses existing worktrees when available.
- Documentation updated for the new tool surface and workflows.

### Fixed
- Safer command quoting for displayed git commands.
- Improved error handling and performance in worktree dashboard/status flows.

## [0.1.0] - 2025-12-15

### Added
- Initial Open Trees release.
