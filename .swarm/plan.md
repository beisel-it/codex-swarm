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

M3 implementation is complete:

- repo onboarding and PR handoff
- board PR/reflection surfaces
- productivity packs, role packs, and repo templates
- governance-lite controls
- quality hardening and cleanup verification

### M4

M4 implementation is complete:

- distributed worker fleet model
- Redis-backed dispatch and remote bootstrap
- sticky placement and failure recovery across nodes
- node health and utilization visibility
- multi-node verification

### M5

M5 refinement and execution are now active:

- `6980a1bb` Refine Phase 5 roadmap into executable M5 delivery plan
- identity, workspace isolation, and RBAC
- policy packs, approval delegation, and stricter repo defaults
- audit export, retention, and admin reporting
- governance UI and multi-user verification

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
