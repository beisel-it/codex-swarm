<h1 align="center">🧠🐝 Codex Swarm</h1>

<p align="center">
  <strong>A GitHub-oriented control plane for Codex-backed planning, execution, review, approvals, validations, and distributed worker orchestration.</strong>
</p>

<p align="center">
  <a href="https://github.com/beisel-it/codex-swarm"><img src="https://img.shields.io/badge/GitHub-beisel--it%2Fcodex--swarm-171515?style=for-the-badge&logo=github" alt="GitHub repository"></a>
  <a href="./docs/README.md"><img src="https://img.shields.io/badge/docs-release_facing-0A66C2?style=for-the-badge" alt="Release docs"></a>
  <a href="./docs/operator-guide.md"><img src="https://img.shields.io/badge/operator_guide-external_codex-1D9BF0?style=for-the-badge" alt="Operator guide"></a>
  <a href="./ROADMAP.md"><img src="https://img.shields.io/badge/roadmap-through_M10-0F766E?style=for-the-badge" alt="Roadmap status"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white" alt="Node 22+">
  <img src="https://img.shields.io/badge/pnpm-%E2%89%A510.28-F69220?logo=pnpm&logoColor=white" alt="pnpm 10.28+">
  <img src="https://img.shields.io/badge/api-Fastify-000000?logo=fastify&logoColor=white" alt="Fastify">
  <img src="https://img.shields.io/badge/frontend-React_%2B_Vite-646CFF?logo=vite&logoColor=white" alt="React and Vite">
  <img src="https://img.shields.io/badge/database-Postgres-4169E1?logo=postgresql&logoColor=white" alt="Postgres">
  <img src="https://img.shields.io/badge/e2e-M9_validated-15803D" alt="M9 validated">
</p>

<p align="center">
  Codex Swarm is no longer a scaffold. It ships a real workflow-oriented control plane, worker runtime, review UI, governance stack, operator skill library, and a validated end-to-end product run.
</p>

---

## ✨ What This Repo Ships

Codex Swarm is built around a workflow API rather than generic CRUD. The product now includes:

- a Fastify control-plane API for repositories, runs, tasks, agents, sessions, approvals, validations, artifacts, audit export, and worker fleet management
- a worker runtime that supervises Codex sessions, provisions isolated worktrees, runs validations, and supports distributed dispatch
- a React/Vite frontend for board views, run detail, governance visibility, publish flows, and a review console with diff evidence
- governance features including RBAC, workspace and team isolation, approval delegation, policy exceptions, audit export, and retention context
- codex-swarm-specific external operator docs, skills, and authoring guidance for real repo operation

The current API-contract direction is documented in [docs/architecture/control-plane-api-contract.md](./docs/architecture/control-plane-api-contract.md).

---

## 📸 Product Surfaces

| Board | Run Detail |
|---|---|
| ![Board overview](./docs/assets/screenshots/user-board-overview.png) | ![Run detail](./docs/assets/screenshots/user-run-detail.png) |

| Review Console | Governance |
|---|---|
| ![Review console](./docs/assets/screenshots/user-review-console.png) | ![Admin governance view](./docs/assets/screenshots/admin-governance-view.png) |

| Distributed Fleet |
|---|
| ![Reference multinode board](./docs/assets/screenshots/reference-multinode-board.png) |

---

## 🚀 Start Here

Choose the entry point that matches how you are approaching the system:

- [docs/README.md](./docs/README.md) for the release-facing documentation hub
- [docs/operator-guide.md](./docs/operator-guide.md) for external Codex operation of this repo
- [docs/operator-skill-library.md](./docs/operator-skill-library.md) for the codex-swarm operator skill pack
- [docs/operator-skill-workflows.md](./docs/operator-skill-workflows.md) for grounded board, planning, recovery, and coordination workflows
- [docs/user-guide.md](./docs/user-guide.md) for end-user product flows
- [docs/admin-guide.md](./docs/admin-guide.md) for governance and admin surfaces
- [docs/support-playbooks.md](./docs/support-playbooks.md) for support and recovery playbooks

---

## 🧭 Milestone Status

The project has been carried through M10:

- `M7` parity review closed
- `M8` codex-swarm external-operator pack closed
- `M9` real codex-swarm end-to-end scenario completed with persisted artifacts, validations, screenshots, and audit export
- `M10` project-level README redesign completed

The M9 scenario was executed as a real codex-swarm product run in an isolated workspace, not as a synthetic backlog-only exercise.

---

## ⚡ Quick Local Bring-Up

```bash
corepack pnpm install
cp .env.example .env
corepack pnpm --dir apps/api dev
corepack pnpm --dir frontend dev
```

Set these in `.env`:

- `DATABASE_URL`
- `DEV_AUTH_TOKEN`
- artifact storage settings appropriate to your deployment mode

For remote or shared-worker deployments, also set:

- `ARTIFACT_STORAGE_ROOT`
- `ARTIFACT_BASE_URL`

All `/api/v1/*` requests use:

```text
Authorization: Bearer <DEV_AUTH_TOKEN>
```

---

## 🔬 Verification

### Core workspace checks

```bash
corepack pnpm run ci:typecheck
corepack pnpm run ci:test
corepack pnpm run ci:build
```

### Useful targeted checks

