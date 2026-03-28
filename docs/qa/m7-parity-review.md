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

## Task `06429514`

Roadmap entry:

- Phase 2 deliverable: `Validation history`

Verdict:

- parity

Evidence:

- The API exposes validation-history reads and writes via `GET /api/v1/validations` and `POST /api/v1/validations` in `apps/api/src/routes/validations.ts`.
- Integration coverage verifies that validation-history entries can be listed with artifact-backed report metadata and created with explicit artifact references in `apps/api/test/app.test.ts`.
- The frontend loads validation data from `/api/v1/validations?runId=...` and renders a dedicated `Validation history` panel in `frontend/src/App.tsx`.
- User-facing docs describe recent validations in the review flow, and the shipped screenshot set includes the review console surface in `docs/user-guide.md` and `docs/assets/screenshots/user-review-console.png`.

Residual risks:

- The frontend panel currently shows command and summary details but not the full linked artifact metadata inline; that deeper evidence remains available through the API and review surfaces.

## Task `f3d00aca`

Roadmap entry:

- Phase 3 deliverable: `One-click PR handoff`

Verdict:

- gap

Evidence:

- The live API exposes two separate actions, `POST /api/v1/runs/:id/publish-branch` and `POST /api/v1/runs/:id/pull-request-handoff`, in `apps/api/src/routes/runs.ts`.
- `ControlPlaneService.createRunPullRequestHandoff` records PR metadata and publishes an artifact, but it does not itself create a provider pull request; the current implementation persists a supplied URL/number or falls back to a manual handoff artifact in `apps/api/src/services/control-plane-service.ts`.
- Integration coverage verifies branch publish and recording a PR handoff for an already published run in `apps/api/test/app.test.ts`, which is weaker than a one-click end-to-end provider handoff.
- The frontend reflects PR state and provider links in run detail surfaces in `frontend/src/App.tsx`, but it does not establish a single action that takes a run from ready state to provider PR creation from the browser.

Residual risks:

- The platform has structured branch publish and PR-state tracking, but reviewers cannot support the stronger roadmap claim that a user has a one-click PR handoff path.

Backlog follow-up:

- Add a real single-action PR handoff flow that either invokes provider PR creation directly or clearly supersedes the roadmap claim with a documented replacement interaction and acceptance evidence.

## Task `ee969b7a`

Roadmap entry:

- Phase 3 exit criterion: `curated skills and roles reduce prompt/setup overhead`

Verdict:

- gap

Evidence:

- The repo does include curated role-pack and skill assets in `.codex/agents/*.toml`, `.agents/skills/*/SKILL.md`, `templates/repo-profiles/*.md`, and `.codex/config.toml`.
- The README documents those starter assets and the M3 plan states the intended outcome, but there is no acceptance check, benchmark, usage study, or documented replacement criterion proving that prompt/setup overhead was actually reduced in practice.
- The strongest live evidence is asset existence and packaging, which supports roadmap items about starter-pack presence but not the stronger exit criterion about measurable overhead reduction.

Residual risks:

- Reviewers can confirm the packs exist, but not that they improve team setup time or reduce prompt burden in a supportable way.

Backlog follow-up:

- Add a concrete acceptance measure or documented superseding criterion for role/skill productivity gains, such as a repeatable setup comparison, onboarding runbook evidence, or another explicit outcome tied to the shipped assets.

## Task `27a74967`

Roadmap entry:

- Phase 4 exit criterion: `session ownership remains sticky and explicit`

Verdict:

- parity

Evidence:

- Distributed session state stores both current node ownership and explicit sticky placement through `workerNodeId` and `stickyNodeId` in the control-plane schema and service layer in `apps/api/src/db/schema.ts` and `apps/api/src/services/control-plane-service.ts`.
- Dispatch claiming preserves or assigns sticky ownership explicitly during distributed scheduling in `apps/api/src/services/control-plane-service.ts`.
- The M4 regression test proves run-detail payloads expose sticky and current node ownership across placement and recovery in `apps/api/test/app.test.ts`.
- The frontend placement surface renders thread, current node, sticky node, constraint labels, and stale markers from live run/session data in `frontend/src/App.tsx`.
- The M4 delivery plan names explicit sticky ownership as part of the exit criteria and runtime model in `docs/architecture/m4-delivery-plan.md`.

Residual risks:

- Sticky ownership is explicit and visible, but node-loss recovery may intentionally clear or reassign stickiness when failure handling requires it; that behavior is covered by the separate safe-retry criterion.

## Task `0ff46f44`

Roadmap entry:

- Phase 4 exit criterion: `lost worker node causes bounded task failure and safe retry`

Verdict:

- parity

Evidence:

- Worker-node reconciliation marks the failed node offline, transitions claimed assignments into `retrying` or `failed`, and updates stranded sessions into bounded stale/pending states in `apps/api/src/services/control-plane-service.ts`.
- Assignment failure handling clears placement and requeues work only up to the configured retry limit, preventing silent drift in `apps/api/src/services/control-plane-service.ts`.
- The M4 regression test `preserves distributed run visibility across two-node retry recovery` proves node-loss reconciliation, bounded retry, and safe reclamation onto a surviving node in `apps/api/test/app.test.ts`.
- The distributed UI surfaces explain placement degradation and retry/reassignment context in `frontend/src/App.tsx`.
- The M4 delivery plan explicitly defines bounded failure and safe retry as the milestone acceptance rule in `docs/architecture/m4-delivery-plan.md`.

Residual risks:

- The verified flow covers the in-repo two-node recovery path; it does not constitute broader chaos testing across larger fleets or external infrastructure failures.
