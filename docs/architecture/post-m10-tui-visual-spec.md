# Post-M10 TUI Visual Spec

Date: 2026-03-29
Owner: frontend-dev
Related task: `dcf98be5`
Implementation reference:

- `apps/tui/src/index.tsx`
- `apps/tui/src/view-model.ts`
- `apps/tui/src/mock-data.ts`
- `docs/operations/tui-launch-and-capture.md`
- `docs/qa/post-m10-tui-acceptance-matrix.md`

## Purpose

This document is the checked-in visual and interaction contract for the
codex-swarm terminal UI. It closes the design-spec gap from
`docs/architecture/post-m10-tui-delivery-plan.md` task `T1` and gives later
shell, drilldown, capture, and QA work a stable surface model.

This is not a generic terminal style note. It describes the specific Ink shell
implemented in `apps/tui/src/index.tsx` and the data hierarchy derived in
`apps/tui/src/view-model.ts`.

## Design Target

The terminal board takes structural inspiration from clawteam's Rich board, but
the codex-swarm surface is intentionally mapped to codex-swarm operator
questions.

Clawteam-inspired qualities to preserve:

- dense but readable summary cards at the top of the screen
- a board-first main view with sidecar alerts and inbox state
- color-coded operator state instead of raw log output
- one-session navigation between overview and deeper inspection views

Codex-swarm-specific differences to preserve:

- run-centric context rather than a generic team-only queue
- explicit review, governance, and validation signal
- distributed-worker and session-placement state
- mock/live/disconnected operating modes in the shell header

## Canonical Screen Stack

The screen is a fixed vertical stack in this order:

1. Header
2. View navigation bar
3. Status strip
4. Summary-card row
5. Primary view surface
6. Footer

This stack is implemented directly in `apps/tui/src/index.tsx` through `Header`,
`NavBar`, `StatusStrip`, `StatCard`, the selected view component, and `Footer`.

### Terminal geometry assumption

The intended review geometry is the capture default from
`docs/operations/tui-launch-and-capture.md`:

- 140 columns
- 40 rows

The layout must still degrade cleanly below that size, but QA and screenshot
evidence should treat 140x40 as the reference frame.

## Visual System

### Tone palette

Use terminal color as semantic state, not decoration.

- `cyanBright`: shell identity, live info, active navigation, info state
- `greenBright`: healthy or complete state
- `yellowBright`: blocked, pending, degraded, or cautionary state
- `redBright`: failed, offline, stale, or urgent operator state
- `blueBright`: discoverability and help/inbox surfaces
- `magentaBright`: kanban and task-structure emphasis
- `gray`: supporting metadata, timestamps, counts, and lower-priority copy
- `white` / `whiteBright`: primary content and headings

### Border rules

Every operator-significant region is boxed. Borders are part of hierarchy, not
chrome.

- Header: `round` border, `cyan`
- Footer: `round` border, `gray`
- Summary cards: `round` border, tone color derived from state
- Main panels: `round` border, color assigned by surface meaning
- Kanban lanes: `round` border, `gray` to keep tasks legible inside the board

### Density rules

- One-line metadata beats multi-line prose wherever the operator can still act.
- Headings should fit on one line.
- Supporting detail goes below the primary label, not beside it.
- No panel should depend on wrapping a long paragraph to communicate state.
- Lists should show the top actionable subset before overflowing the screen.

The current implementation enforces this through:

- `StatCard` fixed width `22`
- `Lane` fixed width `28`
- task lists capped to four items per lane
- run task drilldown capped to six items
- alert list capped to eight entries in `deriveBoardModel`

## Header And Global Shell Rules

The header carries four global signals:

1. product identity: `CODEX SWARM TUI`
2. source mode: `LIVE API` or `MOCK FALLBACK`
3. active run goal
4. refresh posture and freshness timestamp

Header behavior is defined in `Header` inside `apps/tui/src/index.tsx`.

Rules:

- The product label must always remain visible, even when no run is selected.
- Source mode must be high contrast:
  - live mode in `greenBright`
  - mock or fallback mode in `yellowBright`
- The run goal is the primary content line and may truncate, but the mode banner
  may not be displaced.
- Refresh posture uses subdued color unless the shell is disconnected.
- Non-interactive mode must show an explicit warning instead of silently
  ignoring key input.

## Navigation And Focus Model

There is one active focus axis at a time: selected view plus selected run.

The current shell does not support per-panel cursor focus, and that is
intentional. Focus is coarse-grained so refreshes do not scramble operator
position.

### Primary focus objects

- active view: `board`, `run`, `review`, `fleet`, `help`
- selected run index within the run list
- live-refresh on/off state

### Focus invariants

- Switching views must preserve the selected run.
- Refresh must not reset the selected view.
- Refresh should preserve run selection unless the selected run disappears.
- Help is a full view, not a modal.
- Keyboard discoverability must exist both in the footer and in the help view.

### Keybindings

These bindings are implemented in `KeyboardController`:

- `1`: board
- `2`: run
- `3`: review
- `4`: fleet
- `5` or `?`: help
- `left`, `up`, `h`, `k`: previous run
- `right`, `down`, `j`, `l`: next run
- `r`: manual refresh
- `space`: toggle live refresh
- `q`: quit

### Non-interactive behavior

If raw mode is unavailable:

- the board still renders
- keyboard input is disabled
- the header must explain the limitation
- the footer must restate how to regain interactive mode

## Surface Inventory

### 1. Board view

The board view is the default operator landing surface. It is implemented by
`BoardView`.

Layout:

- left column at roughly 72% width: `Task Kanban`
- right rail at roughly 28% width:
  - `Run Focus`
  - `Alerts`
  - `Inbox`

#### Board composition contract

