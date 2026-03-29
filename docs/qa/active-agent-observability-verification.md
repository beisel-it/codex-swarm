# Active-Agent Observability Verification

Date: 2026-03-29
Owner: technical-writer
Task: Validate active-agent transcript visibility recovery paths
Source of truth: `.swarm/plan.md`

## Verdict

- pass for documentation and operator handoff

## Summary

The active-agent observability slice now has a documented operator contract and
verification flow for normal execution, retry/session rollover, restart
recovery, task-state fallback, and not-started states. The backend and frontend
tests on this branch cover the core recovery mappings that keep transcript
access visible instead of dropping to a blank session-only experience.

## Verification Performed

Local commands:

- `corepack pnpm --dir apps/api test -- control-plane-service.observability.test.ts`
- `corepack pnpm --dir frontend test -- agent-observability.test.ts`

Result:

- both commands passed on the current branch

Implementation points inspected:

- `packages/contracts/src/index.ts`
- `apps/api/src/services/control-plane-service.ts`
- `apps/api/test/control-plane-service.observability.test.ts`
- `apps/api/src/routes/agents.ts`
- `apps/api/src/routes/runs.ts`
- `apps/api/src/routes/sessions.ts`
- `frontend/src/agent-observability.ts`
- `frontend/src/agent-observability.test.ts`
- `frontend/src/App.tsx`
- `docs/operations/active-agent-observability.md`

## End-to-End Operator Procedure

### Preconditions

Before validating a run:

1. Ensure the API and frontend are running against the branch that includes the
   observability contract.
2. Identify a run id that has at least one agent and one session lifecycle
   change worth checking.
3. Have an auth token that can call `/api/v1/*`.

### API checks

For a target run `<run-id>`, capture:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/v1/agents?runId=<run-id>"

curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/v1/runs/<run-id>"
```

For each agent under review:

1. Compare `agent.observability` in both responses.
   Expected: identical values for `mode`, session ids, states, timestamp, and
   `lineageSource`.
2. If `currentSessionId` is present, confirm that session exists in
   `run.sessions`.
3. If `visibleTranscriptSessionId` is present, confirm that session also exists
   in `run.sessions` unless the system is still reconciling metadata.
4. When either session id is present, check the transcript endpoint directly:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/v1/sessions/<session-id>/transcript"
```

Expected outcomes:

- `mode=session`: `currentSessionId` is non-null
- `mode=transcript_visibility`: `visibleTranscriptSessionId` is non-null and
  `currentSessionId` is null
- `mode=unavailable`: both session ids are null

### UI checks

Open the board and run-detail pages for the same run.

For the board or any agent card that exposes transcript access:

1. Confirm the transcript badge matches the API mode:
   - `Live transcript`
   - `Fallback transcript`
   - `Visibility pending`
2. Confirm the descriptive copy reflects the lineage reason instead of showing
   a blank or broken card.

For run detail:

1. Open the `Session transcript` panel.
2. Confirm each active or recently active agent still renders a transcript
   selector card whenever `currentSessionId` or `visibleTranscriptSessionId`
   exists in the API.
3. Confirm the card shows:
   - primary session or the reconciliation placeholder
   - session state
   - lineage label
   - transcript updated timestamp or `No transcript timestamp yet`
4. Select the transcript target and compare the rendered transcript entries with
   `GET /api/v1/sessions/:id/transcript`.

Expected outcomes:

- live-mode agents default to the current live session
- fallback-mode agents remain selectable and do not disappear from the panel
- pending-mode agents show reconciliation messaging instead of a blank panel

## Lifecycle Matrix

### 1. Normal execution

API expectation:

- `mode=session`
- `lineageSource=active_session`
- `currentSessionId` populated

UI expectation:

- `Live transcript` badge
- selecting the agent opens the current session transcript

### 2. Retry / session rollover

API expectation:

- `mode=session`
- `currentSessionId` points to the newest retry session
- `visibleTranscriptSessionId` may still point at the older session with the
  latest visible transcript
- `lineageSource=session_rollover`

UI expectation:

- live transcript target remains on the retry session
- copy explains that the latest visible transcript may still be on the older
  thread

### 3. Restart recovery

API expectation:

- `mode=transcript_visibility`
- `currentSessionId=null`
- `visibleTranscriptSessionId` points to the latest reachable non-archived
  session
- `lineageSource=session_rollover`

UI expectation:

- `Fallback transcript` badge
- transcript selector remains present instead of disappearing

### 4. Task state transition

API expectation:

- `mode=transcript_visibility`
- `lineageSource=task_state_transition`

UI expectation:

- fallback transcript card remains visible even after the task leaves live
  execution

### 5. Terminal / stopped state

API expectation:

- `mode=transcript_visibility` when a terminal session is still reachable
- `lineageSource=terminal_session`

UI expectation:

- transcript remains selectable until the terminal session is no longer
  available

### 6. Not started

API expectation:

- `mode=unavailable`
- `lineageSource=not_started`

UI expectation:

- `Visibility pending` badge
- run detail may show the reconciliation empty state instead of a session list

## Known Limitations And Expected Behavior

1. A fallback visible session can exist before any transcript entries have been
   appended. In that case, the selector still appears, but the transcript panel
   is allowed to show `No transcript entries recorded for this session yet.`
2. A run can expose a valid fallback session id before the session object is
   fully reconciled in the UI session list. In that case the operator sees
   `Awaiting session reconciliation` rather than a thread id, which is expected
   until the next hydration cycle.
3. `task_reassignment` is defined in frontend lineage labels but is not covered
   by the current backend recovery mapping or tests for this slice.
4. Archived sessions do not qualify as the latest reachable fallback session.
   If no non-archived session remains, the agent may legitimately surface as
   `unavailable`.

## Pass Criteria

The slice should be treated as healthy when all of the following are true:

- API agent and run-detail responses agree on the observability payload
- run detail keeps a transcript access target for retry, restart, and
  task-transition cases
- the UI uses a fallback badge and explanation instead of going blank
- transcript endpoint output matches the session selected in the UI
