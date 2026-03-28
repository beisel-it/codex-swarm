# Operational SLO and Support Envelope

## Supported objectives

Codex Swarm M6 exposes its operator envelope through `GET /api/v1/metrics`.

The supported objectives are:

- pending approvals should stay within `SLO_PENDING_APPROVAL_MAX_MINUTES` of creation
- active runs should stay within `SLO_ACTIVE_RUN_MAX_MINUTES` of creation
- pending task queue should stay below `SLO_TASK_QUEUE_MAX`
- support response expectation is `SLO_SUPPORT_RESPONSE_HOURS` during `SUPPORT_HOURS_UTC`

The API report returns both the configured objectives and the current measurements:

- `slo.objectives`
- `slo.measurements`
- `slo.status`

## Operational coverage

Covered in the support envelope:

- control-plane API availability and queue health
- pending approval backlog visibility
- governed run backlog visibility
- budgeted usage and cost totals from persisted run metadata
- basic duration baselines for completed runs, approval resolution, and validation turnaround

Not covered as a guaranteed service:

- 24x7 human response
- provider-specific credential brokering beyond the bounded Vault path documented in `security.md`
- infrastructure autoscaling or SRE-managed latency optimization beyond the documented baseline scripts

## Operator workflow

1. Retrieve the current envelope:
   `curl -H "Authorization: Bearer $DEV_AUTH_TOKEN" http://127.0.0.1:3000/api/v1/metrics`
2. Confirm `slo.status.withinEnvelope` is still `true`.
3. If an SLO field is false, use the detailed measurements to determine whether the issue is backlog age, queue growth, or broader failure counts.
4. Apply support escalation rules from `SUPPORT_ESCALATION` when the platform is outside the envelope.

## Support boundaries

- Incidents inside support hours are handled against the documented response objective, not a 24x7 paging promise.
- Restore and DR actions require explicit operator control and should follow `backup-restore-dr.md`.
- Sensitive-repository secret incidents remain governed by the policy and admin review surfaces delivered in Phase 5.
