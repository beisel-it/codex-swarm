# External Operator Skill Workflows

These examples show what successful external-operator Codex flows look like in
the current `codex-swarm` repo. They are grounded in the checked-in skills,
runbooks, and live API surfaces.

## 1. Board Triage Pass

Use when an external Codex session needs to understand the live board state,
separate active work from blocked work, and identify the next operator action.

1. Start with `codex-swarm-board-triage`.
2. Run:
   ```bash
   clawteam board show codex-swarm
   clawteam task list codex-swarm --status in_progress
   clawteam task list codex-swarm --status blocked
   ```
3. If one task is critical or ambiguous, inspect exact detail before making any
   recommendation:
   ```bash
   clawteam task get codex-swarm <task-id>
   ```
4. Cross-check the board UI in [docs/user-guide.md](./user-guide.md) and the
   operator-facing board walkthrough in [docs/operator-guide.md](./operator-guide.md).
5. Output:
   - the active queue
   - the blocked queue and blocker IDs
   - the next ready slice for the requested owner

## 2. Inbox Inspection Pass

Use when an external Codex session needs to inspect or consume agent messages
without losing queued instructions.

1. Start with `codex-swarm-inbox-inspection`.
2. Default to a read-only pass:
   ```bash
   clawteam inbox peek codex-swarm --agent <agent-name>
   ```
3. Only consume messages when the operator actually intends to act on them:
   ```bash
   clawteam inbox receive codex-swarm --agent <agent-name> --limit 10
   ```
4. If consumed messages change work direction, pair the inbox action with a
   board or task re-check:
   ```bash
   clawteam task list codex-swarm --status in_progress
   ```
5. Output:
   - whether the pass was read-only or destructive
   - pending messages or consumed instructions
   - any follow-on task or coordination action

## 3. Task Control Pass

Use when an external Codex session needs to create, update, reassign, or rewire
codex-swarm tasks with exact IDs and dependency edges.

1. Start with `codex-swarm-task-control`.
2. Inspect the current task before changing it:
   ```bash
   clawteam task get codex-swarm <task-id>
   ```
3. Create or mutate the task only after the current state is explicit:
   ```bash
   clawteam task create codex-swarm "Subject" --description "..." --owner backend-dev
   clawteam task update codex-swarm <task-id> --status in_progress --owner frontend-dev
   clawteam task update codex-swarm <task-id> --add-blocked-by <blocker-id>
   ```
4. Re-open the board or task detail immediately after the mutation:
   ```bash
   clawteam task get codex-swarm <task-id>
   clawteam task list codex-swarm --owner frontend-dev
   ```
5. Output:
   - the exact task ID created or changed
   - the resulting owner, status, and blocker graph
   - whether the DAG change matches the intended plan

## 4. Agent Coordination Pass

Use when an external Codex session needs to hand off work, checkpoint progress,
save session state, report cost, or intentionally mark the loop idle.

1. Start with `codex-swarm-agent-coordination`.
2. If ownership is changing, check for overlap first:
   ```bash
   clawteam context conflicts codex-swarm --repo /home/florian/codex-swarm
   ```
3. Send the handoff or escalation with exact task and commit context:
   ```bash
   clawteam inbox send codex-swarm tech-lead "Completed dcac8307 on <commit>"
   ```
4. When the slice is substantial, checkpoint and save the session:
   ```bash
   clawteam workspace checkpoint codex-swarm frontend-dev --message "Operator skill workflow checkpoint"
   clawteam session save codex-swarm --agent frontend-dev --session-id <id> --last-task <task-id>
   ```
5. Only when the queue is actually clear, mark the loop idle:
   ```bash
   clawteam lifecycle idle codex-swarm --last-task <task-id> --task-status completed
   ```
6. Output:
   - the coordination command sequence used
   - whether ownership changed cleanly
   - whether the workspace was checkpointed and the session saved

## 5. Triage Pass

Use when the question is whether Codex Swarm is healthy enough to keep
operating.

1. Start with `codex-swarm-diagnostics`.
2. Run:
   ```bash
   curl -s "$BASE_URL/health" | jq
   corepack pnpm --dir apps/api db:status
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     "$BASE_URL/api/v1/metrics" | jq
   ```
3. Cross-check `docs/operator-guide.md` and `docs/support-playbooks.md`.
4. Output:
   - current health and version posture
   - whether the SLO envelope is intact
   - whether the next step is monitoring, deeper run diagnostics, or recovery

## 6. Execution Monitoring Pass

Use when a specific run is stalled, retrying, or showing worker-placement
issues.

1. Start with `codex-swarm-diagnostics`.
2. Inspect:
   ```bash
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     "$BASE_URL/api/v1/runs/$RUN_ID" | jq

   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     "$BASE_URL/api/v1/events?runId=$RUN_ID&limit=100" | jq

   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     "$BASE_URL/api/v1/worker-nodes" | jq
   ```
3. Use `clawteam` only if you need to confirm devops ownership or escalation
   state:
   ```bash
   clawteam task list codex-swarm --owner devops
   clawteam inbox peek codex-swarm --agent devops
   ```
4. Output:
   - whether the run is blocked by node state, cleanup debt, queue pressure, or
     broader platform health
   - the exact evidence used to reach that conclusion

## 7. Recovery And Diagnostics Pass

Use when the run has stale sessions, a node is lost, or restore and DR action
is required.

1. Start with `codex-swarm-recovery`.
2. Run cleanup classification before mutation:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/cleanup-jobs/run" \
     -d '{
       "runId": "'"$RUN_ID"'",
       "existingWorktreePaths": [],
       "deleteStaleWorktrees": false
     }' | jq
   ```
3. If the issue is node loss, reconcile the node:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/worker-nodes/$WORKER_NODE_ID/reconcile" \
     -d '{"reason":"node_unreachable"}' | jq
   ```
4. If the issue is restore or DR failure, use only the checked-in ops commands:
   ```bash
   corepack pnpm ops:backup
   BACKUP_FILE=.ops/backups/<snapshot>.json corepack pnpm ops:restore
   corepack pnpm ops:drill
   ```
5. Re-verify:
   ```bash
   curl -s "$BASE_URL/health" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     "$BASE_URL/api/v1/metrics" | jq
   ```
6. Output:
   - the exact recovery path taken
   - before-and-after evidence
   - whether the incident is resolved, mitigated, or escalated
