# M0/M1 Architecture

## Purpose

This document freezes the initial technical direction for Codex Swarm's first executable implementation slice.
It translates the PRD and roadmap into a TypeScript-first build plan for Milestone 0 and Milestone 1.

## Decision Summary

- Language: TypeScript across backend, frontend, shared contracts, and worker-facing libraries
- Repository shape: pnpm workspace monorepo
- Backend API: Fastify
- Frontend: Next.js App Router
- Validation and schemas: Zod
- Database access: Prisma with PostgreSQL
- Cache/event bus: Redis
- Tests: Vitest for unit/integration, Playwright for browser smoke coverage
- Primary vertical slice: create a run, persist tasks/sessions, and render the run/task board shell

The PRD's Python examples are treated as reference architecture only. The user directive for this project is TypeScript, so all implementation work should follow the stack above.

## Initial Repository Layout

```text
apps/
  api/              # Fastify control-plane API
  web/              # Next.js board and review UI
  worker/           # Worker supervisor and Codex runtime integration
packages/
  config/           # Shared TS config, eslint, prettier, env helpers
  contracts/        # Shared Zod schemas and API/domain types
  database/         # Prisma schema, client, seed/test helpers
  orchestration/    # Task graph logic and run coordination services
  ui/               # Shared frontend components once needed
docs/
  architecture/
  qa/
.swarm/
  plan.md
```

## M0 Scope

Milestone 0 is about feasibility and repo foundation.

Required outcomes:

1. Create the workspace, package manifests, TypeScript configuration, and shared scripts.
2. Establish the monorepo package boundaries listed above.
3. Add a minimal Fastify API process with a health endpoint.
4. Add a Prisma schema for the core durable entities.
5. Add a worker package with an executable stub for runtime supervision.
6. Add the first shared contracts package so frontend and backend agree on shapes.
7. Add test runner wiring and at least one runnable smoke test command.

M0 does not require full orchestration behavior, approvals, or production UI.

## M1 Scope

Milestone 1 is the first end-to-end orchestration slice on a single host.

Required outcomes:

1. Persist `Run`, `Task`, `Agent`, and `Session` records in PostgreSQL.
2. Expose CRUD or minimal workflow endpoints for runs and tasks.
3. Implement task dependency persistence and unblock behavior in the service layer.
4. Add worker supervisor primitives for:
   - worktree path generation
   - Codex session start/continue command construction
   - persisted session/thread bookkeeping
5. Render a board shell in the frontend that shows runs, tasks, task states, and blocked relationships from real or fixture-backed API responses.
6. Add CI commands for lint, typecheck, unit tests, and integration tests.

## Initial Domain Model

These entities are in scope for the first schema pass:

- `Repository`: tracked repo metadata for a managed codebase
- `Run`: top-level execution instance for one goal
- `Task`: DAG node with owner, status, and dependency links
- `Agent`: logical worker/leader identity in the run
- `Session`: durable Codex session handle bound to an agent
- `Validation`: structured result for lint/test/typecheck/build
- `Artifact`: metadata for logs, patches, and generated outputs

For M0/M1, keep the schema intentionally small. Approvals, budgets, policies, and event timelines can be modeled later once the first run path is working.

## Service Boundaries

### `apps/api`

Owns:

- HTTP endpoints
- request validation
- orchestration service entrypoints
- persistence-backed run/task/session reads and writes

### `apps/worker`

Owns:

- worktree naming and filesystem management
- worker process lifecycle
- Codex runtime command construction
- validation command execution

### `apps/web`

Owns:

- run list and run detail shell
- task board lanes and blocked-state rendering
- validation summary surfaces for the first slice

### Shared packages

- `packages/contracts`: runtime-safe schemas and inferred types
- `packages/database`: Prisma schema and client access
- `packages/orchestration`: business rules for task graph behavior

## Sequence for the First Executable Slice

1. Bootstrap workspace and package boundaries.
2. Add shared contracts and database schema.
3. Add API health endpoint and run/task endpoints.
4. Add worker supervisor stub with unit-testable command builders.
5. Add frontend board shell against fixture or live API data.
6. Add Vitest integration tests for API and worker primitives.
7. Add CI commands once local scripts are stable.

## Constraints

- Avoid premature multi-node or enterprise features.
- Avoid heavy UI polish before real data paths exist.
- Avoid coupling worker logic directly to shell-only task coordination.
- Prefer typed contracts in `packages/contracts` over duplicated request/response shapes.

## Acceptance Criteria for Architecture Freeze

The team can treat architecture as frozen for M0/M1 when:

1. The repo layout exists in code.
2. Shared contracts are checked in.
3. Database schema exists for the M1 entities.
4. The API and worker packages both compile.
5. The board shell can render task state from defined contracts.
6. QA can run a non-empty automated test command.
