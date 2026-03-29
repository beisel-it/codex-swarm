# Codex Swarm

Codex Swarm is a workflow-oriented control plane for running Codex-backed work across repositories, tasks, reviews, approvals, validations, artifacts, and distributed workers.

The current repo is no longer an M0/M1 scaffold. It now ships:

- a Fastify control-plane API
- a worker runtime with supervised Codex session execution
- a frontend board, run-detail, and review surface
- governance, audit export, retention, and admin reporting
- distributed worker placement, recovery, and artifact serving
- an external operator skill pack and documented operator workflows

## Start Here

Choose the path that matches how you are approaching the system:

- Product overview and quick local bring-up:
  [docs/README.md](./docs/README.md)
- External Codex operator entry point:
  [docs/operator-guide.md](./docs/operator-guide.md)
- Checked-in operator skills and workflows:
  [docs/operator-skill-library.md](./docs/operator-skill-library.md)
  [docs/operator-skill-workflows.md](./docs/operator-skill-workflows.md)
- User-facing product walkthroughs:
  [docs/user-guide.md](./docs/user-guide.md)
- Admin and governance operations:
  [docs/admin-guide.md](./docs/admin-guide.md)
- Support and recovery playbooks:
  [docs/support-playbooks.md](./docs/support-playbooks.md)

## What The System Does

Codex Swarm centers on a workflow API rather than generic CRUD:

- repositories are onboarded with provider metadata and trust boundaries
- runs hold the goal, policy posture, budget posture, and completion state
- tasks form a dependency-safe DAG
- agents and sessions persist Codex execution state, including `threadId`
- approvals, validations, and artifacts are first-class review evidence
- worker nodes and dispatch assignments drive distributed execution
- audit export gives a run-scoped governance and provenance record

The intentional API-contract shape is documented in
[docs/architecture/control-plane-api-contract.md](./docs/architecture/control-plane-api-contract.md).

## Current Milestone State

The roadmap has been carried through M9:

- M7 parity review is complete
- M8 external-operator skill pack is complete
- M9 end-to-end validation is complete through a real codex-swarm-run product scenario

The M9 scenario proved a designer-plus-developer flow in an isolated workdir,
produced design and implementation artifacts, generated screenshots, recorded
validations, and exported a persisted audit record.

## Local Bring-Up

1. Install dependencies:
   `corepack pnpm install`
2. Copy `.env.example` to `.env` and set:
   - `DATABASE_URL`
   - `DEV_AUTH_TOKEN`
   - artifact settings for your deployment shape
3. For shared or remote-worker deployments, also set:
   - `ARTIFACT_STORAGE_ROOT`
   - `ARTIFACT_BASE_URL`
4. Start the API:
   `corepack pnpm --dir apps/api dev`
5. Start the frontend:
   `corepack pnpm --dir frontend dev`

Use `Authorization: Bearer <DEV_AUTH_TOKEN>` for `/api/v1/*` requests.

## Core Verification

- API typecheck:
  `corepack pnpm --dir apps/api typecheck`
- Contracts typecheck:
  `corepack pnpm --dir packages/contracts typecheck`
- Orchestration typecheck:
  `corepack pnpm --dir packages/orchestration typecheck`
- API tests:
  `corepack pnpm --dir apps/api test`
- Workspace checks:
  `corepack pnpm run ci:typecheck`
  `corepack pnpm run ci:test`
  `corepack pnpm run ci:build`

## Operational Commands

- Schema/config compatibility:
  `GET /health`
  `corepack pnpm --dir apps/api db:status`
- Metrics and support envelope:
  `GET /api/v1/metrics`
- Backup, restore, and DR drill:
  `corepack pnpm ops:backup`
  `corepack pnpm ops:restore`
  `corepack pnpm ops:drill`
- Single-host smoke flow:
  `corepack pnpm ops:smoke`
- M9 fresh-workdir preparation:
  `corepack pnpm ops:m9:prepare`
- Performance-envelope check:
  `corepack pnpm ops:perf`
- Cleanup and stale-worktree deletion:
  `POST /api/v1/cleanup-jobs/run`

## Distributed Execution Notes

- remote worker nodes should not run without `artifactBaseUrl`
- worker runtime supports both local `stdio` Codex MCP and remote streamable HTTP transport
- repository materialization supports trusted local-path mounts and cloned checkouts
- load-aware scheduling now considers capability, stickiness, queue depth, active claims, utilization, and heartbeat freshness
- leader placement is explicit in distributed runs

## Governance And Review

The governance surface includes:

- RBAC and workspace/team isolation
- approval delegation
- policy-exception approvals with structured decision payloads
- validation templates and worker-executed validation commands
- durable artifact storage and artifact detail retrieval
- run-scoped audit export with approvals, validations, artifacts, events, provenance, and retention context

The review UI now renders diff summary content from `GET /api/v1/artifacts/:id`
alongside approvals, validations, and generic artifact evidence.

## Operator Pack

The repo ships codex-swarm-specific external operator assets:

- repo guidance:
  [AGENTS.md](./AGENTS.md)
- role pack:
  `.codex/config.toml`
  `.codex/agents/*.toml`
- checked-in skill index:
  [.agents/skills/README.md](./.agents/skills/README.md)
- reusable skills:
  `.agents/skills/*/SKILL.md`
- grounded operator workflows:
  [docs/operator-skill-workflows.md](./docs/operator-skill-workflows.md)
- authoring guidance:
  [docs/agent-skill-authoring.md](./docs/agent-skill-authoring.md)

## Workspace Layout

- `apps/api`: control-plane API and persistence layer
- `apps/worker`: worker runtime, provisioning, validation runner, and Codex supervision
- `frontend`: board, run, review, and governance UI
- `packages/contracts`: shared schemas and types
- `packages/orchestration`: DAG and orchestration helpers
- `templates/repo-profiles`: onboarding templates by stack
- `.codex/agents`: checked-in role pack
- `.agents/skills`: checked-in codex-swarm skill library
- `docs`: release-facing docs, operations runbooks, and architecture notes

## Documentation Index

- [docs/README.md](./docs/README.md)
- [docs/user-guide.md](./docs/user-guide.md)
- [docs/admin-guide.md](./docs/admin-guide.md)
- [docs/operator-guide.md](./docs/operator-guide.md)
- [docs/operator-skill-library.md](./docs/operator-skill-library.md)
- [docs/operator-skill-workflows.md](./docs/operator-skill-workflows.md)
- [docs/support-playbooks.md](./docs/support-playbooks.md)
- [docs/reference-deployments.md](./docs/reference-deployments.md)
- [docs/operations/security.md](./docs/operations/security.md)
- [docs/operations/slo-support.md](./docs/operations/slo-support.md)
- [docs/operations/backup-restore-dr.md](./docs/operations/backup-restore-dr.md)
- [docs/operations/m9-readiness.md](./docs/operations/m9-readiness.md)
- [docs/operations/upgrade-path.md](./docs/operations/upgrade-path.md)
- [docs/operations/cost-usage-performance.md](./docs/operations/cost-usage-performance.md)

## Architecture References

- [PRD.md](./PRD.md)
- [ROADMAP.md](./ROADMAP.md)
- [docs/architecture/m0-m1-architecture.md](./docs/architecture/m0-m1-architecture.md)
- [docs/architecture/control-plane-api-contract.md](./docs/architecture/control-plane-api-contract.md)
- [docs/architecture/system-context-and-sequences.md](./docs/architecture/system-context-and-sequences.md)
