# M7 Parity Review Plan

## Objective

Re-read `ROADMAP.md` and verify, entry by entry, that each roadmap commitment has been:

- implemented to feature parity, or
- implemented better than written, or
- clearly superseded by later delivered work.

If a verifier finds a direct error, behavioral gap, or roadmap-to-implementation misalignment, they must report it back to `tech-lead` so a new backlog item can be created and sequenced.

## Review Rules

Each verification task must:

- cite the exact `ROADMAP.md` entry being checked
- inspect the live implementation, not just prior status messages
- state one of: `parity`, `better`, `superseded`, or `gap`
- attach concrete evidence: file paths, API routes, tests, docs, or runbooks
- raise a blocker immediately if the implementation claim is not supportable

## Assignment Model

- `backend-dev`: control-plane, runtime, contracts, governance, scheduling, integrations
- `frontend-dev`: board, run details, review flows, admin/governance UI, user-facing docs surfaces
- `devops`: deployment topology, observability, backup/restore, DR, performance, operations
- `qa-engineer`: acceptance criteria, workflow validation, cross-cutting verification, residual gaps

## Task Matrix

### Foundation and architecture freeze

1. Verify `Finalize PRD and roadmap`
2. Verify `Define domain model and event taxonomy`
3. Verify `Define Swarm Control MCP tool surface`
4. Verify proof of concept: `starting codex mcp-server`
5. Verify proof of concept: `launching a session with codex()`
6. Verify proof of concept: `continuing with codex-reply()`
7. Verify proof of concept: `storing and reusing threadId`
8. Verify `Decide repo structure and initial deployment topology`
9. Verify `Confirm worktree lifecycle and naming rules`
10. Verify `Confirm security defaults: sandbox, approvals, secret scope`
11. Verify deliverable: `docs/architecture/ with system context and sequence diagrams`
12. Verify deliverable: `Initial API contracts`
13. Verify deliverable: `Initial database schema draft`
14. Verify deliverable: `hello world run that creates a leader session and persists threadId`
15. Verify exit criterion: `launch a Codex session from the control plane and continue it reliably`
16. Verify exit criterion: `control plane can write and read task/session records from Postgres`
17. Verify exit criterion: `architecture no longer depends on filesystem JSON as the source of truth`

### Single-host orchestration core

18. Verify control plane: `FastAPI service scaffold`
19. Verify control plane: `Postgres migrations`
20. Verify control plane: `Basic auth placeholder`
21. Verify control plane: `CRUD for repositories, runs, tasks, agents, sessions`
22. Verify orchestrator: `Leader agent flow`
23. Verify orchestrator: `Task DAG creation and persistence`
24. Verify orchestrator: `Worker spawn/stop/retry`
25. Verify orchestrator: `Session registry with threadId`
26. Verify orchestrator: `Worktree provisioner`
27. Verify orchestrator: `Agent heartbeat and liveness model`
28. Verify worker runtime: `Repo checkout or local path mounting`
29. Verify worker runtime: `One active worktree per worker`
30. Verify worker runtime: `codex mcp-server process lifecycle management`
31. Verify worker runtime: `Validation command runner`
32. Verify worker runtime: `Artifact upload pipeline`
33. Verify MCP surface: `run_context.get`
34. Verify MCP surface: `task.list`
35. Verify MCP surface: `task.create`
36. Verify MCP surface: `task.update`
37. Verify MCP surface: `message.send`
38. Verify MCP surface: `message.list`
39. Verify MCP surface: `artifact.publish`
40. Verify MCP surface: `agent.spawn`
41. Verify MCP surface: `agent.status`
42. Verify MCP surface: `agent.stop`
43. Verify deliverable: `Create run from repo + goal/spec`
44. Verify deliverable: `Leader can produce a plan and save .swarm/plan.md`
45. Verify deliverable: `Up to 3 concurrent workers on one host`
46. Verify deliverable: `Tasks visible via API`
47. Verify deliverable: `Minimal CLI or admin script for smoke testing`
48. Verify exit criterion: `one run can complete at least one multi-task coding workflow end-to-end`
49. Verify exit criterion: `each worker executes in an isolated worktree`
50. Verify exit criterion: `each worker session is resumable through persisted threadId`

### Board, approvals, validation, recovery

51. Verify UI: `Browser board showing task DAG and statuses`
52. Verify UI: `Browser board showing agent lanes`
53. Verify UI: `Browser board showing blocked work`
54. Verify UI: `Browser board showing pending approvals`
55. Verify UI: `Browser board showing recent validations`
56. Verify UI: `Run details page`
57. Verify UI: `Review page for artifacts and diff summaries`
58. Verify approvals: `Plan approval`
59. Verify approvals: `Patch/merge handoff approval`
60. Verify approvals: `Policy exception approval`
61. Verify approvals: `Structured reject-with-feedback loop`
62. Verify validation: `Per-task validation templates`
63. Verify validation: `Structured validation records`
64. Verify validation: `Artifact-backed logs and reports`
65. Verify recovery: `Orchestrator restart recovery`
66. Verify recovery: `Worktree reattachment`
67. Verify recovery: `Session reconciliation`
68. Verify recovery: `Mark-stale / retry / archive behavior`
69. Verify observability: `OpenAI tracing integration`
70. Verify observability: `control-plane event timeline`
71. Verify observability: `metrics for retries, failures, queue depth`
72. Verify deliverable: `Browser UI for active runs`
73. Verify deliverable: `Human approve/reject flow`
74. Verify deliverable: `Validation history`
75. Verify deliverable: `Restart-safe active runs`
76. Verify exit criterion: `reviewer can inspect a completed task and approve/reject it in the browser`
77. Verify exit criterion: `run survives orchestrator restart without losing task or approval state`
78. Verify exit criterion: `board latency remains near real time for control-plane events`

