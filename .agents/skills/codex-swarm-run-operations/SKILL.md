---
name: codex-swarm-run-operations
description: Operate Codex Swarm runs through the shipped frontend surfaces and HTTP control plane.
---

# codex-swarm-run-operations

## Purpose

Operate Codex Swarm runs through the real product surfaces: projects, ad-hoc
runs, run overview, board, lifecycle, review, and the `/api/v1` control plane.

## Trigger Conditions

Use this skill when the user asks to:

- create, inspect, start, stop, or update a run
- inspect task, agent, artifact, or message state for a run
- move from project context into run execution context
- understand why a run looks stuck, busy, or finished from the product side

## Required Inputs

- API base URL
- bearer token for `/api/v1/*`
- optional `PROJECT_ID`
- optional `RUN_ID`
- repo checkout access if follow-up validation commands are needed

## Primary Codex Swarm Surfaces

- frontend routes:
  - `/projects`
  - `/projects/:projectId/runs`
  - `/adhoc-runs`
  - `/runs/:runId/overview`
  - `/runs/:runId/board`
  - `/runs/:runId/lifecycle`
  - `/runs/:runId/review`
- HTTP routes:
  - `GET /api/v1/projects`
  - `GET /api/v1/runs`
  - `GET /api/v1/runs/:id`
  - `POST /api/v1/runs`
  - `POST /api/v1/runs/:id/start`
  - `PATCH /api/v1/runs/:id/status`
  - `GET /api/v1/tasks?runId=<id>`
  - `GET /api/v1/agents?runId=<id>`
  - `GET /api/v1/messages?runId=<id>`
  - `GET /api/v1/artifacts?runId=<id>`

## Concrete Commands and Routes

1. List project or ad-hoc runs:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/runs" | jq`
2. Inspect one run in full:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/runs/$RUN_ID" | jq`
3. Create a run:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/runs" \
     -d '{
       "goal":"Investigate failing webhook flow",
       "repositoryId":"<repository-id>",
       "projectId":"<project-id-or-null>"
     }' | jq
   ```
4. Start a pending run explicitly:
   `curl -s -X POST -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/runs/$RUN_ID/start" | jq`
5. Inspect run-scoped tasks, agents, messages, and artifacts:
   ```bash
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/tasks?runId=$RUN_ID" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/agents?runId=$RUN_ID" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/messages?runId=$RUN_ID" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/artifacts?runId=$RUN_ID" | jq
   ```

## Expected Outputs

- the current run state and stage
- the run's task, agent, artifact, and message context
- the next safe action: continue monitoring, start the run, review it, or hand
  off to diagnostics, worker lifecycle, or recovery

## Workflow

1. Start with the frontend route that matches the user context: project runs for
   project-backed work, ad-hoc runs for unscoped work, or a direct run route for
   execution detail.
2. Confirm the run summary with `GET /api/v1/runs/:id` before making any claim
   about task or agent progress.
3. Use run subpages intentionally:
   - `overview` for summary and artifacts
   - `board` for execution ordering and blockers
   - `lifecycle` for placement, sessions, and events
   - `review` for approval and validation evidence
4. Use run-scoped list routes for exact evidence instead of relying on one
   aggregated screen alone.
5. Escalate to worker lifecycle, diagnostics, review/governance, or
   recovery/restore if the issue is no longer just run execution.

## Guardrails

- Do not describe Codex Swarm execution through another product's board or
  inbox terms.
- Do not claim a run is healthy from the board alone when run detail, tasks, or
  agents disagree.
- Do not mutate run status until the current run state has been read first.
