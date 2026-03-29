# codex-swarm-agent-coordination

## Purpose

Coordinate `codex-swarm` agents through real handoff, conflict-check,
checkpoint, session-save, cost-report, and idle-loop commands.

## Trigger Conditions

Use this skill when the user asks to:

- hand work from one agent to another
- notify the leader or a worker
- checkpoint progress
- save an agent session
- report usage or cost
- mark an agent idle or confirm loop behavior

## Required Inputs

- team name, usually `codex-swarm`
- sender and receiver agent names
- task ID when the coordination event is task-specific
- optional repo path for conflict checks
- optional session ID and usage numbers for save/report steps

## Concrete Commands

1. Send a direct coordination message:
   `clawteam inbox send codex-swarm tech-lead "Completed dcac8307 on <commit>"`
2. Check file overlap before a handoff:
   `clawteam context conflicts codex-swarm --repo /home/florian/codex-swarm`
3. Create a workspace checkpoint:
   `clawteam workspace checkpoint codex-swarm backend-dev --message "Checkpoint summary"`
4. Save the active session:
   `clawteam session save codex-swarm --agent backend-dev --session-id <id> --last-task <task-id>`
5. Report usage and cost:
   `clawteam cost report codex-swarm --agent backend-dev --input-tokens <n> --output-tokens <n> --cost-cents <n>`
6. Mark the agent idle only when the queue is clear:
   `clawteam lifecycle idle codex-swarm --last-task <task-id> --task-status completed`

## Expected Outputs

- confirmation that the message, checkpoint, session save, or cost report landed
- conflict results when overlap checking is needed
- a clear next coordination state for the target agent or leader

## Workflow

1. If ownership or branch state is changing, run a conflict check first.
2. Send handoff messages with task IDs and outcomes, not vague prose.
3. Before ending a substantial slice, checkpoint the workspace and save the
   session if resume is expected.
4. Report cost only when the workflow or protocol requires it.
5. Send the idle signal only after the queue is actually empty.

## Grounded Example

```bash
clawteam context conflicts codex-swarm --repo /home/florian/codex-swarm
clawteam workspace checkpoint codex-swarm backend-dev --message "M8 skill pack checkpoint"
clawteam lifecycle idle codex-swarm --last-task dcac8307 --task-status completed
```

Observed grounding for this repo:

- `clawteam workspace checkpoint codex-swarm backend-dev --message "M8 skill pack checkpoint"`
  currently returns `No changes to checkpoint for 'backend-dev'` when there are
  no uncommitted modifications.
- The codex-swarm worker loop expects agents to keep checking task list and
  inbox, and only send `lifecycle idle` when the queue is truly empty.

## Guardrails

- Do not send idle while owned work is still active.
- Do not checkpoint or save a session without explaining what it captures.
- Do not hand off work across agents without task ID or commit context.
