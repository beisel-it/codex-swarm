# Codex Swarm Operator Guide

## Scope

Operators and maintainers are responsible for runtime health, project and run
setup, review and governance correctness, worker lifecycle safety, and
recovery-grade remediation.

This guide is the checked-in entry point for operating the real Codex Swarm
product through its frontend, HTTP control plane, and runbooks.

## Entry points

Use these assets together:

- [Skill Library](./operator-skill-library.md)
- [Skill Workflows](./operator-skill-workflows.md)
- [User Guide](./user-guide.md)
- [Support Playbooks](./support-playbooks.md)
- [Control-Plane API Contract](./architecture/control-plane-api-contract.md)

## Product surfaces

### Frontend

- public without login:
  - landing site only
- `Projects`
- `Ad-Hoc Runs`
- `Settings`
- run workspaces:
  - `overview`
  - `board`
  - `lifecycle`
  - `review`

All operational frontend surfaces require a valid browser session. Operators
bootstrap the first admin with `codex-swarm auth bootstrap-admin`, then log in
through the browser login form backed by the release auth endpoints.

### Control plane

- `/health`
- `/webhooks/*`
- `/api/v1/auth/login`
- `/api/v1/auth/logout`
- `/api/v1/auth/session`
- `/api/v1/projects`
- `/api/v1/repositories`
- `/api/v1/runs`
- `/api/v1/tasks`
- `/api/v1/agents`
- `/api/v1/messages`
- `/api/v1/artifacts`
- `/api/v1/approvals`
- `/api/v1/validations`
- `/api/v1/worker-nodes`
- `/api/v1/worker-dispatch-assignments`
- `/api/v1/repeatable-runs`
- `/api/v1/repeatable-run-triggers`
- `/api/v1/external-event-receipts`
- `/api/v1/events`
- `/api/v1/admin/*`

Route boundary for release auth:

- public without login: `GET /health`, `/webhooks/*`, and the landing/static frontend surface
- protected after login: all operational UI routes and all non-webhook `/api/v1/*` routes
- browser/session auth is the default release path
- worker and local-daemon control-plane calls use the scoped `AUTH_SERVICE_TOKEN` / `CODEX_SWARM_SERVICE_TOKEN` path plus `CODEX_SWARM_SERVICE_NAME`
- legacy bearer-token auth is a local/internal fallback only when `AUTH_ENABLE_LEGACY_DEV_BEARER=true`

### Operations

- `corepack pnpm --dir apps/api db:status`
- `corepack pnpm --dir apps/api db:migrate`
- `corepack pnpm ops:smoke`
- `corepack pnpm ops:backup`
- `corepack pnpm ops:restore`
- `corepack pnpm ops:drill`

## Skill-to-problem map

| Problem                                                       | First asset                             |
| ------------------------------------------------------------- | --------------------------------------- |
| Create or inspect runs                                        | `codex-swarm-run-operations`            |
| Configure projects, repositories, or webhooks                 | `codex-swarm-project-automation`        |
| Review approvals, validations, artifacts, or governance state | `codex-swarm-review-governance`         |
| Inspect node health, placement, or dispatch                   | `codex-swarm-worker-lifecycle`          |
| Diagnose health, metrics, events, or transcript visibility    | `codex-swarm-observability-diagnostics` |
| Execute cleanup, restore, DR, or upgrade-safe remediation     | `codex-swarm-recovery-restore`          |

## Core operator walkthrough

1. Complete install and service startup for the target instance.
2. Run `codex-swarm auth bootstrap-admin --email <email> --password <password> --display-name <name> --yes` once per fresh install to create the first workspace admin and default workspace/team boundary.
3. Start from the product surface that matches the question after logging into the browser UI.
4. Confirm backend truth with the matching protected `/api/v1` routes.
5. Separate product-configuration questions from runtime-health questions.
6. Use recovery only after diagnostics justify mutation.
7. Capture evidence before and after any significant lifecycle or recovery
   action.

## DoD-Based Verification

`definitionOfDone` is now the normative task contract for verification. Treat
it as the checklist a verifier must be able to confirm before a task can finish.
`acceptanceCriteria` still exists, but only as a compatibility-oriented summary
for humans, legacy reads, and older UI affordances.

For newly planned tasks with stored `definitionOfDone`:

1. the worker executes the task against the persisted DoD
2. worker outcome `completed` means only "ready for verification"
3. the task moves to `awaiting_review` and a verifier assignment is queued
4. a different verifier agent reviews the delivered work against
   `definitionOfDone`, current validations, artifacts, and recent messages
5. only verifier outcome `passed` moves the task to `completed`

Verification ownership rules:

- prefer a dedicated `reviewer`
- otherwise use another review-like role such as `visual-reviewer`
- if no review role is available, fall back to a second agent of the worker's
  own specialty
- never reuse the same agent as both worker and verifier

Verification outcomes:

- `requested` or `in_progress`: the task stays in `awaiting_review`
- `passed`: the task becomes `completed`
- `failed`: the task stays open for rework and publishes verifier findings plus
  change requests
- `blocked`: the verifier escalates through the leader rather than inventing a
  new task path directly

Verifier authority is intentionally narrow. The verifier may report
`findings`, `changeRequests`, and evidence, but may not create follow-up tasks
or apply fixes. If rework is needed, the leader creates exactly one follow-up
task from the verifier output and keeps the original task open or linked to the
rework path.

Legacy tasks without `definitionOfDone` remain readable. They continue to show
up in the UI and API, but automatic task-bound verification is not retrofitted
onto old task records.

## How Operators Inspect Verification State

Frontend surfaces:

- `board`: shows whether work is still executing, `awaiting_review`, failed
  verification, or rework requested
- `lifecycle`: shows the handoff from worker completion to verifier activity
  without reading `awaiting_review` as done
- `review`: shows the verification queue, verifier identity, latest summary,
  and open change requests
- task detail: shows `definitionOfDone` as the primary contract and
  `acceptanceCriteria` as the secondary summary

API fields to inspect through `GET /api/v1/runs/:id` or
`GET /api/v1/tasks?runId=<id>`:

- `status`
- `definitionOfDone`
- `acceptanceCriteria`
- `verificationStatus`
- `verifierAgentId`
- `latestVerificationSummary`
- `latestVerificationFindings`
- `latestVerificationChangeRequests`
- `latestVerificationEvidence`

Control-plane events to watch through `GET /api/v1/events`:

- `task.verification_requested`
- `task.verification_passed`
- `task.verification_failed`
- `task.verification_blocked`

## Related docs

- [Webhook-Triggered Repeatable Runs](./operations/webhook-triggered-runs.md)
- [Backup, Restore, and DR](./operations/backup-restore-dr.md)
- [Upgrade Path](./operations/upgrade-path.md)
- [Active Agent Observability](./operations/active-agent-observability.md)
