# M9 Readiness Review

Date: 2026-03-29
Owner: tech-lead
Task: `bf45184e`
Scenario target: `15dc096b`

## Decision

- go

## Readiness Assertions

### 1. Shared branch stability

Satisfied by:

- [docs/qa/m9-branch-stability.md](/home/florian/codex-swarm/docs/qa/m9-branch-stability.md)

Result:

- `ci:typecheck`, `ci:test`, and `ci:build` passed on the intended branch head
- generated `.ops/m9` prep output was removed from the repo worktree before the
  go decision so the shared branch is clean again

### 2. Isolated run environment and fresh-workdir procedure

Satisfied by:

- [docs/operations/m9-readiness.md](/home/florian/codex-swarm/docs/operations/m9-readiness.md)
- `ops:m9:prepare`

Result:

- fresh run root prepared at:
  `/tmp/codex-swarm-m9/m9-landing-page-001`
- isolated workspace path:
  `/tmp/codex-swarm-m9/m9-landing-page-001/workspace`
- manifest path:
  `/tmp/codex-swarm-m9/m9-landing-page-001/manifest.json`

### 3. Designer and developer playbook

Satisfied by:

- [docs/architecture/m9-designer-developer-playbook.md](/home/florian/codex-swarm/docs/architecture/m9-designer-developer-playbook.md)

Result:

- `designer` and `developer` are now explicit M9 agents on the team
- design handoff is required before implementation
- the leader remains in orchestration mode and does not do the implementation

### 4. Acceptance and regression protocol

Satisfied by:

- [docs/qa/m9-acceptance-and-regression-protocol.md](/home/florian/codex-swarm/docs/qa/m9-acceptance-and-regression-protocol.md)

Result:

- pass/fail evidence is defined in advance
- regression classification rules are explicit

## Dispatch Result

The readiness gate is satisfied, so `15dc096b` has been moved to `in_progress`.

Scenario tasks created:

- `e3539a65` design handoff, owner `designer`
- `12758dd9` implementation, owner `developer`

Dependency:

- `12758dd9` is blocked by `e3539a65`

## Guardrails

- work must stay inside the prepared M9 workspace
- the leader must not implement the landing page directly
- the developer must not start before the design handoff is explicit and
  recorded
