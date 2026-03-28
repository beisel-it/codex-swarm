import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ControlPlaneService } from "../src/services/control-plane-service.js";
import { buildApp } from "../src/app.js";
import { getConfig } from "../src/config.js";
import { HttpError } from "../src/lib/http-error.js";

const ids = {
  repository: "11111111-1111-4111-8111-111111111111",
  run: "22222222-2222-4222-8222-222222222222",
  taskA: "33333333-3333-4333-8333-333333333333",
  taskB: "44444444-4444-4444-8444-444444444444",
  agent: "55555555-5555-4555-8555-555555555555",
  session: "66666666-6666-4666-8666-666666666666",
  workerNode: "77777777-7777-4777-8777-777777777777",
  workerNodeB: "88888888-8888-4888-8888-888888888888",
  dispatch: "99999999-9999-4999-8999-999999999999"
} as const;

const defaultBoundary = {
  workspaceId: "default-workspace",
  workspaceName: "Default Workspace",
  teamId: "codex-swarm",
  teamName: "Codex Swarm"
} as const;

const controlPlane = {
  listRepositories: vi.fn(),
  createRepository: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  createRun: vi.fn(),
  updateRunStatus: vi.fn(),
  publishRunBranch: vi.fn(),
  createRunPullRequestHandoff: vi.fn(),
  exportRunAudit: vi.fn(),
  getGovernanceAdminReport: vi.fn(),
  reconcileGovernanceRetention: vi.fn(),
  getRepositorySecretAccessPlan: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  listAgents: vi.fn(),
  createAgent: vi.fn(),
  listWorkerNodes: vi.fn(),
  registerWorkerNode: vi.fn(),
  recordWorkerNodeHeartbeat: vi.fn(),
  updateWorkerNodeDrainState: vi.fn(),
  listWorkerDispatchAssignments: vi.fn(),
  createWorkerDispatchAssignment: vi.fn(),
  claimNextWorkerDispatch: vi.fn(),
  completeWorkerDispatch: vi.fn(),
  reconcileWorkerNode: vi.fn(),
  listMessages: vi.fn(),
  createMessage: vi.fn(),
  listApprovals: vi.fn(),
  getApproval: vi.fn(),
  createApproval: vi.fn(),
  resolveApproval: vi.fn(),
  listValidations: vi.fn(),
  createValidation: vi.fn(),
  listArtifacts: vi.fn(),
  createArtifact: vi.fn(),
  runCleanupJob: vi.fn()
};

const observability = {
  beginRequest: vi.fn(),
  clearActorContext: vi.fn(),
  getMetrics: vi.fn(),
  listEvents: vi.fn(),
  recordRecoverableDatabaseFallback: vi.fn(),
  recordRequestFailure: vi.fn(),
  recordTimelineEvent: vi.fn(),
  setActorContext: vi.fn(),
  withTrace: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
};

class FakeVerticalSliceControlPlane {
  private readonly repositories = [
    {
      id: ids.repository,
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId,
      name: "codex-swarm",
      url: "https://example.com/codex-swarm.git",
      provider: "github",
      defaultBranch: "main",
      localPath: null,
      trustLevel: "trusted",
      approvalProfile: "standard",
      createdAt: new Date("2026-03-28T00:00:00.000Z"),
      updatedAt: new Date("2026-03-28T00:00:00.000Z")
    }
  ];

  private readonly runs = new Map<string, any>();
  private readonly workerNodes = [
    {
      id: ids.workerNode,
      name: "node-a",
      endpoint: "tcp://node-a.internal:7777",
      capabilityLabels: ["linux", "node", "remote"],
      status: "online",
      drainState: "active",
      lastHeartbeatAt: new Date("2026-03-28T11:50:00.000Z"),
      metadata: {},
      eligibleForScheduling: true,
      createdAt: new Date("2026-03-28T00:00:00.000Z"),
      updatedAt: new Date("2026-03-28T11:50:00.000Z")
    },
    {
      id: ids.workerNodeB,
      name: "node-b",
      endpoint: "tcp://node-b.internal:7777",
      capabilityLabels: ["linux", "node", "remote"],
      status: "online",
      drainState: "active",
      lastHeartbeatAt: new Date("2026-03-28T11:51:00.000Z"),
      metadata: {},
      eligibleForScheduling: true,
      createdAt: new Date("2026-03-28T00:00:00.000Z"),
      updatedAt: new Date("2026-03-28T11:51:00.000Z")
    }
  ];
  private readonly workerDispatchAssignments: any[] = [];

  private assertBoundary(entity: { workspaceId: string; teamId: string }, access?: any) {
    if (!access) {
      return;
    }

    if (access.workspaceId !== entity.workspaceId || access.teamId !== entity.teamId) {
      throw new HttpError(403, "outside caller boundary");
    }
  }

  async listRepositories(access?: any) {
    if (!access) {
      return this.repositories;
    }

    return this.repositories.filter((repository) =>
      repository.workspaceId === access.workspaceId && repository.teamId === access.teamId);
  }

  async createRepository() {
    throw new Error("not implemented");
  }

  async listRuns(repositoryId?: string, access?: any) {
    const runs = [...this.runs.values()];
    return (repositoryId ? runs.filter((run) => run.repositoryId === repositoryId) : runs)
      .filter((run) => !access || (run.workspaceId === access.workspaceId && run.teamId === access.teamId));
  }

  async getRun(runId: string, access?: any) {
    const run = this.runs.get(runId);

    if (!run) {
      throw new HttpError(404, `run ${runId} not found`);
    }

    this.assertBoundary(run, access);

    return run;
  }

  async createRun(input: any, createdBy: string, access?: any) {
    const repository = this.repositories.find((candidate) => candidate.id === input.repositoryId);

    if (!repository) {
      throw new HttpError(404, `repository ${input.repositoryId} not found`);
    }

    this.assertBoundary(repository, access);

    const run = {
      id: ids.run,
      repositoryId: input.repositoryId,
      workspaceId: repository.workspaceId,
      teamId: repository.teamId,
      goal: input.goal,
      status: "pending",
      branchName: input.branchName ?? null,
      planArtifactPath: input.planArtifactPath ?? null,
      budgetTokens: input.budgetTokens ?? null,
      budgetCostUsd: input.budgetCostUsd ?? null,
      concurrencyCap: input.concurrencyCap ?? 1,
      policyProfile: input.policyProfile ?? repository.approvalProfile,
      publishedBranch: null,
      branchPublishedAt: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      handoffStatus: "pending",
      completedAt: null,
      metadata: input.metadata,
      createdBy,
      createdAt: new Date("2026-03-28T00:00:00.000Z"),
      updatedAt: new Date("2026-03-28T00:00:00.000Z"),
      tasks: [],
      agents: [],
      sessions: []
    };

    this.runs.set(run.id, run);
    return run;
  }

  async updateRunStatus(runId: string, input: any, access?: any) {
    const run = await this.getRun(runId, access);
    run.status = input.status;
    run.planArtifactPath = input.planArtifactPath ?? run.planArtifactPath;
    return run;
  }

  async publishRunBranch(runId: string, input: any, access?: any) {
    const run = await this.getRun(runId, access);
    const branchName = input.branchName ?? run.branchName;

    if (!branchName) {
      throw new HttpError(409, "run does not have a branch to publish");
    }

    run.branchName = branchName;
    run.publishedBranch = branchName;
    run.branchPublishedAt = new Date();
    run.handoffStatus = "branch_published";
    return run;
  }

  async createRunPullRequestHandoff(runId: string, input: any, access?: any) {
    const run = await this.getRun(runId, access);
    run.publishedBranch = input.headBranch ?? run.publishedBranch ?? run.branchName;
    run.pullRequestUrl = input.url ?? null;
    run.pullRequestNumber = input.number ?? null;
    run.pullRequestStatus = input.url ? input.status : null;
    run.handoffStatus = input.url ? "pr_open" : "manual_handoff";
    return run;
  }

  async listTasks(runId?: string, access?: any) {
    const tasks = [...this.runs.values()].flatMap((run) => run.tasks);
    return (runId ? tasks.filter((task) => task.runId === runId) : tasks)
      .filter((task) => {
        if (!access) {
          return true;
        }

        const run = this.runs.get(task.runId);
        return run && run.workspaceId === access.workspaceId && run.teamId === access.teamId;
      });
  }

