# External Operator Skill Workflows

These examples show what successful external-operator Codex flows look like in
the current `codex-swarm` repo. They are grounded in the checked-in skills,
runbooks, and live API surfaces.

## 1. Triage Pass

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

## 2. Execution Monitoring Pass

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

## 3. Recovery And Diagnostics Pass

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
