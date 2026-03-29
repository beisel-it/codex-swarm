# Codex Swarm Operator Guide

## Scope

Operators are responsible for runtime health, restore and DR execution, upgrade safety, and support-envelope compliance.

This guide is also the checked-in entry point for an external Codex operator using
the repo's curated role pack and skills instead of internal tribal knowledge.

It is intentionally written as a Codex Swarm operator guide, not as a generic
ClawTeam tutorial. The `clawteam` commands below are the concrete coordination
backend that this workspace exposes to an external Codex session.

## External Codex entry points

Use these surfaces together:

- role pack: [leader.toml](/home/florian/codex-swarm/.codex/agents/leader.toml), [architect.toml](/home/florian/codex-swarm/.codex/agents/architect.toml), [implementer.toml](/home/florian/codex-swarm/.codex/agents/implementer.toml), [reviewer.toml](/home/florian/codex-swarm/.codex/agents/reviewer.toml), [tester.toml](/home/florian/codex-swarm/.codex/agents/tester.toml)
- planning skills: [plan-from-spec](/home/florian/codex-swarm/.agents/skills/plan-from-spec/SKILL.md) and [create-task-dag](/home/florian/codex-swarm/.agents/skills/create-task-dag/SKILL.md)
- execution and review skills: [validate-milestone](/home/florian/codex-swarm/.agents/skills/validate-milestone/SKILL.md) and [prepare-pr](/home/florian/codex-swarm/.agents/skills/prepare-pr/SKILL.md)
- runtime docs: [README.md](/home/florian/codex-swarm/README.md), [User Guide](/home/florian/codex-swarm/docs/user-guide.md), [Support Playbooks](/home/florian/codex-swarm/docs/support-playbooks.md)

For day-to-day work, an external Codex operator should combine:

1. board and run-state inspection in the frontend
2. codex-swarm coordination commands through `clawteam` for board, inbox, and task state
3. API and ops commands for health, metrics, backups, restore, and diagnostics

## Skill-to-flow map

Use this map when an external Codex session needs to decide which checked-in
skill or surface to reach for first.

| Operator goal | Primary checked-in asset | Codex Swarm surface to inspect or drive |
| --- | --- | --- |
| Triage blocked or approval-gated work | [leader.toml](/home/florian/codex-swarm/.codex/agents/leader.toml) | board overview, board signals, `clawteam task list`, `clawteam inbox receive` |
| Reshape milestone scope into executable work | [plan-from-spec](/home/florian/codex-swarm/.agents/skills/plan-from-spec/SKILL.md) | roadmap slice, `.swarm/plan.md`, `docs/architecture/` |
| Turn a plan into dependency-safe tasks | [create-task-dag](/home/florian/codex-swarm/.agents/skills/create-task-dag/SKILL.md) | task DAG, board lanes, `clawteam task update` |
| Monitor execution and decide whether a slice is really done | [validate-milestone](/home/florian/codex-swarm/.agents/skills/validate-milestone/SKILL.md) | review surface, validation history, artifacts, build/test commands |
| Prepare a reviewable handoff | [prepare-pr](/home/florian/codex-swarm/.agents/skills/prepare-pr/SKILL.md) | review surface, PR reflection, commit state, validation results |
| Diagnose stale placement or recovery issues | [leader.toml](/home/florian/codex-swarm/.codex/agents/leader.toml) plus this operator guide | run detail, metrics, artifact downloads, `ops:*` commands |

## Operator walkthroughs

### 1. Board triage walkthrough

Use this when an external Codex session needs to triage a codex-swarm run that
looks stalled, approval-gated, or operationally noisy.

Grounding surfaces:

- board screenshot: [user-board-overview.png](/home/florian/codex-swarm/docs/assets/screenshots/user-board-overview.png)
- board walkthrough: [docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L58)
- support escalation cues: [docs/support-playbooks.md](/home/florian/codex-swarm/docs/support-playbooks.md)

Workflow:

1. Confirm platform health before trusting the board:
   `GET /health`
   `corepack pnpm --dir apps/api db:status`
2. Check envelope pressure:
   `GET /api/v1/metrics`
3. Inspect codex-swarm coordination state:
   `clawteam task list codex-swarm --owner <agent-or-role>`
   `clawteam inbox receive codex-swarm --agent <agent-name>`
4. In the board, use the run overview plus `Board signals` to identify:
   - blocked tasks
   - pending approvals
   - recent validations
   - provider handoff or PR state
5. Use the task DAG and agent lanes to decide whether the next action is:
   - unblock dependencies
   - resolve an approval
   - reassign or follow up with an agent
   - move to diagnostics because the issue is runtime, not planning

Expected outputs:

- a clear next operator action
- whether the issue is board-visible workflow pressure or deeper runtime failure
- a board snapshot or metrics capture if the run needs escalation

### 2. Planning and control walkthrough

Use this when an external Codex session needs to plan, reshape, or control a
codex-swarm milestone slice without breaking the board, task graph, or approval
flow.

Grounding surfaces:

- planning skills: [plan-from-spec](/home/florian/codex-swarm/.agents/skills/plan-from-spec/SKILL.md), [create-task-dag](/home/florian/codex-swarm/.agents/skills/create-task-dag/SKILL.md)
- review/control screenshot: [user-review-console.png](/home/florian/codex-swarm/docs/assets/screenshots/user-review-console.png)
- review walkthrough: [docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L80)

Workflow:

1. Start from the active roadmap or delivery-plan slice, not ad hoc board edits.
2. Use the checked-in codex-swarm planning skills to shape the work:
   - read the relevant roadmap section
   - update `.swarm/plan.md` or `docs/architecture/` when the plan changes
   - create dependency-safe tasks rather than a flat task list
