export type WorkerSessionState =
  | "pending"
  | "active"
  | "stopped"
  | "failed"
  | "stale"
  | "archived";

export type AgentObservabilityMode =
  | "session"
  | "transcript_visibility"
  | "unavailable";
export type AgentObservabilityLineageSource =
  | "active_session"
  | "session_rollover"
  | "task_reassignment"
  | "task_state_transition"
  | "terminal_session"
  | "not_started";

export type AgentObservability = {
  mode: AgentObservabilityMode;
  currentSessionId: string | null;
  currentSessionState: WorkerSessionState | null;
  visibleTranscriptSessionId: string | null;
  visibleTranscriptSessionState: WorkerSessionState | null;
  visibleTranscriptUpdatedAt: string | null;
  lineageSource: AgentObservabilityLineageSource;
};

export type AgentObservabilityInput =
  | Partial<AgentObservability>
  | null
  | undefined;

export type AgentLike = {
  id: string;
  name: string;
  status: string;
  observability?: AgentObservabilityInput;
};

export type SessionLike = {
  id: string;
  agentId: string;
  threadId: string;
  workerNodeId?: string | null;
  state: WorkerSessionState;
  staleReason: string | null;
  updatedAt: string;
  cwd: string;
};

export type TranscriptAccessTarget = {
  agentId: string;
  agentName: string;
  mode: "live_session" | "fallback_transcript" | "unavailable";
  sessionId: string | null;
  session: SessionLike | null;
  visibleTranscriptSessionId: string | null;
  visibleTranscriptSession: SessionLike | null;
  observability: AgentObservability;
  summaryLabel: string;
  summaryDetail: string;
  badgeLabel: string;
};

const defaultObservability: AgentObservability = {
  mode: "unavailable",
  currentSessionId: null,
  currentSessionState: null,
  visibleTranscriptSessionId: null,
  visibleTranscriptSessionState: null,
  visibleTranscriptUpdatedAt: null,
  lineageSource: "not_started",
};

export function normalizeAgentObservability(
  input?: AgentObservabilityInput,
): AgentObservability {
  return {
    ...defaultObservability,
    ...input,
  };
}

function summarizeLineage(source: AgentObservabilityLineageSource) {
  switch (source) {
    case "active_session":
      return "Live Codex session is attached to the active agent.";
    case "session_rollover":
      return "Transcript visibility is preserved from the latest reachable session after a retry or restart.";
    case "task_reassignment":
      return "Transcript visibility follows the agent after task reassignment.";
    case "task_state_transition":
      return "Transcript visibility is retained across task state transitions.";
    case "terminal_session":
      return "The latest terminal session remains visible after work completed or stopped.";
    default:
      return "Transcript linkage has not been established yet.";
  }
}

function summarizeLiveSession(
  observability: AgentObservability,
  session: SessionLike | null,
  visibleTranscriptSession: SessionLike | null,
) {
  if (!session) {
    return "Live session linkage is present, but the current session record has not hydrated yet.";
  }

  if (
    observability.visibleTranscriptSessionId &&
    observability.visibleTranscriptSessionId !== session.id &&
    visibleTranscriptSession
  ) {
    return `Live session is active on ${session.threadId}; latest visible transcript remains on ${visibleTranscriptSession.threadId}.`;
  }

  return `Live session is active on ${session.threadId}.`;
}

function summarizeFallback(
  observability: AgentObservability,
  visibleTranscriptSession: SessionLike | null,
) {
  if (!visibleTranscriptSession) {
    return `${summarizeLineage(observability.lineageSource)} Session metadata is still reconciling.`;
  }

  return `${summarizeLineage(observability.lineageSource)} Showing ${visibleTranscriptSession.threadId} as the latest visible transcript.`;
}

export function buildAgentTranscriptTargets(
  agents: AgentLike[],
  sessions: SessionLike[],
): TranscriptAccessTarget[] {
  const sessionsById = new Map(
    sessions.map((session) => [session.id, session] as const),
  );

  return agents.map((agent) => {
    const observability = normalizeAgentObservability(agent.observability);
    const currentSession = observability.currentSessionId
      ? (sessionsById.get(observability.currentSessionId) ?? null)
      : null;
    const visibleTranscriptSession = observability.visibleTranscriptSessionId
      ? (sessionsById.get(observability.visibleTranscriptSessionId) ?? null)
      : null;

    if (observability.mode === "session" && observability.currentSessionId) {
      return {
        agentId: agent.id,
        agentName: agent.name,
        mode: "live_session",
        sessionId: observability.currentSessionId,
        session: currentSession,
        visibleTranscriptSessionId: observability.visibleTranscriptSessionId,
        visibleTranscriptSession,
        observability,
        summaryLabel: "Live session linked",
        summaryDetail: summarizeLiveSession(
          observability,
          currentSession,
          visibleTranscriptSession,
        ),
        badgeLabel: "Live transcript",
      };
    }

    if (
      observability.mode === "transcript_visibility" &&
      observability.visibleTranscriptSessionId
    ) {
      return {
        agentId: agent.id,
        agentName: agent.name,
        mode: "fallback_transcript",
        sessionId: observability.visibleTranscriptSessionId,
        session: visibleTranscriptSession,
        visibleTranscriptSessionId: observability.visibleTranscriptSessionId,
        visibleTranscriptSession,
        observability,
        summaryLabel: "Fallback transcript visible",
        summaryDetail: summarizeFallback(
          observability,
          visibleTranscriptSession,
        ),
        badgeLabel: "Fallback transcript",
      };
    }

    return {
      agentId: agent.id,
      agentName: agent.name,
      mode: "unavailable",
      sessionId: null,
      session: null,
      visibleTranscriptSessionId: null,
      visibleTranscriptSession: null,
      observability,
      summaryLabel: "Transcript pending",
      summaryDetail: summarizeLineage(observability.lineageSource),
      badgeLabel: "Visibility pending",
    };
  });
}

export function chooseTranscriptSessionId(
  currentSessionId: string,
  targets: TranscriptAccessTarget[],
): string {
  if (
    currentSessionId &&
    targets.some((target) => target.sessionId === currentSessionId)
  ) {
    return currentSessionId;
  }

  return (
    targets.find((target) => target.mode === "live_session")?.sessionId ??
    targets.find((target) => target.mode === "fallback_transcript")
      ?.sessionId ??
    ""
  );
}
