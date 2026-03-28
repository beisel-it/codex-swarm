# M7 DevOps Parity Review

This document records devops-owned M7 roadmap parity checks against the live repository state.

## 09ee2cf4 — Review [112] Shared artifact store

- Roadmap entry: `ROADMAP.md` Phase 4, Distributed execution, Remote operation model, `Shared artifact store`
- Verdict: `gap`
- Reasoning: the distributed worker runtime only models shared artifact access as an optional configuration hint and explicitly permits local-only artifact uploads when that URL is absent. The control plane persists artifact metadata and paths, but it does not implement shared blob storage, upload brokering, or artifact retrieval from a common remote store.

Evidence:

- [ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md): `Shared artifact store` is listed as a Phase 4 remote-operation commitment.
- [apps/worker/src/dispatch.ts](/home/florian/codex-swarm/apps/worker/src/dispatch.ts): `evaluateWorkerRuntimeDependencies()` marks `artifact_store` as `degraded` when `artifactBaseUrl` is missing and says `artifact uploads remain local-only`.
- [packages/contracts/src/index.ts](/home/florian/codex-swarm/packages/contracts/src/index.ts): `workerNodeRuntimeSchema` makes `artifactBaseUrl` optional rather than required for remote workers.
- [apps/worker/test/dispatch.test.ts](/home/florian/codex-swarm/apps/worker/test/dispatch.test.ts): the runtime bootstrap test asserts the degraded `local-only` artifact path as expected behavior.
- [apps/api/src/routes/artifacts.ts](/home/florian/codex-swarm/apps/api/src/routes/artifacts.ts): the artifact API only creates and lists artifact records.
- [apps/api/src/services/control-plane-service.ts](/home/florian/codex-swarm/apps/api/src/services/control-plane-service.ts): `createArtifact()` stores artifact metadata and `path`, but there is no shared-store upload, fetch, or synchronization implementation.
- [docs/reference-deployments.md](/home/florian/codex-swarm/docs/reference-deployments.md): the multi-node deployment doc mentions a `shared artifact access path`, but it does not document an implemented shared store workflow.

Residual risks:

- Multi-node runs cannot rely on artifacts being readable across nodes unless operators add their own out-of-band storage path.
- Validation evidence and review artifacts may diverge from the roadmap promise in remote-worker deployments.
- GA deployment documentation currently overstates Phase 4 parity on artifact sharing.

Backlog follow-up:

- Create a new backlog item to implement a real shared artifact store path for remote workers, including upload and retrieval semantics, or explicitly narrow the roadmap/deployment claim to metadata-only artifact tracking.

## 186ffaf5 — Review [115] MCP transport evolution

- Roadmap entry: `ROADMAP.md` Phase 4, Distributed execution, MCP transport evolution, `prefer stdio locally and streamable HTTP for remote/shared services`
- Verdict: `gap`
- Reasoning: the live worker runtime implements only local stdio `codex mcp-server` command construction and request payload builders. There is no remote HTTP MCP transport implementation, no streamable HTTP client/server path for shared services, and no operator doc that shows such a transport being deployed.

Evidence:

- [ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md): the Phase 4 MCP transport entry explicitly calls for `prefer stdio locally and streamable HTTP for remote/shared services`.
- [apps/worker/src/runtime.ts](/home/florian/codex-swarm/apps/worker/src/runtime.ts): `buildCodexServerCommand()` only constructs a local `codex mcp-server` process invocation and does not model an HTTP transport.
- [apps/worker/src/runtime.ts](/home/florian/codex-swarm/apps/worker/src/runtime.ts): `buildCodexSessionStartRequest()` and `buildCodexSessionReplyRequest()` build local tool invocation payloads, not remote transport envelopes.
- [apps/worker/test/runtime.test.ts](/home/florian/codex-swarm/apps/worker/test/runtime.test.ts): tests verify the stdio command shape and local request payloads only.
- [docs/reference-deployments.md](/home/florian/codex-swarm/docs/reference-deployments.md): the multi-node deployment reference documents shared Postgres, Redis, and artifact access, but does not describe any remote MCP HTTP transport path.
- Repo-wide search for `streamable`, `SSE`, and MCP-over-HTTP transport terms finds the roadmap/review text and stdio-oriented worker runtime code, but no remote implementation surface.

Residual risks:

