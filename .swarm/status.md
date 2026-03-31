# Codex Swarm Status

## Completed

- M0/M1 foundation: monorepo, API, worker spike, frontend shell, CI baseline
- M2: approvals, review flows, validation history, observability, recovery spike
- M3: repo onboarding, PR reflection, governance-lite controls, quality hardening, and reusable role/template packs
- M7: roadmap parity review, documented gap conversion, shipped follow-up fixes, and wording cleanup for overstated support claims
- M8: codex-swarm-specific external operator skill pack, walkthroughs, diagnostics/recovery skills, and authoring guidance
- M9: isolated codex-swarm end-to-end landing-page scenario completed with persisted run evidence, screenshots, validations, and audit export

## Active

- post-M10 backlog work is now focused on a codex-swarm terminal UI with clawteam-style board polish and codex-swarm-specific operator depth
- the real M9 run found and fixed product issues in artifact metadata persistence and audit-export compatibility on commit `cb51312`
- external-trigger backend work now persists repeatable run definitions/triggers/event receipts, exposes public webhook ingress, and stores normalized webhook context on created runs for downstream orchestration
- worker and orchestration prompts now forward persisted run context, including external trigger metadata and original/normalized event payloads, into leader and worker execution without webhook-specific branching in the core loop
- operator runbooks and QA coverage now document how to configure webhook-triggered repeatable runs, inspect stored event context, and debug receipt-to-run linkage while keeping service-specific integrations explicitly out of scope
- runs and repeatable runs now carry explicit handoff configuration plus handoff execution state, allowing opt-in automatic branch publish and GitHub PR creation after task completion without conflating implementation success with handoff success
- the API now performs automatic handoff reconciliation through a provider adapter, records `run.auto_handoff_*` control-plane events, and persists separate failure reasons when branch publish or PR creation fails
- the frontend run editor and repeatable run configuration surfaces now expose auto-handoff settings, and run detail messaging now distinguishes manual state, in-progress auto handoff, and failed auto handoff
- the frontend shell has been recut around route-driven `Projects`, `Ad-Hoc Runs`, and `Settings` globals, with `Overview`, `Board`, `Lifecycle`, and `Review` moved into compact run-context workspaces and list/table-first layouts replacing the prior card-wall navigation mix
- the Projects workspace now reads project inventory from the API as the source of truth, removes the old seed/local fallback that could invent phantom projects, and persists repository-to-project assignment when creating a project from the UI
- project-owned agent teams are now first-class resources: projects can import team blueprints or author teams manually, project runs and repeatable runs bind to a concrete project team instead of a run-level team selector, and worker/leader execution now uses persisted team member names, roles, and profiles when provisioning agents
- local project-team execution now falls back to the runtime Codex profile defaults instead of trying to execute non-existent per-role CLI profiles, and leader planning normalizes cyclic/forward task dependencies instead of failing run start on an invalid DAG
- frontend runtime config loading is now hardened for preview deployments: the app consumes `window.__CODEX_SWARM_CONFIG__` on initial load, can refresh from `runtime-config.json` with a `runtime-config.js` fallback, and the runtime-config writer now sources tailnet env defaults so manual preview/build starts no longer silently ship stale API tokens
- project automation webhook setup now uses server-generated immutable endpoint paths, keeps the persisted trigger model generic, and exposes GitHub-specific affordances only as an opt-in UI shape with collapsed optional filter/security sections instead of a flat GitHub-biased form
- the public README screenshot set now uses current staging captures and the shipped route structure, replacing the old mobile-heavy board/run-detail/admin shot list with desktop-only Projects, Project Runs, Project Automation, Ad-Hoc Runs, Run Board, Run Lifecycle, and Settings surfaces
- GitHub Actions CI now checks out the repository before invoking the local `setup-workspace` composite action, aligning the pipeline with how local actions are resolved on runners instead of failing before any real gate executes
- the checked-in Codex Swarm skill library has been hard-recut around real product subsystems (`run operations`, `project automation`, `review/governance`, `worker lifecycle`, `observability/diagnostics`, `recovery/restore`) and no longer describes the repo as a Clawteam-style board/inbox control pack
- leader/task orchestration now rejects cyclic leader DAGs instead of silently serializing them, and actionable blocked worker outcomes can generate unblock child tasks that are wired back into the blocked parent so the graph can widen and reopen automatically once the unblock work completes
- planning, persisted task contracts, plan artifacts, and worker-facing task prompts now carry `definitionOfDone`, while `acceptanceCriteria` remains a compatibility-facing summary for legacy tasks and operator surfaces
- worker dispatch completion is now review-gated for DoD-backed tasks: worker `completed` outcomes move tasks into `awaiting_review`, automatically queue a distinct verifier assignment, and only verifier `passed` outcomes can finally unblock downstream task completion
- the frontend run board, lifecycle, and review surfaces now render definition of done, verification chips, verifier metadata, latest verification summaries, and open change requests, with legacy-task fallback copy when verification metadata is absent
- operator, user, API-contract, and upgrade-path docs now explain DoD-backed verification semantics, reviewer fallback rules, legacy-task rollout behavior, and the UI/API fields operators use to inspect verification state

