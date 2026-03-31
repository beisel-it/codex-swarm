# Task DAG Restoration Validation

Date: 2026-03-31
Owner: tester
Task: Prove DAG restoration with repeatable validation
Source of truth: `.swarm/plan.md`

## Verdict

- pass for the DAG restoration validation slice

## Automated Checks

Commands run locally:

- `corepack pnpm --dir frontend test -- task-dag.test.tsx`
- `corepack pnpm --dir frontend typecheck`
- `corepack pnpm --dir frontend build`

Observed result:

- all three commands passed on the current branch
- `task-dag.test.tsx` passed 4 targeted DAG tests
- the current `frontend test` command also ran `src/agent-observability.test.ts` and `src/projects.test.ts`; all 11 tests passed

## Browser Validation Setup

Validation used the built frontend preview with runtime config pointed at a local fixed-response mock API. The mock API exposed two representative run details through the current product route structure:

- branching run: one root, fan-out to two tasks, then fan-in to a blocked review task
- chain run: one simple three-task dependency chain

The browser checks were executed against the actual Board workspace routes:

- `/runs/run-branch/board`
- `/runs/run-chain/board`

## Repeatable Checklist

1. Start the frontend preview with `CODEX_SWARM_API_BASE_URL` pointing at an API that returns:
   - a branching `RunDetail` with `taskDag`
   - a linear-chain `RunDetail` with `taskDag`
2. Open the branching run Board on a desktop-sized viewport.
3. Confirm the DAG panel renders between the task board and task detail surface.
4. Confirm the branching graph shows:
   - 4 tasks
   - 4 links
   - 1 blocked task
   - one root feeding two middle tasks that converge on one blocked leaf
5. Click a DAG node and confirm:
   - the clicked node becomes selected (`aria-pressed=true`)
   - the shared task detail panel updates to the clicked task
6. Open the linear-chain run Board on a mobile-sized viewport.
7. Confirm the DAG panel remains present and readable in the stacked mobile layout.
8. Click a DAG node and confirm the shared task detail panel updates on mobile as well.

## Evidence

### Desktop: branching dependencies

- [docs/qa/artifacts/task-dag-branch-desktop.png](/home/florian/.local/share/codex-swarm/workspaces/codex-swarm-main/2a9cfaf8-b550-4f10-b3a5-40dc91f3ab1f/shared/docs/qa/artifacts/task-dag-branch-desktop.png)
  - Board route rendered with the restored DAG panel in the live Board layout
  - graph summary showed `4 tasks`, `4 links`, `1 blocked`
  - node topology matched root -> fan-out -> fan-in
- [docs/qa/artifacts/task-dag-branch-selected-desktop.png](/home/florian/.local/share/codex-swarm/workspaces/codex-swarm-main/2a9cfaf8-b550-4f10-b3a5-40dc91f3ab1f/shared/docs/qa/artifacts/task-dag-branch-selected-desktop.png)
  - DAG node `Review integration risks` changed from `aria-pressed=false` to `aria-pressed=true`
  - shared task detail heading updated from `Plan DAG restoration` to `Review integration risks`

### Mobile: linear dependency chain

- [docs/qa/artifacts/task-dag-chain-mobile.png](/home/florian/.local/share/codex-swarm/workspaces/codex-swarm-main/2a9cfaf8-b550-4f10-b3a5-40dc91f3ab1f/shared/docs/qa/artifacts/task-dag-chain-mobile.png)
  - current mobile route render for the chain scenario
- [docs/qa/artifacts/task-dag-chain-mobile-dag.png](/home/florian/.local/share/codex-swarm/workspaces/codex-swarm-main/2a9cfaf8-b550-4f10-b3a5-40dc91f3ab1f/shared/docs/qa/artifacts/task-dag-chain-mobile-dag.png)
  - mobile viewport anchored on the DAG section itself
- [docs/qa/artifacts/task-dag-chain-mobile-selected.png](/home/florian/.local/share/codex-swarm/workspaces/codex-swarm-main/2a9cfaf8-b550-4f10-b3a5-40dc91f3ab1f/shared/docs/qa/artifacts/task-dag-chain-mobile-selected.png)
  - DAG node `Verify chain behavior` changed from `aria-pressed=false` to `aria-pressed=true`
  - shared task detail heading updated from `Plan restoration` to `Verify chain behavior`
- [docs/qa/artifacts/task-dag-chain-mobile-full.png](/home/florian/.local/share/codex-swarm/workspaces/codex-swarm-main/2a9cfaf8-b550-4f10-b3a5-40dc91f3ab1f/shared/docs/qa/artifacts/task-dag-chain-mobile-full.png)
  - full-page mobile capture showing the Board route, DAG section, and downstream task detail in one artifact

## Observations

- The restored DAG is present in the current Board experience, not isolated in a side route or test harness.
- The panel uses current run data and respects both explicit `taskDag` metadata and shared task selection state.
- Desktop layout preserves the intended placement between the board and task detail surfaces.
- Mobile layout keeps the DAG reachable in the stacked flow and preserves node-to-detail selection sync.

## Known Limitations And Untested Edges

1. This validation used controlled local API fixtures rather than a live Postgres-backed control-plane run. It proves the current product route and rendering behavior, but not database or orchestration persistence.
2. The scenario set covered one branching graph and one simple chain. It did not cover very dense graphs, empty/no-dependency runs, missing `taskDag` fallback-only rendering, or malformed/cyclic payloads.
3. The mobile evidence confirms usability of the stacked Board route and node selection, but it does not measure touch hit-area ergonomics or horizontal overflow with larger graphs.
