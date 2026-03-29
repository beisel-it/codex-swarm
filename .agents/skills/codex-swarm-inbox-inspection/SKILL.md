---
name: codex-swarm-inbox-inspection
description: Inspect and handle `codex-swarm` inbox traffic without losing instructions or
---

# codex-swarm-inbox-inspection

## Purpose

Inspect and handle `codex-swarm` inbox traffic without losing instructions or
consuming messages prematurely.

## Trigger Conditions

Use this skill when the user asks to:

- check agent messages
- inspect the inbox
- see whether a worker has new instructions
- confirm whether a message was delivered
- consume queued instructions and act on them

## Required Inputs

- team name, usually `codex-swarm`
- target agent name such as `backend-dev`, `frontend-dev`, or `tech-lead`
- whether the pass is read-only or consume-and-act

## Concrete Commands

1. Non-destructive inspection:
   `clawteam inbox peek codex-swarm --agent backend-dev`
2. Destructive receive when the workflow requires it:
   `clawteam inbox receive codex-swarm --agent backend-dev --limit 10`
3. Send a reply or escalation:
   `clawteam inbox send codex-swarm tech-lead "Need help: <description>"`
4. Re-check active work after message handling:
   `clawteam task list codex-swarm --status in_progress`

## Expected Outputs

- pending inbox count
- message bodies and senders
- whether messages were only inspected or consumed
- any follow-up task or coordination action

## Workflow

1. Default to `inbox peek` so no messages are lost.
2. Switch to `inbox receive` only when the user wants the agent to consume and
   act on the queue.
3. If consumed messages change task direction, pair the inbox step with a task
   update or a reply in the same workflow.
4. Report whether the pass was read-only or destructive.

## Grounded Example

```bash
clawteam inbox peek codex-swarm --agent backend-dev
clawteam inbox receive codex-swarm --agent backend-dev --limit 5
```

Observed grounding for this repo:

- `clawteam inbox peek codex-swarm --agent backend-dev` currently returns
  `Pending messages: 0`.
- Because the current inbox is empty, the correct operator behavior is to keep
  working the active task queue instead of performing a destructive receive.

## Guardrails

- Do not use `inbox receive` for a read-only inspection pass.
- Always say whether messages were consumed.
- If a message changes work direction, tie the result to a task ID or agent
  action before ending the response.
