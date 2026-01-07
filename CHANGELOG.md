# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

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
