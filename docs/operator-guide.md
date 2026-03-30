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

- `Projects`
- `Ad-Hoc Runs`
- `Settings`
- run workspaces:
  - `overview`
  - `board`
  - `lifecycle`
  - `review`

### Control plane

- `/health`
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

### Operations

- `corepack pnpm --dir apps/api db:status`
- `corepack pnpm --dir apps/api db:migrate`
- `corepack pnpm ops:smoke`
- `corepack pnpm ops:backup`
- `corepack pnpm ops:restore`
- `corepack pnpm ops:drill`

## Skill-to-problem map

| Problem | First asset |
| --- | --- |
| Create or inspect runs | `codex-swarm-run-operations` |
| Configure projects, repositories, or webhooks | `codex-swarm-project-automation` |
| Review approvals, validations, artifacts, or governance state | `codex-swarm-review-governance` |
| Inspect node health, placement, or dispatch | `codex-swarm-worker-lifecycle` |
| Diagnose health, metrics, events, or transcript visibility | `codex-swarm-observability-diagnostics` |
| Execute cleanup, restore, DR, or upgrade-safe remediation | `codex-swarm-recovery-restore` |

## Core operator walkthrough

1. Start from the product surface that matches the question.
2. Confirm backend truth with the matching `/api/v1` routes.
3. Separate product-configuration questions from runtime-health questions.
4. Use recovery only after diagnostics justify mutation.
5. Capture evidence before and after any significant lifecycle or recovery
   action.

## Related docs

- [Webhook-Triggered Repeatable Runs](./operations/webhook-triggered-runs.md)
- [Backup, Restore, and DR](./operations/backup-restore-dr.md)
- [Upgrade Path](./operations/upgrade-path.md)
- [Active Agent Observability](./operations/active-agent-observability.md)
