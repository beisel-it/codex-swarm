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

## Task Matrix

| Task | Track | Roadmap coverage | Must deliver | Must not drift into |
| --- | --- | --- | --- | --- |
| `d002e3dc` | Identity and workspace isolation | SSO / OIDC login, workspace/team isolation | authenticated actor model, workspace/team ownership on governed entities, access boundary enforcement hooks | full enterprise provisioning suite |
| `d01ab805` | RBAC and policy packs | RBAC, policy packs by team or repo, approval delegation rules | role-restricted actions, policy profile selection by team/repo, sensitive-repo stricter defaults, approval delegation wiring | bespoke per-screen authorization logic |
| `a9e7afdf` | Audit, retention, and reporting | audit export, retention controls, admin reporting | actor-attributed audit export, retention policies on persisted governance data, admin-readable reporting primitives | full BI/reporting platform |
| `18df47d3` | Secrets and integration hardening | secret source integrations | explicit secret-provider integration boundary, governed-repo credential path, operational usage guidance | provider sprawl or one-off credentials per feature |
| `4ce472b7` | Governance UI and admin surfaces | team and repo policy management, approval/audit trail visibility | policy visibility, approval provenance display, audit/admin views aligned to backend contracts | frontend-owned policy logic |
| `22d6329b` | Multi-user governance verification | Phase 5 exit criteria validation | role restriction checks, audit proof checks, retention checks, stricter-default repo checks | mock-only signoff without backend evidence |

## Acceptance Criteria By Track

### Track 1: Identity and workspace isolation

The track is complete only when:

- the control plane can associate authenticated actor identity with requests
- repos, runs, approvals, and policies belong to a team or workspace boundary
- cross-team access is denied by default for governed routes
- the identity and ownership model is explicit in shared contracts and persistence, not implied by middleware-only state

### Track 2: RBAC and policy packs

The track is complete only when:

- run create, review, approve, retry, stop, and admin actions are role-gated
- policy profiles can be selected or inherited by team and repo without code edits
- sensitive repos can opt into stricter defaults than standard repos
- approval delegation rules are persisted and enforced rather than manually interpreted

### Track 3: Audit, retention, and reporting

The track is complete only when:

- audit export shows actor identity, action, target, and approval provenance
- retention rules can affect stored run, event, artifact, or approval history in a controlled way
- admins have a supported way to inspect policy and approval history without direct database access

### Track 4: Secrets and integration hardening

The track is complete only when:

- governed repos can source secrets through a defined integration boundary
- credential distribution responsibilities are documented for API, worker, and remote execution paths
- the secret-handling path aligns with team/policy boundaries rather than bypassing them

### Track 5: Governance UI and admin surfaces

The track is complete only when:

- policy profile, repo sensitivity, and approval delegation state are visible in the UI
- audit and approval provenance are understandable without reading raw exports
- admin views rely on backend governance contracts and do not invent alternate permission semantics

### Track 6: Multi-user governance verification

The track is complete only when:

- disallowed actions are rejected for the wrong role or workspace
- audit exports can prove who approved what and when
- retention behavior is exercised against real backend state
- at least one sensitive-repo path is verified to behave more strictly than a standard repo path

## Roadmap Coverage Notes

Roadmap bullets intentionally covered in M5:

- SSO / OIDC login
- workspace/team isolation
- RBAC for run create/review/admin actions
- policy packs by team or repo
- approval delegation rules
- audit export
- retention controls
- secret source integrations
- admin reporting

Items that remain minimal by design in this phase:

- identity is allowed to be a minimal OIDC-backed control-plane entrypoint rather than a full account-management system
- admin reporting may be primitive as long as it proves governance state without direct DB access
- secret integrations should establish a pattern and at least one real path, not every provider permutation

## Dependency Model

Phase 5 refinement is complete once the tracks below are on the board with a sane dependency chain.

Execution dependencies:

1. Identity/workspace isolation and RBAC/policy packs start first.
2. Audit/retention and secrets/integration hardening can begin in parallel with RBAC once actor/team boundaries are defined.
3. Governance UI follows the backend contract surface for policy, approval provenance, and admin reporting.
4. QA verification starts once backend governance rules and frontend/admin visibility are materially implemented.
5. The umbrella M5 task must not be closed while any exit criterion still depends on mock-only UI evidence or undocumented operator steps.

## Risks

- If workspace isolation is bolted on after RBAC, policy evaluation will drift and access control will be inconsistent.
- Audit export without actor provenance will not satisfy the stated exit criteria.
- Secret integrations can sprawl; keep the pattern explicit and minimal.

## Deliberate Non-Goals

These remain outside Phase 5:

- GA support envelope, SLOs, backup/restore, and disaster recovery drills
- large-scale performance tuning beyond what governance features require
- full enterprise provisioning ecosystems beyond the minimal identity and policy model