### Hardening and developer workflow integration

79. Verify Git provider integration: `GitHub/GitLab repo onboarding`
80. Verify Git provider integration: `Branch publish`
81. Verify Git provider integration: `Pull request creation`
82. Verify Git provider integration: `PR status reflection into the board`
83. Verify productivity packs: `Curated .codex/agents/ role pack`
84. Verify productivity packs: `plan-from-spec skill`
85. Verify productivity packs: `create-task-dag skill`
86. Verify productivity packs: `validate-milestone skill`
87. Verify productivity packs: `prepare-pr skill`
88. Verify productivity packs: `Repo profile templates by stack (Node, Python, JVM, Go)`
89. Verify governance-lite: `Budget caps`
90. Verify governance-lite: `Concurrency caps`
91. Verify governance-lite: `Approval profiles by repo`
92. Verify governance-lite: `Basic audit log export`
93. Verify quality: `Load and soak tests`
94. Verify quality: `Retry semantics refinement`
95. Verify quality: `Cleanup jobs for stale worktrees and sessions`
96. Verify deliverable: `Real repo onboarding flow`
97. Verify deliverable: `One-click PR handoff`
98. Verify deliverable: `Budget-aware run controls`
99. Verify deliverable: `Reusable role and skill starter packs`
100.  Verify exit criterion: `start from a GitHub or GitLab repo and end with a PR`
101.  Verify exit criterion: `budget caps and concurrency caps are enforced during real runs`
102.  Verify exit criterion: `curated skills and roles reduce prompt/setup overhead`

### Distributed execution

103. Verify worker fleet: `Worker node registration and heartbeats`
104. Verify worker fleet: `Capability labels`
105. Verify worker fleet: `Sticky placement for a session across its lifetime`
106. Verify worker fleet: `Remote worker drain mode`
107. Verify scheduling: `Queueing in Redis`
108. Verify scheduling: `Node selection based on capability and load`
109. Verify scheduling: `Retry on worker node failure`
110. Verify scheduling: `Session placement rules`
111. Verify remote operation model: `Standardized worker bootstrap`
112. Verify remote operation model: `Shared artifact store`
113. Verify remote operation model: `Central Postgres + Redis`
114. Verify remote operation model: `Secure credential distribution pattern`
115. Verify MCP transport evolution: `prefer stdio locally and streamable HTTP for remote/shared services`
116. Verify deliverable: `Leader on one node, workers on multiple nodes`
117. Verify deliverable: `Shared board and task state across nodes`
118. Verify deliverable: `Node-level health and utilization view`
119. Verify exit criterion: `run can place workers on at least 2 nodes and preserve task continuity`
120. Verify exit criterion: `session ownership remains sticky and explicit`
121. Verify exit criterion: `lost worker node causes bounded task failure and safe retry`

### Governance and enterprise readiness

122. Verify scope: `SSO / OIDC login`
123. Verify scope: `Workspace/team isolation`
124. Verify scope: `RBAC for run create/review/admin actions`
125. Verify scope: `Policy packs by team or repo`
126. Verify scope: `Approval delegation rules`
127. Verify scope: `Audit export`
128. Verify scope: `Retention controls`
129. Verify scope: `Secret source integrations`
130. Verify scope: `Admin reporting`
131. Verify deliverable: `Multi-user governance model`
132. Verify deliverable: `Approval and audit trail export`
133. Verify deliverable: `Team and repo policy management`
134. Verify exit criterion: `org admin can prove who approved what and when`
135. Verify exit criterion: `teams can set different policy profiles without code changes`
136. Verify exit criterion: `sensitive repos can run with stricter defaults than standard repos`

### GA and scaling envelope

137. Verify scope: `Operational SLOs`
138. Verify scope: `Backup/restore runbook`
139. Verify scope: `Disaster recovery testing`
140. Verify scope: `Migration and upgrade path`
141. Verify scope: `Cost/usage reporting`
142. Verify scope: `Performance tuning`
143. Verify scope: `Support playbooks`
144. Verify scope: `Reference deployments for single-host and multi-node environments`
145. Verify deliverable: `GA release candidate`
146. Verify deliverable: `Admin/developer/operator docs`
147. Verify deliverable: `Upgrade-safe schema and config versioning`
148. Verify deliverable: `Published support boundaries and limitations`
149. Verify exit criterion: `platform can run reliably under expected concurrency`
150. Verify exit criterion: `recovery procedures are tested`
151. Verify exit criterion: `docs are sufficient for a fresh team to deploy and use the product`

## Output Requirement

Each completed verification task must leave behind:

- a concise parity verdict
- supporting references into the repo
- any residual risks
- explicit backlog follow-up if the verdict is `gap`
