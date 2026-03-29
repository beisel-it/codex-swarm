# ROADMAP

**Product name:** Codex Swarm  
**Document:** Delivery Roadmap  
**Status:** Draft v0.1  
**Last updated:** 2026-03-28  
**Planning horizon:** From architecture freeze to v1.0 GA

## 1. Roadmap intent

This roadmap translates the PRD into a delivery sequence that is practical for a ground-up rewrite. It assumes we are intentionally **not** cloning ClawTeam's file/P2P implementation. Instead, we are building a Codex-native control plane that uses `codex mcp-server` for execution, worktrees for isolation, and durable platform state for orchestration.

The delivery order is shaped by two realities:

1. ClawTeam's current public implementation proves the value of leader/worker worktrees, task dependencies, messaging, dashboards, and templates, but its own roadmap is still progressing toward Redis/shared state and later auth/audit maturity.[^claw-readme][^claw-roadmap]
2. Codex already exposes the primitives we need now: MCP server mode, persistent session continuation by `threadId`, layered `AGENTS.md`, custom agents, skills, worktrees, and multi-agent orchestration via the Agents SDK.[^codex-mcp-server][^agents-md][^skills][^subagents][^worktrees][^agents-sdk]

## 2. Delivery principles

1. **Single-host first, distributed second.**
2. **Durable state first, clever autonomy second.**
3. **Human review before automation of irreversible steps.**
4. **Every phase must leave behind usable software.**
5. **Prefer vertical slices over isolated subsystems.**

## 3. Milestone map

| Milestone | Version target | Outcome |
|---|---|---|
| M0 | pre-v0.1 | Architecture frozen, repo skeleton, contracts defined |
| M1 | v0.1-alpha | Single-host run creation, leader planning, task DAG, worker sessions |
| M2 | v0.1-beta | Board, approvals, validations, restart recovery, branch handoff |
| M3 | v0.2 | Hardening, Git provider integration, budgets, curated role/skill packs |
| M4 | v0.3 | Distributed workers, sticky scheduling, remote node management |
| M5 | v0.5 | Governance, auth, quotas, audit trails, enterprise deployment patterns |
| M6 | v1.0 | Production GA with clear operational model and support boundaries |

## 4. Phase-by-phase plan

## Phase 0 — Foundation and architecture freeze
**Target:** M0  
**Suggested duration:** Weeks 0–2

### Objective
Establish the project skeleton, core contracts, and executable technical spike before feature work begins.

### Scope
- Finalize PRD and roadmap
- Define domain model and event taxonomy
- Define control-plane interaction contract
  - Superseded in the shipped implementation by the HTTP control-plane API
    documented in `docs/architecture/control-plane-api-contract.md`
- Build proof of concept for:
  - starting `codex mcp-server`
  - launching a session with `codex()`
  - continuing with `codex-reply()`
  - storing and reusing `threadId`
- Decide repo structure and initial deployment topology
- Confirm worktree lifecycle and naming rules
- Confirm security defaults: sandbox, approvals, secret scope

### Deliverables
- Monorepo or polyrepo decision recorded
- `docs/architecture/` with system context and sequence diagrams
- Initial API contracts
- Initial database schema draft
- “hello world” run that creates a leader session and persists `threadId`

### Exit criteria
- The team can launch a Codex session from the control plane and continue it reliably.[^codex-mcp-server]
- The control plane can write and read task/session records from Postgres.
- The architecture no longer depends on filesystem JSON as the source of truth.

### Risks retired
- Feasibility risk on Codex MCP orchestration
- Uncertainty around session persistence boundary
- Uncertainty around worktree-based worker isolation

---

## Phase 1 — v0.1-alpha: single-host orchestration core
**Target:** M1  
**Suggested duration:** Weeks 3–6

### Objective
Deliver the first vertical slice: create a run, plan tasks, spawn isolated workers, and track progress on one host.

### Scope
#### Control plane
- FastAPI service scaffold
- Postgres migrations
- Basic auth placeholder (single-user/dev token acceptable for alpha)
- Workflow-oriented repository/run/task/agent creation and state-progression
  routes, with session state exposed through run detail and recovery surfaces
  rather than standalone session CRUD

