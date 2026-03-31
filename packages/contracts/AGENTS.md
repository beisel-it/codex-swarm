# AGENTS.md

See the root [AGENTS.md](../../AGENTS.md) for repository-wide rules. This file only adds contract-specific guidance.

## Purpose

`packages/contracts` defines the shared Zod schemas and exported TypeScript contract types used across API, worker, frontend, CLI, and orchestration code.

## Local Entry Points

- `src/index.ts`: shared contract export surface.
- package-local tests: schema and compatibility validation.

## Default Workflow

- Make contract changes first when behavior depends on shared task, run, validation, or handoff semantics.
- Preserve additive compatibility when possible; downstream packages should fail loudly in tests or typecheck if a change is incompatible.
- Keep Zod schema intent and exported TypeScript usage aligned.

## Run & Verify

- `corepack pnpm --dir packages/contracts typecheck`
- `corepack pnpm --dir packages/contracts test`
- `corepack pnpm --dir packages/contracts build`

## Local Cautions

- Do not let API, worker, and frontend drift onto competing interpretations of the same contract field.
- Contract naming and enum/state changes should be reflected across the repo in the same change set.

## Recent Learnings

- 2026-03-31: Shared contracts are the fastest way to anchor repo-wide changes and avoid subsystem drift.

## Comments

- Keep this file focused on `packages/contracts` specifics.
