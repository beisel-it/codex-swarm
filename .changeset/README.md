# Changesets

This repository uses Changesets to prepare version PRs and release notes for
Codex Swarm packages and release artifacts.

Common commands:

```bash
corepack pnpm changeset
corepack pnpm changeset version
corepack pnpm changeset status --verbose
```

Current intent:

- use Changesets to open version PRs from `main`
- publish only non-private workspace packages with complete publish metadata
- keep private service packages ignored until their release artifacts are ready
