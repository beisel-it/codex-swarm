# Codex Swarm Execution Plan

## Goal

Build Codex Swarm through the roadmap in executable phases, starting with the delivered M0/M1 foundation and advancing through M2+ roadmap milestones.

## Current Phase

### M2

M2 implementation is complete:

- approvals and reject-feedback workflows
- validation history and artifact-backed reports
- restart recovery/session reconciliation spike
- board UI review/detail surfaces
- observability primitives

### M3

M3 refinement and execution are now active:

- `ebaf1339` Refine Phase 3 roadmap into executable M3 delivery plan
- `de54a793` Deliver M3 Git provider onboarding, branch publish, and PR handoff
- `82c94ee4` Deliver M3 curated role packs, skills, and repo templates
- `07c85e9d` Deliver M3 governance-lite: budgets, concurrency caps, approval profiles, audit export
- `a6b55c18` Deliver M3 quality hardening: load tests, retry semantics, cleanup jobs

## Dependency Order

1. Complete roadmap phase refinement for the active milestone.
2. Activate the concrete delivery tracks for that milestone.
3. Close milestone implementation before opening the next roadmap refinement gate.
4. Preserve a clean dependency chain from M3 to M6.

## Execution Rules

- Shared contracts live in one package and are consumed by API, worker, and web.
- Each completed task must end with a git commit before the task is marked complete.
- Blocked tasks should stay blocked until their prerequisites land in the repository.
- Do not treat a roadmap phase as finished until its exit criteria are actually met in code and verification, not only in task metadata.
