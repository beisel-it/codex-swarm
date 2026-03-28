# M7 Frontend Parity Review

Reviewed on HEAD `0c27745` against the live frontend implementation in `frontend/src/App.tsx`, current user/admin docs, and screenshot evidence captured under `docs/assets/screenshots/`.

## Task 51

- Roadmap entry: `ROADMAP.md` UI scope, `Browser board showing: task DAG and statuses` ([ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md#L144))
- Verdict: `better`
- Evidence:
  - Board status lanes render task cards grouped by status, including blocker chips for dependency IDs ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1846))
  - Dedicated DAG panel renders dependencies and readiness state for each task ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1911))
  - User docs call out task lanes and DAG as the operator’s unblock surface ([docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L58))
  - Screenshot evidence: [user-board-overview.png](/home/florian/codex-swarm/docs/assets/screenshots/user-board-overview.png)
- Residual risk:
  - The evidence is strong for parity, but the board remains a single-page tabbed surface rather than a route-per-surface app. That does not block the roadmap item.

## Task 52

- Roadmap entry: `ROADMAP.md` UI scope, `Browser board showing: agent lanes` ([ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md#L146))
- Verdict: `better`
- Evidence:
  - Board view includes a dedicated `Agent lanes` panel, not a secondary detail-only surface ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1950))
  - Each lane shows worker ownership, current task, branch, Codex session thread, placement, session state, heartbeat, and drain-state metadata ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1958))
  - User docs describe the board as covering tasks, approvals, agents, and worker placement, which is consistent with the implemented board surface ([docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L102))
  - Screenshot evidence: [user-board-overview.png](/home/florian/codex-swarm/docs/assets/screenshots/user-board-overview.png)
- Residual risk:
  - The screenshot evidence is wider than the specific lane panel, so the strongest support is the live implementation in `App.tsx`.

## Task 53

- Roadmap entry: `ROADMAP.md` UI scope, `Browser board showing: blocked work` ([ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md#L147))
- Verdict: `better`
- Evidence:
  - The board sidebar exposes a `Blocked tasks` metric for the selected run ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1708))
  - The task board includes a dedicated blocked lane because blocked status is part of the task status order ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1040), [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1864))
  - Blocked tasks render dependency chips labeled `blocked by ...`, making the specific blocker visible from the board itself ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1884))
  - User docs instruct operators to scan blocked work from the board before acting ([docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L58))
  - Screenshot evidence: [user-board-overview.png](/home/florian/codex-swarm/docs/assets/screenshots/user-board-overview.png)
- Residual risk:
  - The blocked-work signal is per selected run rather than a cross-run aggregate, which still satisfies the roadmap wording.

## Task 56

- Roadmap entry: `ROADMAP.md` UI scope, `Run details page` ([ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md#L150))
- Verdict: `better`
- Evidence:
  - Run detail tab exposes lifecycle, fleet posture, session reconciliation, and PR handoff summaries ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2022))
  - Provider detail covers onboarding state, publish state, and PR reflection ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2071))
  - Placement and recovery panels expose sticky node, constraints, stale reasons, sandbox, and session state ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2117), [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2163))
  - User docs describe the run-detail walkthrough and its placement/recovery usage ([docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L69))
  - Screenshot evidence: [user-run-detail.png](/home/florian/codex-swarm/docs/assets/screenshots/user-run-detail.png)
- Residual risk:
  - This surface depends on live session, worker-node, and provider hydration. When backend endpoints degrade, the UI can still fall back, but some details may be snapshot-backed.

## Task 57

- Roadmap entry: `ROADMAP.md` UI scope, `Review page for artifacts and diff summaries` ([ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md#L151))
- Verdict: `gap`
- Evidence:
  - Review workspace supports approval selection, requested context, resolution payloads, and approve/reject actions ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2222))
  - Validation history and artifact review are present in the same surface ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2321), [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2348))
  - Artifact typing includes `diff`, but the artifact UI only renders kind, path/link, and content type, with no diff-summary-specific presentation ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L33), [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2356))
  - User docs describe approvals, validations, and artifacts, but not in-browser diff summaries ([docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L80))
  - Screenshot evidence: [user-review-console.png](/home/florian/codex-swarm/docs/assets/screenshots/user-review-console.png)
- Residual risk:
  - Reviewers can inspect generic artifacts, but the roadmap wording promised explicit diff-summary behavior in the review page.
- Follow-up:
  - Reported to `tech-lead`; backlog follow-up has already been created per direct confirmation.

## Task 54

- Roadmap entry: `ROADMAP.md` UI scope, `Browser board showing: pending approvals` ([ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md#L148))
- Verdict: `gap`
- Evidence:
  - The board view renders fleet, provider, task lanes/DAG, and agent lanes, but no dedicated approvals panel or pending-approval list in the board surface ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1753))
  - Approval data is loaded and filtered for the selected run, but the rendered approval list only appears in the `Review workspace` tab ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1524), [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2222))
  - The board overview docs mention blocked work and task lanes, while approvals are documented under the review console instead ([docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L58), [docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L80))
- Residual risk:
  - Operators can still infer approval pressure from run status such as `awaiting_approval`, but that is not the same as explicit pending approvals on the board.
- Follow-up:
  - Reported to `tech-lead`; backlog follow-up requested if board-level approval visibility remains required by roadmap parity.

## Task 55

- Roadmap entry: `ROADMAP.md` UI scope, `Browser board showing: recent validations` ([ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md#L149))
- Verdict: `gap`
- Evidence:
  - Validation data is loaded and filtered for the selected run, but it is rendered in `Validation history` inside the `Review` tab rather than on the board surface ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1525), [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2321))
  - The board view panels do not include a validation summary card, validation timeline, or recent-checks section ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1753))
  - User docs describe validations as part of the review console workflow, not the board overview ([docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L80))
- Residual risk:
  - Users must switch tabs to inspect validations, which weakens the operator signal the roadmap promised directly on the board.
- Follow-up:
  - Reported to `tech-lead`; backlog follow-up requested if board-level validation visibility remains required by roadmap parity.

## Task 82

- Roadmap entry: `ROADMAP.md` Git provider integration scope, `PR status reflection into the board` ([ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md#L205))
- Verdict: `better`
- Evidence:
  - Run overview shows PR status and PR number directly in the board summary card ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1728))
  - Board provider panel shows publish state and a pull-request card with provider link ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1800))
  - Run detail provider panel repeats PR reflection with handoff state, PR number, and URL ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2100))
  - User docs explicitly instruct operators to confirm branch, publish state, and PR reflection from the board and run detail surfaces ([docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L58), [docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L69))
  - Screenshot evidence: [user-board-overview.png](/home/florian/codex-swarm/docs/assets/screenshots/user-board-overview.png), [reference-multinode-board.png](/home/florian/codex-swarm/docs/assets/screenshots/reference-multinode-board.png)
- Residual risk:
  - The UI reflects backend-provided PR state but does not independently prove provider webhook timeliness. The roadmap item only requires reflection into the board, which is present.
