---
name: codex-swarm-worker-lifecycle
description: Operate Codex Swarm worker nodes, dispatch assignment, and placement state.
---

# codex-swarm-worker-lifecycle

## Purpose

Operate Codex Swarm worker-node lifecycle, dispatch assignment, and run
placement behavior using the shipped control-plane routes and lifecycle views.

## Trigger Conditions

Use this skill when the user asks to:

- inspect worker capacity or node health
- drain or reconcile a worker node
- debug why a run or task is not being claimed
- understand placement, sticky-node state, or session ownership

## Required Inputs

- API base URL
- bearer token for `/api/v1/*`
- optional `WORKER_NODE_ID`
- optional `RUN_ID`
- optional `ASSIGNMENT_ID`

## Primary Codex Swarm Surfaces

- frontend routes:
  - `/runs/:runId/lifecycle`
  - `/runs/:runId/board`
- HTTP routes:
  - `GET /api/v1/worker-nodes`
  - `POST /api/v1/worker-nodes`
  - `PATCH /api/v1/worker-nodes/:id/heartbeat`
  - `PATCH /api/v1/worker-nodes/:id/drain`
  - `POST /api/v1/worker-nodes/:id/claim-dispatch`
  - `POST /api/v1/worker-nodes/:id/reconcile`
  - `GET /api/v1/worker-dispatch-assignments`
  - `PATCH /api/v1/worker-dispatch-assignments/:id`
  - `POST /api/v1/worker-dispatch-assignments/:id/session`
  - `GET /api/v1/runs/:id`

## Concrete Commands and Routes

1. Inspect worker-node state:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/worker-nodes" | jq`
2. Inspect dispatch assignments:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/worker-dispatch-assignments" | jq`
3. Drain a node deliberately:
   ```bash
   curl -s -X PATCH \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/worker-nodes/$WORKER_NODE_ID/drain" \
     -d '{"drain":true,"reason":"maintenance"}' | jq
   ```
4. Reconcile an unhealthy node:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/worker-nodes/$WORKER_NODE_ID/reconcile" \
     -d '{"reason":"node_unreachable"}' | jq
   ```
5. Inspect run lifecycle after a node action:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/runs/$RUN_ID" | jq`

## Expected Outputs

- current worker-node and dispatch posture
- an explanation of whether the issue is capacity, drain state, stale placement,
  or unclaimed dispatch
- a concrete next action: monitor, drain, reconcile, or escalate to recovery

## Workflow

1. Inspect worker-node inventory before touching a node.
2. Cross-check the affected run's lifecycle surface so node actions are tied to
   real placement and session state.
3. Treat drain as planned capacity control and reconcile as error handling; do
   not mix them casually.
4. Re-read worker nodes and the affected run after any lifecycle mutation.
5. If the node issue cascades into stale worktrees, failed sessions, or restore
   concerns, hand off to recovery/restore.

## Guardrails

- Do not describe worker placement as a generic “agent inbox” or board-only
  problem.
- Do not reconcile a node before capturing pre-action worker and run evidence.
- Do not use worker lifecycle actions as a substitute for restore or cleanup
  workflows.
