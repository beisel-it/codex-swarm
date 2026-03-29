# Post-M10 CI Pipeline Redesign Plan

## Goal

Redesign the GitHub CI pipeline as needed so it becomes a trustworthy and
maintainable release gate for codex-swarm beyond M10.

This is a parallel slice, not the current critical path. It should be executed
without blocking the active TUI delivery work.

## Current State

The repo already ships:

- `.github/workflows/ci.yml`
- workspace commands:
  - `pnpm ci:lint`
  - `pnpm ci:typecheck`
  - `pnpm ci:test`
  - `pnpm ci:build`

The existing CI flow is just the current baseline. This slice explicitly allows:

- restructuring jobs and workflow boundaries
- changing step order
- introducing matrices or split validation jobs
- redesigning failure-surface reporting
- tightening or replacing deployment-gating logic where appropriate

## Deliverables

### D1. Workflow audit

- checked-in note describing the current CI and deployment workflow shape
- identified drift, weak spots, or unclear failure surfaces

### D2. CI redesign implementation

- workflow restructuring needed to improve reliability, maintainability, or clarity
- local script adjustments required to keep GitHub and local validation aligned
- any job, matrix, or artifact changes needed for a better operator and contributor experience

### D3. Failure-surface and observability improvements

- clearer reproduction steps for CI failures
- better visibility into what failed and where

### D4. Operator documentation

- short operator doc for reproducing CI locally and understanding the gate order

## Definition of Done

This slice is done only when all of the following are true:

1. The current GitHub CI workflow has been audited against the live repo state.
2. The resulting workflow shape is intentionally chosen, not just patched in place.
3. Any drift, weak failure surfaces, or structural workflow problems found during
   the audit are either fixed or explicitly documented as deferred.
4. The repo has a checked-in doc telling operators how to reproduce the CI gate locally.
5. The updated pipeline validates successfully on the current branch after the redesign.
6. The redesign is documented well enough that future contributors can understand
   the gate structure without reverse-engineering YAML alone.

## Acceptance Criteria

### A. Workflow clarity

- the order and purpose of `lint`, `typecheck`, `test`, and `build` are documented
- the CI gate is documented as the active repository validation path

### B. Reproducibility

- an operator can reproduce the same checks locally with checked-in commands
- any workflow-only assumptions are documented

### C. Reliability

- if workflow changes are made, they do not reduce effective coverage relative to the current gate unless the reduction is intentional and documented
- the updated workflows validate successfully on the current branch

### D. Scope discipline

- redesigning the CI pipeline is allowed
- unrelated infrastructure redesign outside the CI/deployment gate is still out of scope
