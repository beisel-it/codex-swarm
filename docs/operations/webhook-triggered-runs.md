# Webhook-Triggered Repeatable Runs

Date: 2026-03-30
Owner: technical-writer

## Scope

This delivery adds the first external trigger type for repeatable runs:
configured webhook ingress.

What is included now:

- define a repeatable run for a repository
- attach a webhook trigger to that repeatable run
- accept inbound webhook requests on a public `/api/v1/webhooks/*` path
- persist an external event receipt for every accepted or rejected delivery
- create a new run when the configured trigger matches the incoming request
- attach trigger metadata and the received event envelope to `run.context`
- forward that run context into leader and worker prompts

What is intentionally out of scope for this delivery:

- service-specific integrations such as GitHub, GitLab, Atlassian, or Microsoft connection packs
- upstream provider OAuth setup or managed connection objects
- vendor-specific event normalization beyond the generic webhook envelope
- prebuilt trigger catalogs for provider event types

Those service-specific connection layers are future work. The current slice is a
generic webhook ingress path plus repeatable-run configuration.

## Operator Setup

### 1. Create a repeatable run definition

Use the repeatable-runs surface in the frontend or `POST /api/v1/repeatable-runs`
to store the reusable execution settings.

Minimum fields:

- `repositoryId`
- `name`
- `status`
- `execution.goal`

Common optional fields:

- `execution.branchName`
- `execution.planArtifactPath`
- `execution.concurrencyCap`
- `execution.policyProfile`
- `execution.metadata`

Example:

```json
{
  "repositoryId": "<repository-id>",
  "name": "PR review",
  "description": "Review newly opened pull requests",
  "status": "active",
  "execution": {
    "goal": "Review the new PR and report risks",
    "branchName": "main",
    "planArtifactPath": null,
    "budgetTokens": null,
    "budgetCostUsd": null,
    "concurrencyCap": 1,
    "policyProfile": "standard",
    "metadata": {
      "preset": "pr-review"
    }
  }
}
```

### 2. Create a webhook trigger

Attach a trigger with `POST /api/v1/repeatable-run-triggers` or through the
repeatable-runs panel.

Important fields:

- `repeatableRunId`: which stored run definition to launch
- `config.endpointPath`: the public webhook suffix under `/api/v1`
- `config.allowedMethods`: currently `POST` and `PUT` are supported
- `config.secretRef`: optional environment variable name for shared-secret validation
- `config.signatureHeader`: optional header used for shared-secret validation
- `config.eventNameHeader`: optional header copied into `event.eventName`
- `config.deliveryIdHeader`: optional header copied into `event.eventId`
- `config.filters`: generic filters for event name, action, branch, and path

Example:

```json
{
  "repeatableRunId": "<repeatable-run-id>",
  "name": "PR opened webhook",
  "description": "Launch the PR review run for opened PRs on main",
  "enabled": true,
  "kind": "webhook",
  "config": {
    "endpointPath": "/webhooks/project/pr-review",
    "secretRef": "TEST_WEBHOOK_SECRET",
    "signatureHeader": "x-webhook-secret",
    "eventNameHeader": "x-event-name",
    "deliveryIdHeader": "x-delivery-id",
    "allowedMethods": ["POST"],
    "maxPayloadBytes": 1048576,
    "filters": {
      "eventNames": ["pull_request"],
      "actions": ["opened"],
      "branches": ["main"],
      "path": "/webhooks/project/pr-review",
      "metadata": {}
    },
    "metadata": {
      "source": "generic-webhook"
    }
  }
}
```

### 3. Send the webhook

Deliver the request to:

- `POST /api/v1/webhooks/project/pr-review`

Example:

```bash
curl -i \
  -X POST http://localhost:3000/api/v1/webhooks/project/pr-review \
  -H 'content-type: application/json' \
  -H 'x-webhook-secret: top-secret' \
  -H 'x-event-name: pull_request' \
  -H 'x-delivery-id: delivery-42' \
  --data '{
    "action": "opened",
    "pull_request": {
      "number": 42,
      "base": { "ref": "main" }
    }
  }'
```

Expected response:

```json
{
  "receiptId": "<receipt-id>",
  "status": "run_created",
  "runId": "<run-id>",
  "rejectionReason": null
}
```

