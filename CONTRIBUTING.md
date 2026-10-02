# Contributing

Thanks for helping improve Open Trees!

## Development setup

```bash
bun install
```

## Common commands

```bash
bun run lint
bun run typecheck
bun test
bun run bundle
bun run test:e2e
```

## Pull requests

- Keep changes focused and include tests when behavior changes.
- Update `CHANGELOG.md` for user-facing changes.
- Make sure CI is green before requesting review.

## Release workflow

This project uses Semantic Versioning.

1. Update `package.json` version.
2. Add an entry to `CHANGELOG.md`.
3. Tag the release (`vX.Y.Z`) and push.
