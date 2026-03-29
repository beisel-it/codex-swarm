# Development Team Template

Use this template when a codex-swarm run needs to ship product-facing work
across UI, API, contracts, and verification in parallel.

## Team shape

- `leader`
  - owns sequencing, task creation, dependency management, and final acceptance
- `architect`
  - defines contracts and system boundaries before code changes split
- `designer`
  - defines information architecture, interaction model, mobile behavior, and screenshot acceptance targets
- `frontend-developer`
  - implements browser and TUI product surfaces
- `backend-developer`
  - implements control-plane, orchestration, runtime, and persistence slices
- `reviewer`
  - performs defect-focused review of the integrated slice
- `tester`
  - proves the slice with repeatable checks and end-to-end evidence
- `technical-writer`
  - lands operator-facing docs or rollout notes when the slice changes product behavior

## When to use this team

Use this stack for work such as:

- new operator or product surfaces
- end-to-end execution-flow work
- contract changes that affect both frontend and backend
- milestone slices that need designer, implementer, reviewer, and QA coverage

## Launch pattern

1. Start a run with a goal and repository.
2. Create the initial task DAG.
3. Assign:
   - `architect` first for contracts if the slice changes shared shape
   - `designer` and `backend-developer` in parallel when the UX and API can be specified independently
   - `frontend-developer` once the UX handoff and contract boundary are clear
   - `reviewer` and `tester` after the implementation path is integrated
   - `technical-writer` when the slice changes operator or deployment behavior

## Minimum deliverables

- concrete task DAG with ownership
- checked-in implementation across the affected surfaces
- verification evidence from the same commands CI or operations will use
- screenshot evidence for UI work
- operator docs updated if the user-facing behavior changed

## Done criteria

- no task is left in placeholder or mock-backed state
- run/task state progresses automatically without manual repair for the shipped path
- all affected contracts, runtime behavior, and UI surfaces align
- the final reviewer and tester outputs are concrete enough to close the run