- Remote workers currently rely on ad hoc runtime assumptions rather than a documented or implemented MCP-over-HTTP transport boundary.
- The roadmap claim suggests transport evolution away from stdio-only local execution, but operators cannot validate or deploy that split from the current repo.
- Distributed debugging and compatibility expectations may be overstated until a remote/shared MCP transport exists.

Backlog follow-up:

- Create a backlog item for a concrete MCP-over-HTTP transport implementation and operator runbook for remote/shared services, or narrow the roadmap wording to match the current stdio-only runtime.

## 42381f59 — Review [010] Confirm security defaults

- Roadmap entry: `ROADMAP.md` Phase 0, Scope, `Confirm security defaults: sandbox, approvals, secret scope`
- Verdict: `better`
- Reasoning: the repo does not just note these defaults architecturally. It encodes worker sandbox and approval defaults in the runtime helpers, publishes operator-facing secret-boundary configuration, and exposes governed secret-scope inspection routes for admins.

Evidence:

- [apps/worker/src/index.ts](/home/florian/codex-swarm/apps/worker/src/index.ts): the runnable worker example uses `sandbox: "workspace-write"` and `approvalPolicy: "on-request"` as explicit defaults for Codex sessions.
- [apps/worker/src/runtime.ts](/home/florian/codex-swarm/apps/worker/src/runtime.ts): `buildCodexServerCommand()` and session request builders carry sandbox and approval-policy values into worker execution.
- [apps/worker/test/runtime.test.ts](/home/florian/codex-swarm/apps/worker/test/runtime.test.ts): tests cover the stdio command shape with explicit sandbox and approval-policy arguments.
- [apps/api/src/lib/governance-config.ts](/home/florian/codex-swarm/apps/api/src/lib/governance-config.ts): the control plane computes a secret-integration boundary and repository-specific access plan rather than leaving secret scope informal.
- [.env.example](/home/florian/codex-swarm/.env.example): operators get explicit secret-scope controls through `REMOTE_SECRET_ENV_NAMES`, `SECRET_ALLOWED_TRUST_LEVELS`, `SENSITIVE_POLICY_PROFILES`, and `SECRET_DISTRIBUTION_BOUNDARY`.
- [docs/operations/security.md](/home/florian/codex-swarm/docs/operations/security.md): the distribution boundary states that remote workers only receive task-scoped secret env vars and that sensitive repositories must use the brokered path.
- [README.md](/home/florian/codex-swarm/README.md): admin-facing secret boundary endpoints are documented for inspection and operations.

Residual risks:

- Sandbox and approval defaults are explicit, but repo-specific overrides and stricter profiles rely on higher-level orchestration paths that are reviewed in separate roadmap items.

## 363f9807 — Review [069] OpenAI tracing integration

- Roadmap entry: `ROADMAP.md` Phase 2, Observability, `Integrate OpenAI tracing`
- Verdict: `better`
- Reasoning: the implementation does more than a thin provider hook. It maintains local request trace context, emits stable trace headers, and forwards request metadata into the OpenAI tracing integration when the tracing module and export key are available.

Evidence:

- [apps/api/src/lib/observability.ts](/home/florian/codex-swarm/apps/api/src/lib/observability.ts): `loadTracingModule()` imports `@openai/agents`, `configureTracing()` sets the export API key and disabled state, and `withTrace()` forwards request metadata into `tracing.withTrace(...)`.
- [apps/api/src/lib/observability.ts](/home/florian/codex-swarm/apps/api/src/lib/observability.ts): `beginRequest()` creates or accepts `x-codex-trace-id` and returns it on the response for request correlation.
- [apps/api/src/db/schema.ts](/home/florian/codex-swarm/apps/api/src/db/schema.ts): control-plane events persist `traceId` durably.
- [apps/api/test/app.test.ts](/home/florian/codex-swarm/apps/api/test/app.test.ts): app tests exercise event and metrics surfaces that depend on the observability service wiring.

Residual risks:

- The repo proves integration wiring and trace propagation, but it does not include an end-to-end assertion against a live OpenAI tracing backend.

## 4bd84a60 — Review [070] Control-plane event timeline

- Roadmap entry: `ROADMAP.md` Phase 2, Observability, `Add control-plane event timeline`
- Verdict: `better`
- Reasoning: the repo includes a persisted event model, a queryable API route, trace and actor metadata on events, and documentation that carries the timeline into operator workflows.

