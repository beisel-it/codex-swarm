import { describe, expect, it, vi } from "vitest";

import { controlPlaneEvents } from "../src/db/schema.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

const access = {
  workspaceId: "workspace-001",
  workspaceName: "Workspace 001",
  teamId: "team-001",
  teamName: "Team 001"
} as const;

const defaultRunContext = {
  kind: "ad_hoc",
  projectId: null,
  projectSlug: null,
  projectName: null,
  projectDescription: null,
  jobId: null,
  jobName: null
} as const;

describe("ControlPlaneService TUI aggregates", () => {
  it("builds a single overview payload for runs, review state, and fleet health", async () => {
    const now = new Date("2026-03-29T08:00:00.000Z");
    const service = Object.create(ControlPlaneService.prototype) as any;

    service.clock = {
      now: () => now
    };
    service.listRepositories = vi.fn().mockResolvedValue([
      {
        id: "repo-1",
        workspaceId: access.workspaceId,
        teamId: access.teamId,
        name: "codex-swarm",
        url: "https://example.com/codex-swarm.git",
        provider: "github",
        defaultBranch: "main",
        localPath: null,
        trustLevel: "trusted",
        approvalProfile: "standard",
        providerSync: {
          connectivityStatus: "validated",
          validatedAt: now,
          defaultBranch: "main",
          branches: ["main"],
          providerRepoUrl: "https://example.com/codex-swarm",
          lastError: null
        },
        createdAt: now,
        updatedAt: now
      }
    ]);
    service.listRuns = vi.fn().mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        repositoryId: "repo-1",
        workspaceId: access.workspaceId,
        teamId: access.teamId,
        goal: "Deliver the TUI aggregate",
        status: "awaiting_approval",
        branchName: null,
        planArtifactPath: null,
        budgetTokens: null,
        budgetCostUsd: null,
        concurrencyCap: 1,
        policyProfile: "standard",
        publishedBranch: null,
        branchPublishedAt: null,
        branchPublishApprovalId: null,
        pullRequestUrl: null,
        pullRequestNumber: null,
        pullRequestStatus: null,
        pullRequestApprovalId: null,
        handoffStatus: "pending",
        completedAt: null,
        context: defaultRunContext,
        metadata: {},
        createdBy: "backend-dev",
        createdAt: now,
        updatedAt: now
      }
    ]);
    service.listApprovals = vi.fn().mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        runId: "11111111-1111-4111-8111-111111111111",
        workspaceId: access.workspaceId,
        teamId: access.teamId,
        taskId: null,
        kind: "plan",
        status: "pending",
        requestedPayload: {},
        resolutionPayload: {},
        requestedBy: "leader",
        delegation: null,
        resolver: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now
      }
    ]);
    service.listWorkerNodes = vi.fn().mockResolvedValue([
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "worker-a",
        endpoint: "tcp://worker-a.internal:7777",
        capabilityLabels: ["remote"],
        status: "online",
        drainState: "active",
        lastHeartbeatAt: now,
        metadata: {},
        eligibleForScheduling: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "worker-b",
        endpoint: "tcp://worker-b.internal:7777",
        capabilityLabels: ["remote"],
        status: "degraded",
        drainState: "active",
        lastHeartbeatAt: now,
        metadata: {},
        eligibleForScheduling: true,
        createdAt: now,
        updatedAt: now
      }
    ]);
    service.listWorkerDispatchAssignments = vi.fn().mockResolvedValue([
      {
        id: "55555555-5555-4555-8555-555555555555",
        runId: "11111111-1111-4111-8111-111111111111",
        taskId: "66666666-6666-4666-8666-666666666666",
        agentId: "77777777-7777-4777-8777-777777777777",
        sessionId: "88888888-8888-4888-8888-888888888888",
        repositoryId: "repo-1",
        repositoryName: "codex-swarm",
        queue: "worker-dispatch",
        state: "retrying",
        stickyNodeId: "33333333-3333-4333-8333-333333333333",
        preferredNodeId: null,
        claimedByNodeId: null,
        requiredCapabilities: ["remote"],
        worktreePath: "/tmp/codex-swarm",
        branchName: null,
        prompt: "retry",
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        includePlanTool: false,
        metadata: {},
        attempt: 1,
        maxAttempts: 3,
        leaseTtlSeconds: 300,
        claimedAt: null,
        completedAt: null,
        lastFailureReason: "node_lost",
        createdAt: now,
        updatedAt: now
      }
    ]);
    service.getRun = vi.fn().mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo-1",
      workspaceId: access.workspaceId,
      teamId: access.teamId,
      goal: "Deliver the TUI aggregate",
      status: "awaiting_approval",
      branchName: null,
      planArtifactPath: null,
      budgetTokens: null,
      budgetCostUsd: null,
      concurrencyCap: 1,
      policyProfile: "standard",
      publishedBranch: null,
      branchPublishedAt: null,
      branchPublishApprovalId: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      pullRequestApprovalId: null,
      handoffStatus: "pending",
      completedAt: null,
      context: defaultRunContext,
      metadata: {},
      createdBy: "backend-dev",
      createdAt: now,
      updatedAt: now,
      tasks: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          runId: "11111111-1111-4111-8111-111111111111",
          parentTaskId: null,
          title: "Blocked task",
          description: "blocked",
          role: "backend",
          status: "blocked",
          priority: 3,
          ownerAgentId: null,
          dependencyIds: [],
          acceptanceCriteria: [],
          validationTemplates: [],
          createdAt: now,
          updatedAt: now
        }
      ],
      agents: [],
      sessions: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          agentId: "77777777-7777-4777-8777-777777777777",
          threadId: "thread-1",
          cwd: "/tmp/codex-swarm",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          workerNodeId: "33333333-3333-4333-8333-333333333333",
          stickyNodeId: "33333333-3333-4333-8333-333333333333",
          placementConstraintLabels: ["remote"],
          lastHeartbeatAt: now,
          state: "active",
          staleReason: null,
          metadata: {},
          createdAt: now,
          updatedAt: now
        }
      ]
    });
    service.listValidations = vi.fn().mockResolvedValue([
      {
        id: "99999999-9999-4999-8999-999999999999",
        runId: "11111111-1111-4111-8111-111111111111",
        taskId: null,
        name: "typecheck",
        status: "failed",
        command: "pnpm typecheck",
        summary: "failed",
        artifactPath: null,
        artifactIds: [],
        createdAt: now,
        updatedAt: now,
        artifacts: []
      }
    ]);

    const overview = await ControlPlaneService.prototype.getTuiOverview.call(service, access);

    expect(overview.summary).toMatchObject({
      repositories: 1,
      runsTotal: 1,
      runsActive: 1,
      approvalsPending: 1,
      validationsFailed: 1,
      tasksBlocked: 1,
      workerNodesDegraded: 1,
      dispatchRetrying: 1
    });
    expect(overview.runs[0]).toMatchObject({
      activeSessionCount: 1,
      workerNodeIds: ["33333333-3333-4333-8333-333333333333"],
      blockedTaskIds: ["66666666-6666-4666-8666-666666666666"],
      pendingApprovalIds: ["22222222-2222-4222-8222-222222222222"],
      failedValidationIds: ["99999999-9999-4999-8999-999999999999"]
    });
    expect(overview.alerts.map((alert) => alert.kind)).toEqual(expect.arrayContaining([
      "run_awaiting_approval",
      "task_blocked",
      "validation_failed",
      "worker_node_degraded",
      "dispatch_retrying"
    ]));
  });

  it("builds a run drilldown payload with review and fleet context", async () => {
    const now = new Date("2026-03-29T09:00:00.000Z");
    const runId = "11111111-1111-4111-8111-111111111111";
    const workerNodeId = "33333333-3333-4333-8333-333333333333";
    const service = Object.create(ControlPlaneService.prototype) as any;

    service.clock = {
      now: () => now
    };
    service.db = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            orderBy: async () => table === controlPlaneEvents
              ? [{
                  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  traceId: "trace-1",
                  runId,
                  taskId: null,
                  agentId: null,
                  entityType: "run",
                  entityId: runId,
                  eventType: "run.created",
                  status: "pending",
                  summary: "Run created",
                  metadata: {},
                  actor: {
                    actorId: "leader",
                    principal: "leader",
                    actorType: "service",
                    email: null,
                    role: "service",
                    roles: ["service"]
                  },
                  createdAt: now
                }]
              : []
          })
        })
      })
    };
    service.assertRunExists = vi.fn().mockResolvedValue({
      id: runId,
      repositoryId: "repo-1",
      workspaceId: access.workspaceId,
      teamId: access.teamId
    });
    service.assertRepositoryExists = vi.fn().mockResolvedValue({
      id: "repo-1",
      workspaceId: access.workspaceId,
      teamId: access.teamId,
      name: "codex-swarm",
      url: "https://example.com/codex-swarm.git",
      provider: "github",
      defaultBranch: "main",
      localPath: null,
      trustLevel: "trusted",
      approvalProfile: "standard",
      providerSync: {
        connectivityStatus: "validated",
        validatedAt: now.toISOString(),
        defaultBranch: "main",
        branches: ["main"],
        providerRepoUrl: "https://example.com/codex-swarm",
        lastError: null
      },
      createdAt: now,
      updatedAt: now
    });
    service.getRun = vi.fn().mockResolvedValue({
      id: runId,
      repositoryId: "repo-1",
      workspaceId: access.workspaceId,
      teamId: access.teamId,
      goal: "Deliver the TUI aggregate",
      status: "in_progress",
      branchName: null,
      planArtifactPath: null,
      budgetTokens: null,
      budgetCostUsd: null,
      concurrencyCap: 1,
      policyProfile: "standard",
      publishedBranch: null,
      branchPublishedAt: null,
      branchPublishApprovalId: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      pullRequestApprovalId: null,
      handoffStatus: "pending",
      completedAt: null,
      context: defaultRunContext,
      metadata: {},
      createdBy: "backend-dev",
      createdAt: now,
      updatedAt: now,
      tasks: [],
      agents: [],
      sessions: [
        {
          id: "session-1",
          agentId: "agent-1",
          threadId: "thread-1",
          cwd: "/tmp/codex-swarm",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          workerNodeId,
          stickyNodeId: workerNodeId,
          placementConstraintLabels: ["remote"],
          lastHeartbeatAt: now,
          state: "active",
          staleReason: null,
          metadata: {},
          createdAt: now,
          updatedAt: now
        }
      ]
    });
    service.listApprovals = vi.fn().mockResolvedValue([]);
    service.listValidations = vi.fn().mockResolvedValue([]);
    service.listArtifacts = vi.fn().mockResolvedValue([]);
    service.listWorkerNodes = vi.fn().mockResolvedValue([
      {
        id: workerNodeId,
        name: "worker-a",
        endpoint: "tcp://worker-a.internal:7777",
        capabilityLabels: ["remote"],
        status: "online",
        drainState: "active",
        lastHeartbeatAt: now,
        metadata: {},
        eligibleForScheduling: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "worker-b",
        endpoint: "tcp://worker-b.internal:7777",
        capabilityLabels: ["remote"],
        status: "online",
        drainState: "active",
        lastHeartbeatAt: now,
        metadata: {},
        eligibleForScheduling: true,
        createdAt: now,
        updatedAt: now
      }
    ]);
    service.listWorkerDispatchAssignments = vi.fn().mockResolvedValue([
      {
        id: "dispatch-1",
        runId,
        taskId: "task-1",
        agentId: "agent-1",
        sessionId: "session-1",
        repositoryId: "repo-1",
        repositoryName: "codex-swarm",
        queue: "worker-dispatch",
        state: "claimed",
        stickyNodeId: workerNodeId,
        preferredNodeId: workerNodeId,
        claimedByNodeId: workerNodeId,
        requiredCapabilities: ["remote"],
        worktreePath: "/tmp/codex-swarm",
        branchName: null,
        prompt: "work",
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        includePlanTool: false,
        metadata: {},
        attempt: 0,
        maxAttempts: 3,
        leaseTtlSeconds: 300,
        claimedAt: now,
        completedAt: null,
        lastFailureReason: null,
        createdAt: now,
        updatedAt: now
      }
    ]);

    const drilldown = await ControlPlaneService.prototype.getTuiRunDrilldown.call(service, runId, access);

    expect(drilldown.repository).toMatchObject({
      id: "repo-1",
      provider: "github"
    });
    expect(drilldown.workerNodes).toEqual([
      expect.objectContaining({
        id: workerNodeId
      })
    ]);
    expect(drilldown.dispatchAssignments).toHaveLength(1);
    expect(drilldown.events).toEqual([
      expect.objectContaining({
        eventType: "run.created",
        entityId: runId
      })
    ]);
  });
});