#### Orchestrator
- Leader agent flow
- Task DAG creation and persistence
- Worker spawn/stop/retry
- Session registry with `threadId`
- Worktree provisioner
- Agent heartbeat and liveness model

#### Worker runtime
- Repo checkout or local path mounting
- One active worktree per worker
- `codex mcp-server` process lifecycle management
- Validation command runner
- Artifact upload pipeline

#### Control-plane contract
The planned Swarm Control MCP surface was intentionally superseded by the
Fastify HTTP API under `/api/v1`. The authoritative mapping is recorded in
`docs/architecture/control-plane-api-contract.md`.

- `GET /api/v1/runs/:id` replaces `run_context.get`
- `GET /api/v1/tasks`, `POST /api/v1/tasks`, and
  `PATCH /api/v1/tasks/:id/status` replace `task.list`, `task.create`, and
  `task.update`
- `POST /api/v1/messages` and `GET /api/v1/messages` replace `message.send`
  and `message.list`
- `POST /api/v1/artifacts` replaces `artifact.publish`
- `POST /api/v1/agents` and `GET /api/v1/agents` replace `agent.spawn` and
  `agent.status`
- agent stop is currently expressed through run/session recovery controls rather
  than a standalone agent-stop endpoint

### Deliverables
- Create run from repo + goal/spec
- Leader can produce a plan and save `.swarm/plan.md`
- Up to 3 concurrent workers on one host
- Tasks visible via API
- Minimal CLI or admin script for smoke testing

### Exit criteria
- One run can exercise the core orchestration control-plane flow from run creation through task and agent lifecycle progression.
- Each worker executes in an isolated worktree.[^worktrees]
- Each worker session is resumable through persisted `threadId`.[^codex-mcp-server]

### What is intentionally deferred
- Rich board UI
- Human approvals
- GitHub/GitLab integration
- Multi-node execution

---

## Phase 2 — v0.1-beta: board, approvals, validation, recovery
**Target:** M2  
**Suggested duration:** Weeks 7–10

### Objective
Turn the orchestration core into a usable internal product.

### Scope
#### UI
- Browser board showing:
  - task DAG and statuses
  - agent lanes
  - blocked work
  - pending approvals
  - recent validations
- Run details page
- Review page for artifacts and diff summaries

#### Approvals
- Plan approval
- Patch/merge handoff approval
- Policy exception approval
- Structured reject-with-feedback loop

#### Validation
- Per-task validation templates
- Structured validation records
- Artifact-backed logs and reports

#### Recovery
- Orchestrator restart recovery
- Worktree reattachment
- Session reconciliation
- Mark-stale / retry / archive behavior

#### Observability
- Integrate OpenAI tracing
- Add control-plane event timeline
- Add metrics for retries, failures, queue depth

### Deliverables
- Browser UI for active runs
- Human approve/reject flow
- Validation history
- Restart-aware active runs with persisted recovery state

### Exit criteria
- A reviewer can inspect a completed task and approve/reject it in the browser.
- A run retains task and approval state for restart-aware recovery planning.
- Board latency remains near real time for control-plane events.

### Risks retired
- Operator visibility risk
- Approval workflow gap
- Restart durability gap

---

## Phase 3 — v0.2: hardening and developer workflow integration
**Target:** M3  
**Suggested duration:** Weeks 11–16

### Objective
Make the product useful for real repos and repeated internal use.

### Scope
#### Git provider integration
- GitHub/GitLab repo onboarding
- Branch publish
- Pull request creation
- PR status reflection into the board

#### Productivity packs
- Curated `.codex/agents/` role pack
- Initial skills library:
  - plan-from-spec
  - create-task-dag
  - validate-milestone
  - prepare-pr
- Repo profile templates by stack (Node, Python, JVM, Go)

#### Governance-lite
- Budget caps
- Concurrency caps
- Approval profiles by repo
- Basic audit log export

#### Quality
- Bounded performance-envelope verification with documented limits
- Retry semantics refinement
- Cleanup jobs for stale worktrees and sessions

### Deliverables
- Real repo onboarding flow
- One-click PR handoff
- Budget-aware run controls
- Reusable role and skill starter packs

### Exit criteria
- A user can start from a GitHub or GitLab repo and end with a PR.
- Budget caps and concurrency caps are enforced during real runs.
- Curated skills, role packs, and repo templates are shipped, documented, and
  usable as starter packs for repeatable Codex Swarm workflows.[^skills][^subagents]

