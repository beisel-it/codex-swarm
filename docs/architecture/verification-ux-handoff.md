# Verification UX Handoff

Date: 2026-03-31
Owner: designer
Related goal: Automatic task DoD verification with reviewer pairing

## Purpose

This note defines the operator-facing state model for the new worker to verifier
flow so board, review, lifecycle, and task detail surfaces present the same
story:

- the worker finished implementation
- the task is now waiting on verification
- verification passed and the task is truly done
- verification failed and produced change requests
- rework was requested and is now the active follow-up path

The current frontend baseline is the route-driven run workspace in
`frontend/src/App.tsx`, which already exposes `Overview`, `Board`, `Lifecycle`,
and `Review`, but does not yet have a dedicated task detail presentation or any
verification-specific metadata.

## Canonical state model

UI should stop treating `task.status` as the only operator truth once
verification lands. The rendered state should be derived from:

- `task.status`
- `verificationStatus`
- `definitionOfDone.length`
- `verifierAgentId`
- `latestVerificationSummary`
- open change requests linked to the task

### Primary states

1. `In progress`
   Worker is still executing. No verification banner yet.

2. `Awaiting review`
   Worker finished. Task is waiting on or currently in verifier review. This is
   the replacement for the old meaning of `completed`.

3. `Verification passed`
   Verifier approved the work against the stored definition of done. Only this
   state should read as complete.

4. `Verification failed`
   Verifier found gaps against the definition of done. Show findings and hold
   the task open until the leader converts them into rework.

5. `Rework requested`
   A leader-authored follow-up task exists from failed verification findings.
   The original task remains visibly unresolved and points at the rework task.

### Legacy compatibility state

`Legacy task`

- Use when a task has no `definitionOfDone`.
- Do not show the task as verification-backed.
- Surface a muted compatibility badge instead of a warning tone.

## Canonical labels and copy

### Shared chip labels

- Primary status chip:
  - `Pending`
  - `In progress`
  - `Blocked`
  - `Awaiting review`
  - `Completed`

- Verification status chip:
  - `Verification not required` for legacy tasks without DoD
  - `Verification queued`
  - `Verification passed`
  - `Verification failed`
  - `Rework requested`

### Shared helper copy

- Awaiting review:
  - title: `Ready for verification`
  - body: `Worker delivery is complete. Final closure is waiting on verifier review.`

- Verification passed:
  - title: `Verified against definition of done`
  - body: `A separate verifier confirmed the task meets the stored definition of done.`

- Verification failed:
  - title: `Verification found gaps`
  - body: `Verifier findings must be converted into leader-authored rework before this task can close.`

- Rework requested:
  - title: `Rework requested`
  - body: `A follow-up task is open from verifier findings. The original task stays unresolved until that work lands and passes review.`

- Legacy task:
  - title: `Legacy task`
  - body: `This task was created before definition of done was required. Automatic verification metadata is unavailable.`

## Surface contract

## 1. Board

### Board structure

Replace the current coarse grouping with explicit verification-aware lanes:

- `Waiting`
  - `task.status = pending`
- `In progress`
  - `task.status = in_progress`
- `Awaiting review`
  - `task.status = awaiting_review`
- `Needs attention`
  - blocked work
  - `verificationStatus = failed`
  - `verificationStatus = rework_requested`

Keep a collapsed `Verified complete` section below the grid for tasks with:

- `task.status = completed`
- `verificationStatus = passed`

### Board card anatomy

Each board card should show, in order:

1. primary task-status chip
2. verification-status chip
3. task title
4. one-line description
5. role and dependency count
6. DoD summary line
7. verifier or rework summary line when available

### Board card content rules

- `definitionOfDone`
  - show a compact line such as `DoD · 4 checks`
  - show first unmet or first listed item as preview text when space allows
  - never render the full checklist on the card