```bash
corepack pnpm --dir apps/api typecheck
corepack pnpm --dir apps/api test
corepack pnpm --dir packages/contracts typecheck
corepack pnpm --dir packages/orchestration typecheck
```

### Operator and scenario helpers

```bash
corepack pnpm ops:smoke
corepack pnpm ops:m9:prepare
corepack pnpm ops:perf
corepack pnpm ops:backup
corepack pnpm ops:restore
corepack pnpm ops:drill
```

---

## 🏗️ System Shape

### Control plane

- repositories are onboarded with provider and trust metadata
- runs hold goal, policy posture, budget posture, placement, and completion state
- tasks persist a dependency-safe DAG
- agents and sessions persist Codex execution state, including durable `threadId`
- approvals, validations, and artifacts are first-class review evidence

### Distributed execution

- worker nodes register capabilities and heartbeat into the control plane
- dispatch uses capability, stickiness, queue depth, active claims, utilization, and heartbeat freshness
- leader placement is explicit in distributed runs
- worker runtime supports local `stdio` Codex MCP and remote streamable HTTP transport
- repository materialization supports trusted local-path mounts and cloned checkouts

### Governance and review

- workspace and team isolation
- RBAC for run creation, review, and admin actions
- approval delegation and structured policy-exception decisions
- durable audit export with provenance, approvals, validations, artifacts, events, and retention context
- review UI with diff summary, changed-file evidence, reviewer context, and raw diff preview

---

## 🧰 Operator Pack

This repo ships codex-swarm-specific operator assets, not just generic role prompts:

- [AGENTS.md](./AGENTS.md) for repo-level guidance
- `.codex/config.toml` and `.codex/agents/*.toml` for the checked-in role pack
- [.agents/skills/README.md](./.agents/skills/README.md) for the skill index
- `.agents/skills/*/SKILL.md` for reusable codex-swarm workflows
- [docs/operator-skill-library.md](./docs/operator-skill-library.md) for discoverability
- [docs/operator-skill-workflows.md](./docs/operator-skill-workflows.md) for grounded control flows
- [docs/agent-skill-authoring.md](./docs/agent-skill-authoring.md) for extending the pack

---

## 🗂️ Repository Layout

| Path | Responsibility |
|---|---|
| `apps/api` | Control-plane API, persistence, governance, audit, scheduling, cleanup |
| `apps/worker` | Worker runtime, provisioning, Codex supervision, validation runner |
| `frontend` | Board, run detail, review, governance, and publish UI |
| `packages/contracts` | Shared Zod schemas and API contract types |
| `packages/orchestration` | DAG and orchestration helpers |
| `templates/repo-profiles` | Starter repo profiles by stack |
| `.codex/agents` | Checked-in role pack |
| `.agents/skills` | Checked-in codex-swarm skill library |
| `docs` | Release docs, operations references, architecture notes |

---

## 📚 Documentation Index

### Product and operator docs

- [docs/README.md](./docs/README.md)
- [docs/user-guide.md](./docs/user-guide.md)
- [docs/admin-guide.md](./docs/admin-guide.md)
- [docs/operator-guide.md](./docs/operator-guide.md)
- [docs/operator-skill-library.md](./docs/operator-skill-library.md)
- [docs/operator-skill-workflows.md](./docs/operator-skill-workflows.md)
- [docs/agent-skill-authoring.md](./docs/agent-skill-authoring.md)
- [docs/support-playbooks.md](./docs/support-playbooks.md)
- [docs/reference-deployments.md](./docs/reference-deployments.md)

### Operations

- [docs/operations/security.md](./docs/operations/security.md)
- [docs/operations/slo-support.md](./docs/operations/slo-support.md)
- [docs/operations/backup-restore-dr.md](./docs/operations/backup-restore-dr.md)
- [docs/operations/m9-readiness.md](./docs/operations/m9-readiness.md)
- [docs/operations/upgrade-path.md](./docs/operations/upgrade-path.md)
- [docs/operations/cost-usage-performance.md](./docs/operations/cost-usage-performance.md)

### Architecture and planning

- [PRD.md](./PRD.md)
- [ROADMAP.md](./ROADMAP.md)
- [docs/architecture/m0-m1-architecture.md](./docs/architecture/m0-m1-architecture.md)
- [docs/architecture/control-plane-api-contract.md](./docs/architecture/control-plane-api-contract.md)
- [docs/architecture/system-context-and-sequences.md](./docs/architecture/system-context-and-sequences.md)

---

## 🧪 GitHub-Oriented Demo Flow

If you want a quick GitHub-style evaluation path through the repo:

1. Scan this README and the screenshots.
2. Read [docs/operator-guide.md](./docs/operator-guide.md).
3. Run `corepack pnpm run ci:typecheck && corepack pnpm run ci:test && corepack pnpm run ci:build`.
4. Run `corepack pnpm ops:smoke`.
5. Review [docs/reference-deployments.md](./docs/reference-deployments.md) and [docs/operations/upgrade-path.md](./docs/operations/upgrade-path.md).
6. If you want the validated scenario setup, inspect [docs/operations/m9-readiness.md](./docs/operations/m9-readiness.md).

---

## 🔗 Reference

- Project roadmap: [ROADMAP.md](./ROADMAP.md)
- Product requirements: [PRD.md](./PRD.md)
- GitHub repository: https://github.com/beisel-it/codex-swarm
