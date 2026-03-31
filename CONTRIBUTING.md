# Contributing

## Ground rules

- keep API, worker, frontend, and shared contracts aligned
- prefer additive changes over breaking internal package reshuffles
- do not claim support for a deployment shape that is not documented and
  verified in-repo
- treat release-facing docs as product surface, not afterthought

## Commit conventions

This repository uses Conventional Commits for human and automation-facing
history.

Prefer commit subjects like:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`
- `refactor: ...`
- `test: ...`

Keep the subject imperative and concise. If a change affects published packages
or release notes, pair the commit with a changeset instead of relying on the
commit message alone to drive releases.

## Development

```bash
corepack pnpm install
corepack pnpm ci:lint
corepack pnpm ci:typecheck
corepack pnpm ci:test
corepack pnpm ci:build
```

## Release-facing changes

This repository currently uses Changesets for versioning and release PRs.

If a change affects public installability, package boundaries, deployment,
worker onboarding, or release notes, add a changeset:

```bash
corepack pnpm changeset
```

Release operators should also keep [RELEASING.md](/home/florian/codex-swarm/RELEASING.md)
aligned with any workflow or publish-boundary change.

## Docs expectations

If you change:

- install flow
- deployment flow
- supported topology
- release boundary
- operator-facing workflows

then update the matching release-facing docs in `README.md` or `docs/`.