- `verificationStatus`
  - always render as a second chip, even when the primary lane already implies
    it
  - this is how operators distinguish `awaiting_review`, `verification_failed`,
    and `rework_requested` without opening detail

- `verifier identity`
  - show `Verifier · <agent name>` when assigned
  - fallback copy: `Verifier not assigned yet`

- `latestVerificationSummary`
  - show one truncated line only for failed or passed states
  - omit when empty instead of showing placeholder noise on the card

- `open change requests`
  - show `2 open change requests` or `Rework task linked`
  - this line only appears for failed or rework-requested tasks

### Board interaction

- Clicking a card opens task detail in a right-side detail pane or drilldown
  panel.
- `Awaiting review`, `Verification failed`, and `Rework requested` cards should
  visually read as actionable before generic `in_progress` work.

## 2. Task detail

Task detail does not exist as a first-class surface today. Add a reusable task
detail pane that can open from the board, lifecycle tables, and review list.

### Task detail layout

Header:

- task title
- primary status chip
- verification chip
- role
- priority

Section order:

1. `Definition of done`
2. `Acceptance summary`
3. `Verification`
4. `Change requests`
5. `Evidence`
6. `History`

### Task detail section rules

#### Definition of done

- This is the normative section and should appear first.
- Render as a checklist, not a paragraph.
- Each item should use plain sentence copy, one line per item.
- If verifier findings explicitly map to DoD items later, reserve space for
  per-item pass or fail markers without redesigning the section.

Empty state:

- `No definition of done recorded for this task.`
- Supporting line: `Legacy tasks remain readable, but automatic verification does not apply.`

#### Acceptance summary

- Keep `acceptanceCriteria` visible, but secondary.
- Label it `Acceptance summary` instead of `Acceptance criteria` to signal its
  compatibility role.
- Use a lighter visual treatment than the DoD checklist.

Empty state:

- `No acceptance summary provided.`

#### Verification

Fields to show together:

- `Verification status`
- `Verifier`
- `Latest verification summary`
- `Worker summary` when available
- machine validation evidence count

Field rendering:

- `Verification status`: chip plus sentence-level explainer
- `Verifier`: agent name with role, else `Unassigned`
- `Latest verification summary`: full text block, never truncated in detail
- `Worker summary`: collapsible supporting block
- `Validation evidence`: compact list of latest validation results, marked as
  supporting evidence rather than final authority

Loading state:

- `Loading verification metadata…`

Error state:

- `Verification metadata could not be loaded.`
- Supporting line: `Task execution data is still available, but verifier context is incomplete.`

#### Change requests

- Only visible when failed findings or follow-up requests exist.
- Render as numbered items, because operators and leaders need to refer to them
  deterministically.
- Each item should support:
  - change-request text
  - linked follow-up task id or title when created
  - open or resolved state

Empty state copy:

- `No open change requests.`

#### Evidence

- Group artifacts and validations together under one heading.
- Order:
  - latest verification summary artifact or evidence artifact
  - validation results
  - worker artifacts

#### History

- Show a linear history specific to this task, not just run-global events.
- Include worker completion, verification requested, verification passed or
  failed, and rework task creation.

## 3. Review view

The current review view is approval-centric. Extend it with a task verification
queue above or beside approvals.

### Review information architecture

Left rail:

- `Awaiting verification`
- `Failed verification`
- `Rework requested`
- existing approval items

Right detail:

- selected task verification detail

### Review list item content

Each verification item should show:

- task title
- verification chip
- verifier name or `Unassigned`
- latest summary preview
- change-request count when present

### Review detail content

For selected verification item, show:

1. DoD checklist
2. verifier summary
3. findings or change requests
4. supporting validations
5. related artifacts

### Review-specific copy

Empty queue:

- `No tasks are waiting for verification.`

All clear state:

- `All current tasks have either passed verification or are waiting on execution.`

Mixed-data state:

- `Verification data is partial for some tasks. Legacy tasks may not include definition of done or verifier metadata.`

