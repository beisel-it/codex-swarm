# Post-M10 CI Workflow Audit

Date: 2026-03-29
Owner: devops
Source of truth: `docs/architecture/post-m10-ci-hardening-plan.md`

## Audited workflows

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-vercel.yml`

## Audit of the pre-redesign state

### CI workflow

Previous shape:

- one PR-only `dependency-review` job
- one serialized `validate` job that ran:
  - `pnpm ci:lint`
  - `pnpm ci:typecheck`
  - `pnpm ci:test`
  - `pnpm ci:build`

Weak spots:

- all validation stages were collapsed into one job, so contributors had to dig
  through a long log to determine which gate failed first
- failure surfaces were present in logs only; there was no summary that mapped
  failures back to the checked-in local reproduction commands
- the workflow was still effectively a bootstrap-era monolith even though the
  repo now contains multiple real workspace packages and independent failure
  modes

### Vercel workflow

Previous shape:

- separate workflow triggered directly by pull requests, pushes to `main`, and
  manual dispatch
- standalone deploy readiness detection
- direct Vercel preview or production deployment without waiting for the CI
  workflow to succeed first

Weak spots:

- deployment could race independently from the CI gate instead of following a
  successful validation run
- the deploy path detection still reflected bootstrap uncertainty even though
  the live repo now has a concrete deployable app at `frontend`
- the workflow did not explicitly guard against deploying untrusted forked PR
  code through a `workflow_run` path with secrets

### Operator docs

Previous shape:

- `docs/operations/cicd.md` still described the setup as a bootstrap CI/CD
  baseline

Weak spots:

- that framing no longer matched the live repo state
- the document did not explain the intended gate ordering after M10
- reproduction guidance existed, but not as a clear operator-facing gate model

## Resulting redesign choice

The repo now uses:

- explicit CI jobs for `lint`, `typecheck`, `test`, and `build`
- a shared workspace setup action to keep local and GitHub assumptions aligned
- a final CI summary job that records the exact local reproduction commands
- a Vercel workflow triggered from successful `CI` completion or explicit manual
  dispatch
- explicit manual/preview/production deployment targeting
- operator docs rewritten around the real post-M10 gate instead of bootstrap
  framing

## Deferred items

These were not needed for the current redesign:

- platform-specific runner matrices
- external artifact upload for test reports
- non-Vercel deployment targets
