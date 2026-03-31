# Agent And Skill Authoring Guide

Use this guide when extending:

- `.codex/agents/*.toml`
- `.agents/skills/*/SKILL.md`
- `.codex/config.toml`

The goal is to teach Codex how to operate and evolve the actual Codex Swarm
product, not to import workflows from another tool.

## What belongs in an agent

Add an agent when the work needs a stable behavioral identity with distinct:

- scope
- role boundaries
- review bar
- interaction style

Examples:

- a release operator
- a swarm diagnostician
- a governance reviewer

## What belongs in a skill

Add a skill when you need a repeatable Codex Swarm workflow with:

- clear triggers
- fixed input expectations
- concrete surfaces to inspect or drive
- predictable outputs and operating rules

Examples:

- run operations
- project automation
- review and governance investigation
- worker lifecycle control
- diagnostics
- recovery and restore

## Authoring rules

1. Ground every skill in real Codex Swarm surfaces:
   - frontend routes that actually ship
   - `/api/v1` routes that actually exist
   - checked-in ops commands and runbooks
   - current repo docs and verification records
2. Use the standard skill structure:
   - Purpose
   - Trigger Conditions
   - Required Inputs
   - Primary Codex Swarm Surfaces
   - Concrete Commands and Routes
   - Expected Outputs
   - Workflow
   - Guardrails
3. Write to durable product reality, not temporary board state.
4. Prefer route names, command names, and stable docs over screenshots or live
   task IDs.

## What not to do

Do not:

- reference another product as the operating model
- copy generic board, inbox, or task-control guidance that Codex Swarm does not
  actually expose
- rely on dynamic examples such as “the current board wave” or live task IDs
- document removed UI concepts such as global `Admin` or old run-detail naming
  without mapping them to current surfaces

## Extension workflow

1. Find the closest existing skill or agent.
2. Confirm the product surfaces in code or docs before writing instructions.
3. Add the new skill or agent with the minimum scope needed.
4. Update:
   - `.agents/skills/README.md`
   - `docs/operator-skill-library.md`
   - `docs/operator-skill-workflows.md`
     when the curated skill set changes.
5. If the change affects operator expectations, update `docs/operator-guide.md`
   and any acceptance docs that describe the skill library.
