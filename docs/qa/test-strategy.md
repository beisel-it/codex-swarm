# QA Test Strategy

## Scope

This repository currently contains only planning documents:

- `PRD.md`
- `ROADMAP.md`

No TypeScript application code, package manifest, test runner, or executable services are present on `main` as of 2026-03-28. This document defines the QA strategy and test cases that should be implemented once the codebase exists.

## Current QA status

- Unit tests: blocked by missing source code
- Integration tests: blocked by missing source code
- End-to-end tests: blocked by missing UI and runtime
- CI test automation: blocked by missing package/tooling setup

## Recommended TypeScript test stack

- Unit and integration tests: `vitest`
- API contract tests: `supertest` for HTTP endpoints
- UI component tests: `@testing-library/react`
- Browser end-to-end tests: `playwright`
- Coverage reporting: `vitest --coverage`

## Quality gates

The initial TypeScript implementation should not be considered review-ready until it includes:

1. Passing unit tests for domain models and orchestration logic
2. Passing integration tests for API, persistence, and worker lifecycle boundaries
3. Passing end-to-end smoke tests for the browser board once the UI exists
4. CI execution for lint, typecheck, unit tests, and integration tests

## Planned test areas

### 1. Control plane API

Unit tests:

- request validation for run, task, agent, approval, and validation payloads
- status transition rules for tasks and approvals
- serialization of API responses and error shapes

Integration tests:

- create and fetch repositories, runs, tasks, agents, and sessions
- dependency updates unblock downstream tasks correctly
- validation and artifact records persist and are queryable
- restart-safe reads from Postgres-backed state

### 2. Orchestrator service

Unit tests:

- task DAG generation from a run goal
- retry selection and failure handling
- worker assignment and heartbeat timeout behavior
- session continuation using persisted `threadId`

Integration tests:

- leader plan creation persists expected tasks
- worker spawn/stop/retry flows update durable state correctly
- orchestrator restart recovers active runs and sessions

### 3. Worker runtime supervisor

Unit tests:

- worktree naming and path generation
- command construction for `codex mcp-server`
- validation result normalization and artifact metadata creation

Integration tests:

- worktree creation and cleanup on task lifecycle changes
- worker runtime bootstrap against a fixture repository
- validation command execution captures logs and exit codes

### 4. Control-plane contract

Unit tests:

- route-schema validation and response normalization
- authorization and run-context scoping rules

Integration tests:

- `GET /api/v1/tasks`, `PATCH /api/v1/tasks/:id/status`, and
  `POST /api/v1/messages` reflect control-plane state
- `POST /api/v1/artifacts` and `POST /api/v1/validations` persist expected
  records
- `POST /api/v1/agents` and lifecycle recovery controls change runtime state
  safely

### 5. Browser board and review UI

Component tests:

- task board renders task status, blocked state, and agent lanes
- approval views render accept/reject states correctly
- validation logs and artifact links display expected data

End-to-end tests:

- active run board updates after task status changes
- reviewer can approve and reject a task
- recovery state after simulated orchestrator restart is visible in UI

Manual verification:

- use `screenshot` for visual regression evidence once frontend exists
- use `agent-browser` for live UI workflow verification once app is runnable

## Initial test case matrix

### High priority

1. Create run and persist leader session
2. Continue existing session using stored `threadId`
3. Create task DAG with dependencies and unblock behavior
4. Spawn isolated worker worktrees without collisions
5. Persist validation results and artifacts
6. Recover active run after orchestrator restart

### Medium priority

1. Approval accept and reject flows
2. Message delivery between leader and workers
3. Retry failed worker task with preserved audit trail
4. Branch or PR handoff with validation evidence

### Lower priority after alpha

1. Budget and concurrency cap enforcement
2. Remote worker registration and capability scheduling
3. Governance and audit export workflows

## Definition of done for QA on first implementation slice

The first executable vertical slice should include at minimum:

- `package.json` with test scripts
- TypeScript compiler configuration
- unit tests for the first domain/service layer
- one API integration test against a test database
- one worker lifecycle integration test
- CI command that runs tests non-interactively

## Blockers

- No TypeScript source tree exists in this repository yet
- No runtime, API, or UI is available for verification
- No package manager or test tooling is configured
