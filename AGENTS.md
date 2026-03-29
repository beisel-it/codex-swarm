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
