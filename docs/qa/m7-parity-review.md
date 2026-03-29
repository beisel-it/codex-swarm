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

## Task `42ebb355`

Roadmap entry:

- Phase 3 exit criterion: `Budget caps and concurrency caps are enforced during real runs.`

Verdict:

- gap

Evidence:

- Concurrency enforcement is real: `ControlPlaneService.createRun` persists `concurrencyCap`, sensitive repositories are clamped to `1` through `requiresSensitiveDefaults(...)`, and `ControlPlaneService.createAgent` rejects additional active agents once the run cap is exhausted in `apps/api/src/services/control-plane-service.ts`.
- Executable tests prove that concurrency path by rejecting a second agent with `run concurrency cap of 1 active agents reached` in `apps/api/test/app.test.ts`, and policy tests verify the sensitive-repo override in `apps/api/test/control-plane-service.policy.test.ts`.
- Budget handling is weaker: `createRun` stores `budgetTokens` and `budgetCostUsd`, while observability only aggregates `runsWithBudget` and budget totals for reporting in `apps/api/src/services/control-plane-service.ts` and `apps/api/src/lib/observability.ts`.
- The repo-wide budget references in docs and code describe budgeted posture and reporting, not enforcement. `docs/operations/cost-usage-performance.md` and `docs/user-guide.md` both frame budget data as persisted/reporting metadata rather than an execution stop or admission-control mechanism.
- I found no route, scheduler, worker, or integration test that rejects, pauses, or terminates run activity based on a consumed or projected budget threshold.

Residual risks:

- Reviewers can support concurrency-cap enforcement, but not the stronger combined claim that both budget caps and concurrency caps are enforced during real runs.

Backlog follow-up:

- Add real budget-cap enforcement semantics with acceptance coverage, or intentionally narrow the roadmap exit criterion to the currently implemented concurrency enforcement plus budget reporting model.

## Task `37fc936e`

Roadmap entry:

- Phase 4 deliverable: `Leader on one node, workers on multiple nodes`

Verdict:

- gap

Evidence:

- The distributed control-plane model persists `workerNodeId`, `stickyNodeId`, placement constraints, and dispatch assignments for sessions and workers in `apps/api/src/db/schema.ts` and `apps/api/src/services/control-plane-service.ts`.
- The strongest distributed regression, `preserves distributed run visibility across two-node retry recovery`, proves two worker sessions placed on separate nodes and then recovered onto a surviving node in `apps/api/test/app.test.ts`.
- The worker dispatch runtime and reference deployment docs describe remote worker-node execution, drain handling, and multi-node fleet topology in `apps/worker/src/dispatch.ts` and `docs/reference-deployments.md`.
- I found no live route, service flow, or acceptance test that creates or places a distinct leader session on one node while worker sessions execute on other nodes. A repo-wide search only surfaced planning references and the role-pack prompt in `.codex/agents/leader.toml`, not executable leader-placement behavior.

Residual risks:

- Reviewers can support multi-node worker placement and recovery, but not the narrower roadmap deliverable that explicitly names a leader-on-one-node plus workers-on-multiple-nodes execution shape.

Backlog follow-up:

- Add executable leader-placement behavior and acceptance coverage for a split leader/worker topology, or intentionally supersede the roadmap wording to the currently implemented multi-node worker-dispatch model.

## Task `37d31b0f`

Roadmap entry:

- Phase 4 deliverable: `Shared board and task state across nodes`

Verdict:

- parity

Evidence:

- The frontend board hydrates centrally from `/api/v1/runs`, `/api/v1/worker-nodes`, and per-run detail reads in `loadSwarmData()` rather than from any node-local cache in `frontend/src/App.tsx`.
- `ControlPlaneService.getRunDetail` aggregates persisted run, task, agent, session, approval, validation, artifact, event, and worker-node state from the shared control-plane database in `apps/api/src/services/control-plane-service.ts`.
- The distributed regression `preserves distributed run visibility across two-node retry recovery` proves that shared run detail and worker-node list responses reflect node-a and node-b placement, offline reconciliation, and retry reassignment from the same central API surface in `apps/api/test/app.test.ts`.
- User-facing docs describe the board and run-detail surfaces as the place to inspect task progression and worker placement across the fleet in `docs/user-guide.md`.

