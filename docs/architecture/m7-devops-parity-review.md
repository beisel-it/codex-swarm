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
