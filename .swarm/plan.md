# Codex Swarm Execution Plan

## Goal

Build Codex Swarm through the roadmap in executable phases, starting with the delivered M0/M1 foundation and advancing through M2+ roadmap milestones.

## Current Phase

### Post-M10 TUI

Post-M10 work is now active on a codex-swarm terminal UI:

- confirm the real clawteam terminal-board implementation and extract the usable interaction model
- ship a codex-swarm-specific TUI with live board, run, review, and operator views
- package the TUI as a first-class operator entrypoint instead of a one-off demo
- verify the TUI through explicit operator acceptance and regression checks

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

M6 implementation is complete:

- SLOs, support boundaries, and observability envelope
- backup, restore, and disaster recovery evidence
- migration and upgrade safety
- cost, usage, and performance envelope
- admin/developer/operator docs and reference deployments
- GA release-candidate validation

### M7

M7 parity review is complete:

- each roadmap entry was verified as parity, better, superseded, or gap
- documented gaps were converted into explicit backlog items or resolved with shipped fixes
- roadmap and architecture wording was tightened where supportability had been overstated

### M8

M8 implementation is complete:

- codex-swarm-specific external-operator Codex skill library
- board/inbox/task-control skills
- diagnostics and recovery skills
- agent and skill authoring guidance
- acceptance examples proving Codex can manage codex-swarm from the outside

### M9

M9 end-to-end validation is complete:

- codex-swarm was used to run a real designer-plus-developer product scenario in an isolated workdir
- the run produced design artifacts, implementation output, screenshots, validations, and an audit export
- M9 surfaced and fixed product bugs in artifact persistence and audit-export compatibility

## Dependency Order

1. Complete roadmap phase refinement for the active milestone.
2. Activate the concrete delivery tracks for that milestone.
3. Close milestone implementation before opening the next roadmap refinement gate.
4. Preserve a clean dependency chain from M3 through M9.

## Execution Rules

- Shared contracts live in one package and are consumed by API, worker, and web.
- Each completed task must end with a git commit before the task is marked complete.
- Blocked tasks should stay blocked until their prerequisites land in the repository.
- Do not treat a roadmap phase as finished until its exit criteria are actually met in code and verification, not only in task metadata.
