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

## Task `efe7e323`

Roadmap entry:

- Phase 5 deliverable: `Multi-user governance model`

Verdict:

- parity

Evidence:

- The control plane defines explicit governance roles and governed actions for run, review, approval, and admin behavior in `packages/contracts/src/index.ts` and `apps/api/src/lib/authorization.ts`.
- Auth context carries actor, workspace, and team identity, and the service layer enforces workspace/team ownership boundaries across repositories, runs, approvals, and admin reporting in `apps/api/src/plugins/auth.ts` and `apps/api/src/services/control-plane-service.ts`.
- Governance admin routes cover report generation, retention reconciliation, secret-integration boundaries, and repository access plans in `apps/api/src/routes/admin.ts`, with run-level audit export exposed in `apps/api/src/routes/runs.ts`.
- Integration coverage verifies cross-team denial, role-gated run and approval actions, governance-report access, retention reconciliation, secret access planning, and audit/admin behavior in `apps/api/test/app.test.ts`, `apps/api/test/control-plane-service.governance.test.ts`, and `apps/api/test/admin-authorization.test.ts`.
- The frontend admin surface renders actor/workspace/team context, governance posture, approval provenance, and audit/secret details in `frontend/src/App.tsx`, and the operator/admin docs describe the same multi-user governance flows in `docs/admin-guide.md` and `docs/user-guide.md`.

Residual risks:

- The repo supports a concrete multi-user governance model at the workspace/team and role boundary level, but it still relies on the current bounded auth implementation rather than production SSO/OIDC federation.

## Task `c2b2c810`

Roadmap entry:

- Phase 0 scope: `Finalize PRD and roadmap`

Verdict:

- parity

Evidence:

- The product requirements are checked in as `PRD.md` with scope, goals, non-goals, architecture intent, and success metrics.
- The delivery sequence is checked in as `ROADMAP.md` with milestone map, phase-by-phase plan, deliverables, exit criteria, and deferred scope.
- The architecture freeze document in `docs/architecture/m0-m1-architecture.md` explicitly translates the PRD and roadmap into the adopted TypeScript-first implementation plan for M0/M1.

Residual risks:

- The documents remain marked `Draft v0.1`, so this verdict covers the presence of a finalized-in-repo planning baseline rather than a formal external signoff workflow.

## Task `4336b2fc`

Roadmap entry:

- Phase 0 deliverable: `docs/architecture/ with system context and sequence diagrams`

Verdict:

- parity

Evidence:

- `ROADMAP.md` explicitly places the system-context and sequence-diagram deliverable under `docs/architecture/`.
- `docs/architecture/system-context-and-sequences.md` is now checked in and contains a mermaid system-context diagram plus two mermaid sequence diagrams covering run creation/task execution and review/approval flow.
- `docs/architecture/m0-m1-architecture.md` now links directly to `system-context-and-sequences.md` as the checked-in diagram home for the roadmap deliverable.
- The new diagrams are implementation-shaped rather than aspirational: they name the live frontend, control-plane API, Postgres, Redis, worker runtime, Codex runtime, Git provider/local repo, and artifact/log surfaces reflected across `frontend/src/App.tsx`, `apps/api/src/app.ts`, and `apps/worker/src/runtime.ts`.

Residual risks:

- The diagrams are high-level architecture artifacts rather than executable acceptance checks, but they satisfy the roadmap’s explicit documentation deliverable and authoritative file location.

## Task `a4a7bd86`

Roadmap entry:

- Phase 2 deliverable: `Browser UI for active runs`

Verdict:

- better

Evidence:

- The live frontend renders an `Active runs` rail with run status, timestamps, branch or PR state, and provider/handoff metadata in `frontend/src/App.tsx`.
- The same board surface includes run overview, fleet visibility, blocked-task counts, placement issues, and hydration state rather than only a minimal active-run list in `frontend/src/App.tsx`.
- User documentation explicitly describes the board as the default landing surface for active work in `docs/user-guide.md`.
- Screenshot evidence is shipped in `docs/assets/screenshots/user-board-overview.png`.
- The existing frontend M7 parity review also validated the richer board surface against the live implementation in `docs/architecture/m7-parity-review-frontend.md`.

Residual risks:

- The board is a tabbed single-page surface rather than a separate route-per-view UI, but that exceeds rather than blocks the roadmap deliverable.

## Task `2d3ee2ab`

Roadmap entry:

- Phase 2 exit criterion: `board latency remains near real time for control-plane events`

Verdict:

- parity

Evidence:

