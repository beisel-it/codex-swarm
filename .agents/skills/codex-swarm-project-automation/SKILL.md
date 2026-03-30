---
name: codex-swarm-project-automation
description: Configure projects, repositories, repeatable runs, and webhook-triggered automation in Codex Swarm.
---

# codex-swarm-project-automation

## Purpose

Configure Codex Swarm project structure and automation: projects,
repositories, repeatable runs, webhook triggers, and receipt inspection.

## Trigger Conditions

Use this skill when the user asks to:

- create or fix a project or repository setup
- attach repositories to projects
- create or update repeatable runs
- configure or debug webhook-triggered automation
- understand why a repeatable run or webhook trigger is not producing runs

## Required Inputs

- API base URL
- bearer token for `/api/v1/*`
- optional `PROJECT_ID`
- optional `REPOSITORY_ID`
- optional `REPEATABLE_RUN_ID` or `TRIGGER_ID`

## Primary Codex Swarm Surfaces

- frontend routes:
  - `/projects`
  - `/projects/:projectId/repositories`
  - `/projects/:projectId/runs`
  - `/projects/:projectId/automation`
  - `/projects/:projectId/settings`
- HTTP routes:
  - `GET /api/v1/projects`
  - `POST /api/v1/projects`
  - `PATCH /api/v1/projects/:id`
  - `GET /api/v1/repositories`
  - `POST /api/v1/repositories`
  - `PATCH /api/v1/repositories/:id`
  - `GET /api/v1/repeatable-runs`
  - `POST /api/v1/repeatable-runs`
  - `PATCH /api/v1/repeatable-runs/:id`
  - `GET /api/v1/repeatable-run-triggers`
  - `POST /api/v1/repeatable-run-triggers`
  - `PATCH /api/v1/repeatable-run-triggers/:id`
  - `GET /api/v1/external-event-receipts`
  - `POST /api/v1/webhooks/*`

## Concrete Commands and Routes

1. Inspect project and repository inventory:
   ```bash
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/projects" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/repositories" | jq
   ```
2. Create or update a project-backed repository:
   ```bash
   curl -s -X PATCH \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/repositories/$REPOSITORY_ID" \
     -d '{"projectId":"'$PROJECT_ID'"}' | jq
   ```
3. Inspect repeatable runs and triggers for a project:
   ```bash
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/repeatable-runs?projectId=$PROJECT_ID" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/repeatable-run-triggers" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/external-event-receipts" | jq
   ```
4. Create a repeatable run:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/repeatable-runs" \
     -d '{
       "repositoryId":"<repository-id>",
       "name":"PR review",
       "goal":"Review incoming pull requests",
       "status":"active",
       "execution":{"handoffMode":"manual"}
     }' | jq
   ```
5. Create a generic webhook trigger:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/repeatable-run-triggers" \
     -d '{
       "repeatableRunId":"<repeatable-run-id>",
       "name":"GitHub PR opened",
       "description":"Launch when a PR webhook arrives",
       "kind":"webhook",
       "enabled":true,
       "config":{
         "eventNameHeader":"x-github-event",
         "deliveryIdHeader":"x-github-delivery"
       }
     }' | jq
   ```

## Expected Outputs

- a correct project-to-repository mapping
- repeatable runs and triggers that match the intended automation behavior
- receipt evidence showing whether inbound events were accepted and linked to
  created runs
- a clear diagnosis when automation fails: bad project setup, trigger mismatch,
  disabled definition, or ingress issue

## Workflow

1. Confirm the project and repository relationship first.
2. Use the project automation surface for the product view, then cross-check the
   underlying repeatable-run and trigger records via API.
3. Treat webhook configuration as generic by default; use GitHub-specific fields
   only as optional headers or matching hints.
4. Inspect external event receipts before claiming the webhook ingress path is
   broken.
5. If a receipt exists but no useful run appears, hand off to run operations or
   diagnostics instead of continuing to tweak automation blindly.

## Guardrails

- Do not reintroduce user-authored webhook endpoint paths; Codex Swarm now
  generates them.
- Do not treat project-backed repositories as ad-hoc run targets.
- Do not document GitHub-specific presets as if Codex Swarm's trigger model were
  GitHub-only.
