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
