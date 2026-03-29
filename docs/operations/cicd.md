# CI Gate

This repository ships a post-M10 GitHub Actions validation gate.

## Workflow

- `CI` runs on every pull request and on pushes to `main`.

The current workflow audit is recorded in
[docs/architecture/post-m10-ci-audit.md](/home/florian/codex-swarm/docs/architecture/post-m10-ci-audit.md).

## CI behavior

The CI workflow installs Node.js 22 and pnpm 10.28.0 once per job through the
shared setup action and then runs four explicit gates:

- `pnpm ci:lint`
- `pnpm ci:typecheck`
- `pnpm ci:test`
- `pnpm ci:build`

Gate order and purpose:

1. `lint`
2. `typecheck`
3. `test`
4. `build`

Those commands delegate into workspace packages and only execute scripts that
actually exist under the workspace package roots:

- `apps/*`
- `packages/*`
- `services/*`
- `tooling/*`

Each gate runs as a separate GitHub job so the failing surface is obvious in the
Checks UI. A final summary job records the result of every gate and the exact
local reproduction command.

## Dependency review

Pull requests also run GitHub's dependency review action and fail if a change introduces a dependency vulnerability at `high` severity or above.

## Local reproduction

Run the same validation gate locally with:

```bash
corepack pnpm ci:lint
corepack pnpm ci:typecheck
corepack pnpm ci:test
corepack pnpm ci:build
```

## Package expectations

Every workspace package should define the standard scripts it actually supports:

- `lint`
- `typecheck`
- `test`
- `build`

Once those scripts exist, the CI gate will pick them up automatically without
needing per-package workflow edits.
