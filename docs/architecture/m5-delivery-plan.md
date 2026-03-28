# M5 Delivery Plan

## Scope Reference

This plan implements `ROADMAP.md` Phase 5, `v0.5: governance and enterprise readiness`.

Phase 5 objectives:

- add multi-user governance controls without breaking the existing single-team control-plane model
- make approval, policy, and audit behavior provable and administratively manageable
- support team and repo isolation with stricter defaults for sensitive repositories
- establish the governance surfaces needed before GA hardening

## Exit Criteria

Phase 5 is complete when:

1. An org admin can prove who approved what and when.
2. Teams can set different policy profiles without code changes.
3. Sensitive repos can run with stricter defaults than standard repos.

## Execution Order

### Track 1: Identity and workspace isolation

Owner: backend-dev

Primary outputs:

- SSO or OIDC-backed identity entrypoint suitable for the current control plane
- workspace and team ownership model for repos, runs, approvals, and policies
- durable team-scoped access boundaries in the control plane

This track establishes the multi-user boundary model that the rest of M5 depends on.

### Track 2: RBAC and policy packs

Owner: backend-dev

Primary outputs:

- role-based permissions for run create, review, approve, retry, stop, and admin actions
- team or repo policy packs
- stricter defaults for sensitive repos without code changes
- approval delegation rules tied to policy state

This track should extend the M3 governance-lite model rather than replace it.

### Track 3: Audit, retention, and reporting

Owner: devops

Primary outputs:

- audit export with actor and approval provenance
- retention controls for runs, artifacts, and events
- admin-facing reporting primitives for policy and approval history

This track turns existing timeline and audit surfaces into something operationally defensible.

### Track 4: Secrets and integration hardening

Owner: devops

Primary outputs:

- secret source integration pattern for remote and sensitive repos
- documented credential distribution boundaries
- operational guidance for policy-driven secret access

This track should remain minimal and enterprise-oriented, not a full platform rewrite.

### Track 5: Governance UI and admin surfaces

Owner: frontend-dev

Primary outputs:

- team and repo policy visibility
- approval provenance and delegation visibility
- admin-oriented views for audit and policy management

This track should expose the governance model clearly without inventing frontend-only policy logic.

### Track 6: Multi-user governance verification

Owner: qa-engineer

Primary outputs:

- verification of role-restricted actions
- proof that approval provenance and audit exports are complete
- validation that sensitive repos can run under stricter defaults than standard repos
- regression coverage for policy-driven access and retention behavior

This is the milestone acceptance gate for M5.

## Dependency Model

Phase 5 refinement is complete once the tracks below are on the board with a sane dependency chain.

Execution dependencies:

1. Identity/workspace isolation and RBAC/policy packs start first.
2. Audit/retention and secrets/integration hardening can begin in parallel with RBAC once actor/team boundaries are defined.
3. Governance UI follows the backend contract surface for policy, approval provenance, and admin reporting.
4. QA verification starts once backend governance rules and frontend/admin visibility are materially implemented.

## Risks

- If workspace isolation is bolted on after RBAC, policy evaluation will drift and access control will be inconsistent.
- Audit export without actor provenance will not satisfy the stated exit criteria.
- Secret integrations can sprawl; keep the pattern explicit and minimal.

## Deliberate Non-Goals

These remain outside Phase 5:

- GA support envelope, SLOs, backup/restore, and disaster recovery drills
- large-scale performance tuning beyond what governance features require
- full enterprise provisioning ecosystems beyond the minimal identity and policy model
