# Post-M10 CI Redesign Verification

Date: 2026-03-29
Owner: qa-engineer
Task: `671e77b8`
Branch under test: `9b45be3`
Source of truth: `docs/architecture/post-m10-ci-hardening-plan.md`

## Verdict

- parity

## Summary

The redesigned CI gate matches the checked-in hardening plan and is reproducible
locally on the branch under test. GitHub Actions and local reproduction use the
same four validation stages, and the remaining coverage differences are
intentional and documented rather than hidden workflow drift.

## Verification Performed

Local validation commands:

- `corepack pnpm ci:lint`
- `corepack pnpm ci:typecheck`
- `corepack pnpm ci:test`
- `corepack pnpm ci:build`

Result:

- all four commands passed on the current branch

Inspected artifacts:

- `.github/workflows/ci.yml`
- `.github/actions/setup-workspace/action.yml`
- `docs/operations/cicd.md`
- `docs/architecture/post-m10-ci-audit.md`
- `scripts/ci/run-stage.mjs`
- root `package.json`

## Parity Check

### 1. CI workflow shape matches local reproduction docs

- `docs/operations/cicd.md` documents the four CI gates in this order:
  `lint`, `typecheck`, `test`, `build`.
- `.github/workflows/ci.yml` runs separate jobs for those same four gates.
- each GitHub job records the matching local reproduction command in the step
  summary
- the final `gate-summary` job consolidates results and repeats the exact local
  reproduction commands

Conclusion:

- no undocumented drift remains between the documented local gate and the
  GitHub CI validation workflow

### 2. Shared workspace assumptions are aligned

- `.github/actions/setup-workspace/action.yml` standardizes checkout, pnpm
  setup, Node setup from `.nvmrc`, and `pnpm install --frozen-lockfile`
- the local reproduction path uses the same checked-in `pnpm ci:*` commands
  described in `docs/operations/cicd.md`

Conclusion:

- the workflow structure is intentionally chosen and locally reproducible rather
  than depending on opaque GitHub-only steps

## Coverage Shape

The validation surface is script-driven through `scripts/ci/run-stage.mjs`,
which only runs stages that a package actually exposes.

Current package coverage on this branch:

- `apps/api`: `typecheck`, `test`, `build`
- `apps/tui`: `typecheck`, `test`, `build`
- `apps/worker`: `typecheck`, `test`, `build`
- `packages/contracts`: `typecheck`, `test`, `build`
- `packages/database`: `typecheck`, `build`
- `packages/orchestration`: `typecheck`, `test`, `build`
- `frontend`: `lint`, `typecheck`, `build`

## Intentional Deviations And Their Visibility

These differences exist, but they are explicit and supportable.

### 1. Dependency review is GitHub-only

- `dependency-review` runs only for pull requests in `.github/workflows/ci.yml`
- `docs/operations/cicd.md` documents it as a GitHub dependency-review action,
  not as a local command

Assessment:

- intentional and documented

### 2. Lint coverage is frontend-only

- `pnpm ci:lint` delegates through `scripts/ci/run-stage.mjs`
- only `frontend/package.json` currently exposes a `lint` script
- `docs/operations/cicd.md` explains that the CI gate picks up only scripts a
  package actually supports

Assessment:

- intentional and visible
- this is a narrower lint surface than a full workspace lint gate, but it is
  not hidden drift

### 3. Test coverage excludes packages without a `test` script

- `packages/database` does not expose `test`
- `frontend` does not expose `test`
- both GitHub and local `ci:test` follow the same script-discovery rule

Assessment:

- intentional and visible
- this is coverage shape, not parity drift

## Residual Risks

1. Workspace lint coverage remains limited because only the frontend package
   defines a `lint` script.
2. The `frontend` package still has no standalone `test` script, so browser or
   UI-specific regression coverage is not part of the post-M10 CI gate unless it
   is added later.
3. The current worktree contains an unrelated untracked `.ops/` directory, but
   it did not affect the CI verification commands or workflow-parity result.
