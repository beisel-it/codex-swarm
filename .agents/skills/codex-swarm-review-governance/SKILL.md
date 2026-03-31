---
name: codex-swarm-review-governance
description: Drive review, approval, validation, handoff, and governance workflows in Codex Swarm.
---

# codex-swarm-review-governance

## Purpose

Drive Codex Swarm review and governance workflows: approvals, validation
evidence, artifacts, branch publish, pull-request handoff, audit export, and
policy/governance checks.

## Trigger Conditions

Use this skill when the user asks to:

- inspect or resolve a review decision
- understand approval state or provenance
- check validation evidence or artifacts before handoff
- publish a run branch or record PR handoff state
- inspect governance or audit discrepancies

## Required Inputs

- API base URL
- bearer token for `/api/v1/*`
- `RUN_ID`
- optional `APPROVAL_ID`
- optional artifact IDs when validation evidence needs expansion

## Primary Codex Swarm Surfaces

- frontend routes:
  - `/runs/:runId/review`
  - `/runs/:runId/overview`
  - `/settings`
- HTTP routes:
  - `GET /api/v1/approvals?runId=<id>`
  - `GET /api/v1/approvals/:id`
  - `PATCH /api/v1/approvals/:id`
  - `GET /api/v1/validations?runId=<id>`
  - `GET /api/v1/artifacts?runId=<id>`
  - `GET /api/v1/artifacts/:id/content`
  - `POST /api/v1/runs/:id/publish-branch`
  - `POST /api/v1/runs/:id/pull-request-handoff`
  - `GET /api/v1/runs/:id/audit-export`
  - `GET /api/v1/admin/governance-report`
  - `GET /api/v1/admin/secrets/integration-boundary`
  - `GET /api/v1/admin/secrets/access-plan/:id`

## Concrete Commands and Routes

1. Inspect review state for a run:
   ```bash
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/approvals?runId=$RUN_ID" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/validations?runId=$RUN_ID" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/artifacts?runId=$RUN_ID" | jq
   ```
2. Pull full audit context:
   `curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/runs/$RUN_ID/audit-export" | jq`
3. Publish the branch explicitly:
   `curl -s -X POST -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/runs/$RUN_ID/publish-branch" | jq`
4. Record or trigger pull-request handoff:
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer $DEV_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     "$BASE_URL/api/v1/runs/$RUN_ID/pull-request-handoff" \
     -d '{"provider":"github"}' | jq
   ```
5. Inspect governance posture:
   ```bash
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/admin/governance-report" | jq
   curl -s -H "Authorization: Bearer $DEV_AUTH_TOKEN" "$BASE_URL/api/v1/admin/secrets/integration-boundary" | jq
   ```

## Expected Outputs

- a clear review decision or missing-evidence diagnosis
- current validation and artifact posture
- branch publish and PR handoff state
- audit and governance evidence strong enough to distinguish UI confusion from
  backend truth

## Workflow

1. Start with the run review surface to understand the operator-facing state.
2. Pull approvals, validations, and artifacts through the API before deciding.
3. Treat branch publish and PR handoff as separate control actions.
4. Use audit export and governance routes when the question is provenance,
   policy, retention, or secret-access posture rather than simple review state.
5. If the evidence is stale or missing, send the issue back to run operations or
   milestone validation instead of forcing a review decision.

## Guardrails

- Do not describe governance through the removed global `Admin` surface; the
  live UI is `Settings` plus run-scoped review and audit surfaces.
- Do not approve from stale artifacts or outdated validation runs.
- Do not conflate branch publication success with PR handoff success.
