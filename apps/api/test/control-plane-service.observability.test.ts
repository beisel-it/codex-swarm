import { describe, expect, it } from "vitest";

import { ControlPlaneService } from "../src/services/control-plane-service.js";

function createAgent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    name: "worker-agent",
    role: "backend-developer",
    status: "busy",
    worktreePath: "/tmp/codex-swarm/worker-agent",
    branchName: null,
    currentTaskId: "33333333-3333-4333-8333-333333333333",
    lastHeartbeatAt: new Date("2026-03-29T09:59:00.000Z"),
    createdAt: new Date("2026-03-29T09:00:00.000Z"),
    updatedAt: new Date("2026-03-29T09:59:00.000Z"),
    ...overrides,
  };
}

function createSession(
  id: string,
  state: "pending" | "active" | "stopped" | "failed" | "stale" | "archived",
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id,
    agentId: "11111111-1111-4111-8111-111111111111",
    threadId: `thread-${id}`,
    cwd: "/tmp/codex-swarm/worker-agent",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    includePlanTool: false,
    workerNodeId: null,
    stickyNodeId: null,
    placementConstraintLabels: [],
    lastHeartbeatAt: null,
    state,
    staleReason: null,
    metadata: {},
    createdAt: new Date("2026-03-29T09:00:00.000Z"),
    updatedAt: new Date("2026-03-29T09:00:00.000Z"),
    ...overrides,
  };
}

describe("ControlPlaneService agent observability mapping", () => {
  it("preserves transcript visibility through task state transitions even without persisted transcript entries", () => {
    const service = new ControlPlaneService({} as never, {
      now: () => new Date("2026-03-29T10:00:00.000Z"),
    });
    const agent = createAgent({
      status: "stopped",
      currentTaskId: "33333333-3333-4333-8333-333333333333",
    });
    const stoppedSession = createSession(
      "44444444-4444-4444-8444-444444444444",
      "stopped",
    );

    const observability = (service as any).buildAgentObservability(agent, [
      stoppedSession,
    ]);

    expect(observability).toMatchObject({
      mode: "transcript_visibility",
      currentSessionId: null,
      visibleTranscriptSessionId: stoppedSession.id,
      visibleTranscriptSessionState: "stopped",
      visibleTranscriptUpdatedAt: null,
      lineageSource: "task_state_transition",
    });
  });

  it("keeps the latest retry session linked while retaining older visible transcript lineage", () => {
    const service = new ControlPlaneService({} as never, {
      now: () => new Date("2026-03-29T10:00:00.000Z"),
    });
    const agent = createAgent({
      status: "idle",
    });
    const previousSession = createSession(
      "55555555-5555-4555-8555-555555555555",
      "stale",
      {
        metadata: {
          transcript: [
            {
              id: "77777777-7777-4777-8777-777777777777",
              sessionId: "55555555-5555-4555-8555-555555555555",
              kind: "response",
              text: "Previous attempt output",
              createdAt: "2026-03-29T09:15:00.000Z",
              metadata: {},
            },
          ],
        },
        createdAt: new Date("2026-03-29T09:10:00.000Z"),
        updatedAt: new Date("2026-03-29T09:15:00.000Z"),
      },
    );
    const retrySession = createSession(
      "66666666-6666-4666-8666-666666666666",
      "pending",
      {
        createdAt: new Date("2026-03-29T09:20:00.000Z"),
        updatedAt: new Date("2026-03-29T09:20:00.000Z"),
      },
    );

    const observability = (service as any).buildAgentObservability(agent, [
      previousSession,
      retrySession,
    ]);

    expect(observability).toMatchObject({
      mode: "session",
      currentSessionId: retrySession.id,
      currentSessionState: "pending",
      visibleTranscriptSessionId: previousSession.id,
      visibleTranscriptSessionState: "stale",
      lineageSource: "session_rollover",
    });
    expect(observability.visibleTranscriptUpdatedAt).toEqual(
      new Date("2026-03-29T09:15:00.000Z"),
    );
  });

  it("maps active-agent payloads with fallback session lineage for restart recovery responses", () => {
    const service = new ControlPlaneService({} as never, {
      now: () => new Date("2026-03-29T10:00:00.000Z"),
    });
    const restartingAgent = createAgent({
      status: "busy",
    });
    const staleSession = createSession(
      "88888888-8888-4888-8888-888888888888",
      "stale",
      {
        staleReason: "node_lost:heartbeat expired",
        createdAt: new Date("2026-03-29T09:05:00.000Z"),
      },
    );

    const mappedAgents = (service as any).mapAgents(
      [restartingAgent],
      [staleSession],
    );

    expect(mappedAgents).toHaveLength(1);
    expect(mappedAgents[0]).toMatchObject({
      id: restartingAgent.id,
      observability: {
        mode: "transcript_visibility",
        visibleTranscriptSessionId: staleSession.id,
        visibleTranscriptSessionState: "stale",
        visibleTranscriptUpdatedAt: null,
        lineageSource: "session_rollover",
      },
    });
  });
});