  async createTask(input: any, access?: any) {
    const run = await this.getRun(input.runId, access);
    const task = {
      id: run.tasks.length === 0 ? ids.taskA : ids.taskB,
      runId: input.runId,
      parentTaskId: input.parentTaskId ?? null,
      title: input.title,
      description: input.description,
      role: input.role,
      status: input.dependencyIds.length > 0 ? "blocked" : "pending",
      priority: input.priority,
      ownerAgentId: input.ownerAgentId ?? null,
      dependencyIds: input.dependencyIds,
      acceptanceCriteria: input.acceptanceCriteria,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    run.tasks.push(task);
    return task;
  }

  async updateTaskStatus(taskId: string, input: any, access?: any) {
    const run = [...this.runs.values()].find((candidate) => candidate.tasks.some((task: any) => task.id === taskId));

    if (!run) {
      throw new HttpError(404, `task ${taskId} not found`);
    }

    this.assertBoundary(run, access);

    const task = run.tasks.find((candidate: any) => candidate.id === taskId);
    task.status = input.status;
    task.ownerAgentId = input.ownerAgentId ?? task.ownerAgentId;

    if (input.status === "completed") {
      for (const candidate of run.tasks) {
        if (candidate.status !== "blocked") {
          continue;
        }

        const ready = candidate.dependencyIds.every((dependencyId: string) =>
          run.tasks.find((dependencyTask: any) => dependencyTask.id === dependencyId)?.status === "completed");

        if (ready) {
          candidate.status = "pending";
        }
      }
    }

    return task;
  }

  async listAgents(runId?: string, access?: any) {
    const agents = [...this.runs.values()].flatMap((run) => run.agents);
    return (runId ? agents.filter((agent) => agent.runId === runId) : agents)
      .filter((agent) => {
        if (!access) {
          return true;
        }

        const run = this.runs.get(agent.runId);
        return run && run.workspaceId === access.workspaceId && run.teamId === access.teamId;
      });
  }

  async listWorkerNodes() {
    return this.workerNodes;
  }

  async registerWorkerNode(input: any) {
    const workerNode = {
      id: input.id ?? ids.workerNode,
      name: input.name,
      endpoint: input.endpoint ?? null,
      capabilityLabels: input.capabilityLabels ?? [],
      status: input.status ?? "online",
      drainState: input.drainState ?? "active",
      lastHeartbeatAt: new Date(),
      metadata: input.metadata ?? {},
      eligibleForScheduling: (input.status ?? "online") === "online" && (input.drainState ?? "active") === "active",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.workerNodes.splice(0, this.workerNodes.length, workerNode);
    return workerNode;
  }

  async recordWorkerNodeHeartbeat(nodeId: string, input: any) {
    const workerNode = this.workerNodes.find((candidate) => candidate.id === nodeId);

    if (!workerNode) {
      throw new HttpError(404, `worker node ${nodeId} not found`);
    }

    workerNode.status = input.status;
    workerNode.capabilityLabels = input.capabilityLabels ?? [];
    workerNode.metadata = input.metadata ?? {};
    workerNode.lastHeartbeatAt = new Date();
    workerNode.updatedAt = new Date();
    workerNode.eligibleForScheduling = workerNode.status === "online" && workerNode.drainState === "active";

    return workerNode;
  }

  async updateWorkerNodeDrainState(nodeId: string, input: any) {
    const workerNode = this.workerNodes.find((candidate) => candidate.id === nodeId);

    if (!workerNode) {
      throw new HttpError(404, `worker node ${nodeId} not found`);
    }

    workerNode.drainState = input.drainState;
    workerNode.metadata = input.reason ? { drainReason: input.reason } : workerNode.metadata;
    workerNode.updatedAt = new Date();
    workerNode.eligibleForScheduling = workerNode.status === "online" && workerNode.drainState === "active";

    return workerNode;
  }

  async createAgent(input: any, access?: any) {
    const run = await this.getRun(input.runId, access);
    const activeAgents = run.agents.filter((candidate: any) =>
      candidate.status === "provisioning"
      || candidate.status === "idle"
      || candidate.status === "busy"
      || candidate.status === "paused");

    if (activeAgents.length >= run.concurrencyCap) {
      throw new HttpError(409, `run concurrency cap of ${run.concurrencyCap} active agents reached`);
    }

    if (input.session?.workerNodeId) {
      const workerNode = this.workerNodes.find((candidate) => candidate.id === input.session.workerNodeId);

      if (!workerNode) {
        throw new HttpError(404, `worker node ${input.session.workerNodeId} not found`);
      }

      if (!workerNode.eligibleForScheduling) {
        throw new HttpError(409, `worker node ${workerNode.id} is not eligible for scheduling`);
      }

      const missingLabels = (input.session.placementConstraintLabels ?? []).filter((label: string) =>
        !workerNode.capabilityLabels.includes(label));

      if (missingLabels.length > 0) {
        throw new HttpError(409, `worker node ${workerNode.id} is missing required capability labels: ${missingLabels.join(", ")}`);
      }
    }

    const agent = {
      id: ids.agent,
      runId: input.runId,
      name: input.name,
      role: input.role,
      status: input.status,
      worktreePath: input.worktreePath ?? null,
      branchName: input.branchName ?? null,
      currentTaskId: input.currentTaskId ?? null,
      lastHeartbeatAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    run.agents.push(agent);

    if (input.session) {
      run.sessions.push({
        id: ids.session,
        agentId: ids.agent,
        threadId: input.session.threadId,
        cwd: input.session.cwd,
        sandbox: input.session.sandbox,
        approvalPolicy: input.session.approvalPolicy,
        includePlanTool: input.session.includePlanTool,
        workerNodeId: input.session.workerNodeId ?? null,
        stickyNodeId: input.session.workerNodeId ?? null,
        placementConstraintLabels: input.session.placementConstraintLabels ?? [],
        state: "active",
        staleReason: null,
        metadata: input.session.metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    return agent;
  }

  async listWorkerDispatchAssignments(query: any = {}) {
    return this.workerDispatchAssignments
      .filter((assignment) => query.runId ? assignment.runId === query.runId : true)
      .filter((assignment) => query.nodeId ? assignment.claimedByNodeId === query.nodeId : true)
      .filter((assignment) => query.state ? assignment.state === query.state : true);
  }

  async createWorkerDispatchAssignment(input: any) {
    const assignment = {
      id: ids.dispatch,
      runId: input.runId,
      taskId: input.taskId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      repositoryId: input.repositoryId,
      repositoryName: input.repositoryName,
      queue: input.queue ?? "worker-dispatch",
      state: "queued",
      stickyNodeId: input.stickyNodeId ?? null,
      preferredNodeId: input.preferredNodeId ?? null,
      claimedByNodeId: null,
      requiredCapabilities: input.requiredCapabilities ?? [],
      worktreePath: input.worktreePath,
      branchName: input.branchName ?? null,
      prompt: input.prompt,
      profile: input.profile,
      sandbox: input.sandbox,
      approvalPolicy: input.approvalPolicy,
      includePlanTool: input.includePlanTool ?? false,
      metadata: input.metadata ?? {},
      attempt: 0,
      maxAttempts: input.maxAttempts ?? 3,
      leaseTtlSeconds: input.leaseTtlSeconds ?? 300,
      claimedAt: null,
      completedAt: null,
      lastFailureReason: null,
      createdAt: new Date("2026-03-28T12:00:00.000Z"),
      updatedAt: new Date("2026-03-28T12:00:00.000Z")
    };

    this.workerDispatchAssignments.push(assignment);
    return assignment;
  }

  async claimNextWorkerDispatch(nodeId: string) {
    const workerNode = this.workerNodes.find((candidate) => candidate.id === nodeId);

    if (!workerNode) {
      throw new HttpError(404, `worker node ${nodeId} not found`);
    }

    if (!workerNode.eligibleForScheduling) {
      throw new HttpError(409, `worker node ${nodeId} is not eligible for scheduling`);
    }

    const candidate = this.workerDispatchAssignments.find((assignment) =>
      (assignment.state === "queued" || assignment.state === "retrying")
      && (!assignment.stickyNodeId || assignment.stickyNodeId === nodeId)
      && assignment.requiredCapabilities.every((capability: string) => workerNode.capabilityLabels.includes(capability)));

    if (!candidate) {
      return null;
    }

    candidate.state = "claimed";
    candidate.stickyNodeId = candidate.stickyNodeId ?? nodeId;
    candidate.preferredNodeId = nodeId;
    candidate.claimedByNodeId = nodeId;
    candidate.claimedAt = new Date("2026-03-28T12:05:00.000Z");
    candidate.updatedAt = new Date("2026-03-28T12:05:00.000Z");

    if (candidate.sessionId) {
      const run = await this.getRun(candidate.runId);
      const session = run.sessions.find((item: any) => item.id === candidate.sessionId);

      if (session) {
        session.workerNodeId = nodeId;
        session.stickyNodeId = candidate.stickyNodeId;
        session.state = "active";
        session.staleReason = null;
      }
    }

    return candidate;
  }

  async completeWorkerDispatch(assignmentId: string, input: any) {
    const assignment = this.workerDispatchAssignments.find((candidate) => candidate.id === assignmentId);

    if (!assignment) {
      throw new HttpError(404, `worker dispatch assignment ${assignmentId} not found`);
    }

    const run = await this.getRun(assignment.runId);
    const session = run.sessions.find((item: any) => item.id === assignment.sessionId);

    if (input.status === "completed") {
      assignment.state = "completed";
      assignment.completedAt = new Date("2026-03-28T12:10:00.000Z");
      assignment.updatedAt = new Date("2026-03-28T12:10:00.000Z");
      return assignment;
    }

    assignment.attempt += 1;
    assignment.lastFailureReason = input.reason ?? null;
    assignment.claimedByNodeId = null;
    assignment.claimedAt = null;
    assignment.updatedAt = new Date("2026-03-28T12:10:00.000Z");

    if (assignment.attempt < assignment.maxAttempts) {
      assignment.state = "retrying";
      assignment.stickyNodeId = null;
      assignment.preferredNodeId = null;

      if (session) {
        session.workerNodeId = null;
        session.stickyNodeId = null;
        session.state = "pending";
        session.staleReason = input.reason ?? null;
      }
    } else {
      assignment.state = "failed";
      assignment.completedAt = new Date("2026-03-28T12:10:00.000Z");

      if (session) {
        session.workerNodeId = null;
        session.state = "stale";
        session.staleReason = input.reason ?? null;
      }
    }

    return assignment;
  }

  async reconcileWorkerNode(nodeId: string, input: any) {
    const workerNode = this.workerNodes.find((candidate) => candidate.id === nodeId);

    if (!workerNode) {
      throw new HttpError(404, `worker node ${nodeId} not found`);
    }

    workerNode.status = input.markOffline ? "offline" : workerNode.status;
    workerNode.drainState = input.markOffline ? "drained" : workerNode.drainState;
    workerNode.eligibleForScheduling = false;

    let retriedAssignments = 0;
    let failedAssignments = 0;

    for (const assignment of this.workerDispatchAssignments.filter((candidate) =>
      candidate.claimedByNodeId === nodeId && candidate.state === "claimed")) {
      const updated = await this.completeWorkerDispatch(assignment.id, {
        nodeId,
        status: "failed",
        reason: `node_lost:${input.reason}`
      });

      if (updated.state === "retrying") {
        retriedAssignments += 1;
      } else if (updated.state === "failed") {
        failedAssignments += 1;
      }
    }

    return {
      nodeId,
      retriedAssignments,
      failedAssignments,
      staleSessions: retriedAssignments + failedAssignments,
      completedAt: new Date("2026-03-28T12:15:00.000Z")
    };
  }

  async listMessages(_runId?: string, _access?: any) {
    return [];
  }

  async createMessage(_input?: any, _access?: any) {
    throw new Error("not implemented");
  }

  async listApprovals(runId?: string, access?: any) {
    const approvals = [
      {
        id: "77777777-7777-4777-8777-777777777777",
        runId: ids.run,
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId,
        taskId: ids.taskA,
        kind: "plan",
        status: "pending",
        requestedPayload: {
          summary: "Review the execution plan"
        },
        resolutionPayload: {},
        requestedBy: "tech-lead",
        resolver: null,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        runId: "99999999-9999-4999-8999-999999999999",
        workspaceId: "other-workspace",
        teamId: "other-team",
        taskId: null,
        kind: "merge",
        status: "approved",
        requestedPayload: {
          summary: "Approve merge handoff"
        },
        resolutionPayload: {
          feedback: "ok"
        },
        requestedBy: "tech-lead",
        resolver: "reviewer",
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    return (runId ? approvals.filter((approval) => approval.runId === runId) : approvals)
      .filter((approval) => !access || (
        approval.workspaceId === access.workspaceId && approval.teamId === access.teamId
      ));
  }

  async getApproval(approvalId: string, access?: any) {
    const approval = (await this.listApprovals(undefined, access)).find((candidate) => candidate.id === approvalId);

    if (!approval) {
      throw new HttpError(404, `approval ${approvalId} not found`);
    }

    return approval;
  }

  async createApproval(input: any, access?: any) {
    const run = await this.getRun(input.runId, access);
    return {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      runId: input.runId,
      workspaceId: run.workspaceId,
      teamId: run.teamId,
      taskId: input.taskId ?? null,
      kind: input.kind,
      status: "pending",
      requestedPayload: input.requestedPayload,
      resolutionPayload: {},
      requestedBy: input.requestedBy,
      resolver: null,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async resolveApproval(approvalId: string, input: any, access?: any) {
    const approval = await this.getApproval(approvalId, access);

    return {
      ...approval,
      status: input.status,
      resolver: input.resolver,
      resolutionPayload: {
        ...input.resolutionPayload,
        feedback: input.feedback ?? null
      },
      resolvedAt: new Date(),
      updatedAt: new Date()
    };
  }

  async listValidations(_query?: any, _access?: any) {
    return [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        runId: ids.run,
        taskId: ids.taskA,
        name: "typecheck",
        status: "passed",
        command: "pnpm typecheck",
        summary: "Typecheck passed",
        artifactPath: "artifacts/validations/typecheck.json",
        artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
        artifacts: [
          {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            runId: ids.run,
            taskId: ids.taskA,
            kind: "report",
            path: "artifacts/validations/typecheck.json",
            contentType: "application/json",
            metadata: {
              suite: "typecheck"
            },
            createdAt: new Date()
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  }

  async createValidation(input: any, access?: any) {
    await this.getRun(input.runId, access);
    return {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      runId: input.runId,
      taskId: input.taskId ?? null,
      name: input.name,
      status: input.status,
      command: input.command,
      summary: input.summary ?? null,
      artifactPath: input.artifactPath ?? null,
      artifactIds: input.artifactIds ?? [],
      artifacts: (input.artifactIds ?? []).map((artifactId: string) => ({
        id: artifactId,
        runId: input.runId,
        taskId: input.taskId ?? null,
        kind: "report",
        path: input.artifactPath ?? "artifacts/validations/report.json",
        contentType: "application/json",
        metadata: {},
        createdAt: new Date()
      })),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async listArtifacts(_runId?: string, _access?: any) {
    return [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        runId: ids.run,
        taskId: ids.taskA,
        kind: "report",
        path: "artifacts/validations/typecheck.json",
        contentType: "application/json",
        metadata: {
          suite: "typecheck"
        },
        createdAt: new Date()
      }
    ];
  }

  async createArtifact(input: any, access?: any) {
    await this.getRun(input.runId, access);
    return {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      runId: input.runId,
      taskId: input.taskId ?? null,
      kind: input.kind,
      path: input.path,
      contentType: input.contentType,
      metadata: input.metadata ?? {},
      createdAt: new Date()
    };
  }

  async exportRunAudit(runId: string, _exportedBy?: any, _retentionPolicy?: any, access?: any) {
    const run = await this.getRun(runId, access);

    return {
      repository: this.repositories[0],
      run: {
        ...run,
        tasks: undefined,
        agents: undefined,
        sessions: undefined
      },
      tasks: run.tasks,
      agents: run.agents,
      sessions: run.sessions,
      workerNodes: this.workerNodes.filter((workerNode) =>
        run.sessions.some((session: any) =>
          session.workerNodeId === workerNode.id || session.stickyNodeId === workerNode.id)),
      approvals: await this.listApprovals(runId, access),
      validations: await this.listValidations(runId, access),
      artifacts: await this.listArtifacts(runId, access),
      events: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          runId,
          taskId: ids.taskA,
          agentId: ids.agent,
          traceId: "trace-audit",
          eventType: "run.created",
          entityType: "run",
          entityId: runId,
          status: "pending",
          summary: "Run created for repository",
          metadata: {},
          createdAt: new Date("2026-03-28T00:00:00.000Z")
        }
      ],
      exportedAt: new Date("2026-03-28T12:45:00.000Z")
    };
  }
}

describe("buildApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    observability.getMetrics.mockResolvedValue({
      queueDepth: {
        runsPending: 0,
        tasksPending: 0,
        tasksBlocked: 0,
        approvalsPending: 0,
        busyAgents: 0
      },
      retries: {
        recoverableDatabaseFallbacks: 0,
        taskUnblocks: 0
      },
      failures: {
        runsFailed: 0,
        tasksFailed: 0,
        agentsFailed: 0,
        validationsFailed: 0,
        requestFailures: 0
      },
      eventsRecorded: 0,
      recordedAt: new Date("2026-03-28T12:00:00.000Z")
    });
    observability.listEvents.mockResolvedValue([]);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
  });

  it("serves health checks without authentication", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok"
    });

    await app.close();
  });

  it("rejects protected routes without the configured bearer token", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/runs"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "missing or invalid bearer token",
      details: null
    });

    await app.close();
  });

  it("routes authenticated requests to the control plane", async () => {
    controlPlane.listRuns.mockResolvedValueOnce([
      {
        id: "run-1",
        goal: "Ship alpha"
      }
    ]);

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/runs",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: "run-1",
        goal: "Ship alpha"
      }
    ]);
    expect(controlPlane.listRuns).toHaveBeenCalledWith(undefined, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    await app.close();
  });

