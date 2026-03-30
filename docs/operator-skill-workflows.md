# Codex Swarm Skill Workflows

These workflows show how the checked-in skill pack maps to the real Codex
Swarm product and runtime.

## 1. Run operations workflow

Use when a user needs to create, inspect, or advance a run.

1. Start with `codex-swarm-run-operations`.
2. Inspect the matching frontend surface:
   - `/projects/:projectId/runs`
   - `/adhoc-runs`
   - `/runs/:runId/overview`
   - `/runs/:runId/board`
3. Confirm backend truth:
   - `GET /api/v1/runs`
   - `GET /api/v1/runs/:id`
   - `GET /api/v1/tasks?runId=<id>`
   - `GET /api/v1/agents?runId=<id>`
4. If the run needs action, use:
   - `POST /api/v1/runs`
   - `POST /api/v1/runs/:id/start`
   - `PATCH /api/v1/runs/:id/status`
5. If the issue is not run execution anymore, move to automation, review,
   worker lifecycle, diagnostics, or recovery.

## 2. Project and automation workflow

Use when a user needs project setup, repository assignment, repeatable runs, or
webhook-driven automation.

1. Start with `codex-swarm-project-automation`.
2. Inspect:
   - `/projects`
   - `/projects/:projectId/repositories`
   - `/projects/:projectId/automation`
3. Confirm API state:
   - `GET /api/v1/projects`
   - `GET /api/v1/repositories`
   - `GET /api/v1/repeatable-runs`
   - `GET /api/v1/repeatable-run-triggers`
   - `GET /api/v1/external-event-receipts`
4. Mutate only through the shipped resources:
   - `POST/PATCH /api/v1/projects`
   - `POST/PATCH /api/v1/repositories`
   - `POST/PATCH /api/v1/repeatable-runs`
   - `POST/PATCH /api/v1/repeatable-run-triggers`
5. If webhook ingress succeeded but the resulting run is wrong, switch to run
   operations or diagnostics instead of continuing to edit trigger shape.

## 3. Review and governance workflow

Use when a user needs approval state, validation evidence, branch publish, PR
handoff, or governance investigation.

1. Start with `codex-swarm-review-governance`.
2. Open `/runs/:runId/review` and `/runs/:runId/overview`.
3. Confirm:
   - `GET /api/v1/approvals?runId=<id>`
   - `GET /api/v1/validations?runId=<id>`
   - `GET /api/v1/artifacts?runId=<id>`
   - `GET /api/v1/runs/:id/audit-export`
4. Use explicit actions when appropriate:
   - `PATCH /api/v1/approvals/:id`
   - `POST /api/v1/runs/:id/publish-branch`
   - `POST /api/v1/runs/:id/pull-request-handoff`
5. Use governance routes in `Settings` or `/api/v1/admin/*` when the question is
   provenance, retention, or secret-access posture rather than approval alone.

## 4. Worker lifecycle workflow

Use when a user needs to inspect or change worker-node and placement behavior.

1. Start with `codex-swarm-worker-lifecycle`.
2. Inspect `/runs/:runId/lifecycle` and `GET /api/v1/worker-nodes`.
3. Cross-check dispatch state through:
   - `GET /api/v1/worker-dispatch-assignments`
   - `GET /api/v1/runs/:id`
4. Apply lifecycle controls deliberately:
   - `PATCH /api/v1/worker-nodes/:id/drain`
   - `POST /api/v1/worker-nodes/:id/reconcile`
5. Re-read worker and run state after every mutation.

## 5. Diagnostics workflow

Use when the platform appears unhealthy or a run behaves strangely without a
clear single-surface cause.

1. Start with `codex-swarm-observability-diagnostics`.
2. Capture the baseline:
   - `GET /health`
   - `GET /api/v1/metrics`
   - `corepack pnpm --dir apps/api db:status`
3. Narrow to run evidence if needed:
   - `GET /api/v1/runs/:id`
   - `GET /api/v1/events?runId=<id>&limit=100`
   - `GET /api/v1/agents?runId=<id>`
4. Run `corepack pnpm ops:smoke` when bounded end-to-end confirmation is
   needed.
5. Move to worker lifecycle or recovery only after diagnostics show it is a
   runtime or remediation problem.

## 6. Recovery and restore workflow

Use when the issue is already diagnosed as stale placement, cleanup debt,
restore/DR risk, or upgrade mismatch.

1. Start with `codex-swarm-recovery-restore`.
2. Use cleanup classification before deletion:
   - `POST /api/v1/cleanup-jobs/run`
3. Reconcile nodes only with an explicit reason:
   - `POST /api/v1/worker-nodes/:id/reconcile`
4. Use checked-in ops workflows:
   - `corepack pnpm ops:backup`
   - `corepack pnpm ops:restore`
   - `corepack pnpm ops:drill`
   - `corepack pnpm --dir apps/api db:migrate`
5. Re-verify:
   - `GET /health`
   - `GET /api/v1/metrics`
   - `corepack pnpm --dir apps/api db:status`
