# Post-M10 TUI Delivery Plan

## Goal

Ship a beautiful and feature-complete codex-swarm terminal UI that takes stylistic
inspiration from clawteam's terminal board while remaining native to codex-swarm's
workflow model, governance surfaces, and distributed execution model.

## Source Research

Clawteam does not use Textual or curses for its terminal board. The current
implementation is:

- Python `rich` terminal rendering in
  `clawteam/clawteam/board/renderer.py`
- live refresh via `rich.live.Live`
- panel, table, and columns composition via `rich.panel.Panel`,
  `rich.table.Table`, and `rich.columns.Columns`
- a separate lightweight HTTP web board in
  `clawteam/clawteam/board/server.py`

So the design target is not "copy Textual". The correct inspiration is:

- polished live terminal dashboard
- strong information density
- visually distinct summary cards and kanban columns
- operator-first navigation for active work, inbox state, and blocked items

## Technical Direction

Codex Swarm should implement the TUI as a dedicated TypeScript package using
`ink` as the terminal-rendering foundation.

Reasoning:

- it matches the repo's existing TypeScript and React skill base
- it is the closest declarative analogue to clawteam's Rich composition model
- it supports a beautiful operator-grade terminal experience without introducing
  a second language/runtime stack just for the TUI
- it keeps future sharing of render logic, view models, and types practical

## Product Scope

The TUI should be more than a terminal mirror of the web board. It should be the
best operator-first surface for fast triage and control.

### Required views

1. Team and run overview
2. Task kanban with blocked-by visibility
3. Worker fleet and dispatch health
4. Inbox and operator-alert summary
5. Run detail drilldown
6. Review and governance summary
7. Help and keybinding surface

### Required operator actions

1. Switch active run or team context
2. Navigate from board to run detail without leaving the TUI
3. Refresh or toggle live-refresh interval
4. Highlight blocked tasks, pending approvals, failed validations, and node-loss state
5. Launch the TUI through a stable repo command

## Deliverables

### D1. Framework and interaction note

- checked-in architecture note confirming clawteam's real terminal-board stack
- explicit codex-swarm TUI framework decision and rationale
- view inventory and interaction model

### D2. TUI package and launch path

- new `apps/tui` package
- root script for launching the TUI from the repo
- configuration and dependency wiring

### D3. Board and operator dashboard

- summary cards for runs, tasks, approvals, validations, and fleet health
- kanban columns for pending, in-progress, completed, and blocked tasks
- live refresh with graceful empty and disconnected states

### D4. Drilldown views

- run detail
- review/governance summary
- worker fleet and dispatch panel
- operator help/keybinding surface

### D5. TUI-facing data support

- any missing backend aggregation or query surface required for efficient TUI rendering
- stable contract for diff/review/governance data used by the terminal views

### D6. Documentation and acceptance

- operator-facing TUI usage doc
- screenshots or terminal captures
- acceptance checklist and regression protocol

## Definition of Done

The post-M10 TUI task is done only when all of the following are true:

1. `corepack pnpm tui` or an equivalent root-level command launches the codex-swarm TUI.
2. The TUI renders a polished live board with summary cards and kanban structure
   comparable in clarity and quality to clawteam's Rich board.
3. The TUI includes codex-swarm-specific depth that clawteam does not have:
   run detail, review/governance summary, worker fleet, and dispatch state.
4. Keyboard navigation is documented and usable without hidden prompt lore.
5. Empty, loading, and disconnected states are handled intentionally.
6. The implementation is typechecked, tested, and build-safe in the workspace.
7. Operator docs include launch instructions, screenshots/captures, and a short
   workflow walkthrough.
8. QA acceptance passes against the checked-in criteria.

## Acceptance Criteria

### A. Framework correctness

- the checked-in docs explicitly state that clawteam's board uses Rich, not Textual
- codex-swarm's chosen TUI foundation is explicit and justified

### B. Operator usefulness

- an operator can identify blocked work, pending approvals, recent validation failures,
  and worker-fleet issues from the TUI without falling back to the browser
- an operator can move from summary to run detail in one session

### C. Visual quality

- the TUI is visually intentional, not a plain log dump
- summary, kanban, alerts, and drilldowns are readable on a standard terminal
- color and layout choices make state distinctions obvious

### D. Verification

- package-level typecheck passes
- workspace `ci:typecheck`, `ci:test`, and `ci:build` pass
- QA acceptance doc is satisfied

## Task Matrix

### T1. Visual spec and terminal interaction model

Owner: `designer`

Focus:

- define the terminal visual language
- define summary-card, kanban, panel, alert, and drilldown composition
- define keybindings and focus model

### T2. TUI data contract and aggregation support

Owner: `backend-dev`

Focus:

- expose any missing aggregation needed for efficient TUI rendering
- keep contracts and API stable for operator views

### T3. TUI shell and board implementation

Owner: `frontend-dev`

Focus:

- create `apps/tui`
- implement the main board, navigation shell, live refresh, and state handling

### T4. Run/review drilldown implementation

Owner: `developer`

Focus:

- implement run detail, review/governance, and fleet/dispatch drilldowns inside the TUI

### T5. Packaging and operator launch flow

Owner: `devops`

Focus:

- add root launch commands
- verify environment assumptions
- document operator launch and capture workflow

### T6. Acceptance and regression gate

Owner: `qa-engineer`

Focus:

- define and run the TUI acceptance matrix
- verify launch, rendering quality, navigation, and operator usefulness

## Dependency Order

1. T1 visual spec
2. T2 data support and T3 shell can begin in parallel
3. T4 drilldowns depend on the shell and any missing TUI data support
4. T5 packaging can run in parallel once the shell exists
5. T6 acceptance runs last

## Explicit Non-Goals

- replacing the browser UI
- introducing a second Python-based TUI stack into codex-swarm
- copying clawteam's feature set verbatim without codex-swarm-specific operator depth
