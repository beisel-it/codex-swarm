# Codex Swarm

TypeScript pnpm-workspace scaffold for the M0/M1 slice described in [PRD.md](./PRD.md), [ROADMAP.md](./ROADMAP.md), and [docs/architecture/m0-m1-architecture.md](./docs/architecture/m0-m1-architecture.md).

## Workspace Layout

- `apps/api`: Fastify control-plane API scaffold
- `apps/worker`: worker runtime and session lifecycle helpers
- `frontend`: frontend shell
- `packages/contracts`: shared Zod schemas and inferred types
- `packages/database`: database package stub plus initial Prisma schema
- `packages/orchestration`: shared orchestration helpers for M1 task behavior
- `.codex/agents`: curated starter role pack for leader, architect, implementer, reviewer, and tester
- `.agents/skills`: reusable workflow skills for planning, DAG creation, milestone validation, and PR preparation
- `templates/repo-profiles`: stack-specific onboarding templates for Node, Python, JVM, and Go repos

## Setup

1. Install workspace dependencies:
   `corepack pnpm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and `DEV_AUTH_TOKEN`.
   The M6 runtime also tracks `CONTROL_PLANE_SCHEMA_VERSION` and `CONTROL_PLANE_CONFIG_VERSION`; leave the shipped defaults unless you are validating an upgrade mismatch path.
3. For governed-repo testing, optionally switch `SECRET_SOURCE_MODE=external_manager`, set `SECRET_PROVIDER=vault`, and list task-scoped credential names in `REMOTE_SECRET_ENV_NAMES`.
4. Start the API package:
   `corepack pnpm --dir apps/api dev`
5. Start the frontend package:
   `corepack pnpm --dir frontend dev`

## Verification

- API typecheck: `corepack pnpm --dir apps/api typecheck`
- Contracts typecheck: `corepack pnpm --dir packages/contracts typecheck`
- Orchestration typecheck: `corepack pnpm --dir packages/orchestration typecheck`
- API tests: `corepack pnpm --dir apps/api test`

Use `Authorization: Bearer <DEV_AUTH_TOKEN>` for `/api/v1/*` requests.

Admin-oriented governance endpoints:

- `GET /api/v1/admin/governance-report`
- `POST /api/v1/admin/retention/reconcile`
- `GET /api/v1/admin/secrets/integration-boundary`
- `GET /api/v1/admin/secrets/access-plan/:id`

Operational tooling:

- `GET /api/v1/metrics` exposes queue, failure, usage, cost, performance, and SLO envelope data.
- `GET /health` reports the expected schema/config versions for the running build.
- `corepack pnpm --dir apps/api db:status` verifies the live database metadata matches the running build.
- `corepack pnpm ops:backup` writes a logical control-plane snapshot to `.ops/backups/`.
- `corepack pnpm ops:restore` restores a snapshot from `BACKUP_FILE` into `RESTORE_DATABASE_URL` or `DATABASE_URL`.
- `corepack pnpm ops:drill` creates a scratch Postgres database, restores a snapshot, and records counts/timings.
- `corepack pnpm ops:perf` runs a simple concurrent HTTP latency check against a live API base URL.
- `corepack pnpm ops:smoke` drives a live single-host smoke flow against `SMOKE_BASE_URL`, covering repository/run creation, persisted plan artifact linkage, delegation messaging, and operator-visible verification output.
- `POST /api/v1/cleanup-jobs/run` can optionally delete stale or terminal worktree directories when `deleteStaleWorktrees=true`.

Repository materialization:

- Worker runtime now exposes `materializeRepositoryWorkspace(...)` in `@codex-swarm/worker`.
- Repositories with `localPath` are mounted into the worker worktree path as an operator-prepared local checkout. The runtime does not change branches for mounted paths; operators own branch/cleanliness of that source tree.
- Repositories without `localPath` are cloned into the worker worktree path from `repository.url` using the requested branch or the repository default branch.

Operations docs:

- [`docs/README.md`](./docs/README.md)
- [`docs/user-guide.md`](./docs/user-guide.md)
- [`docs/admin-guide.md`](./docs/admin-guide.md)
- [`docs/operator-guide.md`](./docs/operator-guide.md)
- [`docs/support-playbooks.md`](./docs/support-playbooks.md)
- [`docs/reference-deployments.md`](./docs/reference-deployments.md)
- [`docs/operations/security.md`](./docs/operations/security.md)
- [`docs/operations/slo-support.md`](./docs/operations/slo-support.md)
- [`docs/operations/backup-restore-dr.md`](./docs/operations/backup-restore-dr.md)
- [`docs/operations/upgrade-path.md`](./docs/operations/upgrade-path.md)
- [`docs/operations/cost-usage-performance.md`](./docs/operations/cost-usage-performance.md)

## Productivity Packs

The repository includes starter assets for the Phase 3 productivity-pack scope in the roadmap:

- root [`AGENTS.md`](./AGENTS.md) for repo-specific guidance
- `.codex/config.toml` and `.codex/agents/*.toml` for curated role packs
- `.agents/skills/*/SKILL.md` for reusable execution workflows
- `.swarm/prompt.md`, `.swarm/runbook.md`, and `.swarm/status.md` for durable run context
- `templates/repo-profiles/*.md` for stack-specific onboarding defaults
