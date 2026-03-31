# Codex Swarm Skill Library

This directory contains the checked-in skill library for operating, extending,
and validating the real Codex Swarm product.

The library is grounded in shipped Codex Swarm surfaces:

- frontend routes and workspaces
- HTTP control-plane routes under `/api/v1`
- checked-in operational commands such as `corepack pnpm ops:*`
- repo docs under `docs/`, `.swarm/`, and `packages/contracts`

It is not a generic agent-coordination pack and it is not a wrapper around
another product's control model.

## Skill groups

### Codex Swarm product-operation skills

- `codex-swarm-run-operations`
- `codex-swarm-project-automation`
- `codex-swarm-review-governance`
- `codex-swarm-worker-lifecycle`
- `codex-swarm-observability-diagnostics`
- `codex-swarm-recovery-restore`

Use these when the work is about the inner mechanics of Codex Swarm itself:
runs, automation, review, governance, worker placement, diagnostics, and
recovery.

### Workflow execution skills

- `plan-from-spec`
- `create-task-dag`
- `validate-milestone`
- `prepare-pr`

Use these when the work is about shaping, validating, and handing off delivery
inside this repo or a repo managed by Codex Swarm.

## Role and team templates

### Individual agent roles

- `.codex/agents/leader.toml`
- `.codex/agents/architect.toml`
- `.codex/agents/art-director.toml`
- `.codex/agents/designer.toml`
- `.codex/agents/design-researcher.toml`
- `.codex/agents/design-engineer.toml`
- `.codex/agents/frontend-developer.toml`
- `.codex/agents/backend-developer.toml`
- `.codex/agents/infrastructure-engineer.toml`
- `.codex/agents/reviewer.toml`
- `.codex/agents/tester.toml`
- `.codex/agents/technical-writer.toml`
- `.codex/agents/visual-reviewer.toml`

### Launchable team templates

- `templates/agent-teams/development-stack.md`
- `templates/agent-teams/platform-ops-stack.md`
- `templates/agent-teams/web-design-studio.md`

## How to add a new Codex Swarm skill

1. Create `.agents/skills/<skill-name>/SKILL.md`.
2. Use this structure:
   - Purpose
   - Trigger Conditions
   - Required Inputs
   - Primary Codex Swarm Surfaces
   - Concrete Commands and Routes
   - Expected Outputs
   - Workflow
   - Guardrails
3. Ground the skill in actual Codex Swarm surfaces only:
   - shipped frontend routes
   - real `/api/v1` routes
   - checked-in ops commands
   - repo docs and verification records
4. Update:
   - `docs/operator-skill-library.md`
   - `docs/operator-skill-workflows.md`
   - `docs/agent-skill-authoring.md`
     when the new skill changes the curated library.

## What does not belong here

Do not add a skill if it is only:

- generic coding advice with no Codex Swarm workflow tie-in
- generic task-board or inbox guidance from another product
- dynamic “current board wave” lore tied to temporary task IDs
- references to surfaces or product names that Codex Swarm does not actually
  ship
