# Final Phase Task Matrix

## Purpose

This document deepens the remaining roadmap work after M4 closure and mid-M5 execution. It is the detailed planning companion to:

- `docs/architecture/m5-delivery-plan.md`
- `ROADMAP.md` Phase 5 and Phase 6

The goal is to prevent the remaining phases from collapsing into oversized umbrella tasks.

## M5 Remaining Closeout

### Active backend governance lane

Parent task: `d01ab805`

This task is still too broad unless treated as three concrete slices:

1. RBAC enforcement matrix
   Owner: backend-dev
   Scope:
   - role-gate run create, review, approve, retry, stop, and admin actions
   - reject out-of-role actions consistently across governed routes
     Acceptance:
   - wrong-role requests fail deterministically
   - actor/workspace context is preserved in denial and audit paths

2. Policy profile inheritance and sensitive-repo defaults
   Owner: backend-dev
   Scope:
   - team and repo policy profile selection/inheritance
   - stricter defaults for sensitive repositories
     Acceptance:
   - a sensitive repo path is observably stricter than a standard repo path
   - profile selection does not require code edits

3. Approval delegation persistence and enforcement
   Owner: backend-dev
   Scope:
   - persist delegation rules
   - enforce delegated approval eligibility
   - surface delegation state to audit/UI consumers
     Acceptance:
   - delegated approval behavior is enforced rather than interpreted informally
   - audit/provenance can explain delegated approvals

### Active QA closeout lane

Parent task: `22d6329b`

QA signoff must cover these concrete checks:

1. Role restriction matrix
   Scope:
   - wrong-role create/review/approve/admin actions fail
   - allowed-role actions succeed

2. Audit proof matrix
   Scope:
   - export proves actor, approval target, action, and time
   - delegated approvals remain attributable

3. Retention behavior checks
   Scope:
   - retention policy affects governed persisted state
   - reporting remains coherent after retention actions

4. Sensitive-repo default comparison
   Scope:
   - compare one standard repo path with one sensitive repo path
   - confirm stricter defaults apply without code changes

### M5 closure rule

Do not close `8a612dc0` unless:

- `d01ab805` is complete
- `22d6329b` is complete
- evidence includes real backend governance state, not only UI smoke checks

## M6 Detailed Decomposition

M6 should not remain a single final umbrella. It should break into the following execution slices after `7ed82e5e` refinement completes.

### Track 1: Operational SLOs and observability envelope

Suggested owner: devops

Scope:

- define supported service-level objectives
- add measurement and alerting boundaries aligned with those objectives
- document what is and is not covered operationally

Acceptance:

- SLOs are explicit and measurable
- dashboards or reports can show whether the platform is within envelope
- support boundaries match the SLO language

### Track 2: Backup, restore, and disaster recovery

Suggested owner: devops

Scope:

- backup/restore runbook
- disaster recovery exercise plan and recorded results
- restore validation for core control-plane data

Acceptance:

- backup and restore steps are documented and exercised
- recovery procedures are tested, not only described
- failure and restore timing is captured well enough for operators

### Track 3: Migration and upgrade safety

Suggested owner: backend-dev

Scope:

- upgrade-safe schema versioning
- config versioning or migration path
- explicit upgrade and rollback notes for incompatible changes

Acceptance:

- a fresh operator can follow the documented upgrade path
- schema/config evolution does not rely on tribal knowledge
- rollback or failure behavior is documented where rollback is unsafe

### Track 4: Cost, usage, and performance envelope

Suggested owner: devops

Scope:

- cost and usage reporting
- performance baselines under expected concurrency
- bottleneck notes and tuning actions

Acceptance:

- the platform can demonstrate expected concurrency behavior
- cost/usage reporting is available to operators/admins
- performance claims are tied to recorded verification

### Track 5: Admin, developer, and operator docs

Suggested owner: tech-lead

Scope:

- admin/developer/operator documentation set
- support playbooks
- published support boundaries and limitations
- reference deployments for single-host and multi-node environments

Acceptance:

- a fresh team can deploy and operate the platform from docs
- support boundaries are explicit
- reference deployment paths are documented for both topologies

### Track 6: GA validation and release candidate signoff

Suggested owner: qa-engineer

Scope:

- validate recovery procedures
- validate upgrade path
- validate documented deployment flow
- validate production-readiness claims against the release candidate

Acceptance:

- recovery procedures are tested
- docs are sufficient for a fresh team to deploy and use the platform
- the final release candidate has explicit residual-risk notes

## Sequencing Guidance

### M5 remaining order

1. Close backend governance behavior in `d01ab805`.
2. Let QA start `22d6329b` immediately after backend governance lands.
3. Treat `8a612dc0` as a proof gate, not just a wrapper task.

### M6 order

1. Refine M6 into executable plan (`7ed82e5e`).
2. Start Track 2 and Track 3 first because recovery and upgrade safety are the hardest GA blockers.
3. Run Track 1 and Track 4 in parallel once the operational model is stable.
4. Keep Track 5 active throughout, not only at the end.
5. Make Track 6 the final acceptance gate.

## Known Board Hygiene Issues

Historical stale blocker IDs still exist on some umbrella tasks. They do not define the real execution order and should be treated as board debt:

- `8a612dc0` still carries stale blocker `474c6d0e`
- `7ed82e5e` and `76778284` still carry stale blocker chains from earlier seeding

Do not rely on those stale IDs when sequencing the remaining work.
