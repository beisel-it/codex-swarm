import { describe, expect, it } from "vitest";

import { agents, sessions, tasks, workerDispatchAssignments, workerNodes } from "../src/db/schema.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

function extractTargetId(condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) {
  const chunk = condition.queryChunks[3] as { value?: string };

  if (!chunk || typeof chunk.value !== "string") {
    throw new Error("unable to extract update target");
  }

  return chunk.value;
}

class FakeSchedulingDb {
  constructor(
    readonly workerNodeStore: any[],
    readonly assignmentStore: any[],
    readonly sessionStore: any[],
    readonly agentStore: any[]
  ) {}

  select() {
    return {
      from: (table: unknown) => ({
        where: (condition: { queryChunks?: Array<{ value?: string[] } | { value?: string }> }) => ({
          orderBy: async () => {
            if (table === workerNodes) {
              if (condition.queryChunks) {
                const id = extractTargetId(condition as { queryChunks: Array<{ value?: string[] } | { value?: string }> });
                return this.workerNodeStore.filter((candidate) => candidate.id === id);
              }

              return this.workerNodeStore;
            }

            if (table === workerDispatchAssignments) {
              return this.assignmentStore.filter((candidate) => candidate.state === "queued" || candidate.state === "retrying");
            }

            throw new Error("unexpected ordered select table");
          },
          then: <TResult1 = any[], TResult2 = never>(
            onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
          ) => {
            const rows = table === workerNodes && condition.queryChunks
              ? this.workerNodeStore.filter((candidate) => candidate.id === extractTargetId(
                condition as { queryChunks: Array<{ value?: string[] } | { value?: string }> }
              ))
              : table === workerNodes
                ? this.workerNodeStore
                : table === workerDispatchAssignments
                  ? this.assignmentStore.filter((candidate) => candidate.state === "queued" || candidate.state === "retrying")
                  : [];

            return Promise.resolve(rows).then(onfulfilled, onrejected);
          }
        }),
        orderBy: async () => {
          if (table === workerNodes) {
            return this.workerNodeStore;
          }

          if (table === workerDispatchAssignments) {
            return this.assignmentStore.filter((candidate) => candidate.state === "queued" || candidate.state === "retrying");
          }

          throw new Error("unexpected ordered select table");
        }
      })
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) => {
          const id = extractTargetId(condition);

          if (table === workerDispatchAssignments) {
            const record = this.assignmentStore.find((candidate) => candidate.id === id);

            if (!record) {
              throw new Error(`unknown worker dispatch assignment ${id}`);
            }

            Object.assign(record, values);
            return {
              returning: async () => [record],
              then<TResult1 = any[], TResult2 = never>(
                onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
              ) {
                return Promise.resolve([record]).then(onfulfilled, onrejected);
              }
            };
          }

          if (table === sessions) {
            const record = this.sessionStore.find((candidate) => candidate.id === id);

            if (!record) {
              throw new Error(`unknown session ${id}`);
            }

            Object.assign(record, values);
            return Promise.resolve([record]);
          }

          if (table === agents) {
            const record = this.agentStore.find((candidate) => candidate.id === id);

            if (!record) {
              throw new Error(`unknown agent ${id}`);
            }

            Object.assign(record, values);
            return Promise.resolve([record]);
          }

          if (table === tasks) {
            return Promise.resolve([]);
          }

          throw new Error("unexpected update table");
        }
      })
    };
  }
}

describe("ControlPlaneService distributed scheduling", () => {
  it("prefers the lowest-load eligible node when claiming generic dispatch work", async () => {
    const now = new Date("2026-03-28T12:05:00.000Z");
    const db = new FakeSchedulingDb(
      [
        {
          id: "node-a",
          name: "node-a",
          endpoint: "tcp://node-a.internal:7777",
          capabilityLabels: ["remote"],
          status: "online",
          drainState: "active",
          lastHeartbeatAt: new Date("2026-03-28T12:04:00.000Z"),
          metadata: {
            queueDepth: 6,
            activeClaims: 2,
            utilization: {
              cpu: 0.9
            }
          },
          createdAt: new Date("2026-03-28T11:00:00.000Z"),
          updatedAt: now
        },
        {
          id: "node-b",
          name: "node-b",
          endpoint: "tcp://node-b.internal:7777",
          capabilityLabels: ["remote"],
          status: "online",
          drainState: "active",
          lastHeartbeatAt: new Date("2026-03-28T12:05:00.000Z"),
          metadata: {
            queueDepth: 1,
            activeClaims: 0,
            utilization: {
              cpu: 0.2
            }
          },
          createdAt: new Date("2026-03-28T11:00:00.000Z"),
          updatedAt: now
        }
      ],
      [
        {
          id: "dispatch-1",
          runId: "run-1",
          taskId: "task-1",
          agentId: "agent-1",
          sessionId: "session-1",
          repositoryId: "repo-1",
          repositoryName: "codex-swarm",
          queue: "worker-dispatch",
          state: "queued",
          stickyNodeId: null,
          preferredNodeId: null,
          claimedByNodeId: null,
          requiredCapabilities: ["remote"],
          worktreePath: "/tmp/codex-swarm/run-1/worker-1",
          branchName: null,
          prompt: "Claim the healthiest worker",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          metadata: {},
          attempt: 0,
          maxAttempts: 3,
          leaseTtlSeconds: 300,
          claimedAt: null,
          completedAt: null,
          lastFailureReason: null,
          createdAt: new Date("2026-03-28T12:00:00.000Z"),
          updatedAt: new Date("2026-03-28T12:00:00.000Z")
        }
      ],
      [
        {
          id: "session-1",
          agentId: "agent-1",
          threadId: "thread-1",
          cwd: "/tmp/codex-swarm/run-1/worker-1",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          workerNodeId: null,
          stickyNodeId: null,
          placementConstraintLabels: ["remote"],
          lastHeartbeatAt: null,
          state: "pending",
          staleReason: null,
          metadata: {},
          createdAt: new Date("2026-03-28T12:00:00.000Z"),
          updatedAt: new Date("2026-03-28T12:00:00.000Z")
        }
      ],
      [
        {
          id: "agent-1",
          runId: "run-1",
          taskId: "task-1",
          label: "worker-agent",
          role: "backend-dev",
          status: "idle",
          createdAt: new Date("2026-03-28T12:00:00.000Z"),
          updatedAt: new Date("2026-03-28T12:00:00.000Z")
        }
      ]
    );
    const service = new ControlPlaneService(db as never, {
      now: () => now
    });
    (service as any).reconcileRunExecutionState = async () => undefined;

    const overloadedClaim = await service.claimNextWorkerDispatch("node-a");

    expect(overloadedClaim).toBeNull();

    const healthyClaim = await service.claimNextWorkerDispatch("node-b");

    expect(healthyClaim).toMatchObject({
      id: "dispatch-1",
      claimedByNodeId: "node-b",
      stickyNodeId: "node-b",
      preferredNodeId: "node-b",
      state: "claimed"
    });
    expect(db.sessionStore[0]).toMatchObject({
      workerNodeId: "node-b",
      stickyNodeId: "node-b",
      state: "active",
      staleReason: null,
      updatedAt: now
    });
    expect(db.agentStore[0]).toMatchObject({
      status: "busy",
      updatedAt: now
    });
  });
});
