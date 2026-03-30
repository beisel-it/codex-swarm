# Webhook-Triggered Repeatable Runs Verification

Date: 2026-03-30
Owner: technical-writer
Task: Verify end-to-end behavior and document operator workflow
Source of truth: `.swarm/plan.md` task 6

## Verdict

- pass

## Summary

The current webhook-triggered repeatable-run slice satisfies the documented
delivery scope for generic webhook ingestion. Verification covers:

- repeatable-run configuration surfaces
- webhook receipt and validation
- receipt-to-run linkage
- propagation of trigger metadata and event payload into `run.context`
- downstream prompt visibility for leader and worker execution

Service-specific integrations remain explicitly out of scope.

## Coverage Matrix

### 1. Webhook ingress creates the intended run

Evidence:

- `apps/api/test/webhook-route.test.ts`
- `apps/api/test/control-plane-service.webhooks.test.ts`

Verified behavior:

- public webhook ingress is accepted on `/api/v1/webhooks/*` without bearer auth
- the API forwards normalized request data into `ingestWebhook`
- a matching trigger creates a run and returns `receiptId`, `status`, and `runId`
- the created run is attributed to `external-trigger`
- the receipt is updated to `run_created` with `createdRunId`

### 2. Event payload and trigger metadata are attached to run context

Evidence:

- `apps/api/test/control-plane-service.webhooks.test.ts`
- `packages/contracts/test/index.test.ts`

Verified behavior:

- `run.context.externalInput.kind` is `webhook`
- trigger id, repeatable-run id, name, kind, and metadata are attached
- event id, event name, action, raw payload, and request metadata are attached
- `run.context.externalInput.metadata.receiptId` links the created run back to the stored receipt
- run-context contracts accept and validate the stored shape

### 3. Downstream execution can observe the same context

Evidence:

- `packages/orchestration/test/index.test.ts`
- `apps/api/test/app.test.ts`

Verified behavior:

- leader planning prompts include structured run context when external input exists
- worker execution prompts include the same structured context
- ad-hoc runs without external input still omit run-context output, so manual runs are not regressed

### 4. Rejections still preserve audit evidence

Evidence:

- `apps/api/test/control-plane-service.webhooks.test.ts`

Verified behavior:

- requests that fail configured filters are rejected without creating a run
- the external event receipt is still persisted for audit/debugging
- rejection reasons are stored on the receipt

## Operator Reproduction

Recommended local validation commands:

- `corepack pnpm --dir packages/contracts test`
- `corepack pnpm --dir packages/orchestration test`
- `corepack pnpm --dir apps/api test`

Recommended manual operator walkthrough:

1. create a repeatable run definition for a repository
2. create a webhook trigger with a unique endpoint path
3. send a matching webhook to `/api/v1/webhooks/<path>`
4. confirm the HTTP response returns `status: "run_created"` and a `runId`
5. inspect `GET /api/v1/external-event-receipts` for the stored receipt
6. inspect the created run and confirm `context.externalInput` contains the inbound event
7. confirm leader and worker prompt context includes the same event envelope during execution

## Scope And Non-Goals Check

Confirmed in code and docs:

- current support is a generic webhook trigger model only
- the data model leaves room for future external input types
- no provider-specific connection packs, OAuth flows, or service adapters are delivered in this slice
- no ready-made GitHub, GitLab, Atlassian, or Microsoft integrations are implied by the current implementation

## Residual Risks

1. Verification is strong at the API and prompt-contract layers, but there is no single full-stack browser-driven E2E test that exercises UI configuration through live webhook delivery in one test process.
2. `event.eventName` depends on a configured header today; payload-derived provider normalization is future work.
3. Shared-secret validation is generic header equality, not provider-specific signing logic.
