# M7 Parity Review Log

Date: 2026-03-29
Owner: qa-engineer

## Task `261e7d00`

Roadmap entry:

- Phase 1 deliverable: `Create run from repo + goal/spec`

Verdict:

- parity

Evidence:

- `POST /api/v1/runs` accepts `repositoryId`, `goal`, and optional run-spec fields through the live route in `apps/api/src/routes/runs.ts`.
- `ControlPlaneService.createRun` persists repository-backed run state, goal, branch, plan artifact path, budgets, policy profile, and metadata in `apps/api/src/services/control-plane-service.ts`.
- The request contract is defined in `packages/contracts/src/index.ts` and re-exported through `apps/api/src/http/schemas.ts`.
- Integration coverage verifies successful run creation from a repository-backed payload in `apps/api/test/app.test.ts`.
- User-facing flow documentation describes starting from a repository and then creating and monitoring a run in `docs/user-guide.md`.

Residual risks:

- This verifies the control-plane/API contract for repository-backed run creation. It does not by itself prove end-to-end leader execution or plan generation; those are covered by separate roadmap entries.

## Task `1e87453d`

Roadmap entry:

- Phase 1 deliverable: `Leader can produce a plan and save .swarm/plan.md`

Verdict:

- gap

Evidence:

- The repo exposes `planArtifactPath` fields in contracts and persistence (`packages/contracts/src/index.ts`, `packages/database/prisma/schema.prisma`, `apps/api/src/db/schema.ts`, `apps/api/src/services/control-plane-service.ts`) but no implementation that generates or writes `.swarm/plan.md`.
- Worker runtime code only exposes an `includePlanTool` flag and request builders for Codex session start/reply in `apps/worker/src/runtime.ts` and `apps/worker/src/index.ts`.
- Existing tests cover run creation, worker-session request construction, and plan-tool flags, but do not assert plan creation or `.swarm/plan.md` persistence (`apps/api/test/app.test.ts`, `apps/worker/test/runtime.test.ts`).
- The M7 parity plan requires support from live implementation evidence, and no route, script, or documented acceptance check in the repo currently proves the roadmap claim.

Residual risks:

- A reviewer cannot currently verify the promised leader-plan artifact flow from repository state alone.

Backlog follow-up:

- Add a tracked implementation slice for leader plan generation and `.swarm/plan.md` persistence, with an acceptance test or runnable smoke path proving the artifact is created and persisted.

## Task `23364aee`

Roadmap entry:

- Phase 1 deliverable: `Up to 3 concurrent workers on one host`

Verdict:

- better

Evidence:

- Run creation accepts a configurable positive `concurrencyCap` instead of a fixed ceiling of three in `packages/contracts/src/index.ts`.
- `ControlPlaneService.createRun` persists the requested cap, and `ControlPlaneService.createAgent` blocks additional active agents once the run-level cap is reached in `apps/api/src/services/control-plane-service.ts`.
- Integration coverage proves the enforcement path by rejecting a second active agent once the configured cap is exhausted in `apps/api/test/app.test.ts`.
- Local sessions do not require a remote worker-node binding, so the concurrency gate applies to single-host execution as well as later distributed placement in `packages/contracts/src/index.ts` and `apps/api/src/services/control-plane-service.ts`.

Residual risks:

- The repo does not include an explicit smoke or integration test that exercises exactly three host-local workers in one run; the verdict relies on the stronger generic cap implementation rather than a hard-coded `3` acceptance test.

## Task `f8000545`

Roadmap entry:

- Phase 1 exit criterion: `each worker session is resumable through persisted threadId`

Verdict:

- parity

Evidence:

- Session persistence requires a non-null `threadId` in the durable schema in `packages/database/prisma/schema.prisma`.
- The control plane persists session `threadId` values when agents are created with session metadata in `apps/api/src/services/control-plane-service.ts`.
- Session-registry behavior explicitly hydrates persisted sessions, enforces stable thread binding, and supports lookup by `threadId` in `apps/worker/src/session-registry.ts` and `apps/worker/test/session-registry.test.ts`.
- Recovery planning prefers `resume` for active sessions that still have persisted `threadId` values in `apps/worker/src/runtime.ts` and `apps/worker/test/runtime.test.ts`.
- The API vertical-slice test returns the persisted session and `threadId` as part of the run detail payload in `apps/api/test/app.test.ts`.

Residual risks:

- This verifies persistence and restart/recovery decision logic around `threadId`; it does not prove an actual external Codex backend resumed a live conversation during the test run.

## Task `ebeb116b`

Roadmap entry:

- Phase 1 deliverable: `Minimal CLI or admin script for smoke testing`

Verdict:

- gap

Evidence:

- The repo does contain operational scripts under `apps/api/scripts/ops/`, but they target backup, restore, DR, performance, and snapshot workflows rather than a Phase 1 orchestration smoke path.
- The root package scripts expose CI and operational commands in `package.json`, but no dedicated smoke command that creates a run, spawns workers, or exercises the single-host orchestration slice.
- The architecture freeze note in `docs/architecture/m0-m1-architecture.md` explicitly called for at least one runnable smoke test command, but the live repo evidence points only to generic CI and later ops scripts.

Residual risks:

- Reviewers and operators do not have a simple runnable command that proves the Phase 1 orchestration slice is healthy without stitching together API calls manually.

Backlog follow-up:

- Add a checked-in smoke command or admin script that exercises the supported single-host orchestration path and records success/failure clearly.

## Task `ed4377c2`

Roadmap entry:

- Phase 1 exit criterion: `one run can complete at least one multi-task coding workflow end-to-end`

Verdict:

- gap

Evidence:

- The strongest live acceptance check is the control-plane vertical-slice integration in `apps/api/test/app.test.ts`, which creates a run, tasks, an agent, and a session, but stops short of proving a completed coding workflow.
- The repo does not contain an end-to-end test or smoke command that shows leader planning, worker execution, validation, artifact generation, and task completion through a full coding flow.
- The worker package exposes command builders, dispatch primitives, and recovery logic, but not a verified coding workflow runner in `apps/worker/src/runtime.ts`, `apps/worker/src/index.ts`, and `apps/worker/test/dispatch.test.ts`.

Residual risks:

- The project has durable orchestration primitives, but there is still no supportable evidence that a single run completes a real multi-task coding workflow from start to finish.

Backlog follow-up:

- Add an executable end-to-end acceptance path for one multi-task coding run, with durable artifacts or validation outputs proving completion.

## Task `2b929600`

Roadmap entry:

- Phase 1 exit criterion: `each worker executes in an isolated worktree`

Verdict:

- gap

Evidence:

- Worker runtime code currently covers worktree path generation and recovery decisions in `apps/worker/src/runtime.ts`, but not actual worktree creation, attachment, or execution inside a checked-out worktree.
- Session and dispatch payloads carry `worktreePath` fields through contracts and tests (`packages/contracts/src/index.ts`, `apps/worker/test/runtime.test.ts`, `apps/worker/test/dispatch.test.ts`), but the repo does not implement `git worktree` or equivalent checkout/mount behavior.
- A repo-wide search under `apps/` and `packages/` shows no worktree provisioning command path beyond unrelated migration spawning in `apps/api/scripts/ops/control-plane-snapshot.mjs`.

Residual risks:

- The system tracks where a worker should run, but it does not yet provide supportable evidence that workers actually execute inside isolated worktrees.

Backlog follow-up:

- Add a real worktree provisioner and an acceptance test or smoke path that proves workers execute in separate checked-out worktrees.