### What is intentionally deferred
- True multi-tenant auth/RBAC
- Distributed workers across hosts
- Enterprise compliance exports

---

## Phase 4 — v0.3: distributed execution
**Target:** M4  
**Suggested duration:** Weeks 17–22

### Objective
Add multi-node worker capacity while keeping the control plane and task model stable.

### Scope
#### Worker fleet
- Worker node registration and heartbeats
- Capability labels (`node`, `browser`, `python`, `large-memory`, etc.)
- Sticky placement for a session across its lifetime
- Remote worker drain mode

#### Scheduling
- Queueing in Redis
- Node selection based on capability and load
- Retry on worker node failure
- Session placement rules

#### Remote operation model
- Standardized worker bootstrap
- Shared artifact store
- Central Postgres + Redis
- Secure credential distribution pattern

#### MCP transport evolution
For internal control-plane tools, prefer stdio locally and streamable HTTP for remote/shared services. Avoid new SSE-based designs because the MCP project has deprecated SSE for new integrations.[^agents-mcp]

### Deliverables
- Leader on one node, workers on multiple nodes
- Shared board and task state across nodes
- Node-level health and utilization view

### Exit criteria
- A run can place workers on at least 2 nodes and preserve task continuity.
- Session ownership remains sticky and explicit.
- A lost worker node causes bounded task failure and safe retry, not silent drift.

### Why this phase exists
ClawTeam's own roadmap separates cross-machine messaging from shared state and later production-grade concerns.[^claw-roadmap] This rewrite should skip the incremental file→Redis migration path and start distributed execution from an already durable control-plane model.

---

## Phase 5 — v0.5: governance and enterprise readiness
**Target:** M5  
**Suggested duration:** Weeks 23–30

### Objective
Add the controls required for broader organizational use.

### Scope
- SSO / OIDC login
- Workspace/team isolation
- RBAC for run create/review/admin actions
- Policy packs by team or repo
- Approval delegation rules
- Audit export
- Retention controls
- Secret source integrations
- Admin reporting

### Deliverables
- Multi-user governance model
- Approval and audit trail export
- Team and repo policy management

### Exit criteria
- An org admin can prove who approved what and when.
- Teams can set different policy profiles without code changes.
- Sensitive repos can run with stricter defaults than standard repos.

### Risks retired
- Auditability gap
- Multi-user governance gap
- Policy inconsistency across repos

---

## Phase 6 — v1.0: GA and scaling envelope
**Target:** M6  
**Suggested duration:** Weeks 31–40

### Objective
Ship a clearly supported, production-ready platform.

### Scope
- Operational SLOs
- Backup/restore runbook
- Disaster recovery testing
- Migration and upgrade path
- Cost/usage reporting
- Performance envelope verification with documented limits
- Support playbooks
- Reference deployments for single-host and multi-node environments

### Deliverables
- GA release candidate
- Admin/developer/operator docs
- Upgrade-safe schema and config versioning
- Published support boundaries and limitations

### Exit criteria
- The platform can demonstrate expected concurrency behavior with recorded verification and documented limits.
- Recovery procedures are tested.
- Docs are sufficient for a fresh team to deploy and use the product.

## 5. Workstream breakdown

## Workstream A — Control plane and data model
### Epics
- API foundation
- Postgres schema
- event model
- run/session/task services
- approval and artifact services

### Critical dependencies
- PRD sign-off
- Phase 0 proof of concept

### Main risks
- schema churn
- over-coupling orchestration logic to transport details

---

## Workstream B — Codex runtime integration
### Epics
- Worker supervisor
- `codex mcp-server` wrapper
- session registry
- `threadId` resume logic
- validation runner

### Critical dependencies
- worktree lifecycle design
- environment bootstrap rules

### Main risks
- process isolation bugs
- ambiguous failure states
- session cleanup bugs

---

## Workstream C — Swarm Control MCP contract
### Epics
- MCP server implementation
- tool namespaces
- idempotency model
- approval-aware responses
- SDK client wrapper

### Critical dependencies
- stable domain model
- policy design

### Main risks
- tool explosion
- mismatch between agent expectations and API semantics

---