Evidence:

- [apps/api/src/lib/observability.ts](/home/florian/codex-swarm/apps/api/src/lib/observability.ts): `recordTimelineEvent()` persists control-plane events with `traceId`, actor context, entity metadata, and timestamps, and `listEvents()` returns them in chronological order.
- [apps/api/src/routes/events.ts](/home/florian/codex-swarm/apps/api/src/routes/events.ts): `GET /api/v1/events` exposes the live event timeline.
- [apps/api/src/db/schema.ts](/home/florian/codex-swarm/apps/api/src/db/schema.ts): the `controlPlaneEvents` table provides durable storage for the timeline.
- [apps/api/test/app.test.ts](/home/florian/codex-swarm/apps/api/test/app.test.ts): tests cover the empty timeline fallback and delegated event timeline queries.
- [docs/operator-guide.md](/home/florian/codex-swarm/docs/operator-guide.md): operators are directed to use the observability surfaces, including `/api/v1/metrics`, in the operating loop; event evidence is also captured in audit and governance routes.

Residual risks:

- Operator docs emphasize metrics more directly than `/api/v1/events`, so event-timeline usage is currently stronger in API/test evidence than in runbook narrative.

## 72e17c2f — Review [071] Metrics for retries, failures, queue depth

- Roadmap entry: `ROADMAP.md` Phase 2, Observability, `Add metrics for retries, failures, queue depth`
- Verdict: `better`
- Reasoning: the required metrics exist and are exposed through `GET /api/v1/metrics`, and the implementation goes further by adding usage, cost, performance, and SLO envelope reporting on the same surface.

Evidence:

- [apps/api/src/lib/observability.ts](/home/florian/codex-swarm/apps/api/src/lib/observability.ts): `getMetrics()` returns `queueDepth`, `retries`, and `failures` directly from persisted control-plane state.
- [apps/api/src/routes/metrics.ts](/home/florian/codex-swarm/apps/api/src/routes/metrics.ts): `GET /api/v1/metrics` exposes the observability payload.
- [apps/api/test/app.test.ts](/home/florian/codex-swarm/apps/api/test/app.test.ts): tests cover the zeroed metrics fallback and injected live metrics payload, including queue depth, retry counts, and failures.
- [README.md](/home/florian/codex-swarm/README.md): the metrics route is documented as an operator-facing surface.
- [docs/operations/cost-usage-performance.md](/home/florian/codex-swarm/docs/operations/cost-usage-performance.md): runbook documents the expanded metrics contract.
- [docs/operations/slo-support.md](/home/florian/codex-swarm/docs/operations/slo-support.md): SLO operations are explicitly tied to `GET /api/v1/metrics`.

Residual risks:

- The metrics surface is operator-oriented rather than Prometheus-native, so external scraping/export compatibility is out of scope unless a later backlog item adds it.

## 5845d742 — Review [107] Queueing in Redis

- Roadmap entry: `ROADMAP.md` Phase 4, Scheduling, `Queueing in Redis`
- Verdict: `parity`
- Reasoning: the worker package implements Redis-backed pending, inflight, lease, and node-state queues, and the dispatch model is carried through shared contracts and control-plane API routes.

Evidence:

- [apps/worker/src/dispatch.ts](/home/florian/codex-swarm/apps/worker/src/dispatch.ts): `RedisDispatchQueue` implements enqueue, claim, acknowledge, requeue, and node-state coordination on Redis keys.
- [apps/worker/src/dispatch.ts](/home/florian/codex-swarm/apps/worker/src/dispatch.ts): `buildRedisDispatchQueueKeys()` standardizes the Redis namespace for pending, inflight, lease, and node-state structures.
- [packages/contracts/src/index.ts](/home/florian/codex-swarm/packages/contracts/src/index.ts): `workerDispatchAssignmentSchema` and related schemas define the durable queue payload shape.
- [apps/worker/test/dispatch.test.ts](/home/florian/codex-swarm/apps/worker/test/dispatch.test.ts): tests verify queue key generation, claiming, draining behavior, and retry requeue semantics.
- [apps/api/src/routes/worker-dispatch-assignments.ts](/home/florian/codex-swarm/apps/api/src/routes/worker-dispatch-assignments.ts): the API exposes dispatch assignment creation and update routes around the queue-backed workflow.

