# M7 Frontend Parity Review

Reviewed against the live frontend implementation in `frontend/src/App.tsx`, current user/admin docs, and screenshot evidence captured under `docs/assets/screenshots/`.

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
- Verdict: `parity`
- Evidence:
  - Review state now hydrates reviewer artifact detail from `GET /api/v1/artifacts/:id` and keeps the adapter local to the review surface ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1285), [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1586))
  - The review workspace renders an explicit diff-review surface with loading, error, and no-artifact states, rather than relying only on generic artifact cards ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2601))
  - Reviewer-facing file evidence is visible directly in-browser through changed-file cards, insertions/deletions, summary text, and optional provider links ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2642))
  - Inline reviewer context and raw diff preview remain in the same decision workspace as approve/reject actions, validations, and the generic artifact list ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2689), [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2751), [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2778))
  - User docs now describe the in-browser diff-summary workflow for reviewers ([docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md#L88))
- Residual risk:
  - Browser evidence still needs a refreshed screenshot pass once a stable live diff artifact is available in the running environment; current proof is strongest in the checked-in UI and docs.

## Task 54

- Roadmap entry: `ROADMAP.md` UI scope, `Browser board showing: pending approvals` ([ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md#L148))
- Verdict: `parity`
- Evidence:
  - Board state now derives run-scoped pending approvals directly from the live approval collection and filters them for board display ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1536))
  - The board view includes a dedicated `Board signals` panel with a `Pending approvals` section, approval count, request summary, requester, and task/run scope metadata ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1866))
  - The board layout and responsive styles explicitly include the new board-signal panel ([frontend/src/index.css](/home/florian/codex-swarm/frontend/src/index.css#L255))
- Residual risk:
  - Screenshot/user-doc evidence has not yet been refreshed to call out the new board-signal panel, so the strongest proof is in the live implementation.

## Task 55

- Roadmap entry: `ROADMAP.md` UI scope, `Browser board showing: recent validations` ([ROADMAP.md](/home/florian/codex-swarm/ROADMAP.md#L149))
- Verdict: `parity`
- Evidence:
  - Board state now derives recent validations from the live validation collection, sorts them by recency, and limits the board view to the newest records ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1537))
  - The board view includes a dedicated `Recent validations` section with status, command, and summary/command fallback in the board-signal panel ([frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L1903))
  - The board layout and responsive styles explicitly include the new board-signal panel ([frontend/src/index.css](/home/florian/codex-swarm/frontend/src/index.css#L255))
- Residual risk:
  - The board shows recent validation summaries, but the fuller history still lives in the review tab by design.

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
