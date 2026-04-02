import { describe, expect, it, vi } from "vitest";

import { agents, runs, sessions, tasks, workerDispatchAssignments } from "../src/db/schema.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

function extractTargetId(condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) {
  const chunk = condition.queryChunks[3] as { value?: string };

  if (!chunk || typeof chunk.value !== "string") {
    throw new Error("unable to extract update target");
  }

  return chunk.value;
}

class FakeVerificationDb {
  constructor(
    readonly assignmentStore: any[],
    readonly agentStore: any[],
    readonly taskStore: any[],
    readonly sessionStore: any[]
  ) {}

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) => {
          const id = extractTargetId(condition);

          if (table === workerDispatchAssignments) {
            const record = this.assignmentStore.find((candidate) => candidate.id === id);
            Object.assign(record, values);
            return {
              returning: async () => [record]
            };
          }

          if (table === agents) {
            const record = this.agentStore.find((candidate) => candidate.id === id);
            Object.assign(record, values);
            return Promise.resolve([record]);
          }

          if (table === tasks) {
            const record = this.taskStore.find((candidate) => candidate.id === id);
            Object.assign(record, values);
            return Promise.resolve([record]);
          }

          if (table === sessions) {
            const record = this.sessionStore.find((candidate) => candidate.id === id);
            Object.assign(record, values);
            return Promise.resolve([record]);
          }

          throw new Error("unexpected table update");
        }
      })
    };
  }
}

class FakeVerificationSchedulingDb {
  constructor(
    readonly runStore: any[],
    readonly assignmentStore: any[],
    readonly agentStore: any[]
  ) {}

  select() {
    return {
      from: (table: unknown) => ({
        where: () => ({
          orderBy: async () => {
            if (table === workerDispatchAssignments) {
              return this.assignmentStore;
            }

            throw new Error("unexpected ordered select table");
          }
        })
      })
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) => {
          const id = extractTargetId(condition);

          if (table === runs) {
            const record = this.runStore.find((candidate) => candidate.id === id);
            Object.assign(record, values);
            return {
              returning: async () => [record]
            };
          }

          if (table === agents) {
            const record = this.agentStore.find((candidate) => candidate.id === id);
            Object.assign(record, values);
            return {
              returning: async () => [record]
            };
          }

          throw new Error("unexpected update table");
        }
      })
    };
  }
}

class FakeRepairDb {
  constructor(
    readonly runStore: any[],
    readonly assignmentStore: any[],
    readonly agentStore: any[],
    readonly taskStore: any[],
    readonly sessionStore: any[]
  ) {}

  select() {
    return {
      from: (table: unknown) => ({
        where: (condition: { queryChunks?: Array<{ value?: string[] } | { value?: string }> }) => ({
          orderBy: async () => {
            const target = condition.queryChunks?.[3]?.value;
            const ids = Array.isArray(target) ? target : [target];

            if (table === runs) {
              return this.runStore.filter((candidate) => ids.includes(candidate.id));
            }

            if (table === tasks) {
              return this.taskStore.filter((candidate) => ids.includes(candidate.id) || ids.includes(candidate.runId));
            }

            if (table === workerDispatchAssignments) {
              return this.assignmentStore.filter((candidate) => ids.includes(candidate.id) || ids.includes(candidate.runId));
            }

            return [];
          },
          then: <TResult1 = any[], TResult2 = never>(
            onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
          ) => {
            const target = condition.queryChunks?.[3]?.value;
            const ids = Array.isArray(target) ? target : [target];
            const rows = table === runs
              ? this.runStore.filter((candidate) => ids.includes(candidate.id))
              : table === tasks
                ? this.taskStore.filter((candidate) => ids.includes(candidate.id) || ids.includes(candidate.runId))
                : table === workerDispatchAssignments
                  ? this.assignmentStore.filter((candidate) => ids.includes(candidate.id) || ids.includes(candidate.runId))
                  : [];

            return Promise.resolve(rows).then(onfulfilled, onrejected);
          }
        })
      })
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) => {
          const target = condition.queryChunks?.[3]?.value;
          const ids = Array.isArray(target) ? target : [target];
          const store = table === runs
            ? this.runStore
            : table === workerDispatchAssignments
              ? this.assignmentStore
              : table === agents
                ? this.agentStore
                : table === tasks
                  ? this.taskStore
                  : table === sessions
                    ? this.sessionStore
                    : null;

          if (!store) {
            throw new Error("unexpected update table");
          }

          const records = store.filter((candidate) => ids.includes(candidate.id));
          records.forEach((record) => Object.assign(record, values));

          return {
            returning: async () => records,
            then<TResult1 = any[], TResult2 = never>(
              onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
            ) {
              return Promise.resolve(records).then(onfulfilled, onrejected);
            }
          };
        }
      })
    };
  }
}

function createWorkerAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "dispatch-worker-1",
    runId: "run-1",
    taskId: "task-1",
    agentId: "worker-agent-1",
    sessionId: "session-worker-1",
    repositoryId: "repo-1",
    repositoryName: "codex-swarm",
    queue: "worker-dispatch",
    state: "claimed",
    stickyNodeId: "node-1",
    preferredNodeId: "node-1",
    claimedByNodeId: "node-1",
    requiredCapabilities: ["workspace-write"],
    worktreePath: "/tmp/codex-swarm/run-1/shared",
    branchName: "main",
    prompt: "Implement the task",
    profile: "backend-developer",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    includePlanTool: false,
    metadata: {
      assignmentKind: "worker"
    },
    attempt: 0,
    maxAttempts: 3,
    leaseTtlSeconds: 300,
    createdAt: new Date("2026-03-31T09:00:00.000Z"),
    updatedAt: new Date("2026-03-31T09:00:00.000Z"),
    ...overrides
  };
}

function createTaskRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-1",
    runId: "run-1",
    parentTaskId: null,
    title: "Implement verifier pairing",
    description: "Worker completion should trigger verification.",
    role: "backend-developer",
    status: "in_progress",
    priority: 1,
    ownerAgentId: "worker-agent-1",
    verificationStatus: "pending",
    verifierAgentId: null,
    latestVerificationSummary: null,
    latestVerificationFindings: [],
    latestVerificationChangeRequests: [],
    latestVerificationEvidence: [],
    dependencyIds: [],
    definitionOfDone: ["worker completion advances to awaiting_review"],
    acceptanceCriteria: ["review gating is explicit"],
    validationTemplates: [],
    createdAt: new Date("2026-03-31T09:00:00.000Z"),
    updatedAt: new Date("2026-03-31T09:00:00.000Z"),
    ...overrides
  };
}

describe("ControlPlaneService verification lifecycle", () => {
  it("routes worker completion into awaiting_review and queues a verifier assignment", async () => {
    const workerAssignment = createWorkerAssignment();
    const taskRecord = createTaskRecord();
    const db = new FakeVerificationDb(
      [workerAssignment],
      [
        {
          id: "worker-agent-1",
          status: "busy",
          currentTaskId: "task-1"
        }
      ],
      [taskRecord],
      [
        {
          id: "session-worker-1",
          state: "active",
          workerNodeId: "node-1",
          stickyNodeId: "node-1",
          staleReason: null
        }
      ]
    );
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-31T09:10:00.000Z")
    });
    const createAgent = vi.fn(async (input: Record<string, unknown>) => ({
      id: "verifier-agent-1",
      runId: "run-1",
      name: input.name,
      role: input.role,
      profile: input.profile,
      status: "idle",
      projectTeamMemberId: input.projectTeamMemberId ?? null,
      worktreePath: input.worktreePath ?? null,
      branchName: input.branchName ?? null,
      currentTaskId: input.currentTaskId ?? null,
      lastHeartbeatAt: null,
      observability: {
        mode: "unavailable",
        currentSessionId: null,
        currentSessionState: null,
        visibleTranscriptSessionId: null,
        visibleTranscriptSessionState: null,
        visibleTranscriptUpdatedAt: null,
        lineageSource: "not_started"
      },
      createdAt: new Date("2026-03-31T09:10:00.000Z"),
      updatedAt: new Date("2026-03-31T09:10:00.000Z")
    }));
    const createWorkerDispatchAssignment = vi.fn(async (input: Record<string, unknown>) => ({
      id: "dispatch-verifier-1",
      ...input,
      sessionId: undefined,
      state: "queued",
      claimedByNodeId: null,
      stickyNodeId: null,
      preferredNodeId: null,
      attempt: 0,
      createdAt: new Date("2026-03-31T09:10:00.000Z")
    }));
    const recordControlPlaneEvent = vi.fn(async () => undefined);

    (service as any).assertTaskExists = async () => taskRecord;
    (service as any).getRun = async () => ({
      id: "run-1",
      repositoryId: "repo-1",
      projectTeamId: "team-1",
      branchName: "main",
      goal: "Ship verifier pairing",
      context: {
        externalInput: null,
        values: {}
      },
      agents: [
        {
          id: "worker-agent-1",
          role: "backend-developer",
          profile: "backend-developer",
          projectTeamMemberId: "member-backend-1"
        }
      ]
    });
    (service as any).assertRepositoryExists = async () => ({
      id: "repo-1",
      name: "codex-swarm",
      defaultBranch: "main"
    });
    (service as any).areDependenciesSatisfied = async () => true;
    (service as any).loadRunProjectTeam = async () => ({
      id: "team-1",
      members: [
        {
          id: "member-reviewer-1",
          name: "Verifier",
          role: "reviewer",
          profile: "reviewer",
          position: 0
        },
        {
          id: "member-backend-1",
          name: "Builder",
          role: "backend-developer",
          profile: "backend-developer",
          position: 1
        }
      ]
    });
    (service as any).createAgent = createAgent;
    (service as any).createWorkerDispatchAssignment = createWorkerDispatchAssignment;
    (service as any).recordControlPlaneEvent = recordControlPlaneEvent;
    (service as any).enqueueRunnableWorkerDispatches = vi.fn(async () => []);
    (service as any).reconcileRunExecutionState = vi.fn(async () => undefined);
    (service as any).maybeUnblockDependentTasks = vi.fn(async () => undefined);

    await (service as any).transitionWorkerDispatchFailureOrCompletion(workerAssignment, {
      nodeId: "node-1",
      status: "completed",
      outcome: {
        kind: "worker",
        summary: "Implementation is ready for verification.",
        outcomeStatus: "completed",
        blockingIssues: []
      }
    });

    expect(taskRecord.status).toBe("awaiting_review");
    expect(taskRecord.verificationStatus).toBe("requested");
    expect(taskRecord.verifierAgentId).toBe("verifier-agent-1");
    expect(taskRecord.latestVerificationSummary).toContain("Verification requested");
    expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({
      role: "reviewer",
      projectTeamMemberId: "member-reviewer-1",
      currentTaskId: "task-1"
    }), undefined);
    expect(createWorkerDispatchAssignment).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-1",
      agentId: "verifier-agent-1",
      metadata: expect.objectContaining({
        assignmentKind: "verification",
        workerAgentId: "worker-agent-1",
        workerSummary: "Implementation is ready for verification."
      })
    }));
    expect(recordControlPlaneEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "task.verification_requested" }),
      expect.objectContaining({ entityId: "task-1", status: "requested" })
    );
  });

  it("re-requests verification for a review-blocked task from its completed worker context", async () => {
    const now = new Date("2026-03-31T09:12:00.000Z");
    const parentWorkerAssignment = createWorkerAssignment({
      id: "dispatch-worker-parent",
      taskId: "task-parent",
      state: "completed",
      metadata: {
        assignmentKind: "worker",
        workerSummary: "Independent evidence is ready for review.",
        workerOutcomeStatus: "completed",
        blockingIssues: []
      }
    });
    const oldBlockedVerificationAssignment = createWorkerAssignment({
      id: "dispatch-verifier-old",
      taskId: "task-parent",
      agentId: "verifier-agent-old",
      state: "completed",
      metadata: {
        assignmentKind: "verification",
        verificationOutcomeStatus: "blocked",
        workerSummary: "Independent evidence is ready for review."
      }
    });
    const evidenceWorkerAssignment = createWorkerAssignment({
      id: "dispatch-worker-evidence",
      taskId: "task-evidence",
      agentId: "tester-agent-1",
      state: "completed",
      metadata: {
        assignmentKind: "worker",
        workerSummary: "Evidence captured.",
        workerOutcomeStatus: "completed"
      }
    });
    const taskParent = createTaskRecord({
      id: "task-parent",
      title: "Verify persisted payload",
      role: "tester",
      status: "blocked",
      ownerAgentId: "verifier-agent-old",
      verificationStatus: "blocked",
      verifierAgentId: "verifier-agent-old",
      dependencyIds: ["task-write", "task-evidence"]
    });
    const taskWrite = createTaskRecord({
      id: "task-write",
      title: "Write webhook payload",
      status: "completed",
      verificationStatus: "passed",
      ownerAgentId: "worker-agent-1",
      verifierAgentId: "verifier-agent-1",
      dependencyIds: []
    });
    const taskEvidence = createTaskRecord({
      id: "task-evidence",
      parentTaskId: "task-parent",
      title: "Record independent verification evidence",
      role: "tester",
      status: "completed",
      verificationStatus: "passed",
      ownerAgentId: "tester-agent-1",
      verifierAgentId: "reviewer-agent-1",
      dependencyIds: ["task-write"]
    });
    const agentStore: Array<Record<string, unknown>> = [
      {
        id: "worker-agent-1",
        status: "stopped",
        currentTaskId: null,
        updatedAt: now
      }
    ];
    const assignmentStore: Array<Record<string, unknown>> = [
      parentWorkerAssignment,
      oldBlockedVerificationAssignment,
      evidenceWorkerAssignment
    ];
    const db = new FakeRepairDb(
      [],
      assignmentStore,
      agentStore,
      [taskParent, taskWrite, taskEvidence],
      []
    );
    const service = new ControlPlaneService(db as never, {
      now: () => now
    });
    const createAgent = vi.fn(async (input: Record<string, unknown>) => {
      const agent = {
        id: "verifier-agent-retry",
        runId: "run-1",
        name: input.name,
        role: input.role,
        profile: input.profile,
        status: "idle",
        projectTeamMemberId: input.projectTeamMemberId ?? null,
        worktreePath: input.worktreePath ?? null,
        branchName: input.branchName ?? null,
        currentTaskId: input.currentTaskId ?? null,
        updatedAt: now,
        createdAt: now
      };
      agentStore.push(agent);
      return agent;
    });
    const createWorkerDispatchAssignment = vi.fn(async (input: Record<string, unknown>) => {
      const assignment = {
        id: "dispatch-verifier-retry",
        ...input,
        sessionId: undefined,
        state: "queued",
        claimedByNodeId: null,
        stickyNodeId: null,
        preferredNodeId: null,
        attempt: 0,
        createdAt: now,
        updatedAt: now
      };
      assignmentStore.push(assignment);
      return assignment;
    });
    const recordControlPlaneEvent = vi.fn(async () => undefined);

    (service as any).getRun = async () => ({
      id: "run-1",
      repositoryId: "repo-1",
      projectTeamId: "team-1",
      branchName: "main",
      goal: "Retry blocked verification after evidence is recorded",
      context: {
        externalInput: null,
        values: {}
      },
      agents: [
        {
          id: "worker-agent-1",
          role: "backend-developer",
          profile: "backend-developer",
          projectTeamMemberId: "member-backend-1"
        }
      ]
    });
    (service as any).assertRepositoryExists = async () => ({
      id: "repo-1",
      name: "codex-swarm",
      defaultBranch: "main"
    });
    (service as any).loadRunProjectTeam = async () => ({
      id: "team-1",
      members: [
        {
          id: "member-reviewer-1",
          name: "Verifier",
          role: "reviewer",
          profile: "reviewer",
          position: 0
        }
      ]
    });
    (service as any).createAgent = createAgent;
    (service as any).createWorkerDispatchAssignment = createWorkerDispatchAssignment;
    (service as any).recordControlPlaneEvent = recordControlPlaneEvent;

    await expect((service as any).retryBlockedVerificationTask("run-1", taskParent)).resolves.toBe(true);

    expect(taskParent.status).toBe("awaiting_review");
    expect(taskParent.verificationStatus).toBe("requested");
    expect(taskParent.verifierAgentId).toBe("verifier-agent-retry");
    expect(taskParent.latestVerificationSummary).toContain("Verification requested after worker completion");
    expect(createWorkerDispatchAssignment).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-parent",
      metadata: expect.objectContaining({
        assignmentKind: "verification",
        workerAssignmentId: "dispatch-worker-parent",
        workerSummary: "Independent evidence is ready for review."
      })
    }));
    expect(recordControlPlaneEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "task.verification_requested" }),
      expect.objectContaining({ entityId: "task-parent", status: "requested" })
    );
  });

  it("routes a dependency-ready review-blocked task into the verification retry helper", async () => {
    const service = new ControlPlaneService({} as never, {
      now: () => new Date("2026-03-31T09:13:00.000Z")
    });
    const retryBlockedVerificationTask = vi.fn(async () => true);

    (service as any).db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([
            createTaskRecord({
              id: "task-parent",
              status: "blocked",
              verificationStatus: "blocked",
              dependencyIds: ["task-child"]
            })
          ])
        })
      })
    };
    (service as any).areDependenciesSatisfied = async () => true;
    (service as any).retryBlockedVerificationTask = retryBlockedVerificationTask;

    await (service as any).maybeUnblockDependentTasks("run-1", "task-child", "completed");

    expect(retryBlockedVerificationTask).toHaveBeenCalledWith("run-1", expect.objectContaining({
      id: "task-parent",
      verificationStatus: "blocked"
    }));
  });

  it("falls back to a second same-role verifier when no review role is available", async () => {
    const workerAssignment = createWorkerAssignment();
    const taskRecord = createTaskRecord();
    const db = new FakeVerificationDb(
      [workerAssignment],
      [
        {
          id: "worker-agent-1",
          status: "busy",
          currentTaskId: "task-1"
        }
      ],
      [taskRecord],
      [
        {
          id: "session-worker-1",
          state: "active",
          workerNodeId: "node-1",
          stickyNodeId: "node-1",
          staleReason: null
        }
      ]
    );
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-31T09:12:00.000Z")
    });
    const createAgent = vi.fn(async (input: Record<string, unknown>) => ({
      id: "verifier-agent-2",
      runId: "run-1",
      name: input.name,
      role: input.role,
      profile: input.profile,
      status: "idle",
      projectTeamMemberId: input.projectTeamMemberId ?? null,
      worktreePath: input.worktreePath ?? null,
      branchName: input.branchName ?? null,
      currentTaskId: input.currentTaskId ?? null,
      lastHeartbeatAt: null,
      observability: {
        mode: "unavailable",
        currentSessionId: null,
        currentSessionState: null,
        visibleTranscriptSessionId: null,
        visibleTranscriptSessionState: null,
        visibleTranscriptUpdatedAt: null,
        lineageSource: "not_started"
      },
      createdAt: new Date("2026-03-31T09:12:00.000Z"),
      updatedAt: new Date("2026-03-31T09:12:00.000Z")
    }));
    const createWorkerDispatchAssignment = vi.fn(async (input: Record<string, unknown>) => ({
      id: "dispatch-verifier-2",
      ...input,
      sessionId: undefined,
      state: "queued",
      claimedByNodeId: null,
      stickyNodeId: null,
      preferredNodeId: null,
      attempt: 0,
      createdAt: new Date("2026-03-31T09:12:00.000Z")
    }));

    (service as any).assertTaskExists = async () => taskRecord;
    (service as any).getRun = async () => ({
      id: "run-1",
      repositoryId: "repo-1",
      projectTeamId: "team-1",
      branchName: "main",
      goal: "Ship verifier pairing",
      context: {
        externalInput: null,
        values: {}
      },
      agents: [
        {
          id: "worker-agent-1",
          role: "backend-developer",
          profile: "backend-developer",
          projectTeamMemberId: "member-backend-1"
        }
      ]
    });
    (service as any).assertRepositoryExists = async () => ({
      id: "repo-1",
      name: "codex-swarm",
      defaultBranch: "main"
    });
    (service as any).loadRunProjectTeam = async () => ({
      id: "team-1",
      members: [
        {
          id: "member-backend-1",
          name: "Builder One",
          role: "backend-developer",
          profile: "backend-developer",
          position: 0
        },
        {
          id: "member-backend-2",
          name: "Builder Two",
          role: "backend-developer",
          profile: "backend-developer",
          position: 1
        }
      ]
    });
    (service as any).createAgent = createAgent;
    (service as any).createWorkerDispatchAssignment = createWorkerDispatchAssignment;
    (service as any).recordControlPlaneEvent = vi.fn(async () => undefined);
    (service as any).enqueueRunnableWorkerDispatches = vi.fn(async () => []);
    (service as any).reconcileRunExecutionState = vi.fn(async () => undefined);
    (service as any).maybeUnblockDependentTasks = vi.fn(async () => undefined);

    await (service as any).transitionWorkerDispatchFailureOrCompletion(workerAssignment, {
      nodeId: "node-1",
      status: "completed",
      outcome: {
        kind: "worker",
        summary: "Implementation is ready for verification.",
        outcomeStatus: "completed",
        blockingIssues: []
      }
    });

    expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({
      role: "backend-developer",
      profile: "backend-developer",
      projectTeamMemberId: "member-backend-2",
      currentTaskId: "task-1"
    }), undefined);
    expect(createWorkerDispatchAssignment).toHaveBeenCalledWith(expect.objectContaining({
      agentId: "verifier-agent-2",
      metadata: expect.objectContaining({
        assignmentKind: "verification",
        workerAgentId: "worker-agent-1"
      })
    }));
    expect(taskRecord.verifierAgentId).toBe("verifier-agent-2");
  });

  it("resets a failed-verification task to pending and restores the original worker for rework", async () => {
    const verifierAssignment = createWorkerAssignment({
      id: "dispatch-verifier-1",
      agentId: "verifier-agent-1",
      sessionId: "session-verifier-1",
      metadata: {
        assignmentKind: "verification",
        workerAgentId: "worker-agent-1",
        workerSummary: "Implementation is ready for verification."
      }
    });
    const taskRecord = createTaskRecord({
      status: "awaiting_review",
      ownerAgentId: "verifier-agent-1",
      verificationStatus: "in_progress",
      verifierAgentId: "verifier-agent-1"
    });
    const db = new FakeVerificationDb(
      [verifierAssignment],
      [
        {
          id: "worker-agent-1",
          status: "idle",
          currentTaskId: null
        },
        {
          id: "verifier-agent-1",
          status: "busy",
          currentTaskId: "task-1"
        }
      ],
      [taskRecord],
      [
        {
          id: "session-verifier-1",
          state: "active",
          workerNodeId: "node-1",
          stickyNodeId: "node-1",
          staleReason: null
        }
      ]
    );
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-31T09:20:00.000Z")
    });
    const maybeUnblockDependentTasks = vi.fn(async () => undefined);
    const recordControlPlaneEvent = vi.fn(async () => undefined);

    (service as any).assertTaskExists = async () => taskRecord;
    (service as any).recordControlPlaneEvent = recordControlPlaneEvent;
    (service as any).maybeUnblockDependentTasks = maybeUnblockDependentTasks;
    const enqueueRunnableWorkerDispatches = vi.fn(async () => []);
    (service as any).enqueueRunnableWorkerDispatches = enqueueRunnableWorkerDispatches;
    (service as any).reconcileRunExecutionState = vi.fn(async () => undefined);
    (service as any).createTask = vi.fn(async () => {
      throw new Error("verifier must not create tasks directly");
    });

    await (service as any).transitionWorkerDispatchFailureOrCompletion(verifierAssignment, {
      nodeId: "node-1",
      status: "completed",
      outcome: {
        kind: "verification",
        summary: "Definition of done is not satisfied.",
        outcomeStatus: "failed",
        findings: ["Worker completion still closes the task immediately."],
        changeRequests: ["Route worker completion into awaiting_review and queue a verifier assignment."],
        evidence: ["artifact:.swarm/reports/verification.md"]
      }
    });

    expect(taskRecord.status).toBe("pending");
    expect(taskRecord.ownerAgentId).toBe("worker-agent-1");
    expect(taskRecord.verificationStatus).toBe("failed");
    expect(taskRecord.verifierAgentId).toBeNull();
    expect(taskRecord.latestVerificationSummary).toBe("Definition of done is not satisfied.");
    expect(taskRecord.latestVerificationFindings).toEqual([
      "Worker completion still closes the task immediately."
    ]);
    expect(taskRecord.latestVerificationChangeRequests).toEqual([
      "Route worker completion into awaiting_review and queue a verifier assignment."
    ]);
    expect(maybeUnblockDependentTasks).not.toHaveBeenCalled();
    expect(enqueueRunnableWorkerDispatches).toHaveBeenCalledWith("run-1");
    expect(recordControlPlaneEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "task.verification_failed" }),
      expect.objectContaining({
        entityId: "task-1",
        status: "failed",
        metadata: expect.objectContaining({
          changeRequests: ["Route worker completion into awaiting_review and queue a verifier assignment."]
        })
      })
    );
  });

  it("marks verifier passes as completed and unblocks downstream work", async () => {
    const verifierAssignment = createWorkerAssignment({
      id: "dispatch-verifier-1",
      agentId: "verifier-agent-1",
      sessionId: "session-verifier-1",
      metadata: {
        assignmentKind: "verification",
        workerAgentId: "worker-agent-1",
        workerSummary: "Implementation is ready for verification."
      }
    });
    const taskRecord = createTaskRecord({
      status: "awaiting_review",
      ownerAgentId: "verifier-agent-1",
      verificationStatus: "in_progress",
      verifierAgentId: "verifier-agent-1"
    });
    const db = new FakeVerificationDb(
      [verifierAssignment],
      [
        {
          id: "verifier-agent-1",
          status: "busy",
          currentTaskId: "task-1"
        }
      ],
      [taskRecord],
      [
        {
          id: "session-verifier-1",
          state: "active",
          workerNodeId: "node-1",
          stickyNodeId: "node-1",
          staleReason: null
        }
      ]
    );
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-31T09:30:00.000Z")
    });
    const maybeUnblockDependentTasks = vi.fn(async () => undefined);
    const recordControlPlaneEvent = vi.fn(async () => undefined);

    (service as any).assertTaskExists = async () => taskRecord;
    (service as any).recordControlPlaneEvent = recordControlPlaneEvent;
    (service as any).maybeUnblockDependentTasks = maybeUnblockDependentTasks;
    (service as any).enqueueRunnableWorkerDispatches = vi.fn(async () => []);
    (service as any).reconcileRunExecutionState = vi.fn(async () => undefined);

    await (service as any).transitionWorkerDispatchFailureOrCompletion(verifierAssignment, {
      nodeId: "node-1",
      status: "completed",
      outcome: {
        kind: "verification",
        summary: "Definition of done is satisfied.",
        outcomeStatus: "passed",
        findings: [],
        changeRequests: [],
        evidence: ["validation:typecheck=passed"]
      }
    });

    expect(taskRecord.status).toBe("completed");
    expect(taskRecord.verificationStatus).toBe("passed");
    expect(taskRecord.latestVerificationSummary).toBe("Definition of done is satisfied.");
    expect(maybeUnblockDependentTasks).toHaveBeenCalledWith("run-1", "task-1", "completed");
    expect(recordControlPlaneEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "task.verification_passed" }),
      expect.objectContaining({ entityId: "task-1", status: "passed" })
    );
  });

  it("keeps runs in progress while work awaits review and avoids duplicate queueing for the review-gated task", async () => {
    const runDetail = {
      id: "run-1",
      repositoryId: "repo-1",
      workspaceId: "workspace-1",
      teamId: "team-1",
      projectId: null,
      projectTeamId: null,
      projectTeamName: null,
      goal: "Ship verifier pairing",
      status: "in_progress",
      branchName: "main",
      planArtifactPath: null,
      budgetTokens: null,
      budgetCostUsd: null,
      concurrencyCap: 2,
      policyProfile: "standard",
      publishedBranch: null,
      branchPublishedAt: null,
      branchPublishApprovalId: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      pullRequestApprovalId: null,
      handoffStatus: "pending",
      handoff: {
        mode: "manual",
        provider: null,
        baseBranch: null,
        autoPublishBranch: false,
        autoCreatePullRequest: false,
        titleTemplate: null,
        bodyTemplate: null
      },
      handoffExecution: {
        state: "idle",
        failureReason: null,
        attemptedAt: null,
        completedAt: null
      },
      metadata: {},
      context: {
        kind: "ad_hoc",
        projectId: null,
        projectSlug: null,
        projectName: null,
        projectDescription: null,
        jobId: null,
        jobName: null,
        externalInput: null,
        values: {}
      },
      completedAt: null,
      createdBy: "leader",
      createdAt: new Date("2026-03-31T09:00:00.000Z"),
      updatedAt: new Date("2026-03-31T09:00:00.000Z"),
      tasks: [
        {
          ...createTaskRecord({
            id: "task-review",
            status: "awaiting_review",
            verificationStatus: "requested",
            verifierAgentId: "verifier-agent-1"
          })
        },
        {
          ...createTaskRecord({
            id: "task-next",
            title: "Ship the next pending slice",
            status: "pending",
            verificationStatus: "pending",
            verifierAgentId: null,
            ownerAgentId: null
          })
        }
      ],
      agents: [],
      sessions: [],
      taskDag: {
        nodes: [],
        edges: [],
        rootTaskIds: [],
        blockedTaskIds: [],
        unblockPaths: [],
        hasIncompleteDependencies: false,
        missingDependencies: []
      }
    };
    const agentStore: Array<Record<string, unknown>> = [];
    const db = new FakeVerificationSchedulingDb(
      [runDetail],
      [
        createWorkerAssignment({
          id: "dispatch-verifier-1",
          taskId: "task-review",
          agentId: "verifier-agent-1",
          state: "queued",
          metadata: {
            assignmentKind: "verification",
            workerAgentId: "worker-agent-1",
            workerSummary: "Implementation is ready for verification."
          }
        })
      ],
      agentStore
    );
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-31T09:40:00.000Z")
    });
    const createWorkerDispatchAssignment = vi.fn(async (input: Record<string, unknown>) => ({
      id: "dispatch-worker-2",
      ...input,
      state: "queued",
      claimedByNodeId: null,
      stickyNodeId: null,
      preferredNodeId: null,
      attempt: 0,
      createdAt: new Date("2026-03-31T09:40:00.000Z"),
      updatedAt: new Date("2026-03-31T09:40:00.000Z")
    }));

    (service as any).getRun = async () => runDetail;
    (service as any).assertRepositoryExists = async () => ({
      id: "repo-1",
      name: "codex-swarm",
      defaultBranch: "main",
      projectId: null
    });
    (service as any).loadRunProjectTeam = async () => null;
    (service as any).createAgent = vi.fn(async (input: Record<string, unknown>) => {
      const agent = {
        id: "worker-agent-2",
        runId: "run-1",
        name: input.name,
        role: input.role,
        profile: input.profile,
        status: "idle",
        projectTeamMemberId: input.projectTeamMemberId ?? null,
        worktreePath: null,
        branchName: input.branchName ?? null,
        currentTaskId: input.currentTaskId ?? null,
        createdAt: new Date("2026-03-31T09:40:00.000Z"),
        updatedAt: new Date("2026-03-31T09:40:00.000Z")
      };

      agentStore.push(agent);
      return agent;
    });
    (service as any).createWorkerDispatchAssignment = createWorkerDispatchAssignment;
    (service as any).createMessage = vi.fn(async () => undefined);
    (service as any).maybeExecuteAutoHandoff = vi.fn(async () => undefined);

    await (service as any).enqueueRunnableWorkerDispatches("run-1");

    expect(createWorkerDispatchAssignment).toHaveBeenCalledTimes(1);
    expect(createWorkerDispatchAssignment).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-next",
      metadata: expect.objectContaining({
        assignmentKind: "worker"
      })
    }));
    expect(createWorkerDispatchAssignment).not.toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-review"
    }));

    await service.reconcileRunExecutionState("run-1");
    expect(runDetail.status).toBe("in_progress");
    expect(runDetail.completedAt).toBeNull();

    runDetail.tasks[0]!.status = "completed";
    runDetail.tasks[0]!.verificationStatus = "passed";
    runDetail.tasks[1]!.status = "completed";
    runDetail.tasks[1]!.verificationStatus = "not_required";
    db.assignmentStore[0]!.state = "completed";

    await service.reconcileRunExecutionState("run-1");

    expect(runDetail.status).toBe("completed");
    expect(runDetail.completedAt).toEqual(new Date("2026-03-31T09:40:00.000Z"));
  });

  it("reuses the original worker agent when requeueing failed verification rework even if the agent is stopped", async () => {
    const runDetail = {
      id: "run-1",
      status: "in_progress",
      repositoryId: "repo-1",
      branchName: "main",
      concurrencyCap: 1,
      projectTeamId: null,
      projectTeamName: null,
      goal: "Retry the original worker after failed verification",
      handoffConfig: {
        enabled: false,
        provider: null,
        baseBranch: null,
        autoPublishBranch: false,
        autoCreatePullRequest: false,
        titleTemplate: null,
        bodyTemplate: null
      },
      handoffExecution: {
        state: "idle",
        failureReason: null,
        attemptedAt: null,
        completedAt: null
      },
      metadata: {},
      context: {
        kind: "ad_hoc",
        projectId: null,
        projectSlug: null,
        projectName: null,
        projectDescription: null,
        jobId: null,
        jobName: null,
        externalInput: null,
        values: {}
      },
      completedAt: null,
      createdBy: "leader",
      createdAt: new Date("2026-03-31T09:00:00.000Z"),
      updatedAt: new Date("2026-03-31T09:00:00.000Z"),
      tasks: [
        {
          ...createTaskRecord({
            id: "task-rework",
            title: "Fix failed verification findings",
            status: "pending",
            verificationStatus: "failed",
            verifierAgentId: null,
            ownerAgentId: "worker-agent-1",
            latestVerificationChangeRequests: ["Address the remaining definition-of-done gaps."]
          })
        }
      ],
      agents: [
        {
          id: "worker-agent-1",
          runId: "run-1",
          projectTeamMemberId: null,
          name: "Builder",
          role: "backend-developer",
          profile: "backend-developer",
          status: "stopped",
          worktreePath: "/tmp/codex-swarm/run-1/shared",
          branchName: "main",
          currentTaskId: null,
          lastHeartbeatAt: null,
          observability: {
            mode: "unavailable",
            currentSessionId: null,
            currentSessionState: null,
            visibleTranscriptSessionId: null,
            visibleTranscriptSessionState: null,
            visibleTranscriptUpdatedAt: null,
            lineageSource: "not_started"
          },
          createdAt: new Date("2026-03-31T09:00:00.000Z"),
          updatedAt: new Date("2026-03-31T09:00:00.000Z")
        }
      ],
      sessions: [
        {
          id: "session-worker-1",
          agentId: "worker-agent-1",
          threadId: "thread-worker-1",
          cwd: "/tmp/codex-swarm/run-1/shared",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          workerNodeId: null,
          stickyNodeId: null,
          placementConstraintLabels: ["workspace-write"],
          lastHeartbeatAt: null,
          state: "stopped",
          staleReason: null,
          metadata: {},
          createdAt: new Date("2026-03-31T09:00:00.000Z"),
          updatedAt: new Date("2026-03-31T09:00:00.000Z")
        }
      ],
      taskDag: {
        nodes: [],
        edges: [],
        rootTaskIds: [],
        blockedTaskIds: [],
        unblockPaths: [],
        hasIncompleteDependencies: false,
        missingDependencies: []
      }
    };
    const agentStore = [
      {
        id: "worker-agent-1",
        status: "stopped",
        currentTaskId: null,
        updatedAt: new Date("2026-03-31T09:00:00.000Z")
      }
    ];
    const db = new FakeVerificationSchedulingDb(
      [runDetail],
      [],
      agentStore
    );
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-31T09:45:00.000Z")
    });
    const createWorkerDispatchAssignment = vi.fn(async (input: Record<string, unknown>) => ({
      id: "dispatch-worker-retry",
      ...input,
      state: "queued",
      claimedByNodeId: null,
      stickyNodeId: null,
      preferredNodeId: null,
      attempt: 0,
      createdAt: new Date("2026-03-31T09:45:00.000Z"),
      updatedAt: new Date("2026-03-31T09:45:00.000Z")
    }));

    (service as any).getRun = async () => runDetail;
    (service as any).assertRepositoryExists = async () => ({
      id: "repo-1",
      name: "codex-swarm",
      defaultBranch: "main",
      projectId: null
    });
    (service as any).loadRunProjectTeam = async () => null;
    (service as any).createAgent = vi.fn(async () => {
      throw new Error("rework retry should reuse the original worker agent");
    });
    (service as any).createWorkerDispatchAssignment = createWorkerDispatchAssignment;
    (service as any).createMessage = vi.fn(async () => undefined);
    (service as any).maybeExecuteAutoHandoff = vi.fn(async () => undefined);

    await (service as any).enqueueRunnableWorkerDispatches("run-1");

    expect(createWorkerDispatchAssignment).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-rework",
      agentId: "worker-agent-1",
      sessionId: "session-worker-1",
      metadata: expect.objectContaining({
        assignmentKind: "worker"
      })
    }));
  });

  it("invalidates stale claimed worker assignments instead of reviving blocked tasks during repair", async () => {
    const now = new Date("2026-03-31T09:40:00.000Z");
    const db = new FakeRepairDb(
      [
        {
          id: "run-1",
          status: "in_progress"
        }
      ],
      [
        createWorkerAssignment({
          id: "dispatch-stale",
          taskId: "task-blocked",
          agentId: "worker-agent-1",
          sessionId: "session-worker-1",
          state: "claimed"
        })
      ],
      [
        {
          id: "worker-agent-1",
          status: "busy",
          currentTaskId: "task-blocked",
          updatedAt: now
        }
      ],
      [
        createTaskRecord({
          id: "task-blocked",
          status: "blocked",
          ownerAgentId: "worker-agent-1",
          dependencyIds: []
        })
      ],
      [
        {
          id: "session-worker-1",
          state: "active",
          workerNodeId: "node-1",
          stickyNodeId: "node-1",
          staleReason: null,
          updatedAt: now
        }
      ]
    );
    const service = new ControlPlaneService(db as never, {
      now: () => now
    });
    (service as any).recordControlPlaneEvent = async () => undefined;

    await (service as any).repairRunStateFromDispatchAssignments("run-1");
    await (service as any).repairRunStateFromDispatchAssignments("run-1");

    expect(db.assignmentStore[0]).toMatchObject({
      state: "failed",
      lastFailureReason: "task_not_runnable",
      claimedByNodeId: null
    });
    expect(db.taskStore[0]).toMatchObject({
      status: "blocked"
    });
    expect(db.agentStore[0]).toMatchObject({
      status: "idle"
    });
    expect(db.sessionStore[0]).toMatchObject({
      state: "pending",
      workerNodeId: null,
      staleReason: "task_not_runnable"
    });
  });

  it("keeps a review task in awaiting_review when a newer verification retry exists", async () => {
    const now = new Date("2026-03-31T09:42:00.000Z");
    const db = new FakeRepairDb(
      [
        {
          id: "run-1",
          status: "in_progress"
        }
      ],
      [
        createWorkerAssignment({
          id: "dispatch-verifier-old",
          taskId: "task-review",
          agentId: "verifier-agent-old",
          state: "completed",
          metadata: {
            assignmentKind: "verification",
            verificationOutcomeStatus: "blocked"
          },
          createdAt: new Date("2026-03-31T09:40:00.000Z"),
          updatedAt: new Date("2026-03-31T09:40:00.000Z")
        }),
        createWorkerAssignment({
          id: "dispatch-verifier-retry",
          taskId: "task-review",
          agentId: "verifier-agent-new",
          state: "queued",
          metadata: {
            assignmentKind: "verification",
            workerSummary: "Retry verification with recorded evidence."
          },
          createdAt: new Date("2026-03-31T09:41:00.000Z"),
          updatedAt: new Date("2026-03-31T09:41:00.000Z")
        })
      ],
      [
        {
          id: "verifier-agent-new",
          status: "idle",
          currentTaskId: "task-review",
          updatedAt: now
        }
      ],
      [
        createTaskRecord({
          id: "task-review",
          status: "awaiting_review",
          role: "tester",
          ownerAgentId: "worker-agent-1",
          verificationStatus: "requested",
          verifierAgentId: "verifier-agent-new",
          dependencyIds: []
        })
      ],
      []
    );
    const service = new ControlPlaneService(db as never, {
      now: () => now
    });
    (service as any).recordControlPlaneEvent = async () => undefined;

    await (service as any).repairRunStateFromDispatchAssignments("run-1");

    expect(db.taskStore[0]).toMatchObject({
      status: "awaiting_review",
      verificationStatus: "requested",
      verifierAgentId: "verifier-agent-new"
    });
  });

  it("includes verification change requests in the worker execution prompt", () => {
    const service = new ControlPlaneService({} as never, { now: () => new Date() });
    const run = {
      id: "run-1",
      goal: "Add authentication",
      context: null,
      branchName: null
    };
    const repository = { name: "my-repo" };
    const task = createTaskRecord({
      title: "Implement login endpoint",
      role: "backend-developer",
      description: "Build the POST /auth/login handler.",
      definitionOfDone: ["endpoint returns JWT"],
      acceptanceCriteria: ["returns 200 on valid credentials"],
      latestVerificationChangeRequests: [
        "The JWT expiry is not set — fix before marking done.",
        "Missing input validation on the email field."
      ]
    });

    const prompt = (service as any).buildTaskExecutionPrompt(run, repository, task);

    expect(prompt).toContain("Verification change requests");
    expect(prompt).toContain("The JWT expiry is not set — fix before marking done.");
    expect(prompt).toContain("Missing input validation on the email field.");
  });

  it("includes verification findings in the worker execution prompt even when there are no change requests", () => {
    const service = new ControlPlaneService({} as never, { now: () => new Date() });
    const run = {
      id: "run-1",
      goal: "Add authentication",
      context: null,
      branchName: null
    };
    const repository = { name: "my-repo" };
    const task = createTaskRecord({
      title: "Implement login endpoint",
      role: "backend-developer",
      description: "Build the POST /auth/login handler.",
      definitionOfDone: ["endpoint returns JWT"],
      acceptanceCriteria: ["returns 200 on valid credentials"],
      latestVerificationFindings: [
        "The retry flow still drops verifier context when only findings are present."
      ],
      latestVerificationChangeRequests: []
    });

    const prompt = (service as any).buildTaskExecutionPrompt(run, repository, task);

    expect(prompt).toContain("Verification findings");
    expect(prompt).toContain("The retry flow still drops verifier context when only findings are present.");
    expect(prompt).not.toContain("Verification change requests");
  });

  it("omits the change requests section from the worker prompt when there are none", () => {
    const service = new ControlPlaneService({} as never, { now: () => new Date() });
    const run = {
      id: "run-1",
      goal: "Add authentication",
      context: null,
      branchName: null
    };
    const repository = { name: "my-repo" };
    const task = createTaskRecord({
      latestVerificationChangeRequests: []
    });

    const prompt = (service as any).buildTaskExecutionPrompt(run, repository, task);

    expect(prompt).not.toContain("Verification change requests");
  });
});
