# M4 Delivery Plan

## Scope Reference

This plan implements `ROADMAP.md` Phase 4, `v0.3: distributed execution`.

Phase 4 objectives:

- add multi-node worker capacity without changing the control-plane contract model
- preserve sticky session ownership across worker lifetime
- make worker failure bounded, visible, and recoverable
- introduce remote-safe runtime primitives for queueing, bootstrap, and artifact flow

## Exit Criteria

Phase 4 is complete when:

1. A run can place workers on at least two nodes while keeping board and task state shared.
2. Session ownership is explicit, sticky, and visible in the control plane.
3. Losing a worker node causes bounded failure and safe retry rather than silent drift.

## Execution Order

### Track 1: Fleet control-plane model

Owner: backend-dev

Primary outputs:

- worker node registration and heartbeat model
- capability labels and placement constraints
- sticky session placement records in the control plane
- node drain state and assignment eligibility rules

This track defines the durable state model the rest of M4 depends on.

### Track 2: Queueing and remote operations

Owner: devops

Primary outputs:

- Redis-backed queueing for remote work dispatch
- standardized worker bootstrap for remote nodes
- shared runtime assumptions for Postgres, Redis, artifact access, and credentials
- drain-mode operations and node-level runtime checks

This track is the runtime path that turns the durable model into actual distributed execution.

### Track 3: Worker runtime and recovery integration

Owner: backend-dev

Primary outputs:

- worker claim/release flow tied to queue dispatch
- retry behavior on worker node loss
- session continuity and reassignment rules that preserve sticky ownership unless failure forces recovery
- surfaced failure states for control-plane reconciliation

This track should reuse the existing recovery model instead of inventing a new failure path.

### Track 4: Board and fleet visibility

Owner: frontend-dev

Primary outputs:

- node health and utilization surfaces
- placement visibility on runs, tasks, or agent lanes
- explicit drain or degraded-state indicators

This track should remain thin and consume backend contracts rather than deriving its own fleet model.

### Track 5: Multi-node verification

Owner: qa-engineer

Primary outputs:

- verification of two-node placement continuity
- failure injection for node loss and safe retry
- drain-mode and sticky-placement validation
- regression coverage for board and API visibility of distributed state

This is the milestone acceptance gate for M4.

## Dependency Model

Phase 4 refinement is complete once the tracks below are on the board with a sane dependency chain.

Execution dependencies:

1. Fleet control-plane model and queueing/remote operations start in parallel.
2. Worker runtime integration depends on the initial fleet model and queue primitives.
3. Board visibility follows backend contract additions for node and placement state.
4. QA multi-node verification starts once distributed placement and failure handling exist end to end.

## Risks

- If queueing and placement logic live in separate ad hoc paths, distributed failure handling will drift.
- Sticky placement can become accidental rather than explicit unless node ownership is stored durably.
- Remote execution adds operational complexity quickly; keep credentials and artifact access minimal and centralized.

## Deliberate Non-Goals

These remain outside Phase 4:

- enterprise auth, RBAC, or team isolation
- policy packs or compliance export expansion
- GA hardening, backup/restore, and full support envelope