Residual risks:

- The shared-state proof is polling-based and API-centric; it does not separately prove websocket-style fanout, which the roadmap entry does not require.

## Task `a1149a84`

Roadmap entry:

- Phase 4 deliverable: `Node-level health and utilization view`

Verdict:

- parity

Evidence:

- The frontend board contains a dedicated `Fleet visibility` panel titled `Node health, utilization, and drain state` and renders one card per worker node in `frontend/src/App.tsx`.
- Each fleet card shows node status, drain state, schedulability, capability labels, and a utilization summary derived from live node metadata: CPU percent, memory percent, queue depth, and assigned session count in `frontend/src/App.tsx`.
- The control-plane API exposes the worker-node contract through `GET /api/v1/worker-nodes`, `PATCH /api/v1/worker-nodes/:id/heartbeat`, and `PATCH /api/v1/worker-nodes/:id/drain` in `apps/api/src/routes/worker-nodes.ts`.
- Integration coverage verifies worker-node registration, fleet listing, heartbeat updates, drain transitions, and schedulability state in `apps/api/test/app.test.ts`.
- The multi-node reference deployment docs explicitly call for the board to show node health, utilization, and drain state and point to shipped screenshot evidence in `docs/reference-deployments.md`.

Residual risks:

- Utilization is based on reported node metadata rather than an independently sampled telemetry pipeline, but that still satisfies the roadmap deliverable for a visible node-level health/utilization view.

## Task `b7b83d64`

Roadmap entry:

- Phase 5 deliverable: `Approval and audit trail export`

Verdict:

- parity

Evidence:

- The API exposes a dedicated run audit-export route at `GET /api/v1/runs/:id/audit-export` in `apps/api/src/routes/runs.ts`.
- `ControlPlaneService.exportRunAudit` assembles repository, run, task, agent, session, worker-node, approval, validation, artifact, event, retention, and provenance data into one export shape in `apps/api/src/services/control-plane-service.ts`.
- Approval provenance is normalized through `buildApprovalAuditEntry(...)`, which includes requested-by actor context, resolver actor context, delegation data, resolved-by-delegate status, payloads, and policy profile in `apps/api/src/services/control-plane-service.ts`.
- Integration coverage verifies the audit-export route and provenance payload shape in `apps/api/test/app.test.ts`, and governance service tests verify persisted approval/event history export behavior in `apps/api/test/control-plane-service.governance.test.ts`.
- The admin UI hydrates the audit export and approval provenance into the browser surface in `frontend/src/App.tsx`, and both `docs/admin-guide.md` and `docs/user-guide.md` document audit/provenance review as a supported workflow.

Residual risks:

- This verdict covers run-scoped audit export and approval provenance. It does not imply organization-wide external archival or compliance-system delivery beyond the exported payload the repo currently defines.

## Task `35e882a9`

Roadmap entry:

- Phase 5 deliverable: `Team and repo policy management`

Verdict:

- parity

Evidence:

- Repository policy profiles are first-class persisted data via `approvalProfile` on repositories in `apps/api/src/db/schema.ts`.
- `ControlPlaneService.createRepository` applies team-policy inheritance and trust-level-sensitive escalation through `resolveRepositoryApprovalProfile(...)`, so repository policy can vary by team default or explicit override without code changes in `apps/api/src/services/control-plane-service.ts`.
- Policy-focused tests verify team-profile inheritance, restricted-repo elevation, and sensitive-default run behavior in `apps/api/test/control-plane-service.policy.test.ts`.
- Governance tests verify that repository policy defaults flow into run behavior and secret-access differentiation for standard versus sensitive repositories in `apps/api/test/control-plane-service.governance.test.ts`.
- The admin frontend exposes active repository profiles and their repo/run counts in the governance panel, while the docs describe policy profile state and sensitive-default review as supported admin workflows in `frontend/src/App.tsx` and `docs/admin-guide.md`.

