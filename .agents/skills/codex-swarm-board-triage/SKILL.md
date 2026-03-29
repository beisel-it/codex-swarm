---
name: codex-swarm-board-triage
description: Inspect the live `codex-swarm` board, identify active blockers, and reduce the
---

# codex-swarm-board-triage

## Purpose

Inspect the live `codex-swarm` board, identify active blockers, and reduce the
execution queue to the next concrete operator actions.

## Trigger Conditions

Use this skill when the user asks to:

- check team status
- inspect the board
- summarize what is in progress
- explain what is blocked
- decide what the next backend, frontend, QA, or devops action should be

## Required Inputs

- team name, usually `codex-swarm`
- optional owner focus such as `backend-dev`
- optional status focus such as `blocked`, `in_progress`, or `urgent`

## Concrete Commands

1. Show the full board:
   `clawteam board show codex-swarm`
2. Filter to active execution:
   `clawteam task list codex-swarm --status in_progress`
3. Filter to blockers:
   `clawteam task list codex-swarm --status blocked`
4. Inspect one lane:
   `clawteam task list codex-swarm --owner backend-dev`
5. Open a critical task before making claims:
   `clawteam task get codex-swarm <task-id>`

## Expected Outputs

- the current in-progress queue
- the blocked queue and blocker IDs
- the next ready work for the requested owner or lane
- the recommended next control action

## Workflow

1. Start with the full board to establish the current execution wave.
2. Narrow to `in_progress` to see which owners are active.
3. Narrow to `blocked` when the question is about stalled work.
4. Pull exact task detail for any ambiguous or critical item.
5. Report only concrete queue facts: task IDs, owners, statuses, blockers, and
   what is ready now.

## Grounded Example

```bash
clawteam board show codex-swarm
clawteam task list codex-swarm --status in_progress
clawteam task get codex-swarm dcac8307
```

Observed grounding for this repo:

- `clawteam board show codex-swarm` currently shows the 5-member team and the
  M8 execution wave.
- `clawteam task list codex-swarm --status in_progress` currently includes
  backend task `dcac8307`, frontend examples task `35a172a9`, QA acceptance task
  `63c3a79d`, and devops diagnostics task `b1264c64`.
- `clawteam task get codex-swarm dcac8307` confirms the active backend M8 task
  and its control-skill DoD.

## Guardrails

- Do not mutate task state during a read-only triage pass.
- Do not infer blockers without checking task detail.
- Prefer exact task IDs over paraphrased descriptions.