Residual risks:

- The repo proves Redis queue primitives and API integration, but not a production Redis client binding or live multi-node soak run inside this review artifact.

## ced3b858 — Review [111] Standardized worker bootstrap

- Roadmap entry: `ROADMAP.md` Phase 4, Remote operation model, `Standardized worker bootstrap`
- Verdict: `better`
- Reasoning: the bootstrap path is not just implied. It is encoded as a shared contract, a concrete environment envelope, and a dependency-check report that remote workers can evaluate before execution.

Evidence:

- [packages/contracts/src/index.ts](/home/florian/codex-swarm/packages/contracts/src/index.ts): `workerNodeRuntimeSchema`, `workerRuntimeDependencyCheckSchema`, and `remoteWorkerBootstrapSchema` define the shared bootstrap envelope.
- [apps/worker/src/dispatch.ts](/home/florian/codex-swarm/apps/worker/src/dispatch.ts): `buildRemoteWorkerBootstrap()` emits a standardized runtime, dispatch, environment, and dependency-check structure.
- [apps/worker/src/dispatch.ts](/home/florian/codex-swarm/apps/worker/src/dispatch.ts): `evaluateWorkerRuntimeDependencies()` validates control-plane, Postgres, Redis, artifact, Codex CLI, and workspace-root dependencies.
- [apps/worker/test/dispatch.test.ts](/home/florian/codex-swarm/apps/worker/test/dispatch.test.ts): tests assert the bootstrap environment and dependency checks.
- [docs/architecture/m4-delivery-plan.md](/home/florian/codex-swarm/docs/architecture/m4-delivery-plan.md): Track 2 explicitly names standardized worker bootstrap as a devops deliverable and the implementation matches that shape.

Residual risks:

- The bootstrap contract is well defined, but there is still no fully documented worker startup command or supervisor example for a real remote node lifecycle.

## 22e70264 — Review [113] Central Postgres + Redis

- Roadmap entry: `ROADMAP.md` Phase 4, Remote operation model, `Central Postgres + Redis`
- Verdict: `parity`
- Reasoning: remote worker runtime assumptions and deployment docs consistently center Postgres and Redis as shared services reachable by all nodes.

Evidence:

- [packages/contracts/src/index.ts](/home/florian/codex-swarm/packages/contracts/src/index.ts): `workerNodeRuntimeSchema` requires `postgresUrl` and `redisUrl`.
- [apps/worker/src/dispatch.ts](/home/florian/codex-swarm/apps/worker/src/dispatch.ts): runtime dependency checks mark Postgres and Redis as required dependencies and inject both into the bootstrap environment.
- [apps/worker/test/dispatch.test.ts](/home/florian/codex-swarm/apps/worker/test/dispatch.test.ts): bootstrap tests use shared Postgres and Redis URLs for remote worker runtime.
- [docs/reference-deployments.md](/home/florian/codex-swarm/docs/reference-deployments.md): the multi-node reference deployment lists shared Postgres and shared Redis as required components.
- [apps/api/scripts/ops/control-plane-snapshot.mjs](/home/florian/codex-swarm/apps/api/scripts/ops/control-plane-snapshot.mjs): backup and DR tooling operate against the centralized control-plane database model, reinforcing the shared-state deployment posture.

Residual risks:

- This verifies the central-service model and runtime contract, but not HA topologies or Redis/Postgres failover behavior; those remain operational concerns outside the original roadmap wording.

## b8282ec0 — Review [114] Secure credential distribution pattern

- Roadmap entry: `ROADMAP.md` Phase 4, Remote operation model, `Secure credential distribution pattern`
- Verdict: `better`
- Reasoning: the repo defines a narrow, policy-aware credential boundary instead of leaving remote secret flow implicit. Workers receive only declared task-scoped env names, and governed repositories are forced into a brokered path.

Evidence:

- [.env.example](/home/florian/codex-swarm/.env.example): `REMOTE_SECRET_ENV_NAMES`, `SECRET_ALLOWED_TRUST_LEVELS`, `SENSITIVE_POLICY_PROFILES`, and `SECRET_DISTRIBUTION_BOUNDARY` expose the operator-configured credential boundary.
- [apps/api/src/lib/governance-config.ts](/home/florian/codex-swarm/apps/api/src/lib/governance-config.ts): the control plane computes repository-specific secret access plans, including `allowed`, `brokered`, and `denied` outcomes.
- [docs/operations/security.md](/home/florian/codex-swarm/docs/operations/security.md): the documented distribution boundary says API/control-plane owns policy evaluation and remote workers receive only task-scoped env vars.
- [README.md](/home/florian/codex-swarm/README.md): governed-repo setup points operators to the bounded external-manager path and task-scoped credential names.
- [apps/api/test/app.test.ts](/home/florian/codex-swarm/apps/api/test/app.test.ts): governance tests cover secret integration boundary and repository access-plan payloads.

Residual risks:

- The pattern is intentionally narrow and policy-driven, not a generalized secret broker for multiple providers or arbitrary per-task credential minting.

## e5292537 — Review [128] Retention controls

- Roadmap entry: `ROADMAP.md` Phase 5, Scope, `Retention controls`
- Verdict: `better`
- Reasoning: retention is not just documented. The control plane computes retention posture, exposes it in governance reporting and audit exports, and can reconcile retention metadata onto governed runs, artifacts, and events through an admin write path.

Evidence:

- [apps/api/src/services/control-plane-service.ts](/home/florian/codex-swarm/apps/api/src/services/control-plane-service.ts): `getGovernanceAdminReport()` and `exportRunAudit()` compute retention summaries for runs, artifacts, and events.
- [apps/api/src/services/control-plane-service.ts](/home/florian/codex-swarm/apps/api/src/services/control-plane-service.ts): `reconcileGovernanceRetention()` applies retention metadata with dry-run or apply semantics.
- [apps/api/src/routes/admin.ts](/home/florian/codex-swarm/apps/api/src/routes/admin.ts): `POST /api/v1/admin/retention/reconcile` exposes the admin reconciliation path with timeline recording.
- [packages/contracts/src/index.ts](/home/florian/codex-swarm/packages/contracts/src/index.ts): retention policy and reconcile-report contracts are defined in shared schemas.
- [apps/api/test/app.test.ts](/home/florian/codex-swarm/apps/api/test/app.test.ts): app tests cover governance report and retention reconcile routes.
- [apps/api/test/control-plane-service.governance.test.ts](/home/florian/codex-swarm/apps/api/test/control-plane-service.governance.test.ts): service tests cover governed retention summaries and metadata application.
- [docs/admin-guide.md](/home/florian/codex-swarm/docs/admin-guide.md): admins are instructed to dry-run and then apply retention changes through supported surfaces.

Residual risks:

- The current retention flow applies metadata rather than physically deleting governed data, so downstream purge enforcement would need an additional backlog item if hard deletion becomes required.

## 98b7b40f — Review [129] Secret source integrations

- Roadmap entry: `ROADMAP.md` Phase 5, Scope, `Secret source integrations`
- Verdict: `better`
- Reasoning: the repo implements a deliberately narrow but real integration surface: environment-based defaults plus a bounded external-manager path for governed repositories, with policy-aware access planning and admin inspection routes.

Evidence:

- [.env.example](/home/florian/codex-swarm/.env.example): operators configure `SECRET_SOURCE_MODE`, `SECRET_PROVIDER`, `REMOTE_SECRET_ENV_NAMES`, `SECRET_ALLOWED_TRUST_LEVELS`, and `POLICY_DRIVEN_SECRET_ACCESS`.
- [apps/api/src/lib/governance-config.ts](/home/florian/codex-swarm/apps/api/src/lib/governance-config.ts): the control plane derives secret integration boundaries and repository access plans from live config.
- [apps/api/src/routes/admin.ts](/home/florian/codex-swarm/apps/api/src/routes/admin.ts): `GET /api/v1/admin/secrets/integration-boundary` and `GET /api/v1/admin/secrets/access-plan/:id` expose supported integration state without DB access.
- [apps/api/src/services/control-plane-service.ts](/home/florian/codex-swarm/apps/api/src/services/control-plane-service.ts): repository secret access plans are computed as `allowed`, `brokered`, or `denied`.
- [docs/operations/security.md](/home/florian/codex-swarm/docs/operations/security.md): the supported external-manager path is documented as `vault` for governed repositories, with explicit worker-scoped credential boundaries.
- [docs/admin-guide.md](/home/florian/codex-swarm/docs/admin-guide.md): admins are guided to inspect integration boundary and repository access plans.

