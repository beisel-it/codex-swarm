# AGENTS.md

## Purpose

Codex Swarm is a TypeScript monorepo for orchestrating multi-agent software delivery. Use the shared contracts and `.swarm` context files as the source of truth before making workflow changes.

## Working Rules

- Read `.swarm/plan.md` before starting milestone work.
- Update `.swarm/status.md` when milestone status changes in a material way.
- Keep API, worker, frontend, and shared contracts aligned through `packages/contracts`.
- Prefer additive changes to role packs and skills so downstream repos can fork them safely.
- Do not treat roadmap phases as complete until code, verification, and operational docs are all present.

## Repo Areas

- `apps/api`: control-plane API, governance, approvals, cleanup jobs, event and audit routes
- `apps/worker`: session lifecycle, recovery, worktree and cleanup helpers
- `frontend`: board, run detail, review, publish, and PR status surfaces
- `packages/contracts`: shared Zod schemas and API contract types
- `packages/orchestration`: execution planning and orchestration helpers
- `.codex/agents`: starter role pack for agent runs in this repo or derived repos
- `.agents/skills`: reusable workflow skills for planning, DAG generation, milestone validation, PR preparation, and codex-swarm external-operator control
- `templates/repo-profiles`: stack-specific starter profiles for onboarded repos

## Coordination

- Use the `.codex/agents` pack when bootstrapping a new run.
- Use the `.agents/skills` library when the task matches a documented workflow.
- For external Codex operation of this repo, start with `docs/operator-skill-library.md`
  and `.agents/skills/README.md`, then select the codex-swarm-specific skill
  that matches the requested control action.
- Prefer stack templates in `templates/repo-profiles` over ad hoc repo setup.

## Environment

- Use Node.js 22+ and `pnpm` 10.28+.
- Install dependencies from the repository root with `corepack pnpm install`.
- Primary local development commands:
  - `corepack pnpm dev:api`
  - `corepack pnpm dev:worker`
  - `corepack pnpm dev:frontend`
  - `corepack pnpm tui`
- Primary repository gates:
  - `corepack pnpm ci:agent-docs`
  - `corepack pnpm ci:lint`
  - `corepack pnpm ci:typecheck`
  - `corepack pnpm ci:test`
  - `corepack pnpm ci:build`

## Preferred Workflow

- Start from local repo truth, not assumptions.
- Read `.swarm/plan.md` and `.swarm/status.md` before changing workflow or milestone behavior.
- Read `packages/contracts` before changing API, worker, or frontend state handling.
- Prefer package-scoped commands for fast feedback before running full repository gates.
- Treat generated output under `dist/`, `build/`, `coverage/`, and `node_modules/` as non-authoritative unless the task is explicitly about generated artifacts.

## Autonomy Rules

- Optimize for agent autonomy. The default is to solve the problem with the tools, code, tests, skills, and docs already available in the repo.
- Do not add generic "ask the user", "escalate by default", or human-in-the-loop boilerplate to repository guidance. Those patterns reduce the value of autonomous agents here.
- Use available repo tools directly when they can answer the question or validate the change.
- Make reasonable local decisions when the repository structure, contracts, tests, or existing patterns make the direction clear.
- Only stop for outside input when the task genuinely depends on missing external credentials, irreversible third-party actions, or a product decision that cannot be derived from the repo.

## Run & Verify

- Root workflow:
  - `corepack pnpm install`
  - `corepack pnpm ci:agent-docs`
  - `corepack pnpm ci:typecheck`
  - `corepack pnpm ci:test`
- Package-focused loops:
  - `corepack pnpm --dir apps/api test`
  - `corepack pnpm --dir apps/worker test`
  - `corepack pnpm --dir frontend test`
  - `corepack pnpm --dir packages/contracts test`
  - `corepack pnpm --dir packages/orchestration test`
- Frontend local preview:
  - `corepack pnpm --dir frontend dev`
  - `corepack pnpm --dir frontend build`
- API local preview:
  - `corepack pnpm --dir apps/api dev`
  - `corepack pnpm --dir apps/api build`

## Documentation Map

- `LLMS.md`: machine-friendly repository map for models and tools that ingest structured repo context.
- `README.md`: product overview, runtime shape, and operator entrypoints.
- `docs/operator-guide.md`: external operator entrypoint.
- `docs/operator-skill-library.md`: checked-in skill selection guide.
- `docs/architecture/control-plane-api-contract.md`: control-plane contract direction.
- `docs/operations/*`: operational runbooks, deployment, security, and upgrade guidance.
- `docs/qa/*`: test strategy, acceptance, and verification evidence.

## Compatibility Files

- `AGENTS.md` is the canonical repository instruction file.
- `CLAUDE.md`, `AGENT.md`, and `.github/copilot-instructions.md` should remain thin compatibility pointers back to this file rather than diverging copies.
- Package-local `AGENTS.md` files should only add subsystem-specific instructions. They should not restate the full root file.

## Recent Learnings

- 2026-03-31: This repository explicitly optimizes for autonomous coding agents. Guidance should enable tool use and local decision making rather than defaulting to user escalation patterns.
- 2026-03-31: Keep root instructions stable and additive; push subsystem details down into package-local `AGENTS.md` files or focused docs when needed.

## Comments

- Keep this file concise enough to stay high-signal.
- When repo structure or core commands change, update this file and `LLMS.md` together.
