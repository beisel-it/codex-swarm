# Active-Agent Observability Recovery Paths

Date: 2026-03-29
Owner: technical-writer
Source of truth: `.swarm/plan.md`

This runbook explains how active-agent transcript visibility is expected to
behave in the API and web UI when sessions are retried, restarted, or move
through task lifecycle transitions.

## Scope

This document covers the durable observability contract exposed by:

- `GET /api/v1/agents?runId=<run-id>`
- `GET /api/v1/runs/:id`
- `GET /api/v1/sessions/:id/transcript`

It also covers the transcript access behavior shown in the board and run-detail
web UI surfaces.

## Contract Summary

Each agent now exposes an `observability` block with these operator-relevant
fields:

- `mode`
  - `session`: a live or pending session is currently linked to the agent
  - `transcript_visibility`: no current live session is linked, but the latest
    reachable session or transcript is still visible
  - `unavailable`: no current or fallback transcript linkage exists yet
- `currentSessionId`
  - populated only when `mode` is `session`
- `currentSessionState`
  - the state of `currentSessionId`
- `visibleTranscriptSessionId`
  - the session that should still be used to show transcript visibility
- `visibleTranscriptSessionState`
  - the state of `visibleTranscriptSessionId`
- `visibleTranscriptUpdatedAt`
  - timestamp of the latest persisted transcript entry when one exists
- `lineageSource`
  - why the linkage exists: `active_session`, `session_rollover`,
    `task_state_transition`, `terminal_session`, or `not_started`

Operator rule:

- prefer `currentSessionId` for transcript access when `mode=session`
- fall back to `visibleTranscriptSessionId` when
  `mode=transcript_visibility`
- treat `mode=unavailable` as "no transcript path has been published yet"

## Lifecycle Paths

### 1. Normal execution

Expected API behavior:

- `observability.mode` is `session`
- `currentSessionId` is set to the current `pending` or `active` session
- `lineageSource` is usually `active_session`
- `visibleTranscriptSessionId` may match `currentSessionId`

Expected UI behavior:

- board and run detail show a live transcript target
- badge text is `Live transcript`
- the transcript panel selects the live session by default
- if the session exists but has no entries yet, the panel shows
  `No transcript entries recorded for this session yet.`

### 2. Retry / session rollover

Expected API behavior:

- `observability.mode` remains `session` if the retry session is already
  `pending` or `active`
- `currentSessionId` points to the newest retry session
- `visibleTranscriptSessionId` may remain on the prior session if that is where
  the latest visible transcript still lives
- `lineageSource` is `session_rollover`

Expected UI behavior:

- the primary transcript target stays on the new retry session
- the UI summary explains that the latest visible transcript remains on the
  older thread
- the operator should still be able to inspect the older transcript lineage
  through the visible transcript metadata instead of seeing a blank agent card

### 3. Restart recovery with no current live session

Expected API behavior:

- `observability.mode` becomes `transcript_visibility` when no `pending` or
  `active` session exists but a non-archived reachable session still does
- `currentSessionId` is `null`
- `visibleTranscriptSessionId` points to the latest transcript-bearing session,
  or, if no transcript entries have been persisted yet, the latest reachable
  non-archived session
- `lineageSource` is `session_rollover` while the agent is still considered
  active

Expected UI behavior:

- board and run detail show a fallback transcript target instead of collapsing
  to an empty state
- badge text is `Fallback transcript`
- the transcript panel keeps a usable session target as long as the fallback
  session is present in run detail

### 4. Task state transition without a live session

Expected API behavior:

- `observability.mode` becomes `transcript_visibility`
- `currentSessionId` is `null`
- `visibleTranscriptSessionId` points to the latest reachable session
- `lineageSource` is `task_state_transition` when the agent no longer has an
  active session but still has a task association

Expected UI behavior:

- the agent stays visible in transcript access lists
- the transcript card describes the fallback as retained across task state
  transitions
- operators should not see a blank transcript selector just because the task
  moved to a stopped, review, or other non-live phase

### 5. Terminal session after work completed or stopped

Expected API behavior:

- `observability.mode` is `transcript_visibility` if the latest reachable
  session is still available
- `lineageSource` is `terminal_session` when the agent has no current task and
  the latest terminal session remains the best visible transcript target

Expected UI behavior:

- the transcript target remains selectable until the backing session is no
  longer available
- the UI still distinguishes this from a live linked session

### 6. Not started / unavailable

Expected API behavior:

- `observability.mode` is `unavailable`
- both `currentSessionId` and `visibleTranscriptSessionId` are `null`
- `lineageSource` is `not_started`

Expected UI behavior:

- transcript access is shown as pending rather than broken
- badge text is `Visibility pending`
- if no transcript target can be selected yet, run detail shows
  `Active agents are still reconciling transcript visibility. The latest fallback session will appear here as soon as it is published.`

## How Fallback Selection Works

The backend chooses visibility in this order:

1. newest `active` or `pending` session becomes `currentSessionId`
2. newest session with persisted transcript entries becomes
   `visibleTranscriptSessionId`
3. if there is no current live session and no transcript entries yet, the
   newest non-archived session becomes the fallback visible transcript target
4. archived sessions are not used as the latest reachable fallback

Operational implication:

- a restart or retry can preserve transcript visibility even before new
  transcript entries are written to the replacement session

## API and UI Checks by Path

For each lifecycle path, operators should expect these cross-surface invariants:

- `GET /api/v1/agents?runId=<run-id>` and `GET /api/v1/runs/:id` must expose the
  same `observability` block for the agent
- `GET /api/v1/runs/:id` must include the referenced session in `sessions`
  whenever the UI is expected to resolve its thread id directly
- the run-detail transcript badges must match the API mode:
  - `session` -> `Live transcript`
  - `transcript_visibility` -> `Fallback transcript`
  - `unavailable` -> `Visibility pending`
- selecting the current or fallback session in the UI should map to
  `GET /api/v1/sessions/:id/transcript`

## Known Limitations

1. Fallback visibility does not guarantee transcript entries already exist.
   When the backing session has no persisted transcript yet,
   `visibleTranscriptUpdatedAt` stays `null` and the transcript panel may show
   `No transcript entries recorded for this session yet.`
2. The frontend supports a `task_reassignment` lineage label, but the current
   backend recovery mapping documented here emits `active_session`,
   `session_rollover`, `task_state_transition`, `terminal_session`, or
   `not_started`.
3. If session metadata has not fully hydrated into the `sessions` array yet, the
   UI falls back to a reconciliation message such as `Awaiting session
   reconciliation` instead of showing a thread id immediately.
4. Archived sessions are intentionally excluded from "latest reachable session"
   fallback. If the only remaining lineage is archived, the agent can fall back
   to `unavailable`.
5. `visibleTranscriptUpdatedAt` reflects the latest persisted transcript entry,
   not the newest session creation time. A newer retry session can therefore be
   current while the latest visible transcript timestamp still points to an
   older session.