  it("exposes the authenticated identity entrypoint", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: {
        authorization: "Bearer codex-swarm-dev-token",
        "x-codex-actor-id": "oidc|alice",
        "x-codex-email": "alice@example.com",
        "x-codex-workspace-id": "acme",
        "x-codex-workspace-name": "Acme",
        "x-codex-team-id": "platform",
        "x-codex-team-name": "Platform"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      principal: "dev-user",
      subject: "oidc|alice",
      email: "alice@example.com",
      roles: ["platform-admin"],
      workspace: {
        id: "acme",
        name: "Acme"
      },
      team: {
        id: "platform",
        workspaceId: "acme",
        name: "Platform"
      },
      actorType: "user"
    });

    await app.close();
  });

  it("denies cross-team run access by default", async () => {
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        DEV_AUTH_TOKEN: "test-token"
      }),
      controlPlane: new FakeVerticalSliceControlPlane() as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/repositories",
      headers: {
        authorization: "Bearer test-token",
        "x-codex-workspace-id": "other-workspace",
        "x-codex-team-id": "other-team"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);

    await app.close();
  });

  it("returns empty repository and run lists during local database bootstrap failures", async () => {
    const bootstrapError = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED"
    });

    controlPlane.listRepositories.mockRejectedValueOnce(bootstrapError);
    controlPlane.listRuns.mockRejectedValueOnce(bootstrapError);

    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "127.0.0.1",
        DATABASE_URL: "postgres://unused/dev",
        DEV_AUTH_TOKEN: "test-token",
        OPENAI_TRACING_DISABLED: true
      }),
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const headers = {
      authorization: "Bearer test-token"
    };

    const repositoryResponse = await app.inject({
      method: "GET",
      url: "/api/v1/repositories",
      headers
    });

    const runResponse = await app.inject({
      method: "GET",
      url: "/api/v1/runs",
      headers
    });

    expect(repositoryResponse.statusCode).toBe(200);
    expect(repositoryResponse.headers["x-codex-swarm-degraded"]).toBe("database-unavailable");
    expect(repositoryResponse.json()).toEqual([]);

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json()).toEqual([]);

    await app.close();
  });

  it("creates repositories with provider onboarding metadata", async () => {
    controlPlane.createRepository.mockResolvedValueOnce({
      id: ids.repository,
      name: "codex-swarm",
      url: "https://github.com/example/codex-swarm",
      provider: "github",
      defaultBranch: "main",
      localPath: null,
      trustLevel: "trusted",
      approvalProfile: "standard"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/repositories",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        name: "codex-swarm",
        url: "https://github.com/example/codex-swarm",
        provider: "github"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      provider: "github",
      trustLevel: "trusted",
      approvalProfile: "standard"
    });
    expect(controlPlane.createRepository).toHaveBeenCalledWith({
      name: "codex-swarm",
      url: "https://github.com/example/codex-swarm",
      provider: "github",
      defaultBranch: "main",
      approvalProfile: "standard",
      trustLevel: "trusted"
    }, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    await app.close();
  });

  it("publishes the run branch for provider handoff", async () => {
    controlPlane.publishRunBranch.mockResolvedValueOnce({
      id: ids.run,
      repositoryId: ids.repository,
      goal: "Ship alpha",
      status: "in_progress",
      branchName: "runs/m3-git-provider",
      planArtifactPath: null,
      budgetTokens: null,
      budgetCostUsd: null,
      concurrencyCap: 1,
      policyProfile: null,
      publishedBranch: "runs/m3-git-provider",
      branchPublishedAt: "2026-03-28T12:00:00.000Z",
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      handoffStatus: "branch_published",
      completedAt: null,
      metadata: {},
      createdBy: "tech-lead",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T12:00:00.000Z"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/runs/${ids.run}/publish-branch`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        branchName: "runs/m3-git-provider",
        publishedBy: "tech-lead"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      publishedBranch: "runs/m3-git-provider",
      handoffStatus: "branch_published"
    });
    expect(controlPlane.publishRunBranch).toHaveBeenCalledWith(ids.run, {
      branchName: "runs/m3-git-provider",
      publishedBy: "tech-lead",
      remoteName: "origin"
    }, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    await app.close();
  });

  it("records pull request handoff for a published run", async () => {
    controlPlane.createRunPullRequestHandoff.mockResolvedValueOnce({
      id: ids.run,
      repositoryId: ids.repository,
      goal: "Ship alpha",
      status: "in_progress",
      branchName: "runs/m3-git-provider",
      planArtifactPath: null,
      budgetTokens: null,
      budgetCostUsd: null,
      concurrencyCap: 1,
      policyProfile: null,
      publishedBranch: "runs/m3-git-provider",
      branchPublishedAt: "2026-03-28T12:00:00.000Z",
      pullRequestUrl: "https://github.com/example/codex-swarm/pull/42",
      pullRequestNumber: 42,
      pullRequestStatus: "open",
      handoffStatus: "pr_open",
      completedAt: null,
      metadata: {},
      createdBy: "tech-lead",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T12:15:00.000Z"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/runs/${ids.run}/pull-request-handoff`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        title: "M3 Git provider handoff",
        body: "Validation evidence attached.",
        createdBy: "tech-lead",
        provider: "github",
        url: "https://github.com/example/codex-swarm/pull/42",
        number: 42,
        status: "open"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      pullRequestUrl: "https://github.com/example/codex-swarm/pull/42",
      pullRequestNumber: 42,
      handoffStatus: "pr_open"
    });
    expect(controlPlane.createRunPullRequestHandoff).toHaveBeenCalledWith(ids.run, {
      title: "M3 Git provider handoff",
      body: "Validation evidence attached.",
      createdBy: "tech-lead",
      provider: "github",
      url: "https://github.com/example/codex-swarm/pull/42",
      number: 42,
      status: "open"
    }, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    await app.close();
  });

  it("registers and lists worker nodes for fleet visibility", async () => {
    controlPlane.registerWorkerNode.mockResolvedValueOnce({
      id: ids.workerNode,
      name: "node-a",
      endpoint: "tcp://node-a.internal:7777",
      capabilityLabels: ["linux", "node", "remote"],
      status: "online",
      drainState: "active",
      lastHeartbeatAt: "2026-03-28T12:00:00.000Z",
      metadata: {},
      eligibleForScheduling: true,
      createdAt: "2026-03-28T12:00:00.000Z",
      updatedAt: "2026-03-28T12:00:00.000Z"
    });
    controlPlane.listWorkerNodes.mockResolvedValueOnce([
      {
        id: ids.workerNode,
        name: "node-a",
        endpoint: "tcp://node-a.internal:7777",
        capabilityLabels: ["linux", "node", "remote"],
        status: "online",
        drainState: "active",
        lastHeartbeatAt: "2026-03-28T12:00:00.000Z",
        metadata: {},
        eligibleForScheduling: true,
        createdAt: "2026-03-28T12:00:00.000Z",
        updatedAt: "2026-03-28T12:00:00.000Z"
      }
    ]);

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/worker-nodes",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        name: "node-a",
        endpoint: "tcp://node-a.internal:7777",
        capabilityLabels: ["linux", "node", "remote"]
      }
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      id: ids.workerNode,
      eligibleForScheduling: true
    });
    expect(controlPlane.registerWorkerNode).toHaveBeenCalledWith({
      name: "node-a",
      endpoint: "tcp://node-a.internal:7777",
      capabilityLabels: ["linux", "node", "remote"],
      status: "online",
      drainState: "active",
      metadata: {}
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/worker-nodes",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject([
      {
        id: ids.workerNode,
        drainState: "active"
      }
    ]);

    await app.close();
  });

  it("records worker-node heartbeats and drain transitions", async () => {
    controlPlane.recordWorkerNodeHeartbeat.mockResolvedValueOnce({
      id: ids.workerNode,
      name: "node-a",
      endpoint: "tcp://node-a.internal:7777",
      capabilityLabels: ["linux", "node", "remote"],
      status: "online",
      drainState: "active",
      lastHeartbeatAt: "2026-03-28T12:05:00.000Z",
      metadata: {
        queueDepth: 3
      },
      eligibleForScheduling: true,
      createdAt: "2026-03-28T12:00:00.000Z",
      updatedAt: "2026-03-28T12:05:00.000Z"
    });
    controlPlane.updateWorkerNodeDrainState.mockResolvedValueOnce({
      id: ids.workerNode,
      name: "node-a",
      endpoint: "tcp://node-a.internal:7777",
      capabilityLabels: ["linux", "node", "remote"],
      status: "online",
      drainState: "draining",
      lastHeartbeatAt: "2026-03-28T12:05:00.000Z",
      metadata: {
        drainReason: "maintenance"
      },
      eligibleForScheduling: false,
      createdAt: "2026-03-28T12:00:00.000Z",
      updatedAt: "2026-03-28T12:06:00.000Z"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const heartbeatResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/worker-nodes/${ids.workerNode}/heartbeat`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        capabilityLabels: ["linux", "node", "remote"],
        metadata: {
          queueDepth: 3
        }
      }
    });

    expect(heartbeatResponse.statusCode).toBe(200);
    expect(controlPlane.recordWorkerNodeHeartbeat).toHaveBeenCalledWith(ids.workerNode, {
      status: "online",
      capabilityLabels: ["linux", "node", "remote"],
      metadata: {
        queueDepth: 3
      }
    });

    const drainResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/worker-nodes/${ids.workerNode}/drain`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        drainState: "draining",
        reason: "maintenance"
      }
    });

    expect(drainResponse.statusCode).toBe(200);
    expect(drainResponse.json()).toMatchObject({
      drainState: "draining",
      eligibleForScheduling: false
    });
    expect(controlPlane.updateWorkerNodeDrainState).toHaveBeenCalledWith(ids.workerNode, {
      drainState: "draining",
      reason: "maintenance"
    });

    await app.close();
  });

  it("creates and lists worker dispatch assignments", async () => {
    controlPlane.createWorkerDispatchAssignment.mockResolvedValueOnce({
      id: ids.dispatch,
      runId: ids.run,
      taskId: ids.taskA,
      agentId: ids.agent,
      sessionId: ids.session,
      repositoryId: ids.repository,
      repositoryName: "codex-swarm",
      queue: "worker-dispatch",
      state: "queued",
      stickyNodeId: null,
      preferredNodeId: null,
      claimedByNodeId: null,
      requiredCapabilities: ["remote"],
      worktreePath: "/tmp/codex-swarm/run-1/worker-1",
      branchName: null,
      prompt: "Run the task",
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
      createdAt: "2026-03-28T12:00:00.000Z",
      updatedAt: "2026-03-28T12:00:00.000Z"
    });
    controlPlane.listWorkerDispatchAssignments.mockResolvedValueOnce([
      {
        id: ids.dispatch,
        runId: ids.run,
        state: "queued"
      }
    ]);

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/worker-dispatch-assignments",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        runId: ids.run,
        taskId: ids.taskA,
        agentId: ids.agent,
        sessionId: ids.session,
        repositoryId: ids.repository,
        repositoryName: "codex-swarm",
        requiredCapabilities: ["remote"],
        worktreePath: "/tmp/codex-swarm/run-1/worker-1",
        prompt: "Run the task",
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request"
      }
    });

    expect(createResponse.statusCode).toBe(201);
    expect(controlPlane.createWorkerDispatchAssignment).toHaveBeenCalledWith({
      runId: ids.run,
      taskId: ids.taskA,
      agentId: ids.agent,
      sessionId: ids.session,
      repositoryId: ids.repository,
      repositoryName: "codex-swarm",
      queue: "worker-dispatch",
      stickyNodeId: null,
      preferredNodeId: null,
      requiredCapabilities: ["remote"],
      worktreePath: "/tmp/codex-swarm/run-1/worker-1",
      branchName: null,
      prompt: "Run the task",
      profile: "default",
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      includePlanTool: false,
      metadata: {},
      maxAttempts: 3,
      leaseTtlSeconds: 300
    });

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/v1/worker-dispatch-assignments?runId=${ids.run}&state=queued`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(controlPlane.listWorkerDispatchAssignments).toHaveBeenCalledWith({
      runId: ids.run,
      state: "queued"
    });

    await app.close();
  });

  it("claims dispatch work and reconciles node loss", async () => {
    controlPlane.claimNextWorkerDispatch.mockResolvedValueOnce({
      id: ids.dispatch,
      runId: ids.run,
      taskId: ids.taskA,
      agentId: ids.agent,
      sessionId: ids.session,
      repositoryId: ids.repository,
      repositoryName: "codex-swarm",
      queue: "worker-dispatch",
      state: "claimed",
      stickyNodeId: ids.workerNode,
      preferredNodeId: ids.workerNode,
      claimedByNodeId: ids.workerNode,
      requiredCapabilities: ["remote"],
      worktreePath: "/tmp/codex-swarm/run-1/worker-1",
      branchName: null,
      prompt: "Run the task",
      profile: "default",
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      includePlanTool: false,
      metadata: {},
      attempt: 0,
      maxAttempts: 3,
      leaseTtlSeconds: 300,
      claimedAt: "2026-03-28T12:05:00.000Z",
      completedAt: null,
      lastFailureReason: null,
      createdAt: "2026-03-28T12:00:00.000Z",
      updatedAt: "2026-03-28T12:05:00.000Z"
    });
    controlPlane.reconcileWorkerNode.mockResolvedValueOnce({
      nodeId: ids.workerNode,
      retriedAssignments: 1,
      failedAssignments: 0,
      staleSessions: 1,
      completedAt: "2026-03-28T12:15:00.000Z"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const claimResponse = await app.inject({
      method: "POST",
      url: `/api/v1/worker-nodes/${ids.workerNode}/claim-dispatch`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(claimResponse.statusCode).toBe(200);
    expect(controlPlane.claimNextWorkerDispatch).toHaveBeenCalledWith(ids.workerNode);

    const reconcileResponse = await app.inject({
      method: "POST",
      url: `/api/v1/worker-nodes/${ids.workerNode}/reconcile`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        reason: "heartbeat expired"
      }
    });

    expect(reconcileResponse.statusCode).toBe(200);
    expect(reconcileResponse.json()).toMatchObject({
      retriedAssignments: 1
    });
    expect(controlPlane.reconcileWorkerNode).toHaveBeenCalledWith(ids.workerNode, {
      reason: "heartbeat expired",
      markOffline: true
    });

    await app.close();
  });

  it("rejects agent placement onto drained worker nodes", async () => {
    const verticalSlice = new FakeVerticalSliceControlPlane();
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "127.0.0.1",
        DATABASE_URL: "postgres://unused/test",
        DEV_AUTH_TOKEN: "test-token",
        OPENAI_TRACING_DISABLED: true
      }),
      controlPlane: verticalSlice as unknown as ControlPlaneService
    });

    const headers = {
      authorization: "Bearer test-token"
    };

    await app.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers,
      payload: {
        repositoryId: ids.repository,
        goal: "Test drained placement rejection",
        metadata: {}
      }
    });

    await app.inject({
      method: "PATCH",
      url: `/api/v1/worker-nodes/${ids.workerNode}/drain`,
      headers,
      payload: {
        drainState: "draining",
        reason: "maintenance"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers,
      payload: {
        runId: ids.run,
        name: "worker-drained",
        role: "backend-developer",
        status: "idle",
        session: {
          threadId: "thread-drained",
          cwd: "/tmp/codex-swarm/run-1/worker-drained",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          workerNodeId: ids.workerNode,
          placementConstraintLabels: ["remote"],
          metadata: {}
        }
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: `worker node ${ids.workerNode} is not eligible for scheduling`,
      details: null
    });

    await app.close();
  });

  it("lists approvals and forwards the optional runId filter", async () => {
    controlPlane.listApprovals.mockResolvedValueOnce([
      {
        id: "77777777-7777-4777-8777-777777777777",
        runId: ids.run,
        kind: "plan",
        status: "pending",
        requestedPayload: {},
        resolutionPayload: {},
        requestedBy: "tech-lead",
        resolver: null,
        resolvedAt: null
      }
    ]);

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/approvals?runId=${ids.run}`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: "77777777-7777-4777-8777-777777777777",
        runId: ids.run,
        kind: "plan",
        status: "pending",
        requestedPayload: {},
        resolutionPayload: {},
        requestedBy: "tech-lead",
        resolver: null,
        resolvedAt: null
      }
    ]);
    expect(controlPlane.listApprovals).toHaveBeenCalledWith(ids.run, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    await app.close();
  });

  it("exposes an empty event timeline when no live observability backend is injected", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/events",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);

    await app.close();
  });

  it("exposes a zeroed metrics snapshot when no live observability backend is injected", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/metrics",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      queueDepth: {
        runsPending: 0,
        tasksPending: 0,
        tasksBlocked: 0,
        approvalsPending: 0,
        busyAgents: 0
      },
      retries: {
        recoverableDatabaseFallbacks: 0,
        taskUnblocks: 0
      },
      failures: {
        runsFailed: 0,
        tasksFailed: 0,
        agentsFailed: 0,
        validationsFailed: 0,
        requestFailures: 0
      },
      eventsRecorded: 0
    });

    await app.close();
  });

  it("delegates event timeline queries to an injected observability backend", async () => {
    observability.listEvents.mockResolvedValueOnce([
      {
        id: "99999999-9999-4999-8999-999999999999",
        runId: ids.run,
        taskId: ids.taskA,
        agentId: ids.agent,
        traceId: "trace-123",
        eventType: "task.unblocked",
        entityType: "task",
        entityId: ids.taskB,
        status: "pending",
        summary: "Dependency completed and task unblocked",
        metadata: {
          source: "qa-test"
        },
        createdAt: "2026-03-28T12:05:00.000Z"
      }
    ]);

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService,
      observability: observability as any
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/events?runId=${ids.run}&limit=25`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        eventType: "task.unblocked",
        entityId: ids.taskB
      })
    ]);
    expect(observability.listEvents).toHaveBeenCalledWith(ids.run, 25);

    await app.close();
  });

  it("runs the stale session cleanup job", async () => {
    controlPlane.runCleanupJob.mockResolvedValueOnce({
      scannedSessions: 2,
      resumed: 0,
      retried: 1,
      markedStale: 1,
      archived: 0,
      items: [
        {
          sessionId: ids.session,
          runId: ids.run,
          agentId: ids.agent,
          worktreePath: ".swarm/worktrees/codex-swarm/run-001/worker-001",
          action: "mark_stale",
          reason: "missing_worktree"
        }
      ],
      completedAt: new Date("2026-03-28T12:30:00.000Z")
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cleanup-jobs/run",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        runId: ids.run,
        staleAfterMinutes: 20,
        existingWorktreePaths: []
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      scannedSessions: 2,
      markedStale: 1
    });
    expect(controlPlane.runCleanupJob).toHaveBeenCalledWith({
      runId: ids.run,
      staleAfterMinutes: 20,
      existingWorktreePaths: []
    });

    await app.close();
  });

  it("exports a run audit bundle", async () => {
    controlPlane.exportRunAudit.mockResolvedValueOnce({
      repository: {
        id: ids.repository,
        name: "codex-swarm",
        url: "https://github.com/example/codex-swarm",
        provider: "github",
        defaultBranch: "main",
        localPath: null,
        trustLevel: "trusted",
        approvalProfile: "standard",
        createdAt: "2026-03-28T00:00:00.000Z",
        updatedAt: "2026-03-28T00:00:00.000Z"
      },
      run: {
        id: ids.run,
        repositoryId: ids.repository,
        goal: "Ship M3 governance-lite",
        status: "in_progress",
        branchName: "runs/m3-governance",
        planArtifactPath: null,
        budgetTokens: 120000,
        budgetCostUsd: 12.5,
        concurrencyCap: 2,
        policyProfile: "standard",
        publishedBranch: null,
        branchPublishedAt: null,
        pullRequestUrl: null,
        pullRequestNumber: null,
        pullRequestStatus: null,
        handoffStatus: "pending",
        completedAt: null,
        metadata: {},
        createdBy: "tech-lead",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T12:00:00.000Z"
      },
      tasks: [],
      agents: [],
      sessions: [],
      workerNodes: [],
      approvals: [],
      validations: [],
      artifacts: [],
      events: [],
      provenance: {
        exportedBy: {
          principal: "dev-user",
          actorId: "dev-user",
          actorType: "user",
          role: "platform-admin",
          teamId: "codex-swarm",
          policyProfile: "standard"
        },
        approvals: [],
        eventActors: [],
        generatedAt: "2026-03-28T12:45:00.000Z"
      },
      retention: {
        policy: {
          runsDays: 30,
          artifactsDays: 30,
          eventsDays: 30
        },
        runs: { total: 1, expired: 0, retained: 1 },
        artifacts: { total: 0, expired: 0, retained: 0 },
        events: { total: 0, expired: 0, retained: 0 }
      },
      exportedAt: "2026-03-28T12:45:00.000Z"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${ids.run}/audit-export`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      repository: {
        approvalProfile: "standard"
      },
      run: {
        budgetTokens: 120000,
        concurrencyCap: 2,
        policyProfile: "standard"
      },
      provenance: {
        exportedBy: {
          role: "platform-admin"
        }
      }
    });
    expect(controlPlane.exportRunAudit).toHaveBeenCalledWith(
      ids.run,
      {
        principal: "dev-user",
        actorId: "dev-user",
        actorType: "user",
        email: null,
        role: "platform-admin",
        workspaceId: "default-workspace",
        workspaceName: "Default Workspace",
        teamId: "codex-swarm",
        teamName: "Codex Swarm",
        policyProfile: "standard"
      },
      {
        runsDays: 30,
        artifactsDays: 30,
        eventsDays: 30
      },
      expect.objectContaining({
        workspaceId: "default-workspace",
        teamId: "codex-swarm"
      })
    );

    await app.close();
  });

  it("delegates metrics reads to an injected observability backend", async () => {
    observability.getMetrics.mockResolvedValueOnce({
      queueDepth: {
        runsPending: 2,
        tasksPending: 7,
        tasksBlocked: 3,
        approvalsPending: 1,
        busyAgents: 4
      },
      retries: {
        recoverableDatabaseFallbacks: 2,
        taskUnblocks: 5
      },
      failures: {
        runsFailed: 1,
        tasksFailed: 2,
        agentsFailed: 1,
        validationsFailed: 1,
        requestFailures: 3
      },
      eventsRecorded: 18,
      recordedAt: new Date("2026-03-28T12:15:00.000Z")
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService,
      observability: observability as any
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/metrics",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      queueDepth: {
        runsPending: 2,
        tasksPending: 7,
        tasksBlocked: 3,
        approvalsPending: 1,
        busyAgents: 4
      },
      retries: {
        recoverableDatabaseFallbacks: 2,
        taskUnblocks: 5
      },
      failures: {
        requestFailures: 3
      },
      eventsRecorded: 18
    });
    expect(observability.getMetrics).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("gets an approval by id", async () => {
    controlPlane.getApproval.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      runId: ids.run,
      taskId: ids.taskA,
      kind: "plan",
      status: "pending",
      requestedPayload: {
        summary: "Review the execution plan"
      },
      resolutionPayload: {},
      requestedBy: "tech-lead",
      resolver: null,
      resolvedAt: null
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/approvals/77777777-7777-4777-8777-777777777777",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "77777777-7777-4777-8777-777777777777",
      kind: "plan",
      status: "pending"
    });

    await app.close();
  });

  it("resolves approvals with structured reject feedback", async () => {
    controlPlane.resolveApproval.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      runId: ids.run,
      taskId: ids.taskA,
      kind: "plan",
      status: "rejected",
      requestedPayload: {
        summary: "Review the execution plan"
      },
      resolutionPayload: {
        feedback: "Please attach validation evidence"
      },
      requestedBy: "tech-lead",
      resolver: "reviewer-1",
      resolvedAt: "2026-03-28T12:00:00.000Z"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/approvals/77777777-7777-4777-8777-777777777777",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        status: "rejected",
        resolver: "reviewer-1",
        feedback: "Please attach validation evidence"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "rejected",
      resolver: "reviewer-1",
      resolutionPayload: {
        feedback: "Please attach validation evidence"
      }
    });
    expect(controlPlane.resolveApproval).toHaveBeenCalledWith(
      "77777777-7777-4777-8777-777777777777",
      {
        status: "rejected",
        resolver: "dev-user",
        feedback: "Please attach validation evidence",
        resolutionPayload: {}
      },
      expect.objectContaining({
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      })
    );

    await app.close();
  });

  it("serves governance admin reporting without direct database access", async () => {
    controlPlane.getGovernanceAdminReport.mockResolvedValueOnce({
      generatedAt: "2026-03-28T12:00:00.000Z",
      requestedBy: {
        principal: "dev-user",
        actorId: "dev-user",
        actorType: "user",
        role: "platform-admin",
        teamId: "codex-swarm",
        policyProfile: "standard"
      },
      retention: {
        policy: { runsDays: 30, artifactsDays: 30, eventsDays: 30 },
        runs: { total: 1, expired: 0, retained: 1 },
        artifacts: { total: 2, expired: 0, retained: 2 },
        events: { total: 3, expired: 1, retained: 2 }
      },
      approvals: {
        total: 1,
        pending: 0,
        approved: 1,
        rejected: 0,
        history: []
      },
      policies: {
        repositoryProfiles: [{ profile: "standard", repositoryCount: 1, runCount: 1 }],
        sensitiveRepositories: []
      },
      secrets: {
        sourceMode: "environment",
        provider: null,
        remoteCredentialEnvNames: [],
        allowedRepositoryTrustLevels: ["trusted"],
        sensitivePolicyProfiles: [],
        credentialDistribution: ["control-plane issues short-lived credentials"],
        policyDrivenAccess: false
      }
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/governance-report",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(controlPlane.getGovernanceAdminReport).toHaveBeenCalledWith({
      requestedBy: {
        principal: "dev-user",
        actorId: "dev-user",
        actorType: "user",
        email: null,
        role: "platform-admin",
        workspaceId: defaultBoundary.workspaceId,
        workspaceName: defaultBoundary.workspaceName,
        teamId: "codex-swarm",
        teamName: defaultBoundary.teamName,
        policyProfile: "standard"
      },
      retentionPolicy: {
        runsDays: 30,
        artifactsDays: 30,
        eventsDays: 30
      },
      secrets: expect.objectContaining({
        sourceMode: "environment"
      }),
      limit: 50,
      access: expect.objectContaining({
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      })
    });

    await app.close();
  });

  it("reconciles retention metadata through the admin route", async () => {
    controlPlane.reconcileGovernanceRetention.mockResolvedValueOnce({
      dryRun: false,
      appliedAt: "2026-03-28T12:00:00.000Z",
      requestedBy: {
        principal: "dev-user",
        actorId: "dev-user",
        actorType: "user",
        role: "platform-admin",
        teamId: "codex-swarm",
        policyProfile: "standard"
      },
      runsUpdated: 1,
      artifactsUpdated: 2,
      eventsUpdated: 3
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/retention/reconcile",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        dryRun: false,
        runId: ids.run
      }
    });

    expect(response.statusCode).toBe(200);
    expect(controlPlane.reconcileGovernanceRetention).toHaveBeenCalledWith({
      requestedBy: expect.objectContaining({
        role: "platform-admin"
      }),
      retentionPolicy: {
        runsDays: 30,
        artifactsDays: 30,
        eventsDays: 30
      },
      dryRun: false,
      runId: ids.run,
      access: expect.objectContaining({
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      })
    });

    await app.close();
  });

  it("returns a governed secret access plan for a repository", async () => {
    controlPlane.getRepositorySecretAccessPlan.mockResolvedValueOnce({
      repositoryId: ids.repository,
      repositoryName: "codex-swarm",
      trustLevel: "trusted",
      policyProfile: "standard",
      access: "allowed",
      sourceMode: "environment",
      provider: null,
      credentialEnvNames: ["OPENAI_API_KEY"],
      distributionBoundary: ["workers get task-scoped env"],
      reason: "repository can receive the standard environment secret path"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/admin/secrets/access-plan/${ids.repository}`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(controlPlane.getRepositorySecretAccessPlan).toHaveBeenCalledWith({
      repositoryId: ids.repository,
      secrets: expect.objectContaining({
        sourceMode: "environment"
      }),
      access: expect.objectContaining({
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      })
    });

    await app.close();
  });

  it("lists validation history entries with artifact-backed reports", async () => {
    controlPlane.listValidations.mockResolvedValueOnce([
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        runId: ids.run,
        taskId: ids.taskA,
        name: "typecheck",
        status: "passed",
        command: "pnpm typecheck",
        summary: "Typecheck passed",
        artifactPath: "artifacts/validations/typecheck.json",
        artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
        artifacts: [
          {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            runId: ids.run,
            taskId: ids.taskA,
            kind: "report",
            path: "artifacts/validations/typecheck.json",
            contentType: "application/json",
            metadata: {
              suite: "typecheck"
            },
            createdAt: "2026-03-28T12:00:00.000Z"
          }
        ],
        createdAt: "2026-03-28T12:00:00.000Z",
        updatedAt: "2026-03-28T12:05:00.000Z"
      }
    ]);

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/validations?runId=${ids.run}&taskId=${ids.taskA}`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
        artifacts: [
          expect.objectContaining({
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            kind: "report"
          })
        ]
      })
    ]);
    expect(controlPlane.listValidations).toHaveBeenCalledWith({
      runId: ids.run,
      taskId: ids.taskA
    }, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    await app.close();
  });

  it("records validations with explicit artifact references", async () => {
    controlPlane.createValidation.mockResolvedValueOnce({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      runId: ids.run,
      taskId: ids.taskA,
      name: "typecheck",
      status: "passed",
      command: "pnpm typecheck",
      summary: "Typecheck passed",
      artifactPath: "artifacts/validations/typecheck.json",
      artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      artifacts: [
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          runId: ids.run,
          taskId: ids.taskA,
          kind: "report",
          path: "artifacts/validations/typecheck.json",
          contentType: "application/json",
          metadata: {},
          createdAt: "2026-03-28T12:00:00.000Z"
        }
      ],
      createdAt: "2026-03-28T12:00:00.000Z",
      updatedAt: "2026-03-28T12:05:00.000Z"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/validations",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        runId: ids.run,
        taskId: ids.taskA,
        name: "typecheck",
        status: "passed",
        command: "pnpm typecheck",
        summary: "Typecheck passed",
        artifactPath: "artifacts/validations/typecheck.json",
        artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      artifacts: [
        expect.objectContaining({
          kind: "report"
        })
      ]
    });
    expect(controlPlane.createValidation).toHaveBeenCalledWith({
      runId: ids.run,
      taskId: ids.taskA,
      name: "typecheck",
      status: "passed",
      command: "pnpm typecheck",
      summary: "Typecheck passed",
      artifactPath: "artifacts/validations/typecheck.json",
      artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]
    }, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    await app.close();
  });

  it("returns validation errors for invalid request bodies", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/messages",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        runId: "550e8400-e29b-41d4-a716-446655440000",
        kind: "direct",
        body: "Need review"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "validation_error"
    });

    await app.close();
  });

  it("maps control plane HttpError responses to their status code", async () => {
    controlPlane.getRun.mockRejectedValueOnce(new HttpError(404, "run run-404 not found"));

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/runs/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "run run-404 not found",
      details: null
    });

    await app.close();
  });

  it("supports the run-task-agent-session vertical slice", async () => {
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "127.0.0.1",
        DATABASE_URL: "postgres://unused/test",
        DEV_AUTH_TOKEN: "test-token",
        OPENAI_TRACING_DISABLED: true
      }),
      controlPlane: new FakeVerticalSliceControlPlane() as unknown as ControlPlaneService
    });

    const headers = {
      authorization: "Bearer test-token"
    };

    const createRunResponse = await app.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers,
      payload: {
        repositoryId: ids.repository,
        goal: "Implement the control plane vertical slice",
        metadata: {
          milestone: "M1"
        }
      }
    });

    expect(createRunResponse.statusCode).toBe(201);
    expect(createRunResponse.json()).toMatchObject({
      policyProfile: "standard",
      concurrencyCap: 1
    });

    const createTaskAResponse = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers,
      payload: {
        runId: ids.run,
        title: "Persist task graph",
        description: "Store first task",
        role: "backend-developer",
        priority: 2,
        dependencyIds: [],
        acceptanceCriteria: ["task is saved"]
      }
    });

    expect(createTaskAResponse.statusCode).toBe(201);
    expect(createTaskAResponse.json().status).toBe("pending");

    const createTaskBResponse = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers,
      payload: {
        runId: ids.run,
        title: "Unblock dependent task",
        description: "Store second task",
        role: "backend-developer",
        priority: 3,
        dependencyIds: [ids.taskA],
        acceptanceCriteria: ["task unblocks when dependency completes"]
      }
    });

    expect(createTaskBResponse.statusCode).toBe(201);
    expect(createTaskBResponse.json().status).toBe("blocked");

    const completeTaskResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/tasks/${ids.taskA}/status`,
      headers,
      payload: {
        status: "completed"
      }
    });

    expect(completeTaskResponse.statusCode).toBe(200);

    const createAgentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers,
      payload: {
        runId: ids.run,
        name: "worker-1",
        role: "backend-developer",
        status: "idle",
        currentTaskId: ids.taskB,
        session: {
          threadId: "thread-123",
          cwd: "/tmp/codex-swarm/run-1/worker-1",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: true,
          workerNodeId: ids.workerNode,
          placementConstraintLabels: ["remote"],
          metadata: {
            source: "app-test"
          }
        }
      }
    });

    expect(createAgentResponse.statusCode).toBe(201);

    const createSecondAgentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers,
      payload: {
        runId: ids.run,
        name: "worker-2",
        role: "backend-developer",
        status: "idle"
      }
    });

    expect(createSecondAgentResponse.statusCode).toBe(409);
    expect(createSecondAgentResponse.json()).toEqual({
      error: "run concurrency cap of 1 active agents reached",
      details: null
    });

    const getRunResponse = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${ids.run}`,
      headers
    });

    expect(getRunResponse.statusCode).toBe(200);
    expect(getRunResponse.json()).toMatchObject({
      id: ids.run,
      tasks: [
        { id: ids.taskA, status: "completed" },
        { id: ids.taskB, status: "pending" }
      ],
      agents: [
        { id: ids.agent, currentTaskId: ids.taskB }
      ],
      sessions: [
        {
          id: ids.session,
          threadId: "thread-123",
          agentId: ids.agent,
          workerNodeId: ids.workerNode,
          stickyNodeId: ids.workerNode,
          placementConstraintLabels: ["remote"]
        }
      ]
    });

    await app.close();
  });

  it("supports approval cards from persisted approval rows", async () => {
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "127.0.0.1",
        DATABASE_URL: "postgres://unused/test",
        DEV_AUTH_TOKEN: "test-token",
        OPENAI_TRACING_DISABLED: true
      }),
      controlPlane: new FakeVerticalSliceControlPlane() as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/approvals?runId=${ids.run}`,
      headers: {
        authorization: "Bearer test-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        runId: ids.run,
        kind: "plan",
        status: "pending",
        requestedPayload: expect.any(Object),
        resolutionPayload: expect.any(Object)
      })
    ]);

    await app.close();
  });

  it("preserves distributed run visibility across two-node retry recovery", async () => {
    const verticalSlice = new FakeVerticalSliceControlPlane();
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "127.0.0.1",
        DATABASE_URL: "postgres://unused/test",
        DEV_AUTH_TOKEN: "test-token",
        OPENAI_TRACING_DISABLED: true
      }),
      controlPlane: verticalSlice as unknown as ControlPlaneService
    });

    const headers = {
      authorization: "Bearer test-token"
    };

    const runResponse = await app.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers,
      payload: {
        repositoryId: ids.repository,
        goal: "Verify multi-node continuity and retry recovery",
        concurrencyCap: 2,
        metadata: {}
      }
    });

    expect(runResponse.statusCode).toBe(201);

    const firstAgentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers,
      payload: {
        runId: ids.run,
        name: "worker-1",
        role: "backend-developer",
        status: "idle",
        session: {
          threadId: "thread-node-a",
          cwd: "/tmp/codex-swarm/run-1/worker-1",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          workerNodeId: ids.workerNode,
          placementConstraintLabels: ["remote"],
          metadata: {
            lane: "node-a"
          }
        }
      }
    });

    expect(firstAgentResponse.statusCode).toBe(201);

    const secondAgentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers,
      payload: {
        runId: ids.run,
        name: "worker-2",
        role: "frontend-developer",
        status: "idle",
        session: {
          threadId: "thread-node-b",
          cwd: "/tmp/codex-swarm/run-1/worker-2",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          workerNodeId: ids.workerNodeB,
          placementConstraintLabels: ["remote"],
          metadata: {
            lane: "node-b"
          }
        }
      }
    });

    expect(secondAgentResponse.statusCode).toBe(201);

    const initialRunDetailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${ids.run}`,
      headers
    });

    const initialWorkerNodeListResponse = await app.inject({
      method: "GET",
      url: "/api/v1/worker-nodes",
      headers
    });

    expect(initialRunDetailResponse.statusCode).toBe(200);
    expect(initialRunDetailResponse.json()).toMatchObject({
      id: ids.run,
      sessions: [
        {
          threadId: "thread-node-a",
          workerNodeId: ids.workerNode,
          stickyNodeId: ids.workerNode
        },
        {
          threadId: "thread-node-b",
          workerNodeId: ids.workerNodeB,
          stickyNodeId: ids.workerNodeB
        }
      ]
    });
    expect(initialWorkerNodeListResponse.statusCode).toBe(200);
    expect(initialWorkerNodeListResponse.json()).toMatchObject([
      { id: ids.workerNode, name: "node-a", status: "online", drainState: "active" },
      { id: ids.workerNodeB, name: "node-b", status: "online", drainState: "active" }
    ]);

    const dispatchCreateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/worker-dispatch-assignments",
      headers,
      payload: {
        runId: ids.run,
        taskId: ids.taskA,
        agentId: ids.agent,
        sessionId: ids.session,
        repositoryId: ids.repository,
        repositoryName: "codex-swarm",
        stickyNodeId: ids.workerNode,
        requiredCapabilities: ["remote"],
        worktreePath: "/tmp/codex-swarm/run-1/worker-1",
        prompt: "Retry the stranded node-a worker",
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request"
      }
    });

    expect(dispatchCreateResponse.statusCode).toBe(201);

    const initialClaimResponse = await app.inject({
      method: "POST",
      url: `/api/v1/worker-nodes/${ids.workerNode}/claim-dispatch`,
      headers
    });

    expect(initialClaimResponse.statusCode).toBe(200);
    expect(initialClaimResponse.json()).toMatchObject({
      claimedByNodeId: ids.workerNode,
      stickyNodeId: ids.workerNode
    });

    const reconcileResponse = await app.inject({
      method: "POST",
      url: `/api/v1/worker-nodes/${ids.workerNode}/reconcile`,
      headers,
      payload: {
        reason: "heartbeat expired"
      }
    });

    expect(reconcileResponse.statusCode).toBe(200);
    expect(reconcileResponse.json()).toMatchObject({
      nodeId: ids.workerNode,
      retriedAssignments: 1,
      failedAssignments: 0,
      staleSessions: 1
    });

    const postReconcileRunDetailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${ids.run}`,
      headers
    });

    const postReconcileWorkerNodeListResponse = await app.inject({
      method: "GET",
      url: "/api/v1/worker-nodes",
      headers
    });

    expect(postReconcileRunDetailResponse.statusCode).toBe(200);
    expect(postReconcileRunDetailResponse.json()).toMatchObject({
      sessions: [
        {
          threadId: "thread-node-a",
          workerNodeId: null,
          stickyNodeId: null,
          state: "pending",
          staleReason: "node_lost:heartbeat expired"
        },
        {
          threadId: "thread-node-b",
          workerNodeId: ids.workerNodeB,
          stickyNodeId: ids.workerNodeB,
          state: "active"
        }
      ]
    });
    expect(postReconcileWorkerNodeListResponse.statusCode).toBe(200);
    expect(postReconcileWorkerNodeListResponse.json()).toMatchObject([
      { id: ids.workerNode, status: "offline", drainState: "drained", eligibleForScheduling: false },
      { id: ids.workerNodeB, status: "online", drainState: "active", eligibleForScheduling: true }
    ]);

    const retryClaimResponse = await app.inject({
      method: "POST",
      url: `/api/v1/worker-nodes/${ids.workerNodeB}/claim-dispatch`,
      headers
    });

    expect(retryClaimResponse.statusCode).toBe(200);
    expect(retryClaimResponse.json()).toMatchObject({
      claimedByNodeId: ids.workerNodeB,
      stickyNodeId: ids.workerNodeB,
      preferredNodeId: ids.workerNodeB,
      state: "claimed",
      attempt: 1
    });

    const recoveredRunDetailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${ids.run}`,
      headers
    });

    expect(recoveredRunDetailResponse.statusCode).toBe(200);
    expect(recoveredRunDetailResponse.json()).toMatchObject({
      sessions: [
        {
          threadId: "thread-node-a",
          workerNodeId: ids.workerNodeB,
          stickyNodeId: ids.workerNodeB,
          state: "active",
          staleReason: null
        },
        {
          threadId: "thread-node-b",
          workerNodeId: ids.workerNodeB,
          stickyNodeId: ids.workerNodeB,
          state: "active",
          staleReason: null
        }
      ]
    });

    await app.close();
  });
});
