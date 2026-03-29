# Codex Swarm Operator Journey

This page is a storyboard for the operator loop that Codex Swarm is built to support. It shows how a repository moves from onboarding through dispatch, review, and publish handoff while keeping policy, approvals, transcripts, artifacts, and audit evidence visible in the same operating model.

## Journey At A Glance

| Phase | Storyboard | Status chips |
| --- | --- | --- |
| 1. Onboard | Define the repository boundary, trust posture, policy profile, and provider context before work starts. The goal is to make governance and execution constraints explicit up front instead of rediscovering them during a blocked run. | ![Policy ready](https://img.shields.io/badge/policy-ready-0A7F5A?style=flat-square) ![Trust scoped](https://img.shields.io/badge/trust-scoped-1F6FEB?style=flat-square) ![Provider linked](https://img.shields.io/badge/provider-linked-7A3EF0?style=flat-square) |
| 2. Create Run | Create a run with a concrete delivery goal, branch target, and dependency-safe task graph. This is where the operator turns intent into a controlled execution envelope with clear success criteria and known review gates. | ![Goal set](https://img.shields.io/badge/goal-set-0A7F5A?style=flat-square) ![Branch pinned](https://img.shields.io/badge/branch-pinned-1F6FEB?style=flat-square) ![DAG planned](https://img.shields.io/badge/dag-planned-7A3EF0?style=flat-square) |
| 3. Dispatch | Dispatch slices across agents and workers while the board tracks blockers, approvals, validation pressure, and publish posture. The operator uses this phase to keep throughput high without losing visibility into where work is stuck or why. | ![Agents active](https://img.shields.io/badge/agents-active-0A7F5A?style=flat-square) ![Blockers visible](https://img.shields.io/badge/blockers-visible-C97A00?style=flat-square) ![Evidence flowing](https://img.shields.io/badge/evidence-flowing-7A3EF0?style=flat-square) |
| 4. Review / Approval | Pull current diffs, validations, approvals, and artifacts into one review loop so approval decisions stay tied to fresh evidence. This is where the operator decides whether the run is genuinely reviewable or still missing proof. | ![Approval pending](https://img.shields.io/badge/approval-pending-C97A00?style=flat-square) ![Validations current](https://img.shields.io/badge/validations-current-1F6FEB?style=flat-square) ![Diff checked](https://img.shields.io/badge/diff-checked-7A3EF0?style=flat-square) |
| 5. Publish / Handoff | Publish the branch and attach provider PR metadata or a manual handoff package with the relevant audit trail. The operator exits with a traceable delivery handoff instead of an unstructured “done” claim. | ![Branch published](https://img.shields.io/badge/branch-published-0A7F5A?style=flat-square) ![PR reflected](https://img.shields.io/badge/pr-reflected-1F6FEB?style=flat-square) ![Audit export ready](https://img.shields.io/badge/audit-export-ready-7A3EF0?style=flat-square) |

## Storyboard

### 1. Onboard

**Operator focus:** establish the repository contract before any agent starts work.

The operator sets workspace ownership, policy profile, trust level, and provider linkage so later approvals and secret access checks inherit from explicit governance instead of guesswork.

**Signals in play:** ![Policy ready](https://img.shields.io/badge/policy-ready-0A7F5A?style=flat-square) ![Repo trusted](https://img.shields.io/badge/repository-trusted-1F6FEB?style=flat-square) ![Secrets bounded](https://img.shields.io/badge/secrets-bounded-5B6577?style=flat-square)

### 2. Create Run

**Operator focus:** turn a goal into an execution plan that the swarm can actually route.

The run captures branch context, desired outcome, concurrency posture, and a dependency-safe task graph. That gives the board and worker runtime a structured object to drive instead of a flat checklist.

**Signals in play:** ![Goal set](https://img.shields.io/badge/goal-set-0A7F5A?style=flat-square) ![Run scoped](https://img.shields.io/badge/run-scoped-1F6FEB?style=flat-square) ![DAG ready](https://img.shields.io/badge/dag-ready-7A3EF0?style=flat-square)

### 3. Dispatch

**Operator focus:** keep execution moving while preserving accountability.

The board becomes the main control surface: task lanes, worker placement, blockers, validations, and publish state all update in one place. Operators intervene here when a slice is stalled, approval-gated, or missing fresh evidence.

**Signals in play:** ![Agents active](https://img.shields.io/badge/agents-active-0A7F5A?style=flat-square) ![Blocked path visible](https://img.shields.io/badge/blocked-path-visible-C97A00?style=flat-square) ![Transcript visible](https://img.shields.io/badge/transcript-visible-7A3EF0?style=flat-square)

### 4. Review / Approval

**Operator focus:** decide against evidence, not intuition.

Review gathers approval requests, changed files, diff summaries, validations, and artifacts into a single checkpoint. The operator can either approve with confidence or reject with an explicit missing-evidence path that the swarm can act on.

**Signals in play:** ![Approval pending](https://img.shields.io/badge/approval-pending-C97A00?style=flat-square) ![Validations current](https://img.shields.io/badge/validations-current-1F6FEB?style=flat-square) ![Artifacts attached](https://img.shields.io/badge/artifacts-attached-0A7F5A?style=flat-square)

### 5. Publish / Handoff

**Operator focus:** leave the run in an externally reviewable and auditable state.

Once evidence is current, the operator publishes the branch, links provider PR state or manual handoff metadata, and confirms audit export coverage. That makes the run usable for downstream reviewers, support, and governance without reassembling history from logs.

**Signals in play:** ![Branch published](https://img.shields.io/badge/branch-published-0A7F5A?style=flat-square) ![Handoff attached](https://img.shields.io/badge/handoff-attached-1F6FEB?style=flat-square) ![Audit export ready](https://img.shields.io/badge/audit-export-ready-7A3EF0?style=flat-square)

## Artifact Timeline

| Artifact | Typical phase | Why it matters to the operator |
| --- | --- | --- |
| `policy profile` | Onboard | Defines trust posture, approval defaults, and secret boundary before execution starts. |
| `run goal` and `task DAG` | Create Run | Establish the unit of execution, sequencing rules, and expected completion path. |
| `transcripts` | Dispatch | Preserve live execution context when a slice needs follow-up, reassignment, or recovery. |
| `approvals` | Review / Approval | Capture explicit go or no-go decisions with provenance rather than implicit status changes. |
| `validations` and `artifacts` | Dispatch -> Review / Approval | Tie generated output and test evidence to the approval checkpoint. |
| `audit export` | Publish / Handoff | Packages the run history for governance, support, and external handoff. |

## Surface Heatmap

Use this matrix to see which browser surface carries the most operator weight in each phase.

| Surface | Onboard | Create Run | Dispatch | Review / Approval | Publish / Handoff |
| --- | --- | --- | --- | --- | --- |
| Board | ![Secondary](https://img.shields.io/badge/secondary-8B949E?style=flat-square) | ![Primary](https://img.shields.io/badge/primary-0A7F5A?style=flat-square) | ![Primary](https://img.shields.io/badge/primary-0A7F5A?style=flat-square) | ![Secondary](https://img.shields.io/badge/secondary-8B949E?style=flat-square) | ![Secondary](https://img.shields.io/badge/secondary-8B949E?style=flat-square) |
| Review | ![Observe](https://img.shields.io/badge/observe-CFD6E4?style=flat-square&logoColor=black) | ![Observe](https://img.shields.io/badge/observe-CFD6E4?style=flat-square&logoColor=black) | ![Secondary](https://img.shields.io/badge/secondary-8B949E?style=flat-square) | ![Primary](https://img.shields.io/badge/primary-0A7F5A?style=flat-square) | ![Secondary](https://img.shields.io/badge/secondary-8B949E?style=flat-square) |
| Admin | ![Primary](https://img.shields.io/badge/primary-0A7F5A?style=flat-square) | ![Secondary](https://img.shields.io/badge/secondary-8B949E?style=flat-square) | ![Observe](https://img.shields.io/badge/observe-CFD6E4?style=flat-square&logoColor=black) | ![Secondary](https://img.shields.io/badge/secondary-8B949E?style=flat-square) | ![Primary](https://img.shields.io/badge/primary-0A7F5A?style=flat-square) |

**Reading the heatmap:** `Primary` means the phase is mainly driven from that surface, `Secondary` means the surface adds supporting context, and `Observe` means the surface is usually passive unless something needs escalation. Run Detail remains the supporting drill-down for placement, transcript, recovery, and handoff specifics during dispatch and review.

## Where To Dive Deeper

- [Operator Guide](./operator-guide.md) for the external Codex control flow and skill map
- [User Guide](./user-guide.md) for board, run detail, and review walkthroughs
- [Admin Guide](./admin-guide.md) for governance, provenance, and audit-export checks
- [README](../README.md) for the product overview and major UI surfaces
