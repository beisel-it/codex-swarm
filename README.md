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
- `.agents/skills`: reusable workflow skills for planning, DAG creation, milestone validation, PR preparation, and codex-swarm external-operator control
- `templates/repo-profiles`: stack-specific onboarding templates for Node, Python, JVM, and Go repos

## Setup

1. Install workspace dependencies:
   `corepack pnpm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `DEV_AUTH_TOKEN`, and the artifact settings used by your deployment shape.
   The M6 runtime also tracks `CONTROL_PLANE_SCHEMA_VERSION` and `CONTROL_PLANE_CONFIG_VERSION`; leave the shipped defaults unless you are validating an upgrade mismatch path.
   For multi-node deployments, set `ARTIFACT_STORAGE_ROOT` to shared durable storage on the API host and `ARTIFACT_BASE_URL` to the externally reachable API base URL so remote workers and operators can resolve artifact downloads.
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

Control-plane API shape:

- The supported backend surface is workflow-oriented rather than full table-by-table CRUD.
- Repositories, runs, tasks, and agents expose create/list/detail or state-transition routes under `/api/v1`.
- Session state is intentionally exposed through `GET /api/v1/runs/:id`, audit export, cleanup, and worker recovery flows instead of a standalone session CRUD endpoint.
- The supersession note for the original roadmap wording lives in [`docs/architecture/control-plane-api-contract.md`](./docs/architecture/control-plane-api-contract.md).

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
- `corepack pnpm ops:smoke` drives a live single-host smoke flow against `SMOKE_BASE_URL`, starting a real leader session, continuing it on the persisted `threadId`, materializing `.swarm/plan.md`, persisting the task DAG, and emitting operator-visible verification output.
- `POST /api/v1/cleanup-jobs/run` can optionally delete stale or terminal worktree directories when `deleteStaleWorktrees=true`.

Repository materialization:

- Worker runtime now exposes `materializeRepositoryWorkspace(...)` in `@codex-swarm/worker`.
- Repositories with `localPath` are mounted into the worker worktree path as an operator-prepared local checkout. The runtime does not change branches for mounted paths; operators own branch/cleanliness of that source tree.
- Repositories without `localPath` are cloned into the worker worktree path from `repository.url` using the requested branch or the repository default branch.
- `POST /api/v1/repositories` now validates reachable provider-backed repositories with `git ls-remote`, records discovered branches/default branch metadata, and falls back to `main` only when the provider does not expose a default branch.

Artifact persistence:

- `POST /api/v1/artifacts` persists both metadata and durable blob content.
- `GET /api/v1/artifacts/:id/content` serves the stored artifact bytes through the control-plane API.
- Remote worker nodes should not run without `artifactBaseUrl`; the runtime dependency check treats shared artifact access as mandatory for multi-node execution.

Codex MCP transport:

- Worker runtime now supports `codexTransport.kind = "stdio"` for local execution and `codexTransport.kind = "streamable_http"` for remote/shared Codex MCP services.
- Streamable HTTP requests use a single MCP endpoint, send `Accept: application/json, text/event-stream`, and include `MCP-Protocol-Version`.
- Multi-node/shared-service deployments should configure the remote Codex MCP endpoint in the worker bootstrap/runtime contract instead of assuming a local `codex mcp-server` subprocess on every node.

Operations docs:

- [`docs/README.md`](./docs/README.md)
- [`docs/user-guide.md`](./docs/user-guide.md)
- [`docs/admin-guide.md`](./docs/admin-guide.md)
- [`docs/operator-guide.md`](./docs/operator-guide.md)
- [`docs/operator-skill-library.md`](./docs/operator-skill-library.md)
- [`docs/operator-skill-workflows.md`](./docs/operator-skill-workflows.md)
- [`docs/support-playbooks.md`](./docs/support-playbooks.md)
- [`docs/reference-deployments.md`](./docs/reference-deployments.md)
- [`docs/operations/security.md`](./docs/operations/security.md)
- [`docs/operations/slo-support.md`](./docs/operations/slo-support.md)
- [`docs/operations/backup-restore-dr.md`](./docs/operations/backup-restore-dr.md)
- [`docs/operations/upgrade-path.md`](./docs/operations/upgrade-path.md)
- [`docs/operations/cost-usage-performance.md`](./docs/operations/cost-usage-performance.md)

## Productivity Packs

The repository includes starter assets for the Phase 3 productivity-pack scope in the roadmap plus the M8 external-operator skill pack:

- root [`AGENTS.md`](./AGENTS.md) for repo-specific guidance
- `.codex/config.toml` and `.codex/agents/*.toml` for curated role packs
- `.agents/skills/README.md` for the codex-swarm operator-skill index
- `.agents/skills/*/SKILL.md` for reusable execution workflows, including codex-swarm diagnostics and recovery
- [`docs/operator-skill-workflows.md`](./docs/operator-skill-workflows.md) for grounded example flows
- `.swarm/prompt.md`, `.swarm/runbook.md`, and `.swarm/status.md` for durable run context
- `templates/repo-profiles/*.md` for stack-specific onboarding defaults
