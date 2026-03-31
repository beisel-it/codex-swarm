# Verification UX State Handoff

## Goal

Define one operator-facing language for task execution and verification so board, review, lifecycle, and task detail surfaces all describe the same task state without forcing operators to infer whether "completed" means worker-finished or fully verified.

## Core UX rules

1. `definitionOfDone` is the normative target and must appear before `acceptanceCriteria` anywhere both are shown.
2. Task execution state and verification state are separate signals. Operators should never have to infer verification from `task.status` alone.
3. `awaiting_review` means the worker finished and the task is waiting on verifier work, not that the task is done.
4. `completed` is only shown as a success state when `verificationStatus = passed`.
5. Verification failure and rework are task-visible states, not hidden leader-only metadata.
6. Legacy tasks without `definitionOfDone` stay readable but use a muted legacy treatment rather than pretending the new verification model applies.

## Shared state model

Use a two-layer state treatment on every task surface.

### Primary task status

- `pending`: not started
- `in_progress`: executor is actively working
- `blocked`: executor or verifier is blocked and needs intervention
- `awaiting_review`: worker delivery is complete and verification is pending or running
- `completed`: verification passed and the task is done
- `failed`: use only for terminal failure/cancellation paths outside the rework loop
- `cancelled`: task was intentionally abandoned

### Verification status

- `not_requested`: task has not reached verification yet
- `queued`: worker finished, verifier not started
- `in_progress`: verifier assigned and reviewing
- `passed`: verifier confirmed the stored DoD
- `failed`: verifier found unmet DoD items
- `rework_requested`: leader converted failed findings into an open follow-up task
- `blocked`: verifier could not complete review and escalated to the leader
- `not_available`: legacy task or metadata missing

### Combined operator labels

These are the human-facing labels that should be reused everywhere.

| Combined state        | Trigger                                            | Operator label           | Tone    |
| --------------------- | -------------------------------------------------- | ------------------------ | ------- |
| Execution active      | `in_progress` + `not_requested`                    | In execution             | Neutral |
| Awaiting verification | `awaiting_review` + `queued`                       | Awaiting verification    | Warning |
| Verification running  | `awaiting_review` + `in_progress`                  | Verification in progress | Warning |
| Verified complete     | `completed` + `passed`                             | Verified complete        | Success |
| Verification failed   | any open task + `failed`                           | Verification failed      | Danger  |
| Rework requested      | any open task + `rework_requested`                 | Rework requested         | Danger  |
| Verification blocked  | any open task + `blocked`                          | Verification blocked     | Danger  |
| Legacy task           | missing `definitionOfDone` and verification fields | Legacy task              | Muted   |

## Surface mapping

## Board cards

Board cards should stay compact but become two-signal cards.

### Card structure

1. Top row: primary task-status chip plus secondary verification-status chip.
2. Title and one-line description.
3. Meta row: role, executor, verifier.
4. DoD preview block: first two `definitionOfDone` items as checklist rows, then `+N more` when truncated.
5. Summary strip:
   - show worker summary while execution is active
   - show `latestVerificationSummary` once verification starts
6. Open change request pill when `verificationStatus = failed | rework_requested`.

### Lane behavior

- `In flight`: `pending`, `in_progress`
- `Waiting`: `awaiting_review` regardless of whether verification is queued or running
- `Blocked`: `blocked`, `verificationStatus = failed`, `verificationStatus = rework_requested`, `verificationStatus = blocked`
- `Completed`: only tasks with `verificationStatus = passed`

### Card copy

- `Awaiting verification`: "Worker finished. Waiting for verifier assignment."
- `Verification in progress`: "Verifier is checking delivered work against the definition of done."
- `Verified complete`: "Passed verification against the definition of done."
- `Verification failed`: "Verifier found unmet definition-of-done items."
- `Rework requested`: "Leader opened follow-up work from verifier change requests."
- `Verification blocked`: "Verifier escalated a blocker to the leader."
- `Legacy task`: "This task predates stored definition of done."

### Card display rules

- `definitionOfDone` present:
  show checklist preview directly on the card
- `definitionOfDone` absent:
  replace checklist preview with muted text: "No stored definition of done"
- `verifierAgentId` present:
  show `Verifier: {agentName}`
- `verifierAgentId` absent and verification has started:
  show `Verifier: assignment pending`
- `latestVerificationSummary` absent during review:
  show "Verification summary not published yet"
- open change requests present:
  show count pill like `2 change requests`

## Task detail

Task detail needs to become the canonical explanation surface. The board card only hints at state; the detail view resolves it.

### Recommended layout

1. Header
   - task title
   - primary status chip
   - verification status chip
   - role, priority, dependency count
2. Verification overview panel
   - label: `Verification`
   - verifier identity
   - latest verification summary
   - timestamp of latest verification event
   - link or reference to follow-up rework task when present