## Current Validation

- workspace `ci:lint`, `ci:typecheck`, `ci:test`, and `ci:build` passed on the current branch during M6 delivery work
- M9 run `ad5cb54c-8e6c-47c7-b386-1fea85c8138d` completed through codex-swarm with 12 persisted artifacts, 2 validations, generated landing-page output, screenshots, and `run-audit-export.json` under `/tmp/codex-swarm-m9/m9-landing-page-001`
- `corepack pnpm --dir packages/contracts typecheck` passed on `main`
- `corepack pnpm --dir apps/api typecheck` passed on `main`
- `corepack pnpm --dir frontend typecheck` passed on `main`
- `corepack pnpm --dir packages/contracts test -- run-handoff.test.ts index.test.ts` passed
- `corepack pnpm --dir apps/api test -- control-plane-service.auto-handoff.test.ts config.test.ts` passed
- `corepack pnpm ci:typecheck`, `corepack pnpm ci:build`, and `corepack pnpm ci:test` passed after the webhook automation re-cut
- `corepack pnpm ci:lint`, `corepack pnpm ci:typecheck`, `corepack pnpm ci:test`, and `corepack pnpm ci:build` passed after the CI workflow checkout-order fix
- `corepack pnpm --dir packages/orchestration test -- --runInBand`, `corepack pnpm --dir apps/api test -- app.test.ts`, `corepack pnpm ci:typecheck`, `corepack pnpm ci:lint`, `corepack pnpm ci:test`, and `corepack pnpm ci:build` passed after the DAG-width and actionable-blocker follow-up fix
- `corepack pnpm --dir packages/orchestration test -- --runInBand`, `corepack pnpm --dir packages/contracts test -- index.test.ts`, `corepack pnpm --dir apps/worker test -- runtime.test.ts`, `corepack pnpm --dir apps/api test -- app.test.ts`, and `corepack pnpm ci:typecheck` passed after adding `definitionOfDone` to leader planning, persisted tasks, plan artifacts, and worker task prompts
- `corepack pnpm --dir packages/contracts typecheck`, `corepack pnpm --dir packages/orchestration typecheck`, `corepack pnpm --dir apps/api typecheck`, `corepack pnpm --dir packages/contracts test -- index.test.ts`, `corepack pnpm --dir packages/orchestration test -- --runInBand`, and `corepack pnpm --dir apps/api test -- control-plane-service.verification.test.ts` passed after adding verifier pairing, review-gated completion, and verification metadata
- `corepack pnpm --dir frontend typecheck` and `corepack pnpm --dir frontend build` passed after adding verification-aware task cards, task detail panels, lifecycle rows, and the review verification queue
- `corepack pnpm --dir packages/contracts exec vitest run test/index.test.ts` and `corepack pnpm --dir apps/api exec vitest run test/control-plane-service.verification.test.ts test/worker-dispatch-orchestration.verification.test.ts` passed after adding legacy/new-task contract coverage, verifier fallback and run-gating checks, and verifier prompt evidence propagation coverage