Residual risks:

- The current repo shows policy management through API-backed inheritance, governance reporting, and admin visibility. It does not yet expose a richer policy-editor workflow beyond the modeled profiles and repository onboarding fields.

## Task `4d3567b8`

Roadmap entry:

- Phase 1 deliverable: `Tasks visible via API`

Verdict:

- parity

Evidence:

- The task API exposes `GET /api/v1/tasks`, `POST /api/v1/tasks`, and `PATCH /api/v1/tasks/:id/status` in `apps/api/src/routes/tasks.ts`.
- `ControlPlaneService.listTasks`, `createTask`, and `updateTaskStatus` persist and return task records with dependency IDs, owner, priority, acceptance criteria, and status in `apps/api/src/services/control-plane-service.ts`.
- The vertical-slice integration test proves task creation, dependency-driven blocked status, status update, and subsequent visibility through run detail in `apps/api/test/app.test.ts`.
- The architecture sequence docs also reflect persisted task DAG creation through the task API in `docs/architecture/system-context-and-sequences.md`.

Residual risks:

- This verdict covers task visibility and mutation through the API surface. It does not by itself prove a full end-to-end coding workflow, which remains tracked separately as a gap.

## Task `518754be`

Roadmap entry:

- Phase 2 exit criterion: `A reviewer can inspect a completed task and approve/reject it in the browser.`

Verdict:

- parity

Evidence:

- The frontend `Review workspace` loads approval detail, requested context, prior resolution data, validation history, and artifacts for the selected run in `frontend/src/App.tsx`.
- Browser actions call the live `PATCH /api/v1/approvals/:id` route through `updateApprovalDecision(...)`, allowing reviewers to approve or reject with structured notes directly from the UI in `frontend/src/App.tsx`.
- The API exposes both approval-detail read and approval-resolution write surfaces in `apps/api/src/routes/approvals.ts`.
- Integration tests verify approval lookup, delegated approval creation, structured reject-with-feedback resolution, and authorization boundaries for approval resolution in `apps/api/test/app.test.ts`.
- The user guide explicitly documents the browser review flow, including inspecting approval context and recording approve/reject decisions from the action row in `docs/user-guide.md`.

Residual risks:

- The review surface is approval-centric rather than a dedicated “completed task” page, but it satisfies the roadmap criterion by letting reviewers inspect task-linked approval context and act in the browser.

## Task `5af474e4`

Roadmap entry:

- Phase 3 quality item: `Cleanup jobs for stale worktrees and sessions`

Verdict:

- gap

Evidence:

- The repo does implement a cleanup route at `POST /api/v1/cleanup-jobs/run` and a control-plane handler `runCleanupJob(...)` in `apps/api/src/routes/cleanup-jobs.ts` and `apps/api/src/services/control-plane-service.ts`.
- That implementation builds a recovery plan from persisted session state plus a caller-supplied `existingWorktreePaths` list and then updates session/agent state to `resume`, `retry`, `mark_stale`, or `archive` in `apps/api/src/services/control-plane-service.ts`.
- Unit coverage verifies those state transitions in `apps/api/test/control-plane-service.cleanup.test.ts`, and route coverage verifies the cleanup-job API surface in `apps/api/test/app.test.ts`.
- The worker recovery logic likewise only classifies sessions based on whether a worktree path appears in the provided snapshot; it does not create, remove, or scrub filesystem worktrees in `apps/worker/src/runtime.ts`.
- I found no implementation under `apps/` or `packages/` that actually deletes stale worktree directories or performs filesystem cleanup. The job handles stale sessions and worktree-missing detection, but not real worktree cleanup.

Residual risks:

