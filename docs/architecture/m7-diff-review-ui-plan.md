# M7 Diff Review UI Plan

This note prepares frontend task `b6031edd` for immediate implementation once backend task `a550df67` lands.

## Current frontend baseline

- Review actions and approval context already live in [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2306).
- Validation history and generic artifact cards already live in [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2405) and [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2432).
- Current artifact records only expose metadata fields: `id`, `runId`, `taskId`, `kind`, `path`, `contentType`, and `createdAt` in [packages/contracts/src/index.ts](/home/florian/codex-swarm/packages/contracts/src/index.ts#L257).

## Blocker summary

The current artifact contract is sufficient for generic artifact links, but not for reviewer-facing diff summaries.

What is missing today:

- summarized change evidence
- file-level diff metadata
- reviewer-readable diff context/body
- an artifact detail/read endpoint or equivalent diff-review payload

Current backend references that prove the limitation:

- [packages/contracts/src/index.ts](/home/florian/codex-swarm/packages/contracts/src/index.ts#L257)
- [apps/api/src/routes/artifacts.ts](/home/florian/codex-swarm/apps/api/src/routes/artifacts.ts#L11)
- [apps/api/src/services/control-plane-service.ts](/home/florian/codex-swarm/apps/api/src/services/control-plane-service.ts#L1136)

## Expected backend contract shape

Frontend implementation should wait for one of these supported shapes:

1. `GET /api/v1/artifacts/:id` returns diff-detail content for `kind === "diff"`.
2. `GET /api/v1/reviews/diff-summary?approvalId=...` returns a review-scoped diff payload.
3. `GET /api/v1/artifacts?runId=...` expands diff artifacts with embedded summary fields.

Minimum fields needed for the UI:

- `artifactId`
- `kind`
- `title` or summary label
- `changeSummary`
- `filesChanged`
- `insertions`
- `deletions`
- `fileSummaries[]`
- optional `rawDiff` or `diffPreview`
- optional provider links for PR/file views

If backend lands a different shape, keep the frontend adapter local in `frontend/src/App.tsx` or a small helper rather than spreading contract knowledge across components.

## Planned frontend changes

### 1. Add diff-detail adapter

Create a narrow formatter that turns the backend diff payload into:

- top-line metrics
- file summary cards
- optional raw diff preview block
- fallback text when only partial detail is available

### 2. Extend review workspace

Add a diff-review panel beside or below the existing decision workspace in [frontend/src/App.tsx](/home/florian/codex-swarm/frontend/src/App.tsx#L2347).

Planned sections:

- `Diff summary`
- `Files changed`
- `Reviewer context`
- optional `Raw diff preview`

### 3. Keep generic artifacts as fallback

Do not remove the current artifact list. Diff-specific rendering should enhance the review page when a diff-detail payload exists and fall back to the generic artifact card path when it does not.

### 4. Update docs and parity evidence

When implemented:

- refresh [docs/user-guide.md](/home/florian/codex-swarm/docs/user-guide.md) review walkthrough wording
- refresh [docs/assets/screenshots/user-review-console.png](/home/florian/codex-swarm/docs/assets/screenshots/user-review-console.png)
- update [docs/architecture/m7-parity-review-frontend.md](/home/florian/codex-swarm/docs/architecture/m7-parity-review-frontend.md) task 57 from `gap` to the supported verdict

## Acceptance target for `b6031edd`

The follow-on task should be considered ready to close when:

- a reviewer can open a pending approval in the browser
- the review surface shows explicit diff-summary content, not only generic artifact metadata
- changed-file evidence is readable without leaving the browser
- approve/reject actions still work from the same review surface
- lint, typecheck, and build all pass
