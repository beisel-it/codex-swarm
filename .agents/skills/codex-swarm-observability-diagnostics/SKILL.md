---
name: codex-swarm-observability-diagnostics
description: Diagnose Codex Swarm health, metrics, events, agent visibility, and runtime anomalies.
---

# codex-swarm-observability-diagnostics

## Purpose

Diagnose Codex Swarm platform health and runtime anomalies using the shipped
health, metrics, run, event, agent, and observability surfaces.

## Trigger Conditions

Use this skill when the user asks to:

- explain whether the platform is healthy
- inspect queue pressure, failures, or support-envelope drift
- diagnose a stalled or noisy run
- inspect agent transcript visibility or observability gaps

## Required Inputs

- API base URL
- bearer token for `/api/v1/*`
- optional `RUN_ID`
- repo checkout access if smoke or DB status checks are needed

## Primary Codex Swarm Surfaces

- frontend routes:
  - `/projects`
  - `/adhoc-runs`
  - `/runs/:runId/board`
  - `/runs/:runId/lifecycle`
- HTTP routes:
  - `GET /health`
  - `GET /api/v1/metrics`
  - `GET /api/v1/runs`
  - `GET /api/v1/runs/:id`
  - `GET /api/v1/events?runId=<id>&limit=<n>`
  - `GET /api/v1/agents?runId=<id>`
  - `GET /api/v1/worker-nodes`
  - `GET /api/v1/sessions/:id/transcript`
- local commands:
  - `corepack pnpm --dir apps/api db:status`
  - `SMOKE_BASE_URL="$BASE_URL" DEV_AUTH_TOKEN="$DEV_AUTH_TOKEN" corepack pnpm ops:smoke`

## Concrete Commands and Routes

1. Establish the baseline:
   ```bash
   curl -s "$BASE_URL/health" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/metrics" | jq
   corepack pnpm --dir apps/api db:status
   ```
2. If the issue is run-specific, inspect run, events, and agents:
   ```bash
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/runs/$RUN_ID" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/events?runId=$RUN_ID&limit=100" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/agents?runId=$RUN_ID" | jq
   ```
3. Inspect node posture when the problem may be runtime rather than workflow:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/worker-nodes" | jq`
4. Run the smoke path when bounded end-to-end evidence is needed:
   `SMOKE_BASE_URL="$BASE_URL" DEV_AUTH_TOKEN="$DEV_AUTH_TOKEN" corepack pnpm ops:smoke`

## Expected Outputs

- a bounded diagnosis naming the failing surface
- evidence from health, metrics, run, events, agents, or workers
- a next step: continue monitoring, move to worker lifecycle, move to recovery,
  or fix a product/workflow issue

## Workflow

1. Always start with `/health`, `/api/v1/metrics`, and `db:status`.
2. Narrow to run-level evidence only after you know the problem is scoped.
3. Use events and agent visibility to distinguish execution delay from broken
   observability.
4. Use smoke testing when you need a bounded product-level confirmation rather
   than one API route in isolation.
5. Escalate to worker lifecycle or recovery only after the evidence shows the
   problem is deeper than run-state inspection.

## Guardrails

- Do not diagnose from frontend appearance alone when API evidence exists.
- Do not jump straight to recovery mutations from a metrics symptom.
- Do not use outdated control-model language to explain Codex Swarm
  observability behavior.
