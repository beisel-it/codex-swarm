# Agent And Skill Authoring Guide

This guide is the M8 codex-swarm-specific authoring pack for extending:

- `.codex/agents/*.toml`
- `.agents/skills/*/SKILL.md`
- `.codex/config.toml`

Use it when you want to teach external Codex sessions how to operate
`codex-swarm` more effectively.

## What belongs in an agent

Add a new agent when the work needs a stable behavioral identity with distinct:

- scope
- role boundaries
- review bar
- interaction style

Examples:

- a release operator agent
- a codex-swarm diagnostician
- a docs-focused operator

Do not add a new agent if the difference is only one extra command or a tiny
workflow variation. That belongs in a skill.

## What belongs in a skill

Add a new skill when you need a repeatable codex-swarm workflow with:

- clear triggers
- fixed input expectations
- repeatable commands
- predictable outputs

Examples:

- triaging the board
- rewiring blocked tasks
- diagnosing worker-node recovery issues
- preparing a release or handoff review

## Agent extension workflow

1. Choose the closest existing agent under `.codex/agents/`.
2. Copy only the minimum behavior needed for the new role.
3. Keep the role codex-swarm-specific.
4. Wire the new role into `.codex/config.toml` only if it should be generally
   discoverable in the workspace.
5. Update [AGENTS.md](../AGENTS.md) if the new agent changes repo guidance.
6. Add an example use case to
   [docs/operator-guide.md](./operator-guide.md) or
   [docs/operator-skill-workflows.md](./operator-skill-workflows.md) if the
   role is part of the external operator pack.

### Example: add a Release Operator agent

Goal:
an agent focused on release readiness, changelog review, deployment gating, and
post-release verification.

Shape:

- start from `.codex/agents/reviewer.toml`
- tighten scope to release notes, rollout checks, and operator docs
- point the role toward release-related skills and docs

Expected output:

- a new `.codex/agents/release-operator.toml`
- updated docs if the role is intended for general use

## Skill extension workflow

1. Choose the closest skill under `.agents/skills/`.
2. If none exists, create `.agents/skills/<new-skill>/SKILL.md`.
3. Write the skill around real codex-swarm surfaces:
   - `clawteam ...`
   - `corepack pnpm ...`
   - repo docs and architecture files
   - API routes or operational docs where relevant
4. Include:
   - purpose
   - when to use it
   - required context
   - commands and checks
   - expected deliverables
5. Update [docs/operator-skill-library.md](./operator-skill-library.md) and
   [docs/operator-skill-workflows.md](./operator-skill-workflows.md) if the new
   skill is part of the external operator pack.

### Example: add a Release Triage skill

Goal:
teach Codex how to inspect release readiness for codex-swarm.

Expected contents:

- inspect open board items affecting release
- inspect CI/build/test state
- inspect docs/release-note completeness
- produce a go/no-go checklist

Expected output:

- `.agents/skills/codex-swarm-release-triage/SKILL.md`
- operator-guide or workflow-doc update if the skill is part of the external
  operator set

## Wiring rules

- `.codex/config.toml` remains the workspace discovery point for agents, skills,
  and repo profiles.
- Additive changes are preferred so downstream repos can fork safely.
- If a new skill changes the external operator pack, update the operator docs in
  the same commit.
- If a new agent or skill introduces a new acceptance expectation, tell QA so it
  can be reflected in the M8 acceptance package.
