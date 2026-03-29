import { describe, expect, it } from 'vitest'

import { buildAgentTranscriptTargets, chooseTranscriptSessionId } from './agent-observability'

describe('agent observability transcript targets', () => {
  it('prefers the live session during normal execution', () => {
    const targets = buildAgentTranscriptTargets(
      [{
        id: 'agent-1',
        name: 'frontend-dev',
        status: 'busy',
        observability: {
          mode: 'session',
          currentSessionId: 'session-live',
          currentSessionState: 'active',
          visibleTranscriptSessionId: 'session-live',
          visibleTranscriptSessionState: 'active',
          visibleTranscriptUpdatedAt: '2026-03-29T09:15:00.000Z',
          lineageSource: 'active_session',
        },
      }],
      [{
        id: 'session-live',
        agentId: 'agent-1',
        threadId: 'thread-live',
        state: 'active',
        staleReason: null,
        updatedAt: '2026-03-29T09:15:00.000Z',
        cwd: '/tmp/live',
      }],
    )

    expect(targets[0]).toMatchObject({
      mode: 'live_session',
      sessionId: 'session-live',
      summaryLabel: 'Live session linked',
      badgeLabel: 'Live transcript',
    })
    expect(chooseTranscriptSessionId('', targets)).toBe('session-live')
  })

  it('keeps the retry session as the primary transcript target while surfacing older visible transcript lineage', () => {
    const targets = buildAgentTranscriptTargets(
      [{
        id: 'agent-2',
        name: 'backend-dev',
        status: 'busy',
        observability: {
          mode: 'session',
          currentSessionId: 'session-retry',
          currentSessionState: 'pending',
          visibleTranscriptSessionId: 'session-old',
          visibleTranscriptSessionState: 'stale',
          visibleTranscriptUpdatedAt: '2026-03-29T09:12:00.000Z',
          lineageSource: 'session_rollover',
        },
      }],
      [
        {
          id: 'session-old',
          agentId: 'agent-2',
          threadId: 'thread-old',
          state: 'stale',
          staleReason: 'retry in progress',
          updatedAt: '2026-03-29T09:12:00.000Z',
          cwd: '/tmp/old',
        },
        {
          id: 'session-retry',
          agentId: 'agent-2',
          threadId: 'thread-retry',
          state: 'pending',
          staleReason: null,
          updatedAt: '2026-03-29T09:13:00.000Z',
          cwd: '/tmp/retry',
        },
      ],
    )

    expect(targets[0]).toMatchObject({
      mode: 'live_session',
      sessionId: 'session-retry',
      visibleTranscriptSessionId: 'session-old',
    })
    expect(targets[0]?.summaryDetail).toContain('latest visible transcript remains on thread-old')
  })

  it('falls back to the latest visible transcript after restart recovery drops the current session link', () => {
    const targets = buildAgentTranscriptTargets(
      [{
        id: 'agent-3',
        name: 'reviewer',
        status: 'busy',
        observability: {
          mode: 'transcript_visibility',
          currentSessionId: null,
          currentSessionState: null,
          visibleTranscriptSessionId: 'session-stale',
          visibleTranscriptSessionState: 'stale',
          visibleTranscriptUpdatedAt: '2026-03-29T09:20:00.000Z',
          lineageSource: 'session_rollover',
        },
      }],
      [{
        id: 'session-stale',
        agentId: 'agent-3',
        threadId: 'thread-stale',
        state: 'stale',
        staleReason: 'worker restart pending',
        updatedAt: '2026-03-29T09:20:00.000Z',
        cwd: '/tmp/stale',
      }],
    )

    expect(targets[0]).toMatchObject({
      mode: 'fallback_transcript',
      sessionId: 'session-stale',
      summaryLabel: 'Fallback transcript visible',
      badgeLabel: 'Fallback transcript',
    })
  })

  it('retains transcript visibility across task state transitions without showing a blank target', () => {
    const targets = buildAgentTranscriptTargets(
      [{
        id: 'agent-4',
        name: 'leader',
        status: 'stopped',
        observability: {
          mode: 'transcript_visibility',
          currentSessionId: null,
          currentSessionState: null,
          visibleTranscriptSessionId: 'session-terminal',
          visibleTranscriptSessionState: 'stopped',
          visibleTranscriptUpdatedAt: null,
          lineageSource: 'task_state_transition',
        },
      }],
      [{
        id: 'session-terminal',
        agentId: 'agent-4',
        threadId: 'thread-terminal',
        state: 'stopped',
        staleReason: null,
        updatedAt: '2026-03-29T09:00:00.000Z',
        cwd: '/tmp/terminal',
      }],
    )

    expect(targets[0]).toMatchObject({
      mode: 'fallback_transcript',
      sessionId: 'session-terminal',
    })
    expect(targets[0]?.summaryDetail).toContain('task state transitions')
  })
})
