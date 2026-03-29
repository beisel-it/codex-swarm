# codex-swarm-task-control

## Purpose

Create, update, reassign, and rewire `codex-swarm` tasks using explicit board
state and exact task IDs.

## Trigger Conditions

Use this skill when the user asks to:

- create a new task
- update task status
- assign or reassign work
- add or change dependencies
- move a task to `in_progress`, `completed`, or `blocked`

## Required Inputs

- team name, usually `codex-swarm`
- exact task ID for updates
- subject, owner, and dependency intent for new tasks
- any governing doc source such as `ROADMAP.md` or `docs/architecture/*.md`

## Concrete Commands

1. Inspect existing task detail:
   `clawteam task get codex-swarm <task-id>`
2. Create a new task:
   `clawteam task create codex-swarm "Subject" --description "..." --owner backend-dev`
3. Create a blocked task:
   `clawteam task create codex-swarm "Subject" --owner backend-dev --blocked-by <task-a>,<task-b>`
4. Update status or owner:
   `clawteam task update codex-swarm <task-id> --status in_progress --owner backend-dev`
5. Add upstream blockers:
   `clawteam task update codex-swarm <task-id> --add-blocked-by <blocker-id>`
6. Add downstream dependencies:
   `clawteam task update codex-swarm <task-id> --add-blocks <dependent-id>`

## Expected Outputs

- created or updated task ID
- resulting owner and status
- resulting dependency edges
- confirmation that the DAG change matches the intended plan

## Workflow

1. Read the active board or task detail before changing it.
2. Keep one independently shippable slice per task.
3. Add dependency edges only when sequencing is truly required.
4. Re-open the task or filtered board after mutation to verify the change.
5. Report the exact task ID and blocker IDs that changed.

## Grounded Example

```bash
clawteam task get codex-swarm dcac8307
clawteam task update codex-swarm dcac8307 --status in_progress
clawteam task create codex-swarm "M8 follow-up: verify operator examples" \
  --owner qa-engineer \
  --blocked-by dcac8307
```

Observed grounding for this repo:

- `dcac8307` is the active backend M8 operator-control task.
- The live board is already keyed by exact task IDs such as `dcac8307`,
  `35a172a9`, and `63c3a79d`, so follow-up control should use task IDs rather
  than loose prose references.

## Guardrails

- Do not invent dependency edges without checking current blockers.
- Do not leave ownership ambiguous when the responsible lane is known.
- Always return the exact task ID after creation or mutation.