Residual risks:

- The supported integration path is intentionally narrow and does not attempt provider sprawl, which is a design choice rather than a feature gap.

## 1e02d203 — Review [130] Admin reporting

- Roadmap entry: `ROADMAP.md` Phase 5, Scope, `Admin reporting`
- Verdict: `better`
- Reasoning: the repo provides admin reporting as a live API and documented UI/API workflow rather than leaving it as an implied governance requirement.

Evidence:

- [apps/api/src/routes/admin.ts](/home/florian/codex-swarm/apps/api/src/routes/admin.ts): `GET /api/v1/admin/governance-report` serves an admin-readable governance report and records timeline events when generated.
- [apps/api/src/services/control-plane-service.ts](/home/florian/codex-swarm/apps/api/src/services/control-plane-service.ts): `getGovernanceAdminReport()` summarizes approval totals/history, retention posture, sensitive repositories, and secret-boundary state within the caller's workspace/team boundary.
- [apps/api/test/app.test.ts](/home/florian/codex-swarm/apps/api/test/app.test.ts): tests explicitly verify governance admin reporting without direct database access.
- [docs/admin-guide.md](/home/florian/codex-swarm/docs/admin-guide.md): admin workflow and UI guidance treat governance reporting as a first-class support/signoff surface.
- [docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md): the frontend admin surface is documented for reviewing retention posture, approval provenance, and secret-boundary state.

Residual risks:

- The reporting surface is intentionally operational and governance-focused, not a full BI or historical analytics platform.

## e505a812 — Review [137] Operational SLOs

- Roadmap entry: `ROADMAP.md` Phase 6, Scope, `Operational SLOs`
- Verdict: `better`
- Reasoning: SLOs are not just listed in docs; they are exposed through live metrics, backed by config, and tied to operator workflows and support-envelope interpretation.

Evidence:

- [apps/api/src/config.ts](/home/florian/codex-swarm/apps/api/src/config.ts): the runtime defines `SLO_PENDING_APPROVAL_MAX_MINUTES`, `SLO_ACTIVE_RUN_MAX_MINUTES`, `SLO_TASK_QUEUE_MAX`, and `SLO_SUPPORT_RESPONSE_HOURS`.
- [apps/api/src/lib/observability.ts](/home/florian/codex-swarm/apps/api/src/lib/observability.ts): `getMetrics()` computes `slo.objectives`, `slo.measurements`, and `slo.status`.
- [docs/operations/slo-support.md](/home/florian/codex-swarm/docs/operations/slo-support.md): the supported objectives and operator workflow are documented.
- [docs/operator-guide.md](/home/florian/codex-swarm/docs/operator-guide.md): the operator loop explicitly requires checking `GET /api/v1/metrics` against the documented envelope.

Residual risks:

- The SLO surface is intentionally bounded to control-plane backlog and operator response objectives, not a full externally monitored SLA program.

## a8ea869b — Review [138] Backup/restore runbook

- Roadmap entry: `ROADMAP.md` Phase 6, Scope, `Backup/restore runbook`
- Verdict: `better`
- Reasoning: the repo includes both the runbook and executable backup/restore tooling rather than documentation alone.

Evidence:

- [docs/operations/backup-restore-dr.md](/home/florian/codex-swarm/docs/operations/backup-restore-dr.md): documents supported backup and restore procedures, parameters, operator cautions, and recorded evidence.
- [apps/api/scripts/ops/backup-control-plane.mjs](/home/florian/codex-swarm/apps/api/scripts/ops/backup-control-plane.mjs): implements logical control-plane backup.
- [apps/api/scripts/ops/restore-control-plane.mjs](/home/florian/codex-swarm/apps/api/scripts/ops/restore-control-plane.mjs): implements restore from snapshot.
- [README.md](/home/florian/codex-swarm/README.md): root ops commands are documented for operators.
- [docs/qa/m6-rc-signoff.md](/home/florian/codex-swarm/docs/qa/m6-rc-signoff.md): RC signoff validates that the documented backup and restore commands exist and are part of the supported recovery flow.

Residual risks:

- The runbook is for logical control-plane backup/restore, not a full infrastructure or regional rebuild procedure.

## 228c803b — Review [139] Disaster recovery testing