3. Apply the task changes through codex-swarm's coordination model:
   `clawteam task list codex-swarm --owner <owner>`
   `clawteam task update codex-swarm <task-id> --status in_progress`
4. Use the board to confirm the control result:
   - task DAG is sane
   - blocked tasks only exist where sequencing is real
   - pending approvals are visible on the board
5. When a human or delegated control decision is needed, use the review surface to:
   - inspect requested context
   - verify validations and artifacts
   - approve or reject with explicit feedback

Expected outputs:

- updated plan and dependency-safe task graph
- board state that matches the intended execution order
- an approval decision or a clearly recorded rejection path when control gates apply

Helpful artifacts:

- `.swarm/plan.md`
- approval payloads and validation records in the review surface
- artifact downloads through `GET /api/v1/artifacts/:id/content`

### 3. Diagnostics and recovery walkthrough

Use this when an external Codex session needs to diagnose codex-swarm runtime
or recovery behavior: stale placement, failed sessions, degraded nodes, or a
restore/DR event that puts run continuity at risk.

Grounding surfaces:

- run-detail screenshot: [user-run-detail.png](/home/florian/codex-swarm/docs/assets/screenshots/user-run-detail.png)
- run-detail walkthrough: [docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L69)
- DR runbook: [docs/operations/backup-restore-dr.md](/home/florian/codex-swarm/docs/operations/backup-restore-dr.md)

Workflow:

1. Validate runtime baseline:
   `GET /health`
   `GET /api/v1/metrics`
   `corepack pnpm --dir apps/api db:status`
2. Open `Run Detail` and inspect:
   - placement surface
   - sticky-node ownership
   - stale reasons
   - recovery surface metadata for sandbox, cwd, and worker node impact
3. If the issue looks data-plane or runtime specific, gather evidence:
   - task and approval state from the board
   - validation or log artifacts through `GET /api/v1/artifacts/:id/content`
   - current support-envelope status from metrics
4. If restore or DR validation is needed, use:
   `corepack pnpm ops:backup`
   `corepack pnpm ops:restore`
   `corepack pnpm ops:drill`
5. Only reopen traffic or mark recovery complete after:
   - restore/drill checks are green
   - `/health` and `db:status` match the running build
   - the affected run no longer shows unresolved stale or failed session state

Expected outputs:

- a bounded diagnosis: workflow issue, worker/runtime issue, or restore/DR issue
- preserved evidence for escalation
- a documented recovery result, not just an operator assumption

### 4. Execution monitoring and review handoff walkthrough

Use this when an external Codex session needs to verify that an active slice is
actually ready for review or PR preparation instead of only looking complete on
the board.

Grounding surfaces:

- execution/review skills: [validate-milestone](/home/florian/codex-swarm/.agents/skills/validate-milestone/SKILL.md), [prepare-pr](/home/florian/codex-swarm/.agents/skills/prepare-pr/SKILL.md)
- review screenshot: [user-review-console.png](/home/florian/codex-swarm/docs/assets/screenshots/user-review-console.png)
- board screenshot: [user-board-overview.png](/home/florian/codex-swarm/docs/assets/screenshots/user-board-overview.png)

Workflow:

1. Start from the board and identify the slice approaching review:
   - a run in `awaiting_approval`
   - a task lane near completion
   - recent validations that look current
2. Open the review surface and inspect:
   - approval request summary
   - validation history
   - artifact list
3. Use the repo's validation and handoff discipline before claiming the slice is done:
   - run the commands required by the active milestone
   - compare the result to [validate-milestone](/home/florian/codex-swarm/.agents/skills/validate-milestone/SKILL.md)
   - only move to handoff once the evidence is current
   - treat publish and PR handoff as two explicit steps: publish the branch first, then record provider PR metadata or a manual handoff payload
4. If the slice is genuinely reviewable, use [prepare-pr](/home/florian/codex-swarm/.agents/skills/prepare-pr/SKILL.md) to gather:
   - commit summary
   - reviewer-facing notes
   - rollout or operational caveats
5. Leave the system in one of two explicit states:
   - approved and handoff-ready
   - rejected or still in-progress with the missing evidence called out

Expected outputs:

- a clear go or no-go review decision
- validation-backed handoff notes instead of file-inventory prose
- a repeatable path from board state to review-ready slice

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
- If a repository record does not include `localPath`, the control plane validates provider connectivity with `git ls-remote`, records the discovered branches/default branch, and the worker runtime clones `repository.url` into the assigned worktree path using the requested branch or the repository default branch.
- Operators should use `localPath` only for trusted single-host flows where the source checkout lifecycle is already under explicit control.

### Artifact storage rules

- `POST /api/v1/artifacts` writes blob content into `ARTIFACT_STORAGE_ROOT` and records a control-plane download URL for the artifact.
- `GET /api/v1/artifacts/:id/content` is the supported retrieval path for operators, dashboards, and remote workers.
- Multi-node workers must be configured with an `artifactBaseUrl`; without it, the runtime dependency check leaves the node unschedulable for remote execution.

### Codex MCP transport rules

- Single-host workers should keep `codexTransport.kind = "stdio"` and run the local `codex mcp-server` subprocess.
- Remote or shared-service worker deployments can set `codexTransport.kind = "streamable_http"` with the shared MCP endpoint URL and headers in the worker runtime/bootstrap envelope.
- The runtime uses MCP Streamable HTTP request framing for that path: one POST per JSON-RPC message, `Accept: application/json, text/event-stream`, and `MCP-Protocol-Version`.
- For remote/shared services, bind the MCP server safely, validate `Origin`, and require authentication on the HTTP endpoint per the current MCP transport guidance.

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
