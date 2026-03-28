# M6 Release Candidate Signoff

Date: 2026-03-29
Owner: qa-engineer
Task: `2f4f7cd3`

## Scope Validated

This signoff validates the M6 release candidate against:

- recovery procedure evidence and runbooks
- upgrade-path documentation and version-gate behavior
- documentation sufficiency for a fresh-team deployment flow
- final residual risks for the GA candidate

## Verification Performed

### Backend and workspace verification

- `corepack pnpm ci:test`
- `corepack pnpm ci:typecheck`
- `corepack pnpm ci:build`
- `corepack pnpm --dir apps/api test --run test/versioning.test.ts`

Result:

- all commands passed on clean HEAD `0723971`
- API, worker, contracts, orchestration, frontend, and database packages build or typecheck successfully
- versioning tests confirm deterministic failure on missing or mismatched schema/config metadata

### Recovery evidence validation

Reviewed:

- [Backup, Restore, and DR](../operations/backup-restore-dr.md)
- [Support Playbooks](../support-playbooks.md)
- [Operator Guide](../operator-guide.md)

Validated:

- documented backup, restore, and drill commands exist in the repo root scripts
- DR evidence is recorded with timings, counts, and result status
- operator playbooks describe failure handling for failed restore/drill and prohibit reopening traffic before validation

### Upgrade-path validation

Reviewed:

- [Upgrade Path](../operations/upgrade-path.md)
- [Operator Guide](../operator-guide.md)
- [README](../../README.md)

Validated:

- documented `db:migrate` and `db:status` commands exist
- `/health` exposes schema/config versions
- `apps/api/src/db/check-version.ts` enforces version compatibility against persisted metadata
- rollback limitations are stated explicitly and do not imply unsafe reverse migrations

### Fresh-team docs sufficiency

Reviewed:

- [Documentation index](../README.md)
- [README](../../README.md)
- [Reference Deployments](../reference-deployments.md)
- [User Guide](../user-guide.md)
- [Admin Guide](../admin-guide.md)
- [Operator Guide](../operator-guide.md)
- [Security](../operations/security.md)
- [SLO and Support Envelope](../operations/slo-support.md)
- [Cost, Usage, and Performance](../operations/cost-usage-performance.md)

Validated:

- the docs set provides a coherent path from initial setup to deployment, health checks, governance/admin usage, and operator procedures
- single-host and multi-node reference deployments are both documented
- screenshots and UI walkthroughs exist for board, run detail, review, governance/admin, and fleet visibility
- support boundaries and non-goals are documented rather than implied

## Release-Candidate Decision

RC decision: approved

Basis:

- recovery procedures are documented and backed by recorded drill evidence
- upgrade safety is enforced by version-gated metadata checks and documented operator steps
- the docs set is sufficient for a fresh team to install, configure, deploy, and operate the platform at the supported reference level
- workspace verification is green across tests, typechecks, and builds

## Residual Risks

1. DR evidence is bounded to logical control-plane backup and restore, not a full regional failover or infra-rebuild exercise.
2. The performance probe is a bounded smoke baseline and not a substitute for sustained production load testing in a target deployment.
3. Documentation quality is sufficient for the supported reference topologies, but local environment prerequisites still depend on operators providing reachable Postgres and Redis instances.
4. Rollback remains restore-based; reverse schema rollback is intentionally not promised for incompatible upgrades.

## Follow-Up Guidance

- Preserve future DR drill outputs and upgrade validation records as release evidence rather than relying on one historical run.
- Re-run `ops:perf`, DR drill, and upgrade checks whenever the supported deployment topology or schema/config contract changes materially.
