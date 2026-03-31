# M6 Delivery Plan

## Scope Reference

This plan implements `ROADMAP.md` Phase 6, `v1.0: GA and scaling envelope`.

Phase 6 objectives:

- ship a production-ready platform with explicit support boundaries
- prove recovery and upgrade procedures through recorded exercises
- make operational, cost, and performance claims measurable
- provide enough documentation for a fresh team to deploy and operate the system

## Exit Criteria

Phase 6 is complete when:

1. The platform can demonstrate expected concurrency behavior with recorded verification and documented limits.
2. Recovery procedures are tested.
3. Docs are sufficient for a fresh team to deploy and use the product.

## Execution Order

### Track 1: SLOs, support boundaries, and observability envelope

Owner: devops

Task:

- `b1a94897` M6 SLOs, support boundaries, and observability envelope

Primary outputs:

- measurable service-level objectives
- explicit support boundaries and limitations
- observability/reporting aligned to the operational envelope

Status note:

- this track has already landed implementation work and should be treated as evidence-bearing input to M6 signoff

### Track 2: Backup, restore, and disaster recovery

Owner: devops

Task:

- `d8f99581` M6 backup, restore, and disaster recovery validation

Primary outputs:

- backup and restore runbooks
- disaster recovery exercise evidence
- recorded drill timings and restore validation

Status note:

- this track has already landed implementation work and must be incorporated into the final GA evidence set

### Track 3: Migration and upgrade safety

Owner: backend-dev

Task:

- `c2728407` M6 migration and upgrade safety: schema/config versioning and upgrade path

Primary outputs:

- schema/config versioning model
- documented upgrade path
- rollback or failure notes where rollback is unsafe

This is the remaining core backend GA blocker.

### Track 4: Cost, usage, and performance envelope

Owner: devops

Task:

- `ffe88049` M6 cost, usage, and performance envelope

Primary outputs:

- operator-visible cost and usage reporting
- performance baselines under expected concurrency
- documented bottlenecks and tuning notes

Status note:

- this track has already landed implementation work and should be evaluated during M6 signoff rather than reopened casually

### Track 5: Admin, developer, and operator docs

Owner: tech-lead

Task:

- `36074f2b` M6 admin/developer/operator docs, support playbooks, and reference deployments

Primary outputs:

- deployer/operator/admin documentation set
- support playbooks
- single-host and multi-node reference deployment guidance
- published support boundaries and limitations

This track must stay grounded in the actual runtime and governance model that shipped in M0 through M5.

### Track 6: GA validation and release-candidate signoff

Owner: qa-engineer

Task:

- `2f4f7cd3` M6 GA validation and release-candidate signoff

Primary outputs:

- validation of recovery procedures
- validation of upgrade path
- validation that docs support a fresh-team deployment flow
- explicit residual-risk statement for the release candidate

This is the final acceptance gate for the full roadmap.

## Task Matrix

| Task       | Track                              | Roadmap coverage                                                        | Must deliver                                                           | Must not drift into                                     |
| ---------- | ---------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `b1a94897` | SLOs/support boundaries            | Operational SLOs, support boundaries                                    | measurable SLOs, clear support envelope, aligned observability         | vague reliability claims without measurement            |
| `d8f99581` | Backup/restore/DR                  | backup/restore runbook, disaster recovery testing                       | exercised runbooks, recorded drills, restore validation                | documentation-only DR with no exercise evidence         |
| `c2728407` | Migration/upgrade safety           | migration and upgrade path, upgrade-safe schema/config versioning       | upgrade path, schema/config evolution guidance, rollback/failure notes | undocumented breaking changes                           |
| `ffe88049` | Cost/usage/performance             | cost/usage reporting, performance tuning                                | reported usage/cost signals, concurrency baselines, tuning notes       | unsupported performance claims                          |
| `36074f2b` | Docs/support/reference deployments | admin/developer/operator docs, support playbooks, reference deployments | fresh-team-usable docs, deployment guidance, support boundaries        | aspirational docs detached from actual product behavior |
| `2f4f7cd3` | GA validation/signoff              | GA release candidate and final exit criteria                            | full RC signoff with residual risks                                    | signoff based only on unit or component checks          |

## Acceptance Criteria By Track

### Track 1: SLOs, support boundaries, and observability envelope

The track is complete only when:

- SLOs are explicit and measurable
- operators can observe whether the platform is inside or outside the envelope
- support boundaries match the published operational claims

### Track 2: Backup, restore, and disaster recovery

The track is complete only when:

- backup and restore procedures are documented
- at least one real recovery drill is recorded with validation results
- operators can follow the runbook without implicit tribal knowledge

### Track 3: Migration and upgrade safety

The track is complete only when:

- schema and config evolution are versioned or explicitly governed
- upgrade steps are documented for a fresh operator
- upgrade-risk and rollback limitations are stated where applicable

### Track 4: Cost, usage, and performance envelope

The track is complete only when:

- expected-concurrency behavior has recorded evidence
- cost and usage data are exposed to operators or admins
- performance notes include constraints and known bottlenecks

### Track 5: Admin, developer, and operator docs

The track is complete only when:

- a fresh team can deploy the platform from docs
- docs cover single-host and multi-node reference topologies
- support boundaries and limitations are published clearly

### Track 6: GA validation and release-candidate signoff

The track is complete only when:

- recovery procedures are tested
- upgrade path is tested or explicitly validated
- docs are sufficient for a fresh-team deployment and usage flow
- the release candidate has explicit residual-risk notes

## Dependency Model

Execution dependencies:

1. Track 3 and Track 5 are the remaining primary blockers because upgrade safety and documentation are not yet complete.
2. Tracks 1, 2, and 4 are already landed and should feed evidence into final signoff rather than reopening as speculative work.
3. Track 6 starts once Track 3 and Track 5 are materially complete and can consume the evidence from Tracks 1, 2, and 4.
4. The umbrella `76778284` must not close while any exit criterion still depends on undocumented operator steps or untested upgrade/recovery behavior.

## Risks

- Recovery evidence can become stale if documentation diverges from the exercised runtime path.
- Upgrade safety is a real GA blocker; schema/config churn without versioning invalidates operator trust.
- Documentation quality can lag behind implementation and create a false sense of readiness.

## Deliberate Non-Goals

These remain outside M6:

- new major feature tracks unrelated to GA readiness
- enterprise platform expansion beyond the already-shipped governance model
- speculative scaling work that is not tied to the documented support envelope