## Expected Behavior

For every inbound webhook:

1. the API resolves the configured trigger by `endpointPath`
2. the request is normalized into a generic webhook event envelope
3. an `external_event_receipts` record is persisted with status `received`
4. trigger validation checks:
   - trigger enabled state
   - repeatable run status
   - allowed HTTP method
   - max payload size
   - optional shared-secret validation
   - configured filters for event name, action, and branch
5. on rejection, the receipt is updated to `rejected` and no run is created
6. on success, a new run is created as `createdBy = external-trigger`
7. the receipt is updated to `run_created` with `createdRunId`

## Run Context Shape

Webhook-triggered runs store the inbound event on `run.context.externalInput`.

Current field mapping:

- `run.context.externalInput.kind = "webhook"`
- `run.context.externalInput.trigger.id`: persisted trigger id
- `run.context.externalInput.trigger.repeatableRunId`: stored repeatable-run definition id
- `run.context.externalInput.trigger.name`: configured trigger name
- `run.context.externalInput.trigger.kind = "webhook"`
- `run.context.externalInput.trigger.metadata`: arbitrary trigger metadata from configuration
- `run.context.externalInput.event.sourceType = "webhook"`
- `run.context.externalInput.event.eventId`: delivery id header value, or a generated UUID when the header is absent
- `run.context.externalInput.event.eventName`: event-name header value when configured
- `run.context.externalInput.event.action`: `payload.action` when present
- `run.context.externalInput.event.payload`: raw webhook JSON body
- `run.context.externalInput.event.request`: method, path, query, headers, content metadata, remote address, and user agent
- `run.context.externalInput.metadata.receiptId`: persisted audit receipt id

The run also keeps linkage in `run.metadata`:

- `run.metadata.repeatableRun.id`
- `run.metadata.repeatableRun.name`
- `run.metadata.externalEventReceiptId`

## Where Operators Observe It

Primary observation points:

- repeatable-runs panel in the frontend:
  - configured repeatable runs
  - webhook triggers
  - recent delivery receipts and statuses
- board and run detail:
  - the created run appears like any other run
  - the run is attributable to `createdBy = external-trigger`
- `GET /api/v1/external-event-receipts`:
  - list receipts by repository, repeatable run, or trigger
- `GET /api/v1/runs` and run detail payloads:
  - inspect `context.externalInput` and `metadata.externalEventReceiptId`

Prompt propagation:

- leader planning prompts include `Run context:` when `externalInput` is present
- worker execution prompts include the same structured run context

That means downstream agents can inspect the original trigger metadata and
event payload without any webhook-specific branch in the core execution loop.

## Debugging And Audit Checklist

When a webhook-triggered run does not appear as expected, check these in order:

1. Trigger configuration
   - confirm the trigger is enabled
   - confirm `config.endpointPath` matches the public URL exactly
   - confirm `allowedMethods`, filter values, and `maxPayloadBytes`
2. Secret validation
   - confirm the configured `secretRef` environment variable exists on the API process
   - confirm the request sent the expected `signatureHeader`
3. Receipt state
   - inspect `GET /api/v1/external-event-receipts`
   - look for `status`, `rejectionReason`, `createdRunId`, and the stored request envelope
4. Run creation
   - if the receipt is `run_created`, confirm the linked `runId` exists
   - inspect `run.metadata.externalEventReceiptId`
   - inspect `run.context.externalInput`
5. Execution handoff
   - verify the created run enters the normal execution lifecycle
   - inspect leader or worker prompt context when validating downstream behavior

Common outcomes:

- `rejected` with a rejection reason:
  trigger matched the path but failed validation
- `run_created` with a `createdRunId`:
  webhook ingress succeeded and the run was queued
- `failed`:
  receipt persistence succeeded but run creation failed after validation

## Current Operator Notes

- Webhook ingress is intentionally public and bypasses bearer auth; it relies on
  configured trigger matching and optional shared-secret validation instead.
- The event envelope is generic by design. Operators should not assume
  provider-specific semantics beyond the configured headers and raw payload.
- If a project needs provider-aware connection management, prebuilt service
  event catalogs, or vendor-specific signing logic, that belongs to a later
  service-integration milestone, not this delivery.