- Kanban is the dominant region and always appears on the left.
- The side rail carries action-priority context, not secondary decoration.
- `Run Focus` is the first side panel because it anchors every alert and inbox
  entry to the currently selected run.

#### Kanban lane mapping

Lane definitions come from `laneOrder` in `apps/tui/src/view-model.ts`:

- `Pending`
- `Blocked`
- `In Progress`
- `Review / Done`

Rules:

- `Blocked` must remain its own lane even if counts are low.
- `Review / Done` is intentionally merged at this stage to fit standard terminal
  width while still surfacing `awaiting_review`.
- Each lane shows:
  - title
  - task count
  - up to four tasks
- Each task row shows:
  - title in state color
  - role and priority
  - blocked-by dependency ids when present
  - description only in non-compact board mode

#### Right-rail panel rules

`Run Focus` must show:

- run status
- branch
- PR or handoff state
- policy profile

`Alerts` must show operator-priority items first:

- pending approvals
- failed validations
- fleet degradation
- stale sessions

`Inbox` must show recent run-scoped message summaries sorted newest first.

### 2. Run detail view

The run view is implemented by `RunView`.

Layout:

- left half: `Run Detail`
- right half:
  - `Active Tasks`
  - `Session Placement`

Rules:

- `Run Detail` gives the operator the narrative summary of the selected run:
  goal, creator, freshness, and review state.
- `Active Tasks` is compact and action-oriented.
- `Session Placement` is the distributed-execution panel and must show thread,
  node placement, and stale state without requiring the fleet view.

This view exists to answer: "what is happening on this run right now, and where
is it executing?"

### 3. Review and governance view

The review surface is implemented by `ReviewView`.

Layout:

- left half: `Review Summary`
- right half: `Operator Attention`

Rules:

- `Review Summary` contains stable state facts about the run:
  PR or handoff state, approval counts, validation failures, artifact count
- `Operator Attention` contains only issues needing intervention
- this surface is not a generic placeholder; it must remain populated from
  real codex-swarm review and validation state when available

This view exists to answer: "can this run move forward, and if not, what is
stopping it?"

### 4. Fleet and dispatch view

The fleet surface is implemented by `FleetView`.

Layout:

- one full-width panel: `Fleet And Dispatch`

Rules:

- every worker node row must show:
  - node name
  - node status
  - drain state
  - scheduling eligibility
  - cpu, memory, and queue depth metrics
- status color follows node health:
  - online: `greenBright`
  - degraded: `yellowBright`
  - offline: `redBright`

This view exists to answer: "is the worker fleet healthy enough to trust the
board state and session placement?"

### 5. Help view

The help surface is implemented by `HelpView`.

Rules:

- it is a first-class view, not an overlay
- it repeats every supported binding in plain language
- it must be reachable from both `5` and `?`
- it must be short enough to read in one screen without scrolling

### 6. Alerts and status-only surfaces

The shell also includes state panels outside the main views:

- `StatePanel` for loading and empty states
- `StatusStrip` for normal, loading, and disconnected refresh messages

Rules:

- loading is `cyanBright`
- empty is `yellowBright`
- disconnected state keeps the last good board visible when possible and shows
  a warning-toned status strip rather than collapsing the layout

## Summary Card Spec

Summary cards are the primary scan target after the header. They are implemented
by `StatCard` and derived in `deriveBoardModel`.

### Required cards

- `Runs`
- `Blocked`
- `Approvals`
- `Failed checks`
- `Fleet alerts`

### Card anatomy

Each card contains exactly three levels:

1. uppercase label in muted tone
2. bold high-contrast value
3. single-line explanatory detail

Rules:

- cards are visually equal-sized
- the value must remain readable from a quick glance
- tone is driven by operator urgency, not by metric category alone
- healthy zero states should read as positive, not absent

## Hierarchy And Spacing Rules

Use spacing to separate semantic layers:

- one blank row equivalent between header, nav, status, cards, and footer
- panel title on the first line inside the border
- panel content starts one row below the title
- task and alert entries use one-row separation when stacked

If a future edit needs more density, remove prose before removing structural
spacing.

## Mapping From Clawteam Inspiration To Codex-Swarm Layout

This mapping is mandatory for future TUI changes.

| Clawteam-style board idea           | Codex-swarm implementation rule                                      |
| ----------------------------------- | -------------------------------------------------------------------- |
| Summary cards across the top        | `StatCard` row directly under the status strip                       |
| Main kanban surface                 | `BoardView` left column with explicit blocked lane                   |
| Operator side rail                  | `Run Focus`, `Alerts`, `Inbox` stacked in the board right rail       |
| Live dashboard identity             | header mode banner plus refresh cadence in `Header`                  |
| Drilldown navigation in one session | numbered views preserved in `NavBar` and `KeyboardController`        |
| Team health signal                  | `FleetView` plus `Fleet alerts` card and fleet-derived alert rows    |
| Review pressure signal              | `Approvals`, `Failed checks`, `Review Summary`, `Operator Attention` |

Do not replace codex-swarm's run/review/fleet specialization with a generic team
board just because the layout inspiration came from clawteam.

## QA And Capture References

QA and docs work should reference this document together with:

- `docs/operations/tui-launch-and-capture.md`
- `docs/qa/post-m10-tui-acceptance-matrix.md`

Expected screenshots or captures should line up with these exact surfaces:

- board overview
- run detail
- review/governance
- fleet/dispatch
- help
- disconnected or mock fallback when applicable

## Change Rules

Any future TUI change should update this spec when it changes any of the
following:

- a top-level surface
- view order or keybindings
- color semantics for health, warning, or failure
- kanban lane model
- header source-mode behavior
- panel hierarchy or default geometry assumptions

If the implementation and this spec diverge, treat that as a real regression for
operator docs and QA rather than silent drift.