- Roadmap entry: `ROADMAP.md` Phase 6, Scope, `Disaster recovery testing`
- Verdict: `better`
- Reasoning: the repo includes a dedicated DR drill script plus recorded drill evidence with timings and zero-mismatch validation, which is stronger than a documentation-only claim.

Evidence:

- [apps/api/scripts/ops/dr-exercise.mjs](/home/florian/codex-swarm/apps/api/scripts/ops/dr-exercise.mjs): implements a scratch-database backup/restore validation drill.
- [docs/operations/backup-restore-dr.md](/home/florian/codex-swarm/docs/operations/backup-restore-dr.md): records the 2026-03-28 drill result with backup, restore, validation, and total timings, plus mismatch outcome.
- [docs/support-playbooks.md](/home/florian/codex-swarm/docs/support-playbooks.md): includes a failure playbook for failed restore or DR drills.
- [docs/qa/m6-rc-signoff.md](/home/florian/codex-swarm/docs/qa/m6-rc-signoff.md): QA signoff validates the DR evidence and support posture.

Residual risks:

- The drill is a bounded control-plane recovery exercise, not a full multi-region or infra-failover rehearsal.

## 5ed05df2 — Review [140] Migration and upgrade path

- Roadmap entry: `ROADMAP.md` Phase 6, Scope, `Migration and upgrade path`
- Verdict: `better`
- Reasoning: the upgrade path is documented, version-gated in code, and validated in QA signoff rather than being an implicit operator expectation.

Evidence:

- [docs/operations/upgrade-path.md](/home/florian/codex-swarm/docs/operations/upgrade-path.md): documents supported upgrade, failure handling, and restore-based rollback notes.
- [apps/api/src/db/versioning.ts](/home/florian/codex-swarm/apps/api/src/db/versioning.ts): persists and reads schema/config version metadata.
- [apps/api/src/db/check-version.ts](/home/florian/codex-swarm/apps/api/src/db/check-version.ts): enforces schema/config compatibility against persisted metadata.
- [README.md](/home/florian/codex-swarm/README.md): setup and operator notes mention schema/config version expectations.
- [docs/qa/m6-rc-signoff.md](/home/florian/codex-swarm/docs/qa/m6-rc-signoff.md): QA signoff explicitly validates version-gate behavior and the documented upgrade path.

Residual risks:

- Rollback remains restore-based and intentionally does not promise reverse migrations for every incompatible change.

## f49aa2b4 — Review [141] Cost/usage reporting

- Roadmap entry: `ROADMAP.md` Phase 6, Scope, `Cost/usage reporting`
- Verdict: `better`
- Reasoning: cost and usage reporting are exposed as live API fields and documented for operators/admins, not merely described as future reporting intent.

Evidence:

- [apps/api/src/lib/observability.ts](/home/florian/codex-swarm/apps/api/src/lib/observability.ts): `getMetrics()` returns `usage` and `cost` summaries from persisted control-plane state.
- [packages/contracts/src/index.ts](/home/florian/codex-swarm/packages/contracts/src/index.ts): the metrics contract includes `usage` and `cost` schemas.
- [docs/operations/cost-usage-performance.md](/home/florian/codex-swarm/docs/operations/cost-usage-performance.md): documents the reporting surface and its limitations.
- [docs/operator-guide.md](/home/florian/codex-swarm/docs/operator-guide.md): operators are directed to use `GET /api/v1/metrics` for usage and budgeted-cost visibility.

Residual risks:

- The cost report is based on persisted Codex Swarm run data, not downstream provider invoice reconciliation.

## b62becff — Review [142] Performance tuning

- Roadmap entry: `ROADMAP.md` Phase 6, Scope, `Performance tuning`
- Verdict: `superseded`
- Reasoning: the delivered M6 shape is a measured performance envelope with bounded probe tooling and explicit limitations, rather than an open-ended “tuning” subsystem. Later M6 delivery docs and RC evidence treat this as performance baselining and operator verification.

Evidence:

- [docs/architecture/m6-delivery-plan.md](/home/florian/codex-swarm/docs/architecture/m6-delivery-plan.md): Track 4 reframes the GA work as `Cost, usage, and performance envelope`.
- [docs/operations/cost-usage-performance.md](/home/florian/codex-swarm/docs/operations/cost-usage-performance.md): documents performance baselines, limitations, and the operator-facing concurrency probe.
- [apps/api/scripts/ops/perf-envelope.mjs](/home/florian/codex-swarm/apps/api/scripts/ops/perf-envelope.mjs): implements the bounded HTTP concurrency probe.
- [docs/qa/m6-rc-signoff.md](/home/florian/codex-swarm/docs/qa/m6-rc-signoff.md): residual risks explicitly describe the performance probe as a bounded smoke baseline rather than sustained production tuning.

Residual risks:

- If the product later needs autoscaling, sustained load tuning, or deeper latency optimization claims, that requires a new explicit backlog slice beyond the current envelope.

## f263dc98 — Review [143] Support playbooks

- Roadmap entry: `ROADMAP.md` Phase 6, Scope, `Support playbooks`
- Verdict: `better`
- Reasoning: the repo includes concrete playbooks tied to the documented support envelope, recovery, upgrade, governance, and secret-access failure modes.

Evidence:

- [docs/support-playbooks.md](/home/florian/codex-swarm/docs/support-playbooks.md): includes stepwise playbooks for SLO-envelope breaches, failed restore/DR drills, upgrade failures, governance discrepancies, and sensitive-repository secret-access issues.
- [docs/operations/slo-support.md](/home/florian/codex-swarm/docs/operations/slo-support.md): defines the support envelope that the playbooks operationalize.
- [docs/operator-guide.md](/home/florian/codex-swarm/docs/operator-guide.md): integrates the playbooks into the reference operating loop.
- [docs/qa/m6-rc-signoff.md](/home/florian/codex-swarm/docs/qa/m6-rc-signoff.md): QA signoff validates that operator playbooks describe failure handling for failed restore/drill and upgrade scenarios.

Residual risks:

- The playbooks intentionally reflect the bounded support model and do not imply 24x7 managed operations.

## d8b447e1 — Review [144] Reference deployments for single-host and multi-node environments

- Roadmap entry: `ROADMAP.md` Phase 6, Scope, `Reference deployments for single-host and multi-node environments`
- Verdict: `better`
- Reasoning: the repo provides both deployment topologies, supporting checklist steps, and linked UI/runbook evidence rather than a minimal topology note.

Evidence:

- [docs/reference-deployments.md](/home/florian/codex-swarm/docs/reference-deployments.md): documents single-host and multi-node reference topologies, shared dependencies, and deployment checklist requirements.
- [docs/operator-guide.md](/home/florian/codex-swarm/docs/operator-guide.md): ties the reference topologies into the operator operating loop.
- [docs/qa/m6-rc-signoff.md](/home/florian/codex-swarm/docs/qa/m6-rc-signoff.md): QA signoff explicitly validates that single-host and multi-node reference deployments are both documented.
- [README.md](/home/florian/codex-swarm/README.md): points operators to the deployment and operations docs set.

Residual risks:

- The reference deployments document supported shapes and evidence expectations, but they still assume operators provide reachable Postgres and Redis infrastructure.

## 49d0d4a0 — Review [148] Published support boundaries and limitations

- Roadmap entry: `ROADMAP.md` Phase 6, Deliverables, `Published support boundaries and limitations`
- Verdict: `better`
- Reasoning: support boundaries and limitations are published across multiple operator-facing docs and reinforced in QA RC signoff, rather than buried in implementation details.

Evidence:

- [docs/operations/slo-support.md](/home/florian/codex-swarm/docs/operations/slo-support.md): states what is and is not covered by the support envelope.
- [docs/support-playbooks.md](/home/florian/codex-swarm/docs/support-playbooks.md): turns those boundaries into operator response procedures.
- [docs/operator-guide.md](/home/florian/codex-swarm/docs/operator-guide.md): includes explicit operator boundaries.
- [docs/reference-deployments.md](/home/florian/codex-swarm/docs/reference-deployments.md): defines supported deployment shapes and evidence expectations.
- [docs/qa/m6-rc-signoff.md](/home/florian/codex-swarm/docs/qa/m6-rc-signoff.md): QA signoff explicitly validates that support boundaries and non-goals are documented rather than implied.

Residual risks:

- The published boundary is clear, but any future expansion into 24x7 support, provider-billing reconciliation, or broader SRE guarantees would need new roadmap language and implementation work.