- Operators can reconcile stale session state, but stale worktree directories may still accumulate because the repo does not currently provide an actual worktree-deletion path.

Backlog follow-up:

- Add real stale-worktree cleanup behavior with filesystem-level acceptance evidence, or intentionally narrow the roadmap item to session-state reconciliation plus missing-worktree detection.

## Task `7717800b`

Roadmap entry:

- Phase 0 exit criterion: `The architecture no longer depends on filesystem JSON as the source of truth.`

Verdict:

- parity

Evidence:

- The durable control-plane model is defined in Postgres-backed schema and migrations for repositories, runs, tasks, agents, sessions, worker nodes, approvals, validations, artifacts, events, workspaces, and teams in `packages/database/prisma/schema.prisma`, `apps/api/src/db/schema.ts`, and `apps/api/src/db/migrate.ts`.
- The API service reads and writes operational state through that database model in `apps/api/src/services/control-plane-service.ts`; task/session/run behavior is expressed through SQL/Drizzle persistence rather than filesystem JSON files.
- Versioning and compatibility checks also read authoritative metadata from the database, with tests asserting the control-plane compatibility row is loaded from Postgres in `apps/api/test/versioning.test.ts`.
- A repo-wide search shows filesystem JSON usage only for operational snapshot/backup scripts and incidental serialized transport payloads, not as the runtime source of truth for orchestration state.

Residual risks:

- The repo still emits JSON for backup snapshots and some transport payloads, but those are support utilities and wire formats rather than the control plane’s authoritative state store.

## Task `66a28a85`

Roadmap entry:

- Phase 2 deliverable: `Human approve/reject flow`

Verdict:

- parity

Evidence:

- The API exposes approval list, detail, create, and resolve routes in `apps/api/src/routes/approvals.ts`, with explicit authorization on request and resolve actions.
- The frontend `Review workspace` provides an approval list, requested context, resolution notes, and browser buttons for `Approve request` and `Reject with feedback` in `frontend/src/App.tsx`.
- Integration coverage verifies approval creation and structured reject-with-feedback resolution through the live API shape in `apps/api/test/app.test.ts`.
- The user guide documents the browser review console as the supported human approve/reject flow in `docs/user-guide.md`.

Residual risks:

- The delivered flow centers on approval records linked to runs/tasks rather than a broader generalized review workflow, but it satisfies the roadmap’s approve/reject deliverable.

## Task `98288275`

Roadmap entry:

- Phase 2 deliverable: `Restart-safe active runs`

Verdict:

- parity

Evidence:

- The worker runtime implements an explicit restart recovery planner through `buildSessionRecoveryPlan(...)`, classifying persisted sessions into resume, retry, mark-stale, or archive actions based on thread state, heartbeat age, and worktree presence in `apps/worker/src/runtime.ts`.
- Worker runtime tests verify that persisted sessions are mapped into restart actions deterministically, including missing-thread, missing-worktree, heartbeat-timeout, and terminal-session cases in `apps/worker/test/runtime.test.ts`.
- The worker session registry supports hydrating persisted session records, preserving thread bindings, and resuming lookups by `threadId` in `apps/worker/src/session-registry.ts` and `apps/worker/test/session-registry.test.ts`.
- The control plane persists runs, tasks, agents, sessions, and approvals durably in the shared database schema, which is the required foundation for restart-safe active run state in `apps/api/src/db/schema.ts`.

Residual risks:

- This verdict covers the delivered restart-safe model and recovery primitives. The stronger end-to-end proof that a run survives an orchestrator restart without losing task or approval state remains the separate exit criterion tracked in `[077]`.

## Task `9496d26d`

Roadmap entry:

- Phase 2 exit criterion: `A run survives orchestrator restart without losing task or approval state.`

Verdict:

- gap

Evidence:

