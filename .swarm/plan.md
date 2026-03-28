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

M5 implementation is complete:

- identity and workspace isolation
- RBAC, policy packs, approval delegation, and sensitive defaults
- audit export, retention, and admin reporting
- governance UI and multi-user verification

### M6

M6 refinement and execution are now active:

- `7ed82e5e` Refine Phase 6 roadmap into executable M6 delivery plan
- SLOs, support boundaries, and observability envelope
- backup, restore, and disaster recovery evidence
- migration and upgrade safety
- cost, usage, and performance envelope
- admin/developer/operator docs and reference deployments
- GA release-candidate validation

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
