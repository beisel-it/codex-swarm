# Backup, Restore, and Disaster Recovery

## Scope

The supported backup path is a logical JSON snapshot of the core control-plane tables:

- `control_plane_metadata`
- `workspaces`
- `teams`
- `repositories`
- `runs`
- `tasks`
- `agents`
- `worker_nodes`
- `sessions`
- `worker_dispatch_assignments`
- `messages`
- `approvals`
- `validations`
- `artifacts`
- `control_plane_events`

This protects the control-plane state that governs orchestration, audit, and recovery behavior.

## Backup

Create a snapshot:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/codex_swarm \
corepack pnpm ops:backup
```

Optional variables:

- `BACKUP_FILE`: output path; defaults to `.ops/backups/control-plane-<timestamp>.json`

## Restore

Restore a snapshot into a target database:

```bash
BACKUP_FILE=.ops/backups/control-plane-latest.json \
RESTORE_DATABASE_URL=postgres://postgres:postgres@localhost:5432/codex_swarm_restore \
corepack pnpm ops:restore
```

The restore path truncates the known control-plane tables and repopulates them from the snapshot. Do not point it at a production database without an approved maintenance window.

## DR exercise

Run a scratch-database drill:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/codex_swarm \
corepack pnpm ops:drill
```

The drill:

1. creates a temporary database cloned from `template0`
2. captures a logical snapshot from the source database
3. restores that snapshot into the scratch database
4. compares per-table counts between source and restored state
5. records timings and result counts
6. drops the scratch database

Optional variables:

- `DRILL_DATABASE_NAME`: override the scratch database name
- `DRILL_OUTPUT_FILE`: output path for the drill report
- `RESTORE_DATABASE_URL`: use an explicit restore target instead of an auto-created scratch database

## Recovery expectations

- backup duration is measured per drill run
- restore duration is measured per drill run
- validation duration is measured per drill run
- operators should persist the JSON drill record as evidence for release or support reviews

## Recorded drill result

An M6 drill was executed on 2026-03-28 against an ephemeral local Postgres 16 instance after schema migration and seed data load.

- backup duration: 33ms
- restore duration: 2023ms
- validation duration: 45ms
- total drill duration: 2175ms
- source/restored counts matched for `workspaces`, `teams`, `repositories`, `runs`, `approvals`, and `control_plane_events`
- drill result: success with zero mismatches

This is a bounded control-plane drill, not a full regional failover rehearsal.

## Failure handling

- if backup succeeds and restore fails, preserve the snapshot and investigate the target database state before rerunning
- if count validation fails, treat the drill as unsuccessful and compare the mismatched tables before cutting over any restore path
- after a real restore, rerun migrations, `corepack pnpm --dir apps/api db:status`, and application health checks before reopening traffic
