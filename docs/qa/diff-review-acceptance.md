# Diff Review Acceptance Plan

Date: 2026-03-29
Owner: qa-engineer
Related task: `d408d35b`
Implementation dependency: `a550df67`

## Purpose

Prepare the QA acceptance and follow-on verification plan for the diff-review UI and backend slice before the implementation lands.

This plan is intentionally scoped to the live repo baseline on 2026-03-29:

- current run detail and review surfaces expose validations, artifacts, publish state, and PR handoff state
- the repo does not yet expose reviewer-visible file diffs, hunks, inline review comments, or diff-thread actions

## Current Baseline

The current repo already provides these adjacent seams:

- PR handoff state and branch publish tracking in `apps/api/src/routes/runs.ts`
- pull-request handoff integration coverage in `apps/api/test/app.test.ts`
- artifact and validation surfaces in `apps/api/test/app.test.ts`
- review-console and run-detail UI surfaces in `frontend/src/App.tsx`
- user docs for review, artifacts, and PR handoff state in `docs/user-guide.md`

The current repo does not yet provide supportable evidence for:

- a diff payload on the API
- file-level or hunk-level review surfaces in the frontend
- inline or per-file comment persistence
- reviewer actions tied directly to diff context

## Acceptance Scope

The diff-review slice should not be treated as complete until all of these are true.

### Backend contract

- an explicit API route exists for reviewer-visible diffs, or the existing run/review routes are extended with a stable diff payload
- the payload is typed in `packages/contracts/src/index.ts`
- the payload includes enough structure for frontend review without reparsing raw patch text in the browser
- the payload clearly distinguishes file path, change kind, and per-file or per-hunk content
- empty, missing, oversized, or unsupported diffs return deterministic states rather than silent failure

### Frontend behavior

- the review UI exposes a visible diff-review surface for the selected run or approval context
- reviewers can tell which files changed without opening raw artifacts manually
- reviewers can inspect file content or hunks with stable ordering
- empty-state, loading-state, and failure-state behavior are explicit in the UI
- the diff surface stays coherent with existing approval, validation, artifact, and PR handoff context

### Verification and persistence

- backend tests cover success, empty, error, and access-control paths for the diff payload
- frontend tests cover render behavior for normal, empty, and error states
- browser verification confirms the final visual layout, readability, and state transitions
- docs are updated if the review workflow materially changes for users or operators

## Minimum Backend Test Matrix

Add or extend tests for:

1. diff payload can be fetched for a run or reviewable approval context
2. changed files are returned in deterministic order
3. file entries preserve path and change type metadata
4. multi-file diffs do not collapse into one opaque blob
5. no-diff states return an explicit empty result
6. missing upstream diff or provider data returns a visible error contract
7. unauthorized callers cannot read diffs outside workspace or team boundaries

Suggested test homes:

- `apps/api/test/app.test.ts`
- a dedicated diff-oriented service test if backend logic is non-trivial
- `packages/contracts/test/index.test.ts` if new schemas are added

## Minimum Frontend Test Matrix

Add or extend tests for:

1. review surface renders the changed-file list
2. selecting a file reveals the correct diff content
3. loading state is visible while fetching diff data
4. empty state is visible when no diff exists
5. error state is visible when diff retrieval fails
6. diff UI does not displace or hide approval decision controls unexpectedly

Likely code areas:

- `frontend/src/App.tsx`
- the existing frontend test harness if component extraction happens as part of the implementation

## Browser Acceptance Pass

Once implementation lands, run a browser pass with `agent-browser` and capture screenshots for:

1. review surface with a multi-file diff
2. file-selection behavior
3. empty diff state
4. backend or provider error state
5. interaction between diff view, approval context, validations, and artifacts

This pass should specifically check:

- line wrapping and overflow behavior
- readability of additions and deletions
- file-list density on desktop
- whether the diff surface remains usable on narrower layouts
- whether approval actions stay visible and unambiguous while reviewing diffs

## Documentation Follow-Up

Update docs if the landed UI changes how reviewers work:

- `docs/user-guide.md` if the review-console workflow changes materially
- screenshot references under `docs/assets/screenshots/` if new UI evidence is needed
- operator/admin docs only if diff review introduces new governance, access, or support implications

## Open Questions For Landing Review

When `a550df67` lands, confirm these before final signoff:

- is diff data sourced from stored artifacts, provider APIs, or generated branch comparisons
- what are the size limits and truncation rules
- what happens when a run has PR handoff metadata but no retrievable diff
- whether comments or review threads are in scope now or deferred to a later task

## Exit Condition For This Prep Task

This preparation task is complete when:

- QA has a written acceptance matrix for the diff-review slice
- the expected backend and frontend verification points are explicit
- the browser and screenshot plan is ready for execution once implementation lands

Implementation parity itself remains blocked on `a550df67`.
