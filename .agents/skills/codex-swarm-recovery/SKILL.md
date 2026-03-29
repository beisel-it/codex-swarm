---
name: codex-swarm-recovery
description: Drive Codex Swarm recovery investigation and operator-controlled remediation
---

# codex-swarm-recovery

## Purpose

Drive Codex Swarm recovery investigation and operator-controlled remediation
using the repo's cleanup, worker reconciliation, restore, DR, and upgrade
surfaces.

## Trigger Conditions

Use this skill when the user asks to:

- recover a stalled run or stale session set
- reconcile a lost or degraded worker node
- run the documented restore or DR path
- follow the upgrade-failure or support playbook after diagnostics are complete

## Required Inputs

- API base URL
- bearer token for `/api/v1/*`
- optional `RUN_ID` and `WORKER_NODE_ID`
- known worktree snapshot when using cleanup classification
- repo checkout access for `ops:restore`, `ops:drill`, `db:migrate`, and
  `db:status`

## Concrete Commands

1. Start from the matching runbook:
   - `docs/operator-guide.md`
   - `docs/operations/backup-restore-dr.md`
   - `docs/operations/upgrade-path.md`
   - `docs/support-playbooks.md`
2. Run cleanup classification in dry-run mode before mutation:
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
3. If the issue is node loss, reconcile the node with an explicit reason:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/worker-nodes/$WORKER_NODE_ID/reconcile" \
     -d '{"reason":"node_unreachable"}' | jq
   ```
4. If cleanup should remove stale terminal worktrees, rerun only after the
   dry-run evidence is recorded:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/cleanup-jobs/run" \
     -d '{
       "runId": "'"$RUN_ID"'",
       "existingWorktreePaths": [],
       "deleteStaleWorktrees": true
     }' | jq
   ```
5. For restore or DR incidents, use the shipped ops commands instead of ad hoc
   database edits:
   `corepack pnpm ops:backup`
   `BACKUP_FILE=.ops/backups/<snapshot>.json corepack pnpm ops:restore`
   `corepack pnpm ops:drill`
6. For upgrade mismatch, use the documented version path:
   `corepack pnpm --dir apps/api db:migrate`
   `corepack pnpm --dir apps/api db:status`
7. Re-check the platform after the recovery action:
   `curl -s "$BASE_URL/health" | jq`
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/metrics" | jq`
8. Use `clawteam` only for recovery ownership or escalation after the Codex
   Swarm action is complete:
   `clawteam inbox send codex-swarm tech-lead "Recovery update: <summary>"`

## Expected Outputs

- the exact recovery path taken
- before-and-after evidence
- whether the issue is resolved, mitigated, or still blocked and needs
  escalation

## Workflow

1. Confirm the diagnosis before mutating cleanup or reconciliation state.
2. Prefer dry-run cleanup classification before destructive cleanup.
3. Use restore, DR, and upgrade commands only through the checked-in runbooks.
4. Re-verify `/health`, `db:status`, and `/api/v1/metrics` after the action.

## Guardrails

- do not mutate cleanup or reconciliation state before a dry-run or equivalent
  evidence capture
- do not reopen traffic after restore or DR work until the documented checks
  are green
- do not bypass Codex Swarm recovery with ad hoc filesystem or database edits