- The live frontend hydrates board data on a fixed `REFRESH_MS = 15_000` cadence and re-fetches swarm state with `window.setInterval(() => { void hydrate() }, REFRESH_MS)` in `frontend/src/App.tsx`.
- The board exposes that live cadence directly in the UI with the `Hydration` signal reading `Polling every 15s` when API-backed data is active in `frontend/src/App.tsx`.
- The API exposes an event-timeline surface at `GET /api/v1/events` in `apps/api/src/routes/events.ts`, and the board/run detail model also carries persisted event history through `ControlPlaneService.getRunDetail` in `apps/api/src/services/control-plane-service.ts`.
- Control-plane mutations record timeline events durably across run, task, approval, validation, worker-node, cleanup-job, and admin routes through `recordTimelineEvent(...)` in `apps/api/src/lib/observability.ts` and the route handlers under `apps/api/src/routes/`.
- Integration coverage proves the event API path by verifying `/api/v1/events` returns observability-backed timeline rows in `apps/api/test/app.test.ts`.

Residual risks:

- The implementation is polling-based rather than push-streamed, so "near real time" is currently bounded by the 15-second refresh interval instead of sub-second event delivery.

## Task `2ed1519c`

Roadmap entry:

- Phase 3 quality item: `Load and soak tests`

Verdict:

- gap

Evidence:

- The only checked-in performance tool is `apps/api/scripts/ops/perf-envelope.mjs`, which performs a bounded concurrent HTTP probe against one endpoint using configurable `PERF_CONCURRENCY` and `PERF_ITERATIONS`.
- The operator documentation in `docs/operations/cost-usage-performance.md` explicitly calls that path an `HTTP concurrency probe` and states that it is `a bounded smoke baseline, not a full load-generation platform`.
- The top-level operator summary in `README.md` also describes `corepack pnpm ops:perf` as `a simple concurrent HTTP latency check`, which is materially weaker than roadmap-promised load and soak tests.
- The final RC note in `docs/qa/m6-rc-signoff.md` repeats that the current performance probe `is a bounded smoke baseline and not a substitute for sustained production load testing`.

Residual risks:

- Operators have a useful latency probe, but the repo does not currently provide supportable sustained-load or soak-test coverage for the control plane or worker flows.

Backlog follow-up:

- Add real load and soak test assets plus runnable acceptance guidance, or explicitly narrow the roadmap wording to the current bounded HTTP concurrency probe.

## Task `e2815a2a`

Roadmap entry:

- Phase 3 deliverable: `Reusable role and skill starter packs`

Verdict:

- parity

Evidence:

- The repo ships a checked-in role pack under `.codex/agents/` with distinct leader, architect, implementer, reviewer, and tester profiles expressed as reusable TOML assets.
- `.codex/config.toml` wires the starter-pack directories for agents, skills, and repo profiles into one reusable workspace configuration surface.
- The reusable workflow skill pack is checked in under `.agents/skills/` with `plan-from-spec`, `create-task-dag`, `validate-milestone`, and `prepare-pr` skills.
- Stack-specific starter defaults are checked in under `templates/repo-profiles/` for Node, Python, JVM, and Go repositories.
- `README.md` documents these assets together under the `Productivity Packs` section as the shipped starter-pack surface.

Residual risks:

- This verdict covers the existence and wiring of reusable starter-pack assets. Separate roadmap item `[102]` remains a gap because the repo does not prove these packs measurably reduce prompt/setup overhead.

## Task `c504255d`

Roadmap entry:

- Phase 3 exit criterion: `A user can start from a GitHub or GitLab repo and end with a PR.`

Verdict:

- gap

Evidence:

- The repository onboarding path accepts provider metadata and persists it through `POST /api/v1/repositories` and `ControlPlaneService.createRepository`, but the checked-in API tests only exercise a GitHub example and not an end-to-end GitHub-or-GitLab workflow in `apps/api/src/routes/repositories.ts`, `apps/api/src/services/control-plane-service.ts`, and `apps/api/test/app.test.ts`.
- Branch publication and PR progression are modeled as two separate follow-up actions, `POST /api/v1/runs/:id/publish-branch` and `POST /api/v1/runs/:id/pull-request-handoff`, in `apps/api/src/routes/runs.ts`.
- `ControlPlaneService.createRunPullRequestHandoff` does not create a provider PR. It persists supplied PR metadata when a URL is already known, or falls back to a `.swarm/handoffs/.../pull-request.json` manual handoff artifact when no URL is provided in `apps/api/src/services/control-plane-service.ts`.
- The integration coverage proves repository onboarding metadata, branch publish, and recording a GitHub PR handoff URL, but it does not prove a real provider-created PR or any GitLab path in `apps/api/test/app.test.ts`.
- The user docs describe reviewing publish and PR handoff state in the UI, which is weaker than the roadmap’s end-to-end acceptance claim in `docs/user-guide.md`.

Residual risks:

- Reviewers can confirm structured provider metadata and PR-state tracking, but not a supportable flow where a user starts from a GitHub or GitLab repository and ends with an actually created pull request.

Backlog follow-up:

- Add a real provider-backed end-to-end acceptance path for GitHub and/or GitLab PR creation, or intentionally narrow the roadmap exit criterion to the current publish-plus-handoff tracking model.
