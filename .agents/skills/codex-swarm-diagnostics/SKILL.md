# codex-swarm-diagnostics

## Purpose

Diagnose Codex Swarm health, queue pressure, worker-state drift, and run-level
failures from an external Codex session using the repo's live operator
surfaces.

## Trigger Conditions

Use this skill when the user asks to:

- diagnose why Codex Swarm is unhealthy or outside its support envelope
- inspect a stalled, retrying, or blocked run
- determine whether the issue is queue growth, worker-node state, or broader
  platform health
- gather the evidence needed before a recovery action

## Required Inputs

- API base URL for the running Codex Swarm control plane
- bearer token for `/api/v1/*`
- optional `RUN_ID` when the issue is scoped to one run
- repo checkout access when local runbook commands such as `db:status` or
  `ops:smoke` are needed

## Concrete Commands

1. Re-anchor on the repo runbooks:
   - `README.md`
   - `docs/operator-guide.md`
   - `docs/support-playbooks.md`
2. Check health and version posture:
   `curl -s "$BASE_URL/health" | jq`
   `corepack pnpm --dir apps/api db:status`
3. Capture operator-envelope metrics:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/metrics" | jq`
4. If the issue is run-specific, inspect run detail:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/runs/$RUN_ID" | jq`
5. Inspect the event timeline for the affected run:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/events?runId=$RUN_ID&limit=100" | jq`
6. Inspect worker availability and drain posture:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/worker-nodes" | jq`
7. If you need an end-to-end bounded confirmation, run the shipped smoke path:
   `SMOKE_BASE_URL="$BASE_URL" DEV_AUTH_TOKEN="$DEV_AUTH_TOKEN" corepack pnpm ops:smoke`
8. Use `clawteam` only when you need to confirm active ownership or follow-up expectations:
   `clawteam task list codex-swarm --owner devops`
   `clawteam inbox peek codex-swarm --agent devops`

## Expected Outputs

- a concise diagnosis naming the failing surface
- the exact health, metrics, run, event, or worker evidence used
- a recommendation for the next safe action: monitor, reconcile, cleanup dry
  run, restore path, or escalation

## Workflow

1. Start with `/health`, `db:status`, and `/api/v1/metrics`.
2. Narrow to `/api/v1/runs/:id`, `/api/v1/events`, and `/api/v1/worker-nodes`
   only after you know the issue is scoped.
3. Prefer repo-supported smoke verification over ad hoc probing when you need a
   bounded end-to-end check.
4. Use `clawteam` only as a coordination overlay, not as a substitute for the
   Codex Swarm product surfaces.

## Guardrails

- do not diagnose from task metadata alone when API or runbook evidence exists
- do not recommend recovery mutations before capturing pre-action evidence
- do not drift into generic ClawTeam guidance
