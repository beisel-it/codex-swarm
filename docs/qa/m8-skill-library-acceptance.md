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

- gap

## Summary

The current repo still ships the older internal productivity pack rather than
the codex-swarm-specific external-operator library described in the delivery
plan. The checked-in assets are not yet sufficient for an external Codex
operator to discover, understand, and run real Codex Swarm operational
workflows from docs and skills alone. Generic ClawTeam guidance would not be a
passing substitute for this gate.

## Evidence

### 1. Discoverability is incomplete

- `README.md` mentions `.agents/skills` and `.codex/agents`, but it does not
  provide an M8 entry doc or operator-facing walkthrough that explains how an
  external Codex session should use the skill pack against this workspace.
- `docs/architecture/m8-delivery-plan.md` requires `Repo-facing entry docs that
  explain how external Codex should use the skill pack against this workspace`,
  but the repo does not currently include such an operator guide.
- The only docs file found for M8 is the delivery plan itself:
  `docs/architecture/m8-delivery-plan.md`.

### 2. Skill coverage does not match the required operator workflows

- The current checked-in skill set under `.agents/skills/` contains only:
  `plan-from-spec`, `create-task-dag`, `validate-milestone`, and `prepare-pr`.
- `docs/architecture/m8-delivery-plan.md` requires explicit codex-swarm
  operator skills for:
  board triage, task DAG creation and maintenance, agent coordination and loop
  management, run diagnostics and recovery investigation, and skill/agent
  extension workflows.
- A repo-wide search across `.agents`, `.codex`, `README.md`, and `docs/`
  found no checked-in codex-swarm operator skills that walk an external Codex
  session through board triage, inbox inspection, task updates, loop
  management, recovery commands, or agent/skill authoring for this repo.

### 3. Individual skill files are under-specified for M8

- The current skill files provide `Purpose`, `Inputs`, `Outputs`, and a generic
  `Workflow`, but they do not consistently include the M8-required fields:
  trigger conditions, concrete commands or workflow steps, and expected outputs
  tied to real codex-swarm operator actions.
- None of the current skill files include concrete codex-swarm operator command
  sequences for board or inbox inspection, task creation or reassignment,
  recovery diagnostics, or loop management.

### 4. Example workflows are missing

- `docs/architecture/m8-delivery-plan.md` requires documented and exercised
  example workflows for a codex-swarm triage pass, task-board planning pass,
  execution monitoring pass, and recovery or diagnostic pass.
- A docs-wide search found no checked-in example workflow docs for those flows.
- Because the examples are missing, QA cannot verify the no-hidden-lore
  requirement from repo evidence alone.

## What Is Already Present

These existing assets are useful inputs, but they do not satisfy the M8 gate on
their own:

- `.codex/config.toml` wires the workspace plan, agents, skills, and profiles
- `.codex/agents/*.toml` provides starter role prompts
- `.agents/skills/*/SKILL.md` provides the earlier four reusable workflow
  skills
- `docs/qa/diff-review-acceptance.md` and the broader docs set show that the
  repo has rich operator workflows, but they are not yet translated into an
  external-operator Codex skill library

## Blocking Gaps

M8 should remain open until the repo includes all of the following:

1. A repo-facing operator entry doc for external Codex usage.
2. Explicit codex-swarm skills for board triage, inbox handling, task control,
   run diagnostics, recovery investigation, and skill/agent authoring.
3. Skill files with trigger conditions, required inputs, concrete command
   sequences, and expected outputs.
4. At least three documented example workflows grounded in real `clawteam` and
   repo operations.
5. Enough checked-in evidence that QA can follow the pack without hidden prompt
   lore.

## Recommended Follow-Up

- Add the missing operator-facing entry documentation.
- Expand the skill library from the older productivity pack into the full M8
  external-operator set.
- Add workflow examples that explicitly exercise codex-swarm board, inbox,
  planning, monitoring, and recovery loops rather than generic team
  coordination examples.
- Re-run QA acceptance after those docs and skills land.
