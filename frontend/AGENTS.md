# AGENTS.md

See the root [AGENTS.md](../AGENTS.md) for repository-wide rules. This file only adds frontend-specific guidance.

## Purpose

`frontend` owns the React/Vite operator console for projects, runs, board, lifecycle, review, automation, and settings.

## Local Entry Points

- `src/main.tsx`: frontend bootstrap.
- `src/App.tsx`: shell and route composition entrypoint.
- `src/task-dag.tsx` and `src/task-dag-model.ts`: board/DAG presentation logic.
- `src/theme.ts` and `src/index.css`: shared visual system and global styling.

## Default Workflow

- Read `packages/contracts` before changing frontend task, review, or run-state handling.
- Prefer deterministic presentation models over duplicated lane or badge heuristics.
- Use real package tests and builds to confirm UI state changes rather than relying on visual inference alone.
- Preserve the repo's deliberate visual direction; do not collapse into generic dashboard styling.

## Run & Verify

- `corepack pnpm --dir frontend dev`
- `corepack pnpm --dir frontend typecheck`
- `corepack pnpm --dir frontend test`
- `corepack pnpm --dir frontend build`

## Local Cautions

- Keep route-driven IA intact unless the task explicitly changes navigation.
- Runtime config behavior matters for previews and deployments; do not hardcode environment assumptions into the UI.
- When board and DAG behavior change together, keep their source-of-truth mapping aligned.

## Recent Learnings

- 2026-03-31: Board and DAG surfaces should share a single state interpretation model whenever possible to avoid contradictory operator signals.

## Comments

- Keep this file focused on `frontend` specifics.