describe("ControlPlaneService task DAG shaping", () => {
  it("derives nodes, dependency edges, roots, blocked tasks, and unblock paths", () => {
    const service = Object.create(ControlPlaneService.prototype) as any;
    const runTasks = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        parentTaskId: null,
        title: "Plan DAG shape",
        description: "Root planning task",
        role: "backend-developer",
        status: "completed",
        priority: 3,
        ownerAgentId: null,
        dependencyIds: [],
        acceptanceCriteria: [],
        validationTemplates: [],
        createdAt: new Date("2026-03-29T09:30:00.000Z"),
        updatedAt: new Date("2026-03-29T09:30:00.000Z")
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        parentTaskId: null,
        title: "Expose graph contract",
        description: "Depends on plan",
        role: "backend-developer",
        status: "blocked",
        priority: 3,
        ownerAgentId: null,
        dependencyIds: ["11111111-1111-4111-8111-111111111111"],
        acceptanceCriteria: [],
        validationTemplates: [],
        createdAt: new Date("2026-03-29T09:31:00.000Z"),
        updatedAt: new Date("2026-03-29T09:31:00.000Z")
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        parentTaskId: null,
        title: "Render graph",
        description: "Depends on contract",
        role: "frontend-developer",
        status: "blocked",
        priority: 3,
        ownerAgentId: null,
        dependencyIds: ["22222222-2222-4222-8222-222222222222"],
        acceptanceCriteria: [],
        validationTemplates: [],
        createdAt: new Date("2026-03-29T09:32:00.000Z"),
        updatedAt: new Date("2026-03-29T09:32:00.000Z")
      }
    ];

    const taskDag = service.buildTaskDag(runTasks);

    expect(taskDag.rootTaskIds).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(taskDag.blockedTaskIds).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333"
    ]);
    expect(taskDag.nodes.find((node: { taskId: string }) => node.taskId === "22222222-2222-4222-8222-222222222222")).toMatchObject({
      dependentTaskIds: ["33333333-3333-4333-8333-333333333333"],
      blockedByTaskIds: [],
      isBlocked: true
    });
    expect(taskDag.nodes.find((node: { taskId: string }) => node.taskId === "33333333-3333-4333-8333-333333333333")).toMatchObject({
      blockedByTaskIds: ["22222222-2222-4222-8222-222222222222"],
      isBlocked: true
    });
    expect(taskDag.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111->22222222-2222-4222-8222-222222222222",
        isSatisfied: true,
        isBlocking: false
      }),
      expect.objectContaining({
        id: "22222222-2222-4222-8222-222222222222->33333333-3333-4333-8333-333333333333",
        isSatisfied: false,
        isBlocking: true
      })
    ]));
    expect(taskDag.unblockPaths).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: "33333333-3333-4333-8333-333333333333",
        blockingTaskIds: ["22222222-2222-4222-8222-222222222222"],
        pathTaskIds: [
          "22222222-2222-4222-8222-222222222222",
          "33333333-3333-4333-8333-333333333333"
        ],
        pathEdgeIds: ["22222222-2222-4222-8222-222222222222->33333333-3333-4333-8333-333333333333"]
      })
    ]));
  });
});
