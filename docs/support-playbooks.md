# Codex Swarm Support Playbooks

## Purpose

These playbooks translate the operational envelope into concrete support actions.

## 1. Platform outside SLO envelope

Signals:

- `GET /api/v1/metrics` reports `withinEnvelope = false`
- queue growth exceeds configured limits
- approval or run age exceeds configured objectives

Actions:

1. Capture the current metrics response.
2. Identify whether the issue is queue growth, approval backlog, validation delay, or broader failure counts.
3. Confirm whether the issue falls inside the documented support envelope.
4. Escalate using the configured support-response process when the platform is still outside the envelope after first-pass triage.

## 2. Failed restore or DR drill

Signals:

- `ops:restore` fails
- `ops:drill` reports mismatched counts
- restored API fails `/health` or `db:status`

Actions:

1. Preserve the snapshot and drill output.
2. Record the failed table counts or validation mismatches.
3. Do not reopen traffic until restore validation and health checks are green.
4. If needed, rerun the documented restore path into a clean target.

## 3. Upgrade failure

Signals:

- schema/config mismatch on startup
- failed migration
- `/health` reports unexpected schema/config values

Actions:

1. Stop rollout progression.
2. Verify `db:migrate` and `db:status` output.
3. Restore the previous known-good state if the new build cannot pass the documented upgrade checks.
4. Record the failure mode and any rollback limitations.

## 4. Governance or approval audit discrepancy

Signals:

- approval attribution appears incomplete
- delegated approval provenance looks inconsistent
- policy or retention state appears wrong for a repo

Actions:

1. Pull the run audit export and governance report.
2. Compare actor attribution, policy profile, workspace/team ownership, and delegation state.
3. Confirm whether the issue is UI-only or present in backend state.
4. Treat missing backend provenance as a release-blocking defect.

## 5. Sensitive repository secret-access issue

Signals:

- access plan reports `denied` unexpectedly
- brokered access fails for a sensitive repository

Actions:

1. Inspect repository trust level and policy profile.
2. Check the integration boundary and access plan admin surfaces.
3. Confirm `SECRET_SOURCE_MODE`, `SECRET_PROVIDER`, and `REMOTE_SECRET_ENV_NAMES`.
4. Do not bypass the governed path with ad hoc credentials.
