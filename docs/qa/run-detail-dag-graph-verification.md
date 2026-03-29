# Run Detail DAG Graph Verification

Date: 2026-03-29
Owner: technical-writer
Task: Validate DAG graph behavior and regressions
Source of truth: `.swarm/plan.md`

## Verdict

- pass for reviewer handoff

## Summary

The Run Detail DAG graph preserves dependency parity with the existing textual
DAG view for the representative cases required by the run plan: simple chains,
branching, blocked-task paths, and empty or no-dependency states. The graph adds
layout, root-task, blocked-task, and unblock-path cues without changing the raw
task list beneath it.

## Verification Performed

Local commands:

- `corepack pnpm --dir apps/api test -- control-plane-service.tui.test.ts`
- `corepack pnpm --dir packages/contracts test`
- `corepack pnpm --dir frontend typecheck`
- `corepack pnpm --dir frontend build`

Result:

- all commands passed on the current branch
- the API command expanded to the full `apps/api` Vitest suite and passed

Inspected implementation points:

- `apps/api/src/services/control-plane-service.ts`
- `apps/api/test/control-plane-service.tui.test.ts`
- `packages/contracts/test/index.test.ts`
- `frontend/src/App.tsx`

## Scenario Matrix

### 1. Simple chain

Scenario:

- task A has no dependencies
- task B depends on task A
- task C depends on task B

Expected graph outcome:

- three nodes render in dependency order from left to right
- two directed edges render: `A -> B` and `B -> C`
- only task A is marked as a root task
- if task B is incomplete, task C is included in an unblock path that contains
  both task B and task C plus the `B -> C` edge

Expected textual outcome:

- task A shows `ready`
- task B shows task A in its dependency chips
- task C shows task B in its dependency chips

Parity check:

- the graph edge count and the textual dependency chips describe the same chain
- the graph adds ordering and path highlighting, but does not invent or hide
  dependencies relative to the textual list

### 2. Fan-out and fan-in branching

Scenario:

- fan-out: task A is a shared prerequisite for tasks B and C
- fan-in: task D depends on both tasks B and C

Expected graph outcome:

- task A appears as one root with two outgoing edges
- tasks B and C appear in the next dependency column
- task D renders with two incoming edges from tasks B and C
- the summary counts four tasks and four links

Expected textual outcome:

- task B lists task A as its only dependency
- task C lists task A as its only dependency
- task D lists both task B and task C as dependencies

Parity check:

- fan-out is visible as repeated dependency chips on B and C plus two outgoing
  edges from A
- fan-in is visible as two dependency chips on D plus two incoming edges to D

### 3. Blocked task and unblock-path behavior

Scenario:

- task A is completed
- task B is blocked on task A or otherwise still marked `blocked`
- task C is blocked on incomplete task B

Expected graph outcome:

- blocked tasks are counted in the graph summary and styled as blocked nodes
- incomplete prerequisite edges are styled as blocking links
- every blocked task gets an unblock-path entry
- for task C, the unblock path includes task C, task B, and the `B -> C` edge
- completed dependencies are still shown as edges, but are marked satisfied
  rather than blocking

Expected textual outcome:

- task statuses remain visible from the raw task cards
- dependency chips still list the same prerequisite task ids that generated the
  graph edges

Parity check:

- the graph and text agree on which tasks are linked
- the graph adds unblock-path emphasis derived from unresolved dependencies;
  the textual list remains the raw dependency reference

### 4. Empty and no-dependency cases

Scenario A: no tasks exist for the run yet

Expected graph outcome:

- the graph panel shows `No task DAG data published for this run yet.`

Expected textual outcome:

- the textual DAG list shows `No task DAG entries recorded for this run.`

Scenario B: tasks exist, but every task has an empty dependency list

Expected graph outcome:

- every task renders as a root task in a single column
- the summary shows `0 links`
- the graph adds `All tasks are dependency-free`
- the note explains that every task is currently a root task

Expected textual outcome:

- every task shows the `ready` chip instead of dependency ids

Parity check:

- both views present the run as dependency-free
- the graph adds only the aggregate summary and single-column layout

## Expected Unblock-Path Rules

- unblock paths are calculated per blocked task
- only unresolved dependencies contribute blocking edges to a path
- satisfied dependencies remain visible as normal edges but are not highlighted
  as blocking
- a blocked task can appear in multiple unblock paths when it is a shared
  blocker for downstream work
- root tasks are never shown as depending on anything, even when they block
  downstream tasks

## Known Limitations

1. The textual DAG remains a raw card list and does not visually group tasks by
   graph column or path; reviewers should use it for exact dependency ids and
   statuses, not for topology.
2. The frontend recomputes block pressure from live task dependencies when it
   builds the graph model. That is useful for parity, but it means the graph can
   emphasize unresolved dependency pressure even if a stale published `taskDag`
   payload under-reports it.
3. A task that is explicitly marked `blocked` but has no unresolved dependency
   edges still appears in `blockedTaskIds`; its unblock path may therefore
   contain only the task itself and no highlighted incoming edge.
