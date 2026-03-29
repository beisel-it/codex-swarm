# External Operator Skill Library

This document is the M8 entry point for an external Codex session operating the
`codex-swarm` workspace and product from the outside.

Source of truth for scope:

- `docs/architecture/m8-delivery-plan.md`
- `docs/qa/m8-skill-library-acceptance.md`

## What this pack is

The checked-in skill library is a codex-swarm-specific operator pack. It is not
a generic ClawTeam tutorial. The skills are grounded in the actual control
surfaces used by this repo:

- `clawteam` board, inbox, task, coordination, lifecycle, and workspace commands
- repo docs such as `PRD.md`, `ROADMAP.md`, `.swarm/status.md`, and
  `docs/architecture/*.md`
- repo-local verification commands such as `corepack pnpm --dir ... test`

## Current M8 control skills

- [`codex-swarm-board-triage`](../.agents/skills/codex-swarm-board-triage/SKILL.md)
- [`codex-swarm-inbox-inspection`](../.agents/skills/codex-swarm-inbox-inspection/SKILL.md)
- [`codex-swarm-task-control`](../.agents/skills/codex-swarm-task-control/SKILL.md)
- [`codex-swarm-agent-coordination`](../.agents/skills/codex-swarm-agent-coordination/SKILL.md)
- [`codex-swarm-diagnostics`](../.agents/skills/codex-swarm-diagnostics/SKILL.md)
- [`codex-swarm-recovery`](../.agents/skills/codex-swarm-recovery/SKILL.md)
- [Agent and Skill Authoring Guide](./agent-skill-authoring.md)
- [Checked-in skill index](../.agents/skills/README.md)

These cover the currently checked-in external-operator slice:

- board triage
- inbox inspection
- task create/update/dependency workflows
- agent coordination and loop-control commands
- diagnostics and recovery investigation grounded in the live product surfaces
- safe extension of the checked-in agent and skill pack

## How to operate codex-swarm with this pack

1. Start with the board:
   `clawteam board show codex-swarm`
2. Narrow the queue:
   `clawteam task list codex-swarm --status in_progress`
   `clawteam task list codex-swarm --status blocked`
3. Inspect inbox state before consuming it:
   `clawteam inbox peek codex-swarm --agent <agent>`
4. Mutate tasks only after checking current state:
   `clawteam task get codex-swarm <task-id>`
5. Use coordination commands when ownership or task state changes:
   `clawteam inbox send ...`
   `clawteam context conflicts ...`
   `clawteam workspace checkpoint ...`
6. Use the diagnostics and recovery skills when the question shifts from board
   control to live product state:
   - `codex-swarm-diagnostics`
   - `codex-swarm-recovery`
7. Use the authoring pack when the goal is to extend codex-swarm itself:
   - `docs/agent-skill-authoring.md`
   - `.agents/skills/README.md`

## Grounded repo examples

The current workspace gives concrete operator anchors:

- `clawteam board show codex-swarm` currently shows the live M8 wave.
- `clawteam task list codex-swarm --status in_progress` currently includes
  backend task `dcac8307`, frontend examples `35a172a9`, QA acceptance
  `63c3a79d`, and devops diagnostics `b1264c64`.
- `clawteam inbox peek codex-swarm --agent backend-dev` currently reports
  `Pending messages: 0`.
- `clawteam task get codex-swarm dcac8307` confirms the active backend M8
  control-skill task and its DoD.
- Codex Swarm diagnostics and recovery are grounded in the live repo surfaces
  documented in `docs/operator-guide.md`, `docs/support-playbooks.md`, and the
  API routes under `apps/api/src/routes/`.

## Selection guide

- Need to inspect active or blocked work:
  use `codex-swarm-board-triage`
- Need to inspect or consume message traffic:
  use `codex-swarm-inbox-inspection`
- Need to create or rewire tasks:
  use `codex-swarm-task-control`
- Need to hand off, checkpoint, save, or idle an agent:
  use `codex-swarm-agent-coordination`
- Need to diagnose health, queue, run, or worker-node issues:
  use `codex-swarm-diagnostics`
- Need to perform cleanup, reconciliation, restore, or upgrade recovery:
  use `codex-swarm-recovery`
- Need to add or extend codex-swarm agents or skills:
  use `docs/agent-skill-authoring.md` and `.agents/skills/README.md`
