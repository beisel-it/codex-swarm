# AGENTS.md

See the root [AGENTS.md](../../AGENTS.md) for repository-wide rules. This file only adds API-specific guidance.

## Purpose

`apps/api` owns the Fastify control plane, persistence-facing orchestration state, governance endpoints, approvals, validations, event history, and API-side operational scripts.

## Local Entry Points

- `src/server.ts`: API server entrypoint.
- `src/app.ts`: route/plugin composition.
- `src/control-plane/`: control-plane state transitions and services.
- `src/routes/`: HTTP route handlers.
- `src/db/`: migrations, version checks, and persistence helpers.

## Default Workflow

- Read `packages/contracts` before changing request or response shapes.
- Prefer API tests and package-local typecheck before running full repository gates.
- Preserve auditability: state transition changes should keep event history and failure reasons coherent.
- Use existing route/service patterns instead of introducing one-off endpoint shapes.

## Run & Verify

- `corepack pnpm --dir apps/api dev`
- `corepack pnpm --dir apps/api typecheck`
- `corepack pnpm --dir apps/api test`
- `corepack pnpm --dir apps/api build`

## Local Cautions

- Avoid changing persistence semantics in isolation from contracts, worker behavior, and frontend state mapping.
- Do not bypass explicit control-plane events or durable failure reasons when a state transition can fail.
- `scripts/ops/*` under this package affect operational behavior; keep operator docs aligned when changing them.

## Recent Learnings

- 2026-03-31: API-side task and review state changes should be validated against shared contracts first, not inferred from UI assumptions.

## Comments

- Keep this file focused on `apps/api` specifics.
