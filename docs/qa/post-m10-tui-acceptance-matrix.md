# Post-M10 TUI Acceptance Matrix

Date: 2026-03-29
Owner: qa-engineer
Related task: `71f4345b`
Source of truth: `docs/architecture/post-m10-tui-delivery-plan.md`

## Scope

This document prepares the QA acceptance and regression gate for the codex-swarm
terminal UI described in the post-M10 delivery plan.

This is a prep artifact only. Final acceptance remains blocked until the TUI
implementation tasks land.

## Pass Conditions

The TUI should be accepted only when all of the following are true.

### 1. Launch and packaging

- a root-level launch command exists, such as `corepack pnpm tui`
- the command launches the codex-swarm TUI without undocumented setup steps
- startup failures produce actionable errors rather than raw stack noise

### 2. Rendering quality

- the initial board render is visually intentional, not a plain log stream
- summary cards, kanban columns, alerts, and drilldown panels are readable on a
  normal terminal size
- blocked, failed, warning, and healthy states are visually distinct
- empty, loading, and disconnected states are handled intentionally

### 3. Live refresh behavior

- live refresh updates board state without corrupting layout
- refresh cadence is visible or documented
- refresh can be triggered or adjusted through the documented operator flow if
  the implementation claims that capability
- transient data loss or API failure degrades gracefully

### 4. Navigation and interaction

- an operator can move from the board overview to run detail in one session
- navigation between board, drilldowns, help, and review surfaces is usable
  without hidden keybindings
- the help or keybinding surface is discoverable from inside the TUI
- focus and selection behavior remain coherent after refreshes

### 5. Board usefulness

- the TUI lets an operator identify blocked work
- pending approvals are visible without switching to the browser
- recent validation failures are visible without switching to the browser
- the task view keeps blocked-by relationships understandable

### 6. Review and governance usefulness

- review or governance summary surfaces show enough signal to understand whether
  a run is awaiting approval or affected by governance constraints
- the TUI does not present review state as a generic placeholder when real
  codex-swarm data exists

### 7. Fleet and distributed-state usefulness

- worker fleet and dispatch health are visible from the TUI
- node-loss, drain, stale, or degraded worker conditions are visible
- the TUI exposes codex-swarm-specific distributed state rather than just raw
  counts

### 8. Verification safety

- package-level typecheck passes for the TUI package
- workspace `ci:typecheck`, `ci:test`, and `ci:build` pass
- operator docs include launch instructions and a short workflow walkthrough
- terminal screenshots or captures exist for review evidence

## Required Evidence

Final acceptance should collect all of the following.

### Command evidence

- TUI launch command output
- package-level typecheck result
- workspace `ci:typecheck`, `ci:test`, and `ci:build` results

### Visual evidence

- initial launch capture
- live board capture
- run-detail drilldown capture
- review or governance capture
- fleet or dispatch capture
- help or keybinding capture
- empty or disconnected state capture if applicable

### Interaction evidence

- a short operator walkthrough proving navigation from overview to drilldown
- a note on how refresh works and what happens during degraded data states

## Regression Buckets

Every TUI failure should be classified into one of these buckets.

### A. Visual regression

Use when:

- layout collapses or overlaps
- state colors or labels become unreadable
- panels or kanban columns no longer convey state clearly

### B. Data regression

Use when:

- the TUI omits live codex-swarm state that the browser or API exposes
- blocked work, approvals, validations, or fleet data are wrong or stale in a
  way that exceeds the documented refresh model
- drilldowns show placeholder or empty content despite live backend data

### C. Navigation regression

Use when:

- keybindings are undocumented, broken, or inconsistent
- focus jumps unexpectedly
- operators cannot reach run detail, review, or fleet panels from the board

### D. Packaging or launch regression

Use when:

- the root launch command is missing or broken
- startup depends on hidden environment assumptions
- the TUI fails before rendering the intended surface

### E. Operator-usefulness regression

Use when:

- the TUI technically renders but does not let an operator answer the core triage
  questions the delivery plan requires
- the browser is still required for blocked work, approval state, or fleet
  visibility because the TUI surface is too shallow

## Final Acceptance Run Checklist

When implementation lands, QA should execute this checklist in order:

1. Launch the TUI through the documented root command.
2. Confirm initial render quality and startup state.
3. Verify live refresh behavior.
4. Verify navigation to run detail, review/governance, fleet, and help views.
5. Verify blocked-work, approval, validation, and fleet usefulness.
6. Capture required terminal screenshots.
7. Run workspace verification commands.
8. Classify any failure into exactly one primary regression bucket.
9. Record final pass or fail with concrete evidence.

## Current Blocker

Task `71f4345b` remains blocked until the TUI implementation tasks land:

- `dcf98be5`
- `c725113b`
- `6b07dd53`
- `009f8f0a`
- `b20b8a1f`