3. Definition of done panel
   - ordered checklist sourced from `definitionOfDone`
   - if verification exists, show per-item outcome markers:
     `met`, `not met`, `not evaluated`
4. Acceptance criteria panel
   - secondary, collapsed by default when DoD exists
   - label copy: `Acceptance criteria (summary / compatibility)`
5. Evidence panel
   - worker summary
   - validation results
   - published artifacts
6. Change requests panel
   - only visible when verifier supplied findings or leader opened rework
   - show each requested change as a numbered list item
7. Lifecycle panel
   - condensed event stream for this task only

### Detail copy

- verification panel subtitle when queued:
  "Execution is finished. Verification has not started yet."
- verification panel subtitle when running:
  "Verifier is reviewing delivered work against the stored definition of done."
- verification panel subtitle when passed:
  "All required definition-of-done checks passed."
- verification panel subtitle when failed:
  "Verification failed. Review findings are listed below."
- verification panel subtitle when rework requested:
  "Rework was requested from verifier findings. The original task stays open until follow-up work lands."
- verification panel subtitle when blocked:
  "Verification could not complete and was escalated to the leader."

### Detail display rules

- `definitionOfDone` must always render above `acceptanceCriteria`
- if both exist, visually de-emphasize acceptance criteria with smaller label and collapsed container
- `latestVerificationSummary` should be plain text first, never hidden inside lifecycle history
- `verifierAgentId` should include role context when available:
  `Reviewer: Maya (reviewer)`
- if same-role fallback is used:
  append muted note `Fallback verifier`
- open change requests should show:
  request text, severity if available, and linked rework task id/title when one exists

## Review view

The current review workspace is approval-centric. For this flow it should gain a task-verification queue above or alongside approvals.

### Review list

Add task verification items with these row fields:

- task title
- verification status chip
- verifier name or `Unassigned`
- latest verification summary preview
- open change request count

### Review detail

The selected verification item should show:

- definition-of-done checklist
- worker summary
- validation evidence list
- verifier summary
- findings and change requests
- lifecycle snippet showing:
  worker completed -> verification requested -> verification result

### Review filters

Provide four quick filters:

- `Awaiting verification`
- `Verification running`
- `Failed / rework`
- `Verified`

### Review copy

- empty queue:
  "No tasks currently need verification."
- no findings for passed task:
  "No verifier findings. Task passed verification."
- no change requests after failed result:
  "Verifier reported failure but no structured change requests were attached."

## Lifecycle history

Lifecycle should tell the story in verbs, not raw status names.

### Required events

- `task.execution_completed`
  copy: "Worker marked delivery ready for verification."
- `task.verification_requested`
  copy: "Verification requested from {verifierName}."
- `task.verification_started`
  copy: "Verification started by {verifierName}."
- `task.verification_passed`
  copy: "Verification passed."
- `task.verification_failed`
  copy: "Verification failed with {count} finding(s)."
- `task.rework_requested`
  copy: "Leader created rework task {taskRef} from verifier findings."
- `task.verification_blocked`
  copy: "Verifier escalated a blocker to the leader."

### Event row content

Each row should show:

- event verb
- actor
- timestamp
- one-line summary
- expandable metadata for DoD references, finding count, and linked rework task

## Empty, loading, and error states

These states should be explicit and shared across web and TUI wording.

### Definition of done

- loading:
  "Loading definition of done…"
- empty on legacy task:
  "No definition of done was stored for this task."
- error:
  "Definition of done could not be loaded."

### Verification metadata

- loading:
  "Loading verification status…"
- empty before worker completion:
  "Verification has not been requested yet."
- empty during queued state without verifier:
  "Verifier assignment pending."
- empty summary:
  "No verification summary published yet."
- error:
  "Verification metadata is unavailable. Retry to load the latest review state."

### Change requests

- loading:
  "Loading change requests…"
- empty for passed task:
  "No open change requests."
- empty for failed task:
  "No structured change requests were attached."
- error:
  "Change requests could not be loaded."

## Legacy behavior

Legacy tasks without `definitionOfDone` should not render as broken.

- show muted `Legacy task` chip
- hide per-item DoD checklist outcomes
- keep `acceptanceCriteria` visible as the only requirement list
- show helper copy:
  "This task was created before mandatory verification metadata was stored."

## Implementation notes for current surfaces

- The current web board can absorb this with richer task cards and a stricter completed lane rule.
- The current review screen needs a task-verification list in addition to approval requests; approvals alone are not enough for this flow.
- The current lifecycle screen needs task-level verification events, not only session status rows and a generic recent-events list.
- The current web app has no task detail surface; add a right-side drawer or dedicated route, but keep the content model above intact.
- TUI parity can use the same combined labels and copy even if it reduces the content to one summary line plus DoD count instead of the full detail layout.