- The repo does include restart-oriented building blocks: `buildSessionRecoveryPlan(...)` in `apps/worker/src/runtime.ts` and persisted-session hydration in `apps/worker/src/session-registry.ts` with test coverage in `apps/worker/test/runtime.test.ts` and `apps/worker/test/session-registry.test.ts`.
- The API layer persists run, task, agent, session, and approval records in the database-backed schema and control-plane service, which is necessary for restart durability in `apps/api/src/db/schema.ts` and `apps/api/src/services/control-plane-service.ts`.
- However, I found no executable acceptance test or smoke path that simulates an orchestrator restart and then proves the same run still exposes intact task state plus approval state afterward.
- The existing API tests exercise approvals, tasks, and run detail on an in-memory fake control plane, but they do not restart the orchestrator/service process between writes and reads in `apps/api/test/app.test.ts`.
- The QA strategy document names restart recovery as a desired scenario, which underscores that this proof was planned, but it is not yet present as shipped evidence in `docs/qa/test-strategy.md`.

Residual risks:

- Reviewers can support the durability model and recovery helpers, but not the stronger roadmap claim that a real run survives orchestrator restart without losing task or approval state.

Backlog follow-up:

- Add an executable restart-recovery acceptance path that persists a run with tasks and approvals, restarts the control-plane/orchestrator layer, and proves those states remain intact afterward.

## Task `5bc0b2a9`

Roadmap entry:

- Phase 3 quality item: `Retry semantics refinement`

Verdict:

- parity

Evidence:

- Worker dispatch failure handling is bounded and explicit in `apps/api/src/services/control-plane-service.ts`: failed dispatches either move to `retrying` with incremented attempts and cleared placement, or to terminal `failed` once `maxAttempts` is exhausted.
- Worker-node reconciliation applies the same semantics during node loss, producing counted `retriedAssignments` versus `failedAssignments` and marking stranded sessions stale or pending rather than silently drifting in `apps/api/src/services/control-plane-service.ts`.
- The Redis dispatch queue requeues assignments with retry metadata and clears inflight leases in `apps/worker/src/dispatch.ts`, with direct coverage in `apps/worker/test/dispatch.test.ts`.
- The distributed regression `preserves distributed run visibility across two-node retry recovery` proves safe retry behavior across node loss and reassignment in `apps/api/test/app.test.ts`.

Residual risks:

- This verifies retry/refinement behavior at the dispatch and control-plane layers; it does not by itself prove production-scale load behavior, which remains a separate gap under `[093]`.

## Task `8b1babd1`

Roadmap entry:

- Phase 3 deliverable: `Real repo onboarding flow`

Verdict:

- gap

Evidence:

- The current onboarding API is `POST /api/v1/repositories`, which persists repository name, URL, provider, default branch, local path, trust level, and approval profile in `apps/api/src/routes/repositories.ts` and `apps/api/src/services/control-plane-service.ts`.
- The checked-in integration test only verifies that repository creation returns provider onboarding metadata for a GitHub example in `apps/api/test/app.test.ts`.
- I found no implementation that validates provider connectivity, imports repository metadata from GitHub/GitLab, checks access, syncs branches, or performs any broader provider-backed onboarding workflow beyond storing the submitted repository record.
- The user guide describes onboarding in terms of resulting repository state, but it does not provide a stronger executable flow than creating and then selecting a repository record in `docs/user-guide.md`.

Residual risks:

- Reviewers can support repository record creation with provider/trust metadata, but not the stronger roadmap deliverable implied by a real repo onboarding flow.

Backlog follow-up:

- Add a provider-backed onboarding flow with acceptance evidence, or intentionally narrow the roadmap deliverable to the currently implemented repository registration path.

## Task `974b5cb4`

Roadmap entry:

- Phase 3 deliverable: `Budget-aware run controls`

Verdict:

- gap

Evidence:

- Run creation does accept and persist `budgetTokens`, `budgetCostUsd`, `concurrencyCap`, and `policyProfile` on the run model in `apps/api/src/services/control-plane-service.ts` and `apps/api/src/db/schema.ts`.
- Concurrency is enforced during active agent creation, and sensitive policy defaults can clamp concurrency, but that is separate from budget-aware control behavior in `apps/api/src/services/control-plane-service.ts` and `apps/api/test/control-plane-service.policy.test.ts`.
- The remaining budget-related surfaces are reporting-oriented: `docs/operations/cost-usage-performance.md` describes `cost` as budgeted run posture, and `apps/api/src/lib/observability.ts` aggregates budget totals for metrics rather than enforcing runtime controls.
- I found no API route, scheduler path, worker behavior, or UI action that changes run execution based on remaining or exceeded budget. The repo persists budget metadata, but it does not expose supportable budget-aware control logic.

Residual risks:

- Reviewers can support policy-aware concurrency and budget reporting, but not the stronger deliverable claim that runs have real budget-aware controls.

Backlog follow-up:

- Add actual budget-aware run control behavior with acceptance evidence, or intentionally narrow the deliverable to persisted budget metadata plus reporting.

## Task `84255222`

Roadmap entry:

- Phase 4 exit criterion: `A run can place workers on at least 2 nodes and preserve task continuity.`

Verdict:

- parity

Evidence:

- The distributed regression `preserves distributed run visibility across two-node retry recovery` creates a run with two worker sessions initially placed on node-a and node-b in `apps/api/test/app.test.ts`.
- That same test proves continuity after node loss: a claimed dispatch on node-a is reconciled, retried, and reclaimed on node-b while the run detail continues to expose the surviving and reassigned session state in `apps/api/test/app.test.ts`.
- The control-plane dispatch and reconciliation logic updates session placement, assignment retry state, and agent status centrally in `apps/api/src/services/control-plane-service.ts`.

Residual risks:

- The verified flow covers the in-repo two-node continuity path; it does not constitute broader fleet-scale or chaos-style continuity testing beyond the roadmap’s stated acceptance bar.

## Task `57450e9a`

Roadmap entry:

- Phase 5 exit criterion: `An org admin can prove who approved what and when.`

Verdict:

- parity

Evidence:

- Approval audit entries include `approvalId`, requester, requested-by actor, delegation, resolver, resolver actor, resolved-at timestamp, resolved-by-delegate status, and policy profile in `apps/api/src/services/control-plane-service.ts`.
- Governance tests verify that approval provenance captures both who requested and who resolved a governed approval, including delegated approval chains, in `apps/api/test/control-plane-service.governance.test.ts`.
- Audit-export tests verify the same provenance survives into the run audit bundle that an admin can inspect or export in `apps/api/test/control-plane-service.governance.test.ts`.
- The admin guide explicitly instructs admins to use audit export and approval provenance to confirm who approved what and when in `docs/admin-guide.md`.
- The frontend admin surface renders requested actor, resolver actor, policy profile, and resolved-at details in `frontend/src/App.tsx`.

Residual risks:

- The proof surface is run-scoped via governance report and audit export; broader cross-run aggregation would be an enhancement, not a requirement of the roadmap wording.

## Task `81c7c2da`

Roadmap entry:

- Phase 5 exit criterion: `Teams can set different policy profiles without code changes.`

Verdict:

- parity

Evidence:

- Repository policy resolution is data-driven: `resolveRepositoryApprovalProfile(...)` uses explicit repository input or the owning team’s `policyProfile` when creating repositories in `apps/api/src/services/control-plane-service.ts`.
- Policy tests verify that changing the team policy profile changes the inherited repository approval profile without code edits in `apps/api/test/control-plane-service.policy.test.ts`.
- The governance report aggregates active repository profiles and their repository/run counts, giving admins a live readback of policy variation in `apps/api/src/services/control-plane-service.ts` and `apps/api/test/control-plane-service.governance.test.ts`.
- The admin frontend renders those active profiles and counts in the governance panel in `frontend/src/App.tsx`.

Residual risks:

- The repo proves data-driven policy differentiation and inheritance, but not a richer standalone policy-administration editor beyond the current API-backed onboarding and governance surfaces.