## 4. Lifecycle

Lifecycle should answer: who worked, who verified, what happened, and what is
currently blocking closure.

### Lifecycle event groups

Add verification-aware rows to the recent-events stream and any future task
history table:

- `Worker marked task ready for verification`
- `Verification requested`
- `Verifier assigned`
- `Verification passed`
- `Verification failed`
- `Leader requested rework`
- `Rework task created`

### Lifecycle row anatomy

Each task lifecycle row should show:

- task title
- current verification chip
- worker agent
- verifier agent
- timestamp
- summary line

### Lifecycle summary rules

- `awaiting_review` must never read as done in lifecycle recaps.
- `completed` rows must carry `Verification passed` adjacent to the completed
  state, not in a separate hidden field.
- `verification_failed` should persist in history even after the task moves into
  `rework_requested`.

### Lifecycle empty and error states

- Empty:
  - `No task lifecycle events recorded yet.`
- Loading:
  - `Loading task and verification history…`
- Error:
  - `Lifecycle history is unavailable right now.`

## Display rules by field

### definitionOfDone

- Board: compact count plus first-item preview
- Task detail: full checklist, first section
- Review: full checklist for selected item
- Lifecycle: not repeated verbatim; reference via summary such as `Checked against 4 DoD items`

### verificationStatus

- Always render as a first-class semantic chip.
- Do not bury it inside prose or event tables.
- If backend returns an unknown value, render `Verification unknown` with a
  neutral tone.

### verifierAgentId

- Resolve to agent display name everywhere.
- If missing during `awaiting_review`, show `Verifier not assigned yet`.
- If missing during `passed` or `failed`, show `Verifier unavailable` and treat
  that as data-quality debt, not as a user-facing hard failure.

### latestVerificationSummary

- Board: one-line preview
- Task detail: full paragraph block
- Review: preview in list, full text in detail
- Lifecycle: summarized event copy only

### open change requests

- Board: count only
- Task detail: full numbered list with linked follow-up task
- Review: count in list, full text in detail
- Lifecycle: event rows for creation and resolution

## Empty, loading, and error matrix

### Board

- no verification tasks:
  - `No tasks are waiting for verification.`
- verification data loading:
  - `Loading verification state…`
- verification data error:
  - `Board verification state is unavailable. Showing task execution data only.`

### Task detail

- no DoD:
  - `No definition of done recorded for this task.`
- no verification summary:
  - `No verification summary yet.`
- metadata loading:
  - `Loading task verification details…`
- metadata error:
  - `Task verification details could not be loaded.`

### Review

- empty queue:
  - `No tasks are waiting for verification.`
- loading:
  - `Loading verification queue…`
- error:
  - `Verification queue could not be loaded.`

### Lifecycle

- empty:
  - `No task lifecycle events recorded yet.`
- loading:
  - `Loading task and verification history…`
- error:
  - `Lifecycle history is unavailable right now.`

## Implementation notes for frontend follow-on

- Extend the frontend `Task` type first so state derivation is local and typed.
- Add a small view-model helper that maps raw task plus verification metadata
  into display labels, chips, and helper copy. Avoid scattering state logic
  across board, review, and lifecycle sections.
- Reuse the same verification chip component or formatter in all run surfaces.
- Keep legacy tasks readable without forcing placeholder warnings into every
  card.
- Introduce task detail as a shared component before restyling each surface
  separately.

## Acceptance target for implementation

The frontend follow-on should be ready to close when:

- operators can distinguish `in progress`, `awaiting review`, `verification passed`,
  `verification failed`, and `rework requested` without opening logs
- the task detail surface makes `definitionOfDone` visibly primary and
  `acceptanceCriteria` visibly secondary
- review surfaces show verifier identity, latest verification summary, and open
  change requests in a task-centric queue
- lifecycle surfaces retain a readable audit trail for verification request,
  outcome, and rework creation
- empty, loading, and error states match the copy in this note
