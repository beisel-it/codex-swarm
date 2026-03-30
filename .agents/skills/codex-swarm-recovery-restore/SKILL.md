---
name: codex-swarm-recovery-restore
description: Recover Codex Swarm through cleanup, restore, DR, and upgrade-safe remediation.
---

# codex-swarm-recovery-restore

## Purpose

Recover Codex Swarm safely through cleanup classification, node/run
reconciliation, backup/restore, DR drill, and upgrade recovery.

## Trigger Conditions

Use this skill when the user asks to:

- recover a stale or failed run
- clean up stale worktrees or sessions
- perform restore or DR validation
- repair an upgrade or migration mismatch
- execute an operator-controlled remediation after diagnostics are complete

## Required Inputs

- API base URL
- bearer token for `/api/v1/*`
- optional `RUN_ID`
- optional `WORKER_NODE_ID`
- repo checkout access for `ops:*`, `db:migrate`, and `db:status`

## Primary Codex Swarm Surfaces

- HTTP routes:
  - `POST /api/v1/cleanup-jobs/run`
  - `POST /api/v1/worker-nodes/:id/reconcile`
  - `GET /api/v1/runs/:id`
  - `GET /api/v1/metrics`
  - `GET /health`
- local commands:
  - `corepack pnpm ops:backup`
  - `BACKUP_FILE=.ops/backups/<snapshot>.json corepack pnpm ops:restore`
  - `corepack pnpm ops:drill`
  - `corepack pnpm --dir apps/api db:migrate`
  - `corepack pnpm --dir apps/api db:status`
- runbooks:
  - `docs/operations/backup-restore-dr.md`
  - `docs/operations/upgrade-path.md`
  - `docs/support-playbooks.md`

## Concrete Commands and Routes

1. Run cleanup classification before destructive cleanup:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/cleanup-jobs/run" \
     -d '{
       "runId":"'$RUN_ID'",
       "existingWorktreePaths":[],
       "deleteStaleWorktrees":false
     }' | jq
   ```
2. If deletion is justified, rerun with destructive cleanup enabled:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/cleanup-jobs/run" \
     -d '{
       "runId":"'$RUN_ID'",
       "existingWorktreePaths":[],
       "deleteStaleWorktrees":true
     }' | jq
   ```
3. Reconcile a degraded worker node:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/worker-nodes/$WORKER_NODE_ID/reconcile" \
     -d '{"reason":"node_unreachable"}' | jq
   ```
4. Run restore or DR workflows:
   ```bash
   corepack pnpm ops:backup
   BACKUP_FILE=.ops/backups/<snapshot>.json corepack pnpm ops:restore
   corepack pnpm ops:drill
   ```
5. Repair upgrade mismatch:
   ```bash
   corepack pnpm --dir apps/api db:migrate
   corepack pnpm --dir apps/api db:status
   curl -s "$BASE_URL/health" | jq
   ```

## Expected Outputs

- the exact remediation path taken
- pre-action and post-action evidence
- a clear result: resolved, mitigated, or still blocked with escalation context

## Workflow

1. Start from diagnostics, not from guesswork.
2. Use cleanup dry-run evidence before any destructive cleanup.
3. Use restore, DR, and upgrade commands only through the checked-in runbooks.
4. Re-check `/health`, `/api/v1/metrics`, and run detail after every recovery
   action.
5. Record the remaining risk explicitly if the action mitigated rather than
   fully resolved the issue.

## Guardrails

- Do not mutate cleanup or restore state before preserving evidence.
- Do not bypass Codex Swarm recovery through ad hoc DB or filesystem edits.
- Do not declare recovery complete until health, DB status, and affected run
  state agree.