## Workstream D — Web UI and review experience
### Epics
- board
- run details
- agent details
- approval console
- artifact viewer

### Critical dependencies
- event stream
- artifact schema
- validation schema

### Main risks
- too much low-level data, not enough actionable signal
- board performance under noisy runs

---

## Workstream E — Policy, security, and governance
### Epics
- sandbox policies
- secret allowlisting
- approval profiles
- trust-level handling
- audit logging

### Critical dependencies
- Codex config strategy
- identity/auth strategy

### Main risks
- over-broad environment inheritance
- policy drift across repos

---

## Workstream F — Integrations and ecosystem
### Epics
- GitHub/GitLab connectors
- repo bootstrap
- PR creation
- provider webhooks
- template/skill starter packs

### Critical dependencies
- stable run/branch model
- review workflow

### Main risks
- provider-specific edge cases
- mismatch between local and remote repo state

## 6. Suggested implementation order inside each milestone

1. Database schema and event model  
2. Run creation API  
3. Leader session bootstrapping  
4. Task DAG persistence  
5. Worktree creation and worker session provisioning  
6. HTTP control-plane routes for task/message/artifact updates
7. Validation runner  
8. Board API and UI  
9. Approvals  
10. Recovery and cleanup  
11. Git provider integration  
12. Distributed node scheduling  
13. Governance and audit

This order keeps the "create run → plan → delegate → validate → review" path usable as early as possible.

## 7. Acceptance criteria by version

## v0.1-alpha
- Single host
- Up to 3 workers
- One repo per run
- Leader planning
- Task DAG
- Durable sessions
- Isolated worktrees
- Task updates and artifacts via MCP tools

## v0.1-beta
- Board UI
- Approvals
- Validations
- Recovery
- Cleanup
- Branch handoff

## v0.2
- PR creation
- Budgets
- Role/skill packs
- Better operator controls
- Production-shaped internal use

## v0.3
- Multi-node scheduling
- Remote workers
- Shared artifact and event model
- Node health and stickiness

## v0.5
- Auth/RBAC
- Audit trails
- Policy packs
- Team-level governance

## v1.0
- GA docs
- SLOs
- tested backup/restore
- defined support model

## 8. Deferred or optional items

These are explicitly not required for v0.1 and should not slow down the first usable release:

- Marketplace for reusable community agents
- Cross-repo orchestration
- Full visual DAG editor
- tmux-compatible live pane layout
- Token-level live event stream from Codex internals
- Multi-model abstraction layer over non-Codex coding agents
- Autonomous backlog ingestion from Jira/Linear without human gating

## 9. Team shape recommendation

For fastest delivery, the build team should cover these responsibilities:

- **Platform lead:** architecture, data model, orchestrator design
- **Backend engineer:** API, persistence, scheduler, recovery
- **Runtime engineer:** Codex integration, worktrees, worker supervisor
- **Frontend engineer:** board, review, approval UX
- **DevEx/product engineer:** role packs, skills, templates, repo onboarding
- **Part-time security/governance reviewer:** sandbox, approval, secret policy

A smaller team can still do this, but these roles will exist whether or not they map to separate people.

## 10. Definition of done by milestone

A milestone is done only when all of the following are true:
- Core workflow works end-to-end
- Docs and runbooks are updated
- Failure modes have been exercised
- Cleanup paths exist
- Metrics and logs are wired
- No critical path depends on manual DB edits or hidden shell steps

## 11. Source notes

[^claw-readme]: [HKUDS/ClawTeam README](https://github.com/HKUDS/ClawTeam/blob/main/README.md)
[^claw-roadmap]: [HKUDS/ClawTeam ROADMAP](https://github.com/HKUDS/ClawTeam/blob/main/ROADMAP.md)
[^codex-mcp-server]: [Use Codex with the Agents SDK](https://developers.openai.com/codex/guides/agents-sdk/)
[^agents-sdk]: [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
[^agents-md]: [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
[^skills]: [Codex agent skills](https://developers.openai.com/codex/skills/)
[^subagents]: [Codex subagents and custom agents](https://developers.openai.com/codex/subagents/)
[^worktrees]: [Codex worktrees](https://developers.openai.com/codex/app/worktrees/)
[^agents-mcp]: [Agents SDK MCP guide](https://openai.github.io/openai-agents-python/mcp/)
