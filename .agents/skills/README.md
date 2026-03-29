# codex-swarm external operator skill index

This is the checked-in Codex skill library for operating the `codex-swarm`
product and workspace from the outside.

These skills are codex-swarm-specific. They are not generic ClawTeam primers.
They assume the operator is driving this repository and product through the
actual repo surfaces:

- `clawteam` task, board, inbox, coordination, and lifecycle commands
- repo docs such as `PRD.md`, `ROADMAP.md`, `.swarm/status.md`, and
  `docs/architecture/*.md`
- workspace verification commands such as `corepack pnpm --dir ... test`

## Current control-skill pack

- `codex-swarm-board-triage`
  Inspect the live `codex-swarm` board, reduce the queue, and identify the next
  unblockers.
- `codex-swarm-inbox-inspection`
  Inspect or consume agent inbox traffic without losing messages.
- `codex-swarm-task-control`
  Create, update, reassign, and rewire task dependencies with explicit task IDs.
- `codex-swarm-agent-coordination`
  Send handoffs, run conflict checks, checkpoint workspaces, save sessions,
  report cost, and manage idle-loop transitions.
- `codex-swarm-diagnostics`
  Diagnose Codex Swarm health, metrics drift, queue pressure, run-state
  failures, and worker-node issues through the live repo surfaces.
- `codex-swarm-recovery`
  Drive cleanup dry runs, worker reconciliation, restore or DR steps, and
  post-recovery verification through the checked-in runbooks.

## How to use this pack

1. Read [docs/operator-skill-library.md](../../docs/operator-skill-library.md)
   for repo-specific operator guidance.
2. Select the skill that matches the requested control action.
3. Use `codex-swarm` as the team name unless the user explicitly says otherwise.
4. Inspect current state before mutating it:
   `clawteam board show codex-swarm`
   `clawteam task list codex-swarm --status in_progress`
   `clawteam inbox peek codex-swarm --agent <agent>`
5. Report exact task IDs, statuses, blockers, and command outcomes back to the
   user.

## Guardrails

- Do not consume inbox messages with `inbox receive` unless the workflow needs
  destructive reads.
- Do not mutate task dependencies without checking current board or task state.
- Do not describe commands abstractly when a concrete codex-swarm command
  sequence exists.
