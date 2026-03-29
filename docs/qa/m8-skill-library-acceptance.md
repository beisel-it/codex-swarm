# M8 Skill Library Acceptance

Date: 2026-03-29
Owner: qa-engineer
Task: `63c3a79d`

## Roadmap Reference

Source of truth:

- `docs/architecture/m8-delivery-plan.md`

Acceptance target:

- discoverability, coherence, and sufficiency of the shipped external-operator skill library without hidden prompt lore
- the library must be codex-swarm-specific, not a generic ClawTeam skill pack

## Verdict

- parity

## Summary

The repo now ships a codex-swarm-specific external-operator skill library that
is discoverable from checked-in docs, grounded in real codex-swarm control
surfaces, and documented well enough for an external Codex session to operate
the workspace without relying on hidden prompt lore. Generic ClawTeam guidance
is no longer the primary path; the checked-in pack is explicitly scoped to
codex-swarm operator capability.

## Evidence

### 1. Discoverability is now explicit

- `docs/operator-skill-library.md` is now the repo-facing M8 entry doc for an
  external Codex session operating `codex-swarm`.
- `.agents/skills/README.md` provides a checked-in skill index, distinguishes
  external-operator skills from the older workflow-execution skills, and spells
  out what belongs in the codex-swarm skill library.
- `docs/operator-guide.md` now explicitly frames itself as an external Codex
  operator entry point rather than only a human operator runbook.
- `README.md` and `.codex/config.toml` still provide the discovery wiring for
  checked-in agents, skills, and workspace context files.

### 2. Skill coverage matches the required operator workflows

- The checked-in skill set now includes codex-swarm-specific operator skills
  for board triage, inbox inspection, task control, agent coordination,
  diagnostics, and recovery under `.agents/skills/`.
- `docs/operator-skill-library.md` maps those exact skills to the M8 operator
  workflows required by `docs/architecture/m8-delivery-plan.md`.
- `docs/agent-skill-authoring.md` closes the authoring-pack requirement with
  codex-swarm-specific guidance for extending `.codex/agents`,
  `.agents/skills`, and `.codex/config.toml`.

### 3. Individual skill files now meet the M8 shape

- The codex-swarm operator skills consistently include purpose, trigger
  conditions, required inputs, concrete commands, expected outputs, workflow,
  and guardrails.
- The skills are grounded in real codex-swarm commands and product surfaces,
  including `clawteam` board and inbox control, task mutation, workspace
  checkpointing, session save, cost reporting, health and metrics inspection,
  cleanup jobs, worker reconciliation, and restore or DR commands.
- The operator skills also include grounded examples or observed repo context
  rather than abstract generic advice.

### 4. Example workflows are documented and grounded

- `docs/operator-guide.md` now includes four codex-swarm-specific walkthroughs:
  board triage, planning and control, diagnostics and recovery, and execution
  monitoring plus review handoff.
- `docs/operator-skill-library.md` includes grounded repo examples tied to the
  live board, task queue, inbox, and task-detail surfaces.
- The individual operator skills include command-level examples and expected
  outputs, which makes the pack usable without hidden prompt lore.

## Acceptance Evidence

The M8 gate is satisfied by the combined checked-in pack:

- `.codex/config.toml` wires the workspace plan, agents, skills, and profiles
- `.codex/agents/*.toml` provides the checked-in role pack
- `.agents/skills/README.md` indexes both the external-operator and workflow
  execution skills
- `.agents/skills/codex-swarm-*/SKILL.md` provides the codex-swarm-specific
  operator pack
- `docs/operator-skill-library.md` provides the M8 entry point and selection
  guide
- `docs/agent-skill-authoring.md` provides the repeatable authoring and
  extension workflow
- `docs/operator-guide.md` provides grounded operator walkthroughs over real
  product surfaces

## Residual Risks

- Some grounded examples cite the current live board wave and task IDs, so they
  may need refresh as the board evolves.
- The acceptance pass verifies discoverability, coherence, and sufficiency of
  the shipped operator pack; it does not claim every future codex-swarm workflow
  already has a dedicated skill.
