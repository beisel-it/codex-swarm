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
