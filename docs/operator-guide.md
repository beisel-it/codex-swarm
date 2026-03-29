# Codex Swarm Operator Guide

## Scope

Operators are responsible for runtime health, restore and DR execution, upgrade safety, and support-envelope compliance.

## Core Checks

### Health and version checks

- `GET /health`
- `corepack pnpm --dir apps/api db:status`

Use these first after deployment, restore, or upgrade.

### Metrics and SLO checks

- `GET /api/v1/metrics`

This exposes:

- SLO status
- usage counts
- budgeted cost summaries
- persisted performance summaries

### Backup, restore, and DR

Use:

- `corepack pnpm ops:backup`
- `corepack pnpm ops:restore`
- `corepack pnpm ops:drill`

Follow the detailed runbook in [Backup, Restore, and DR](./operations/backup-restore-dr.md).

### Upgrade path

Use:

- `corepack pnpm --dir apps/api db:migrate`
- `corepack pnpm --dir apps/api db:status`

Follow the detailed runbook in [Upgrade Path](./operations/upgrade-path.md).

### Repository materialization rules

- Worker workspaces are prepared through `materializeRepositoryWorkspace(...)` in `apps/worker/src/runtime.ts`.
- If a repository record includes `localPath`, the worker path is a mounted view of that operator-managed checkout. The platform treats the mounted source as pre-positioned and does not switch branches or clean the source tree.
- If a repository record does not include `localPath`, the worker runtime clones `repository.url` into the assigned worktree path using the requested branch or the repository default branch.
- Operators should use `localPath` only for trusted single-host flows where the source checkout lifecycle is already under explicit control.

### Cleanup job behavior

- `POST /api/v1/cleanup-jobs/run` still supports dry classification of missing or stale sessions through `existingWorktreePaths`.
- Set `deleteStaleWorktrees=true` when operators want the cleanup run to remove stale or terminal worktree directories on disk after reconciliation.
- Placeholder paths such as `untracked/<sessionId>` are never deleted.

## Reference Operating Loop

1. Check `/health` and `db:status`.
2. Confirm `GET /api/v1/metrics` remains inside the documented envelope.
3. Investigate backlog, failure, or queue growth when the envelope is violated.
4. Use backup/restore and DR procedures for recovery events.
5. Record drill, restore, or upgrade evidence for release and support reviews.

## Operator Boundaries

- The platform does not promise 24x7 human response.
- Recovery procedures require explicit operator control.
- Cost reporting is based on Codex Swarm persisted data, not downstream provider invoices.
- The secret path is bounded to the documented integration model, not every provider variant.
