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
- frontend runtime config loading is now hardened for preview deployments: the app consumes `window.__CODEX_SWARM_CONFIG__` on initial load, can refresh from `runtime-config.json` with a `runtime-config.js` fallback, and the runtime-config writer now sources tailnet env defaults so manual preview/build starts no longer silently ship stale API tokens
- project automation webhook setup now uses server-generated immutable endpoint paths, keeps the persisted trigger model generic, and exposes GitHub-specific affordances only as an opt-in UI preset with collapsed optional filter/security sections instead of a flat GitHub-biased form
- the public README screenshot set now uses current staging captures and the shipped route structure, replacing the old mobile-heavy board/run-detail/admin shot list with desktop-only Projects, Project Runs, Project Automation, Ad-Hoc Runs, Run Board, Run Lifecycle, and Settings surfaces

## Current Validation

- workspace `ci:lint`, `ci:typecheck`, `ci:test`, and `ci:build` passed on the current branch during M6 delivery work
- M9 run `ad5cb54c-8e6c-47c7-b386-1fea85c8138d` completed through codex-swarm with 12 persisted artifacts, 2 validations, generated landing-page output, screenshots, and `run-audit-export.json` under `/tmp/codex-swarm-m9/m9-landing-page-001`
- `corepack pnpm --dir packages/contracts typecheck` passed on `main`
- `corepack pnpm --dir apps/api typecheck` passed on `main`
- `corepack pnpm --dir frontend typecheck` passed on `main`
- `corepack pnpm --dir packages/contracts test -- run-handoff.test.ts index.test.ts` passed
- `corepack pnpm --dir apps/api test -- control-plane-service.auto-handoff.test.ts config.test.ts` passed
- `corepack pnpm ci:typecheck`, `corepack pnpm ci:build`, and `corepack pnpm ci:test` passed after the webhook automation re-cut
