# Codex Swarm LLM Context

See [AGENTS.md](./AGENTS.md) for repository behavior and workflow rules. This file is the machine-friendly map of what matters in the repo.

## Summary

Codex Swarm is a TypeScript monorepo for multi-agent software delivery. It combines a Fastify control-plane API, a worker runtime that supervises Codex-backed sessions in isolated worktrees, a React/Vite frontend for operators, a terminal UI, shared contracts, orchestration helpers, and checked-in agent/skill assets used to operate the product from Codex.

Prioritize shared contracts and `.swarm` context before changing task lifecycle, orchestration, API state, or frontend presentation.

## Key Directories

- `apps/api`: Fastify control-plane API, persistence, governance, approvals, validations, event routes, and ops scripts.
- `apps/worker`: worker runtime, worktree/session lifecycle, recovery helpers, and validation execution.
- `apps/cli`: installable `codex-swarm` CLI entrypoint and single-host helpers.
- `apps/tui`: terminal UI operator surface.
- `frontend`: React/Vite browser console for projects, runs, review, lifecycle, automation, and settings.
- `packages/contracts`: shared Zod schemas and contract types. Read this before changing API or UI state semantics.
- `packages/orchestration`: planning and execution helpers for dependency-safe task graphs.
- `packages/database`: shared database package and schema support.
- `.swarm`: active plan/status context for current milestone work.
- `.agents/skills`: checked-in skill library for operating and extending codex-swarm.
- `.codex/agents`: checked-in agent pack for codex-swarm runs and downstream repos.
- `docs`: product, architecture, ops, QA, and operator workflow documentation.
- `templates/repo-profiles`: starter repo profiles and team templates.

## Entry Points

- `apps/api/src/server.ts`: API server entrypoint.
- `apps/worker/src/index.ts`: worker runtime entrypoint.
- `apps/cli/src/bin/codex-swarm.ts`: CLI binary entrypoint.
- `frontend/src/main.tsx`: browser app entrypoint.
- `packages/contracts/src/index.ts`: shared contract export surface.
- `packages/orchestration/src/index.ts`: orchestration export surface.
- `scripts/ci/run-stage.mjs`: package-stage CI runner.

## Ignore / Deprioritize

- `node_modules/`
- `frontend/node_modules/`
- `dist/`
- `frontend/dist/`
- coverage output and other generated build artifacts
- `.git/`

Generated output is useful for debugging build issues, but it is not the source of truth for behavior or architecture.

## Run & Test

- Install: `corepack pnpm install`
- Root doc validation: `corepack pnpm ci:agent-docs`
- Root gates:
  - `corepack pnpm ci:lint`
  - `corepack pnpm ci:typecheck`
  - `corepack pnpm ci:test`
  - `corepack pnpm ci:build`
- Local dev:
  - `corepack pnpm dev:api`
  - `corepack pnpm dev:worker`
  - `corepack pnpm dev:frontend`
  - `corepack pnpm tui`
- Package-focused loops:
  - `corepack pnpm --dir apps/api test`
  - `corepack pnpm --dir apps/worker test`
  - `corepack pnpm --dir frontend test`
  - `corepack pnpm --dir packages/contracts test`
  - `corepack pnpm --dir packages/orchestration test`

## Reasoning Hints

- Read `.swarm/plan.md` and `.swarm/status.md` before changing milestone-sensitive behavior.
- Read `packages/contracts` before changing task states, API payloads, or frontend state mapping.
- For external operation of the product, start with `docs/operator-guide.md`, `docs/operator-skill-library.md`, and `.agents/skills/README.md`.
- Prefer additive changes to checked-in agent packs, skills, and templates so downstream repos can fork them safely.
- Treat this repo as autonomy-first: use tools, tests, scripts, and checked-in skills to answer questions and validate changes before reaching for outside clarification.

## Variables & Secrets

- Common local env variables include `DATABASE_URL`, `DEV_AUTH_TOKEN`, `GIT_COMMAND`, `GITHUB_CLI_COMMAND`, `ARTIFACT_STORAGE_ROOT`, and `ARTIFACT_BASE_URL`.
- Never store real secret values in this file. Use variable names only.
