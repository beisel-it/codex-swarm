import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HTTPMethods } from "fastify";
import {
  buildPlanMarkdown,
  CodexSessionRuntime,
  CodexServerSupervisor,
  materializePlanArtifact,
  SessionRegistry
} from "@codex-swarm/worker";
import type { ControlPlaneService } from "../src/services/control-plane-service.js";
import { buildApp } from "../src/app.js";
import { getConfig } from "../src/config.js";
import type { LeaderPlanningLoopRequest } from "../src/lib/leader-planning-loop.js";
import { runLeaderPlanningLoop } from "../src/lib/leader-planning-loop.js";
import { runManagedWorkerDispatch } from "../src/lib/worker-dispatch-orchestration.js";
import { HttpError } from "../src/lib/http-error.js";
import { CURRENT_CONTROL_PLANE_SCHEMA_VERSION } from "../src/db/versioning.js";

const ids = {
  project: "10101010-1010-4010-8010-101010101010",
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

const defaultRunContext = {
  kind: "ad_hoc",
  projectId: null,
  projectSlug: null,
  projectName: null,
  projectDescription: null,
  jobId: null,
  jobName: null,
  externalInput: null,
  values: {}
} as const;

const controlPlane = {
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  listRepositories: vi.fn(),
  createRepository: vi.fn(),
  listRuns: vi.fn(),
  listRunsByJobScope: vi.fn(),
  getRun: vi.fn(),
  createRun: vi.fn(),
  updateRun: vi.fn(),
  updateRunStatus: vi.fn(),
  publishRunBranch: vi.fn(),
  createRunPullRequestHandoff: vi.fn(),
  exportRunAudit: vi.fn(),
  getTuiOverview: vi.fn(),
  getTuiRunDrilldown: vi.fn(),
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
  recordRunBudgetCheckpoint: vi.fn(),
  listValidations: vi.fn(),
  createValidation: vi.fn(),
  listArtifacts: vi.fn(),
  createArtifact: vi.fn(),
  getArtifact: vi.fn(),
  attachArtifactStorage: vi.fn(),
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

function coerceNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function readWorkerNodeMetric(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const directValue = coerceNonNegativeNumber(metadata[key]);

    if (directValue !== null) {
      return directValue;
    }

    const nested = metadata[key];

    if (nested && typeof nested === "object") {
      const nestedRecord = nested as Record<string, unknown>;

      for (const nestedKey of ["pending", "tasksPending", "assignments", "active", "count", "value", "cpu", "memory"]) {
        const nestedValue = coerceNonNegativeNumber(nestedRecord[nestedKey]);

        if (nestedValue !== null) {
          return nestedValue;
        }
      }
    }
  }

  return null;
}

function normalizeUtilizationMetric(value: number | null) {
  if (value === null) {
    return Number.POSITIVE_INFINITY;
  }

  if (value <= 1) {
    return value * 100;
  }

  return value;
}

function workerNodeLoadTuple(workerNode: {
  id: string;
  metadata?: Record<string, unknown>;
  lastHeartbeatAt?: Date | null;
}) {
  const metadata = workerNode.metadata ?? {};
  const rawQueueDepth = readWorkerNodeMetric(metadata, ["queueDepth", "queue", "queue_depth"]);
  const rawActiveClaims = readWorkerNodeMetric(metadata, ["activeClaims", "claimedAssignments", "activeAssignments"]);
  const rawCpuUtilization = readWorkerNodeMetric(metadata, ["cpuUtilization", "utilizationCpu", "cpu", "utilization", "load"]);
  const rawMemoryUtilization = readWorkerNodeMetric(metadata, ["memoryUtilization", "utilizationMemory", "memory"]);
  const hasExplicitLoadSignals = [rawQueueDepth, rawActiveClaims, rawCpuUtilization, rawMemoryUtilization]
    .some((value) => value !== null);
  const queueDepth = rawQueueDepth ?? 0;
  const activeClaims = rawActiveClaims ?? 0;
  const cpuUtilization = normalizeUtilizationMetric(rawCpuUtilization);
  const memoryUtilization = normalizeUtilizationMetric(rawMemoryUtilization);
  const heartbeatLagMs = hasExplicitLoadSignals
    ? workerNode.lastHeartbeatAt
      ? Math.max(0, new Date("2026-03-28T12:05:00.000Z").getTime() - workerNode.lastHeartbeatAt.getTime())
      : Number.POSITIVE_INFINITY
    : 0;

  return [
    queueDepth,
    activeClaims,
    cpuUtilization,
    memoryUtilization,
    heartbeatLagMs,
    workerNode.id
  ] as const;
}

function compareWorkerNodesForAssignment(
  left: {
    id: string;
    metadata?: Record<string, unknown>;
    lastHeartbeatAt?: Date | null;
  },
  right: {
    id: string;
    metadata?: Record<string, unknown>;
    lastHeartbeatAt?: Date | null;
  },
  assignment: {
    stickyNodeId?: string | null;
    preferredNodeId?: string | null;
  }
) {
  if (assignment.stickyNodeId) {
    if (left.id === assignment.stickyNodeId && right.id !== assignment.stickyNodeId) {
      return -1;
    }

    if (right.id === assignment.stickyNodeId && left.id !== assignment.stickyNodeId) {
      return 1;
    }
  }

  if (assignment.preferredNodeId) {
    if (left.id === assignment.preferredNodeId && right.id !== assignment.preferredNodeId) {
      return -1;
    }

    if (right.id === assignment.preferredNodeId && left.id !== assignment.preferredNodeId) {
      return 1;
    }
  }

  const leftTuple = workerNodeLoadTuple(left);
  const rightTuple = workerNodeLoadTuple(right);
  const [leftQueueDepth, leftActiveClaims, leftCpu, leftMemory, leftHeartbeatLag, leftId] = leftTuple;
  const [rightQueueDepth, rightActiveClaims, rightCpu, rightMemory, rightHeartbeatLag, rightId] = rightTuple;

  if (leftQueueDepth !== rightQueueDepth) {
    return leftQueueDepth - rightQueueDepth;
  }

  if (leftActiveClaims !== rightActiveClaims) {
    return leftActiveClaims - rightActiveClaims;
  }

  if (leftCpu !== rightCpu) {
    return leftCpu - rightCpu;
  }

  if (leftMemory !== rightMemory) {
    return leftMemory - rightMemory;
  }

  if (leftHeartbeatLag !== rightHeartbeatLag) {
    return leftHeartbeatLag - rightHeartbeatLag;
  }

  if (leftId < rightId) {
    return -1;
  }

  if (leftId > rightId) {
    return 1;
  }

  return 0;
}

class FakeVerticalSliceControlPlane {
  private readonly repositories: any[] = [
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
      providerSync: {
        connectivityStatus: "validated",
        validatedAt: new Date("2026-03-28T00:00:00.000Z"),
        defaultBranch: "main",
        branches: ["main"],
        providerRepoUrl: "https://example.com/codex-swarm.git",
        lastError: null
      },
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
  private readonly messages: any[] = [];
  private readonly artifacts: any[] = [
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      runId: ids.run,
      taskId: ids.taskA,
      kind: "report",
      path: "artifacts/validations/typecheck.json",
      contentType: "application/json",
      url: "http://localhost:3000/api/v1/artifacts/cccccccc-cccc-4ccc-8ccc-cccccccccccc/content",
      sizeBytes: 17,
      sha256: "fe31f5f3446f89f5f47df61053a8dff5cbb6e1cf6398949bf16a6760522b5f82",
      metadata: {
        suite: "typecheck",
        storageKey: "cc/cccccccc-cccc-4ccc-8ccc-cccccccccccc/content.bin"
      },
      createdAt: new Date()
    }
  ];
  private readonly validations: any[] = [
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
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  private readonly approvals: any[] = [
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

  async createRepository(input: any, access?: any) {
    const repository = {
      id: crypto.randomUUID(),
      workspaceId: access?.workspaceId ?? defaultBoundary.workspaceId,
      teamId: access?.teamId ?? defaultBoundary.teamId,
      name: input.name,
      url: input.url,
      provider: input.provider ?? "github",
      defaultBranch: input.defaultBranch ?? "main",
      localPath: input.localPath ?? null,
      trustLevel: input.trustLevel ?? "trusted",
      approvalProfile: input.approvalProfile ?? "standard",
      providerSync: {
        connectivityStatus: "validated",
        validatedAt: new Date("2026-03-28T00:00:00.000Z"),
        defaultBranch: input.defaultBranch ?? "main",
        branches: [input.defaultBranch ?? "main"],
        providerRepoUrl: input.url,
        lastError: null
      },
      createdAt: new Date("2026-03-28T00:00:00.000Z"),
      updatedAt: new Date("2026-03-28T00:00:00.000Z")
    };

    this.repositories.push(repository);
    return repository;
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
      branchPublishApprovalId: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      pullRequestApprovalId: null,
      handoffStatus: "pending",
      completedAt: null,
      context: input.context ?? {
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
      metadata: {
        ...(input.metadata ?? {}),
        runContext: input.context ?? {
          kind: "ad_hoc",
          projectId: null,
          projectSlug: null,
          projectName: null,
          projectDescription: null,
          jobId: null,
          jobName: null,
          externalInput: null,
          values: {}
        }
      },
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

  async updateRun(runId: string, input: any, access?: any) {
    const run = await this.getRun(runId, access);
    run.goal = input.goal ?? run.goal;
    run.branchName = input.branchName === undefined ? run.branchName : input.branchName;
    run.budgetTokens = input.budgetTokens === undefined ? run.budgetTokens : input.budgetTokens;
    run.budgetCostUsd = input.budgetCostUsd === undefined ? run.budgetCostUsd : input.budgetCostUsd;
    run.concurrencyCap = input.concurrencyCap ?? run.concurrencyCap;
    run.policyProfile = input.policyProfile === undefined ? run.policyProfile : input.policyProfile;
    run.context = input.context === undefined ? run.context : input.context;
    run.metadata = input.metadata === undefined
      ? run.metadata
      : {
          ...input.metadata,
          runContext: input.context ?? run.context
        };
    run.updatedAt = new Date();
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
    run.branchPublishApprovalId = input.approvalId ?? run.branchPublishApprovalId;
    run.handoffStatus = "branch_published";
    return run;
  }

  async createRunPullRequestHandoff(runId: string, input: any, access?: any) {
    const run = await this.getRun(runId, access);
    run.publishedBranch = input.headBranch ?? run.publishedBranch ?? run.branchName;
    run.pullRequestUrl = input.url ?? null;
    run.pullRequestNumber = input.number ?? null;
    run.pullRequestStatus = input.url ? input.status : null;
    run.pullRequestApprovalId = input.approvalId ?? run.pullRequestApprovalId;
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
    const taskId = run.tasks.length === 0
      ? ids.taskA
      : run.tasks.length === 1
        ? ids.taskB
        : crypto.randomUUID();
    const task = {
      id: taskId,
      runId: input.runId,
      parentTaskId: input.parentTaskId ?? null,
      title: input.title,
      description: input.description,
      role: input.role,
      status: input.dependencyIds.length > 0 ? "blocked" : "pending",
      priority: input.priority,
      ownerAgentId: input.ownerAgentId ?? null,
      dependencyIds: input.dependencyIds,
      definitionOfDone: input.definitionOfDone,
      acceptanceCriteria: input.acceptanceCriteria,
      validationTemplates: input.validationTemplates ?? [],
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
    task.dependencyIds = input.dependencyIds ?? task.dependencyIds;

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
    workerNode.capabilityLabels = input.capabilityLabels && input.capabilityLabels.length > 0
      ? input.capabilityLabels
      : workerNode.capabilityLabels;
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
      candidate.role !== "tech-lead" && (
      candidate.status === "provisioning"
      || candidate.status === "idle"
      || candidate.status === "busy"
      || candidate.status === "paused"));

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

    const agentId = run.agents.length === 0 ? ids.agent : crypto.randomUUID();
    const agent = {
      id: agentId,
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
      const sessionId = run.sessions.length === 0 ? ids.session : crypto.randomUUID();
      run.sessions.push({
        id: sessionId,
        agentId,
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

  async createAgentSession(agentId: string, input: any, access?: any) {
    const run = [...this.runs.values()].find((candidate) =>
      candidate.agents.some((agent: any) => agent.id === agentId));

    if (!run) {
      throw new HttpError(404, `agent ${agentId} not found`);
    }

    this.assertBoundary(run, access);
    const session = {
      id: crypto.randomUUID(),
      agentId,
      threadId: input.threadId,
      cwd: input.cwd,
      sandbox: input.sandbox,
      approvalPolicy: input.approvalPolicy,
      includePlanTool: input.includePlanTool ?? false,
      workerNodeId: input.workerNodeId ?? null,
      stickyNodeId: input.workerNodeId ?? null,
      placementConstraintLabels: input.placementConstraintLabels ?? [],
      lastHeartbeatAt: null,
      state: "active",
      staleReason: null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    run.sessions.push(session);
    return session;
  }

  async listWorkerDispatchAssignments(query: any = {}) {
    return this.workerDispatchAssignments
      .filter((assignment) => query.runId ? assignment.runId === query.runId : true)
      .filter((assignment) => query.nodeId ? assignment.claimedByNodeId === query.nodeId : true)
      .filter((assignment) => query.state ? assignment.state === query.state : true);
  }

  async createWorkerDispatchAssignment(input: any) {
    const assignmentId = this.workerDispatchAssignments.length === 0 ? ids.dispatch : crypto.randomUUID();
    const assignment = {
      id: assignmentId,
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

  async attachSessionToWorkerDispatchAssignment(assignmentId: string, sessionId: string) {
    const assignment = this.workerDispatchAssignments.find((candidate) => candidate.id === assignmentId);

    if (!assignment) {
      throw new HttpError(404, `worker dispatch assignment ${assignmentId} not found`);
    }

    const run = await this.getRun(assignment.runId);
    const session = run.sessions.find((candidate: any) => candidate.id === sessionId);

    if (!session) {
      throw new HttpError(404, `session ${sessionId} not found`);
    }

    assignment.sessionId = sessionId;
    assignment.updatedAt = new Date("2026-03-28T12:05:30.000Z");
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

    const candidate = this.workerDispatchAssignments.find((assignment) => {
      if (!(assignment.state === "queued" || assignment.state === "retrying")) {
        return false;
      }

      if (assignment.stickyNodeId && assignment.stickyNodeId !== nodeId) {
        return false;
      }

      if (!assignment.requiredCapabilities.every((capability: string) => workerNode.capabilityLabels.includes(capability))) {
        return false;
      }

      const preferredWorkerNode = this.workerNodes
        .filter((candidateNode) => candidateNode.eligibleForScheduling)
        .filter((candidateNode) => (!assignment.stickyNodeId || assignment.stickyNodeId === candidateNode.id))
        .filter((candidateNode) =>
          assignment.requiredCapabilities.every((capability: string) => candidateNode.capabilityLabels.includes(capability)))
        .sort((left, right) => compareWorkerNodesForAssignment(left, right, assignment))[0];

      return !preferredWorkerNode || preferredWorkerNode.id === nodeId;
    });

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
      if (session) {
        session.workerNodeId = input.nodeId;
        session.stickyNodeId = assignment.stickyNodeId ?? input.nodeId;
        session.state = "stopped";
        session.staleReason = null;
      }
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

  async listMessages(runId?: string, access?: any) {
    const messages = runId ? this.messages.filter((message) => message.runId === runId) : this.messages;

    return messages.filter((message) => {
      if (!access) {
        return true;
      }

      const run = this.runs.get(message.runId);
      return run && run.workspaceId === access.workspaceId && run.teamId === access.teamId;
    });
  }

  async createMessage(input?: any, access?: any) {
    if (!input?.runId) {
      throw new HttpError(400, "runId is required");
    }

    const run = await this.getRun(input.runId, access);
    const message = {
      id: crypto.randomUUID(),
      runId: input.runId,
      senderAgentId: input.senderAgentId ?? null,
      recipientAgentId: input.recipientAgentId ?? null,
      kind: input.kind ?? "direct",
      body: input.body,
      createdAt: new Date()
    };

    this.messages.push(message);
    return message;
  }

  async listSessionTranscript(sessionId: string, access?: any) {
    const run = [...this.runs.values()].find((candidate) =>
      candidate.sessions.some((session: any) => session.id === sessionId));

    if (!run) {
      throw new HttpError(404, `session ${sessionId} not found`);
    }

    this.assertBoundary(run, access);
    const session = run.sessions.find((candidate: any) => candidate.id === sessionId);
    return Array.isArray(session.metadata?.transcript) ? session.metadata.transcript : [];
  }

  async appendSessionTranscript(sessionId: string, entries: any[], access?: any) {
    const run = [...this.runs.values()].find((candidate) =>
      candidate.sessions.some((session: any) => session.id === sessionId));

    if (!run) {
      throw new HttpError(404, `session ${sessionId} not found`);
    }

    this.assertBoundary(run, access);
    const session = run.sessions.find((candidate: any) => candidate.id === sessionId);
    const now = new Date();
    const existing = Array.isArray(session.metadata?.transcript) ? session.metadata.transcript : [];
    const appended = entries.map((entry) => ({
      id: crypto.randomUUID(),
      sessionId,
      kind: entry.kind,
      text: entry.text,
      createdAt: entry.createdAt ?? now,
      metadata: entry.metadata ?? {}
    }));
    session.metadata = {
      ...session.metadata,
      transcript: [...existing, ...appended]
    };
    session.updatedAt = now;
    return session.metadata.transcript;
  }

  async listApprovals(runId?: string, access?: any) {
    return (runId ? this.approvals.filter((approval) => approval.runId === runId) : this.approvals)
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
    const now = new Date();
    const approval = {
      id: crypto.randomUUID(),
      runId: input.runId,
      workspaceId: run.workspaceId,
      teamId: run.teamId,
      taskId: input.taskId ?? null,
      kind: input.kind,
      status: "pending",
      requestedPayload: input.requestedPayload,
      resolutionPayload: {},
      requestedBy: input.requestedBy,
      delegation: input.delegation
        ? {
            delegateActorId: input.delegation.delegateActorId,
            delegatedBy: input.requestedBy,
            delegatedAt: now,
            reason: input.delegation.reason ?? null
          }
        : null,
      resolver: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now
    };

    this.approvals.push(approval);
    return approval;
  }

  async resolveApproval(approvalId: string, input: any, access?: any) {
    const approval = await this.getApproval(approvalId, access);
    approval.status = input.status;
    approval.resolver = input.resolver;
    approval.resolutionPayload = {
      ...input.resolutionPayload,
      feedback: input.feedback ?? null
    };
    approval.resolvedAt = new Date();
    approval.updatedAt = new Date();
    return approval;
  }

  async recordRunBudgetCheckpoint(runId: string, input: any, access?: any) {
    const run = await this.getRun(runId, access);
    const budgetUsage = run.metadata?.budgetUsage ?? {};
    const tokensUsedTotal = (budgetUsage.tokensUsedTotal ?? 0) + (input.tokensUsedDelta ?? 0);
    const costUsdTotal = (budgetUsage.costUsdTotal ?? 0) + (input.costUsdDelta ?? 0);
    const exceeded = [];

    if (run.budgetTokens !== null && tokensUsedTotal >= run.budgetTokens) {
      exceeded.push("tokens");
    }

    if (run.budgetCostUsd !== null && costUsdTotal >= run.budgetCostUsd) {
      exceeded.push("cost");
    }

    const approvedException = this.approvals.find((approval) =>
      approval.runId === runId
      && approval.kind === "policy_exception"
      && approval.status === "approved"
      && approval.requestedPayload?.policyDecision?.policyKey === "run_budget"
      && approval.requestedPayload?.policyDecision?.targetId === runId);
    const pendingException = this.approvals.find((approval) =>
      approval.runId === runId
      && approval.kind === "policy_exception"
      && approval.status === "pending"
      && approval.requestedPayload?.policyDecision?.policyKey === "run_budget"
      && approval.requestedPayload?.policyDecision?.targetId === runId);

    let decision = "within_budget";
    let continueAllowed = true;
    let approvalId = null;

    if (exceeded.length > 0) {
      if (approvedException) {
        decision = "approved_exception";
        approvalId = approvedException.id;
      } else {
        decision = "awaiting_policy_exception";
        continueAllowed = false;
        const approval = pendingException ?? await this.createApproval({
          runId,
          kind: "policy_exception",
          requestedBy: "system:budget-guard",
          requestedPayload: {
            summary: "Run execution exceeded its configured budget and requires a policy exception review to continue.",
            policyDecision: {
              policyKey: "run_budget",
              trigger: "budget_cap_exceeded",
              targetType: "run",
              targetId: runId,
              requestedAction: "continue_run",
              decision: "block_pending_approval",
              policyProfile: run.policyProfile,
              checkpointSource: input.source,
              observed: {
                totalTokens: tokensUsedTotal,
                totalCostUsd: costUsdTotal
              },
              threshold: {
                budgetTokens: run.budgetTokens,
                budgetCostUsd: run.budgetCostUsd
              }
            },
            enforcement: {
              onApproval: "continue_run",
              onRejection: "remain_blocked"
            }
          }
        }, access);
        approvalId = approval.id;
        run.status = "awaiting_approval";
      }
    }

    run.metadata = {
      ...run.metadata,
      budgetUsage: {
        tokensUsedTotal,
        costUsdTotal,
        lastCheckpointAt: new Date().toISOString(),
        lastCheckpointSource: input.source
      },
      budgetGuard: {
        decision,
        continueAllowed,
        exceeded,
        approvalId,
        updatedAt: new Date().toISOString()
      }
    };

    return {
      runId,
      continueAllowed,
      decision,
      tokensUsedTotal,
      costUsdTotal,
      exceeded,
      approvalId,
      updatedAt: new Date()
    };
  }

  async listValidations(_query?: any, _access?: any) {
    return this.validations
      .filter((validation) => _query?.runId ? validation.runId === _query.runId : true)
      .filter((validation) => _query?.taskId ? validation.taskId === _query.taskId : true)
      .map((validation) => ({
        ...validation,
        artifacts: validation.artifactIds
          .map((artifactId: string) => this.artifacts.find((artifact) => artifact.id === artifactId))
          .filter(Boolean)
      }));
  }

  async createValidation(input: any, access?: any) {
    const run = await this.getRun(input.runId, access);
    const task = input.taskId
      ? run.tasks.find((candidate: any) => candidate.id === input.taskId) ?? null
      : null;
    const template = input.templateName
      ? task?.validationTemplates?.find((candidate: any) => candidate.name === input.templateName) ?? null
      : null;
    const validation = {
      id: crypto.randomUUID(),
      runId: input.runId,
      taskId: input.taskId ?? null,
      name: input.name ?? template?.name,
      status: input.status,
      command: input.command ?? template?.command,
      summary: input.summary ?? template?.summary ?? null,
      artifactPath: input.artifactPath ?? template?.artifactPath ?? null,
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

    this.validations.push({
      id: validation.id,
      runId: validation.runId,
      taskId: validation.taskId,
      name: validation.name,
      status: validation.status,
      command: validation.command,
      summary: validation.summary,
      artifactPath: validation.artifactPath,
      artifactIds: validation.artifactIds,
      createdAt: validation.createdAt,
      updatedAt: validation.updatedAt
    });

    return validation;
  }

  async listArtifacts(_runId?: string, _access?: any) {
    return _runId
      ? this.artifacts.filter((artifact) => artifact.runId === _runId)
      : this.artifacts;
  }

  async createArtifact(input: any, access?: any) {
    await this.getRun(input.runId, access);
    const artifact = {
      id: crypto.randomUUID(),
      runId: input.runId,
      taskId: input.taskId ?? null,
      kind: input.kind,
      path: input.path,
      contentType: input.contentType,
      url: null,
      sizeBytes: null,
      sha256: null,
      metadata: input.metadata ?? {},
      createdAt: new Date()
    };

    this.artifacts.push(artifact);
    return artifact;
  }

  async getArtifact(artifactId: string, access?: any) {
    const artifact = this.artifacts.find((candidate) => candidate.id === artifactId);

    if (!artifact) {
      throw new HttpError(404, `artifact ${artifactId} not found`);
    }

    await this.getRun(artifact.runId, access);
    return artifact;
  }

  async attachArtifactStorage(artifactId: string, storage: any) {
    const artifact = this.artifacts.find((candidate) => candidate.id === artifactId);

    if (!artifact) {
      throw new HttpError(404, `artifact ${artifactId} not found`);
    }

    artifact.url = storage.url;
    artifact.sizeBytes = storage.sizeBytes;
    artifact.sha256 = storage.sha256;
    artifact.metadata = {
      ...artifact.metadata,
      storageKey: storage.storageKey,
      url: storage.url,
      sizeBytes: storage.sizeBytes,
      sha256: storage.sha256
    };

    return artifact;
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
    expect(response.json()).toMatchObject({
      status: "ok",
      versions: {
        schema: CURRENT_CONTROL_PLANE_SCHEMA_VERSION,
        config: "1"
      }
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

  it("serves the TUI overview aggregate from the control plane", async () => {
    controlPlane.getTuiOverview.mockResolvedValue({
      generatedAt: new Date("2026-03-29T08:00:00.000Z"),
      summary: {
        repositories: 1,
        runsTotal: 1,
        runsActive: 1,
        approvalsPending: 1,
        validationsFailed: 0,
        tasksBlocked: 1,
        workerNodesOnline: 1,
        workerNodesDegraded: 0,
        workerNodesOffline: 0,
        dispatchQueued: 1,
        dispatchRetrying: 0
      },
      runs: [
        {
          run: {
            id: ids.run,
            repositoryId: ids.repository,
            workspaceId: defaultBoundary.workspaceId,
            teamId: defaultBoundary.teamId,
            goal: "Ship the TUI drilldown aggregate",
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
            metadata: {},
            createdBy: "backend-dev",
            createdAt: new Date("2026-03-29T07:30:00.000Z"),
            updatedAt: new Date("2026-03-29T07:45:00.000Z")
          },
          repository: {
            id: ids.repository,
            name: "codex-swarm",
            provider: "github",
            trustLevel: "trusted",
            approvalProfile: "standard"
          },
          taskCounts: {
            pending: 0,
            blocked: 1,
            inProgress: 1,
            awaitingReview: 0,
            completed: 0,
            failed: 0,
            cancelled: 0
          },
          approvalCounts: {
            pending: 1,
            approved: 0,
            rejected: 0
          },
          validationCounts: {
            pending: 0,
            passed: 0,
            failed: 0
          },
          dispatchCounts: {
            queued: 1,
            claimed: 0,
            completed: 0,
            retrying: 0,
            failed: 0
          },
          activeSessionCount: 1,
          workerNodeIds: [ids.workerNode],
          blockedTaskIds: [ids.taskB],
          pendingApprovalIds: [ids.agent],
          failedValidationIds: []
        }
      ],
      fleet: {
        workerNodes: [],
        dispatchAssignments: []
      },
      alerts: [
        {
          kind: "task_blocked",
          severity: "warning",
          runId: ids.run,
          entityId: ids.taskB,
          summary: "Task is blocked"
        }
      ]
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tui/overview",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(controlPlane.getTuiOverview).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));
    expect(response.json()).toMatchObject({
      summary: {
        approvalsPending: 1,
        tasksBlocked: 1
      },
      runs: [
        {
          run: {
            id: ids.run
          },
          repository: {
            name: "codex-swarm"
          }
        }
      ],
      alerts: [
        {
          kind: "task_blocked",
          entityId: ids.taskB
        }
      ]
    });

    await app.close();
  });

  it("serves the TUI run drilldown aggregate from the control plane", async () => {
    controlPlane.getTuiRunDrilldown.mockResolvedValue({
      generatedAt: new Date("2026-03-29T08:05:00.000Z"),
      repository: {
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
        providerSync: {
          connectivityStatus: "validated",
          validatedAt: new Date("2026-03-29T07:00:00.000Z"),
          defaultBranch: "main",
          branches: ["main"],
          providerRepoUrl: "https://example.com/codex-swarm",
          lastError: null
        },
        createdAt: new Date("2026-03-29T07:00:00.000Z"),
        updatedAt: new Date("2026-03-29T07:00:00.000Z")
      },
      run: {
        id: ids.run,
        repositoryId: ids.repository,
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId,
        goal: "Ship the TUI drilldown aggregate",
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
        metadata: {},
        createdBy: "backend-dev",
        createdAt: new Date("2026-03-29T07:30:00.000Z"),
        updatedAt: new Date("2026-03-29T08:00:00.000Z"),
        tasks: [],
        agents: [],
        sessions: []
      },
      approvals: [],
      validations: [],
      artifacts: [],
      workerNodes: [],
      dispatchAssignments: [],
      events: []
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/tui/runs/${ids.run}`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(controlPlane.getTuiRunDrilldown).toHaveBeenCalledWith(
      ids.run,
      expect.objectContaining({
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      })
    );
    expect(response.json()).toMatchObject({
      repository: {
        id: ids.repository
      },
      run: {
        id: ids.run,
        status: "awaiting_approval"
      }
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

  it("returns grouped project and ad-hoc runs when requested", async () => {
    controlPlane.listRunsByJobScope.mockResolvedValueOnce({
      projectJobs: [
        {
          id: "run-project-1",
          goal: "Ship projects",
          jobScope: {
            kind: "project",
            projectId: "550e8400-e29b-41d4-a716-446655440010",
            repositoryProjectId: "550e8400-e29b-41d4-a716-446655440010",
            reason: "run_assigned"
          }
        }
      ],
      adHocJobs: [
        {
          id: "run-ad-hoc-1",
          goal: "Legacy job",
          jobScope: {
            kind: "ad_hoc",
            projectId: null,
            repositoryProjectId: null,
            reason: "repository_unassigned"
          }
        }
      ]
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/runs?view=job_scope",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      projectJobs: [
        {
          id: "run-project-1",
          goal: "Ship projects",
          jobScope: {
            kind: "project",
            projectId: "550e8400-e29b-41d4-a716-446655440010",
            repositoryProjectId: "550e8400-e29b-41d4-a716-446655440010",
            reason: "run_assigned"
          }
        }
      ],
      adHocJobs: [
        {
          id: "run-ad-hoc-1",
          goal: "Legacy job",
          jobScope: {
            kind: "ad_hoc",
            projectId: null,
            repositoryProjectId: null,
            reason: "repository_unassigned"
          }
        }
      ]
    });
    expect(controlPlane.listRunsByJobScope).toHaveBeenCalledWith(undefined, expect.objectContaining({
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
        "x-codex-roles": "reviewer,workspace_admin",
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
      roles: ["reviewer", "workspace_admin"],
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
    controlPlane.listRunsByJobScope.mockRejectedValueOnce(bootstrapError);

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
    const groupedRunResponse = await app.inject({
      method: "GET",
      url: "/api/v1/runs?view=job_scope",
      headers
    });

    expect(repositoryResponse.statusCode).toBe(200);
    expect(repositoryResponse.headers["x-codex-swarm-degraded"]).toBe("database-unavailable");
    expect(repositoryResponse.json()).toEqual([]);

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json()).toEqual([]);
    expect(groupedRunResponse.statusCode).toBe(200);
    expect(groupedRunResponse.json()).toEqual({
      projectJobs: [],
      adHocJobs: []
    });

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
      approvalProfile: "standard",
      providerSync: {
        connectivityStatus: "validated",
        validatedAt: "2026-03-28T00:00:00.000Z",
        defaultBranch: "main",
        branches: ["main"],
        providerRepoUrl: "https://github.com/example/codex-swarm",
        lastError: null
      }
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
      approvalProfile: "standard",
      providerSync: {
        connectivityStatus: "validated",
        defaultBranch: "main",
        branches: ["main"]
      }
    });
    expect(controlPlane.createRepository).toHaveBeenCalledWith({
      name: "codex-swarm",
      url: "https://github.com/example/codex-swarm",
      provider: "github",
      trustLevel: "trusted"
    }, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    await app.close();
  });

  it("supports project CRUD routes", async () => {
    controlPlane.listProjects.mockResolvedValueOnce([
      {
        id: ids.project,
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId,
        name: "Platform Refresh",
        description: "Main delivery stream",
        repositoryCount: 1,
        runCount: 2,
        latestRunAt: "2026-03-28T12:00:00.000Z",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:00:00.000Z"
      }
    ]);
    controlPlane.createProject.mockResolvedValueOnce({
      id: ids.project,
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId,
      name: "Platform Refresh",
      description: "Main delivery stream",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T10:00:00.000Z"
    });
    controlPlane.getProject.mockResolvedValueOnce({
      id: ids.project,
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId,
      name: "Platform Refresh",
      description: "Main delivery stream",
      repositoryCount: 1,
      runCount: 1,
      latestRunAt: "2026-03-28T12:00:00.000Z",
      repositoryAssignments: [],
      runAssignments: [],
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T10:00:00.000Z"
    });
    controlPlane.updateProject.mockResolvedValueOnce({
      id: ids.project,
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId,
      name: "Platform Refresh",
      description: "Updated scope",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T11:00:00.000Z"
    });
    controlPlane.deleteProject.mockResolvedValueOnce(undefined);

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const headers = {
      authorization: "Bearer codex-swarm-dev-token"
    };

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers
    });
    expect(listResponse.statusCode).toBe(200);
    expect(controlPlane.listProjects).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers,
      payload: {
        name: "Platform Refresh",
        description: "Main delivery stream"
      }
    });
    expect(createResponse.statusCode).toBe(201);
    expect(controlPlane.createProject).toHaveBeenCalledWith({
      name: "Platform Refresh",
      description: "Main delivery stream"
    }, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${ids.project}`,
      headers
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(controlPlane.getProject).toHaveBeenCalledWith(ids.project, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${ids.project}`,
      headers,
      payload: {
        description: "Updated scope"
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(controlPlane.updateProject).toHaveBeenCalledWith(ids.project, {
      description: "Updated scope"
    }, expect.objectContaining({
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId
    }));

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${ids.project}`,
      headers
    });
    expect(deleteResponse.statusCode).toBe(204);
    expect(controlPlane.deleteProject).toHaveBeenCalledWith(ids.project, expect.objectContaining({
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
      branchPublishApprovalId: "99999999-9999-4999-8999-999999999999",
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      pullRequestApprovalId: null,
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
        approvalId: "99999999-9999-4999-8999-999999999999",
        publishedBy: "tech-lead"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      publishedBranch: "runs/m3-git-provider",
      branchPublishApprovalId: "99999999-9999-4999-8999-999999999999",
      handoffStatus: "branch_published"
    });
    expect(controlPlane.publishRunBranch).toHaveBeenCalledWith(ids.run, {
      branchName: "runs/m3-git-provider",
      approvalId: "99999999-9999-4999-8999-999999999999",
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
      branchPublishApprovalId: null,
      pullRequestUrl: "https://github.com/example/codex-swarm/pull/42",
      pullRequestNumber: 42,
      pullRequestStatus: "open",
      pullRequestApprovalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
        approvalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
      pullRequestApprovalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      handoffStatus: "pr_open"
    });
    expect(controlPlane.createRunPullRequestHandoff).toHaveBeenCalledWith(ids.run, {
      title: "M3 Git provider handoff",
      body: "Validation evidence attached.",
      createdBy: "tech-lead",
      approvalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
      usage: {
        repositories: 0,
        runsTotal: 0,
        workerNodesOnline: 0
      },
      cost: {
        runsWithBudget: 0,
        totalBudgetedRunCostUsd: 0
      },
      performance: {
        completedRunsMeasured: 0,
        runDurationMs: {
          p95: 0
        }
      },
      slo: {
        objectives: {
          pendingApprovalMaxMinutes: 60,
          activeRunMaxMinutes: 240,
          taskQueueMax: 100,
          supportResponseHours: 8
        },
        support: {
          hoursUtc: "Mon-Fri 08:00-18:00 UTC"
        },
        status: {
          withinEnvelope: true
        }
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
      deletedWorktrees: 1,
      worktreeDeleteFailures: 0,
      items: [
        {
          sessionId: ids.session,
          runId: ids.run,
          agentId: ids.agent,
          worktreePath: ".swarm/worktrees/codex-swarm/run-001/worker-001",
          action: "mark_stale",
          reason: "missing_worktree",
          worktreeDeleted: true,
          worktreeDeleteReason: null
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
        existingWorktreePaths: [],
        deleteStaleWorktrees: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      scannedSessions: 2,
      markedStale: 1,
      deletedWorktrees: 1
    });
    expect(controlPlane.runCleanupJob).toHaveBeenCalledWith({
      runId: ids.run,
      staleAfterMinutes: 20,
      existingWorktreePaths: [],
      deleteStaleWorktrees: true
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
        branchPublishApprovalId: null,
        pullRequestUrl: null,
        pullRequestNumber: null,
        pullRequestStatus: null,
        pullRequestApprovalId: null,
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
        roles: ["platform-admin", "workspace_admin"],
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
      {
        principal: "dev-user",
        actorId: "dev-user",
        actorType: "user",
        email: null,
        role: "platform-admin",
        roles: ["platform-admin", "workspace_admin"],
        workspaceId: "default-workspace",
        workspaceName: "Default Workspace",
        teamId: "codex-swarm",
        teamName: "Codex Swarm",
        policyProfile: "standard"
      }
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
      usage: {
        repositories: 3,
        runsTotal: 10,
        runsActive: 4,
        runsCompleted: 6,
        tasksTotal: 21,
        approvalsTotal: 5,
        validationsTotal: 8,
        artifactsTotal: 9,
        workerNodesOnline: 2,
        workerNodesDraining: 1
      },
      cost: {
        runsWithBudget: 6,
        totalBudgetedRunCostUsd: 72.5,
        averageBudgetedRunCostUsd: 12.08,
        maxBudgetedRunCostUsd: 20
      },
      performance: {
        completedRunsMeasured: 6,
        approvalsMeasured: 4,
        validationsMeasured: 7,
        runDurationMs: {
          p50: 120000,
          p95: 480000,
          max: 600000
        },
        approvalResolutionMs: {
          p50: 60000,
          p95: 180000,
          max: 240000
        },
        validationTurnaroundMs: {
          p50: 90000,
          p95: 240000,
          max: 360000
        }
      },
      slo: {
        objectives: {
          pendingApprovalMaxMinutes: 60,
          activeRunMaxMinutes: 240,
          taskQueueMax: 100,
          supportResponseHours: 8
        },
        support: {
          hoursUtc: "Mon-Fri 08:00-18:00 UTC",
          escalation: ["page platform admin"]
        },
        status: {
          pendingApprovalsWithinTarget: true,
          activeRunsWithinTarget: true,
          queueDepthWithinTarget: true,
          withinEnvelope: true
        },
        measurements: {
          oldestPendingApprovalAgeMinutes: 12,
          oldestActiveRunAgeMinutes: 45,
          pendingApprovals: 1,
          activeRuns: 4,
          tasksPending: 7
        }
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
      usage: {
        runsTotal: 10,
        workerNodesDraining: 1
      },
      cost: {
        totalBudgetedRunCostUsd: 72.5
      },
      performance: {
        runDurationMs: {
          p95: 480000
        }
      },
      slo: {
        status: {
          withinEnvelope: true
        }
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

  it("creates approvals with delegated reviewer provenance", async () => {
    controlPlane.createApproval.mockResolvedValueOnce({
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
      requestedBy: "dev-user",
      delegation: {
        delegateActorId: "reviewer-2",
        delegatedBy: "dev-user",
        delegatedAt: new Date("2026-03-28T12:00:00.000Z"),
        reason: "covering primary reviewer"
      },
      resolver: null,
      resolvedAt: null,
      createdAt: new Date("2026-03-28T12:00:00.000Z"),
      updatedAt: new Date("2026-03-28T12:00:00.000Z")
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/approvals",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        runId: ids.run,
        taskId: ids.taskA,
        kind: "plan",
        requestedBy: "ignored-client-value",
        requestedPayload: {
          summary: "Review the execution plan"
        },
        delegation: {
          delegateActorId: "reviewer-2",
          reason: "covering primary reviewer"
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      runId: ids.run,
      taskId: ids.taskA,
      kind: "plan",
      requestedBy: "dev-user",
      delegation: {
        delegateActorId: "reviewer-2",
        delegatedBy: "dev-user",
        reason: "covering primary reviewer"
      }
    });
    expect(controlPlane.createApproval).toHaveBeenCalledWith(
      {
        runId: ids.run,
        taskId: ids.taskA,
        kind: "plan",
        requestedBy: "dev-user",
        requestedPayload: {
          summary: "Review the execution plan"
        },
        delegation: {
          delegateActorId: "reviewer-2",
          reason: "covering primary reviewer"
        }
      },
      expect.objectContaining({
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      })
    );

    await app.close();
  });

  it("rejects generic policy-exception approval requests without a structured policy decision", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/approvals",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        runId: ids.run,
        kind: "policy_exception",
        requestedBy: "ignored-client-value",
        requestedPayload: {
          reason: "budget_cap_exceeded"
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(controlPlane.createApproval).not.toHaveBeenCalled();

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
        roles: ["workspace_admin"],
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
        roles: ["platform-admin", "workspace_admin"],
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
      secrets: {
        sourceMode: "environment",
        provider: null,
        remoteCredentialEnvNames: [],
        allowedRepositoryTrustLevels: ["trusted"],
        sensitivePolicyProfiles: [],
        credentialDistribution: [
          "control-plane issues short-lived credentials",
          "workers receive only task-scoped environment variables",
          "sensitive repositories require policy-driven secret access"
        ],
        policyDrivenAccess: false
      },
      limit: 50,
      access: {
        principal: "dev-user",
        actorId: "dev-user",
        actorType: "user",
        email: null,
        role: "platform-admin",
        roles: ["platform-admin", "workspace_admin"],
        workspaceId: defaultBoundary.workspaceId,
        workspaceName: defaultBoundary.workspaceName,
        teamId: defaultBoundary.teamId,
        teamName: defaultBoundary.teamName,
        policyProfile: "standard"
      }
    });

    await app.close();
  });

  it("rejects admin reads for non-admin roles with deterministic details", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/governance-report",
      headers: {
        authorization: "Bearer codex-swarm-dev-token",
        "x-codex-role": "member",
        "x-codex-roles": "member"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "actor role is not permitted to perform admin.read",
      details: {
        action: "admin.read",
        roles: ["member"],
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      }
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

  it("accepts template-based validation requests without inline command fields", async () => {
    controlPlane.createValidation.mockResolvedValueOnce({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      runId: ids.run,
      taskId: ids.taskA,
      name: "unit",
      status: "pending",
      command: "pnpm test --filter api",
      summary: "Run the API test slice",
      artifactPath: ".swarm/validations/unit.json",
      artifactIds: [],
      artifacts: [],
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
        templateName: "unit"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(controlPlane.createValidation).toHaveBeenCalledWith({
      runId: ids.run,
      taskId: ids.taskA,
      templateName: "unit",
      status: "pending",
      artifactIds: []
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

  it("stores and returns per-session transcript entries", async () => {
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
        goal: "Persist transcript entries",
        metadata: {}
      }
    });

    expect(createRunResponse.statusCode).toBe(201);

    const createAgentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers,
      payload: {
        runId: ids.run,
        name: "transcript-agent",
        role: "backend-developer",
        status: "idle",
        session: {
          threadId: "thread-transcript",
          cwd: "/tmp/codex-swarm-transcript",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          metadata: {}
        }
      }
    });

    expect(createAgentResponse.statusCode).toBe(201);

    const appendResponse = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${ids.session}/transcript`,
      headers,
      payload: {
        entries: [
          {
            kind: "prompt",
            text: "Create the landing page"
          },
          {
            kind: "response",
            text: "Landing page draft is ready.",
            metadata: {
              source: "worker-dispatch"
            }
          }
        ]
      }
    });

    expect(appendResponse.statusCode).toBe(201);
    expect(appendResponse.json()).toEqual([
      expect.objectContaining({
        sessionId: ids.session,
        kind: "prompt",
        text: "Create the landing page"
      }),
      expect.objectContaining({
        sessionId: ids.session,
        kind: "response",
        text: "Landing page draft is ready.",
        metadata: {
          source: "worker-dispatch"
        }
      })
    ]);

    const transcriptResponse = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${ids.session}/transcript`,
      headers
    });

    expect(transcriptResponse.statusCode).toBe(200);
    expect(transcriptResponse.json()).toHaveLength(2);
    expect(transcriptResponse.json()[1]).toMatchObject({
      kind: "response",
      text: "Landing page draft is ready."
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
        definitionOfDone: ["task record persists a reusable definition of done"],
        acceptanceCriteria: ["task is saved"]
      }
    });

    expect(createTaskAResponse.statusCode).toBe(201);
    expect(createTaskAResponse.json()).toMatchObject({
      status: "pending",
      definitionOfDone: ["task record persists a reusable definition of done"]
    });

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
        definitionOfDone: ["dependency relationship stays intact while task waits"],
        acceptanceCriteria: ["task unblocks when dependency completes"]
      }
    });

    expect(createTaskBResponse.statusCode).toBe(201);
    expect(createTaskBResponse.json()).toMatchObject({
      status: "blocked",
      definitionOfDone: ["dependency relationship stays intact while task waits"]
    });

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

  it("proves a hello-world control-plane launch and continuation path with persisted thread reuse", async () => {
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
        goal: "Launch a hello-world leader session and continue it",
        concurrencyCap: 1,
        metadata: {
          scenario: "hello-world"
        }
      }
    });

    expect(createRunResponse.statusCode).toBe(201);

    const initialRegistry = new SessionRegistry();
    initialRegistry.seed({
      sessionId: ids.session,
      runId: ids.run,
      agentId: ids.agent,
      worktreePath: process.cwd()
    });

    const launchSupervisor = new CodexServerSupervisor({
      config: {
        cwd: process.cwd(),
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        includePlanTool: true
      },
      command: [
        process.execPath,
        "--input-type=module",
        "-e",
        "setInterval(() => {}, 1000);"
      ]
    });
    const launchRuntime = new CodexSessionRuntime({
      registry: initialRegistry,
      supervisor: launchSupervisor,
      executeTool: async (request) => ({
        threadId: "thread-hello-world",
        output: request.tool === "codex" ? "leader-started" : "leader-continued"
      }),
      now: () => new Date("2026-03-29T12:00:00.000Z")
    });

    const launchResult = await launchRuntime.startSession(ids.session, "Create a hello-world leader session");
    expect(launchResult.session.threadId).toBe("thread-hello-world");

    const createLeaderResponse = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers,
      payload: {
        runId: ids.run,
        name: "leader",
        role: "tech-lead",
        status: "idle",
        session: {
          threadId: launchResult.session.threadId,
          cwd: process.cwd(),
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: true,
          metadata: {
            scenario: "hello-world"
          }
        }
      }
    });

    expect(createLeaderResponse.statusCode).toBe(201);

    const persistedRunResponse = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${ids.run}`,
      headers
    });

    expect(persistedRunResponse.statusCode).toBe(200);
    expect(persistedRunResponse.json()).toMatchObject({
      id: ids.run,
      sessions: [
        {
          id: ids.session,
          threadId: "thread-hello-world",
          agentId: ids.agent
        }
      ]
    });

    const rehydratedRegistry = new SessionRegistry();
    rehydratedRegistry.hydrate([
      {
        sessionId: ids.session,
        runId: ids.run,
        agentId: ids.agent,
        worktreePath: process.cwd(),
        state: "active",
        threadId: "thread-hello-world",
        staleReason: null,
        lastHeartbeatAt: new Date("2026-03-29T12:00:00.000Z"),
        createdAt: new Date("2026-03-29T12:00:00.000Z"),
        updatedAt: new Date("2026-03-29T12:00:00.000Z")
      }
    ]);

    const continueSupervisor = new CodexServerSupervisor({
      config: {
        cwd: process.cwd(),
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        includePlanTool: true
      },
      command: [
        process.execPath,
        "--input-type=module",
        "-e",
        "setInterval(() => {}, 1000);"
      ]
    });
    const continueRuntime = new CodexSessionRuntime({
      registry: rehydratedRegistry,
      supervisor: continueSupervisor,
      executeTool: async () => ({
        threadId: "thread-hello-world",
        output: "leader-continued"
      }),
      now: () => new Date("2026-03-29T12:05:00.000Z")
    });

    const continueResult = await continueRuntime.continueSession(ids.session, "Continue the hello-world leader session");
    expect(continueResult.request.tool).toBe("codex-reply");
    if (continueResult.request.tool !== "codex-reply") {
      throw new Error("expected a codex-reply request");
    }
    expect(continueResult.request.input.threadId).toBe("thread-hello-world");
    expect(continueResult.session.lastHeartbeatAt?.toISOString()).toBe("2026-03-29T12:05:00.000Z");

    const stopped = await continueRuntime.stopSession(ids.session);
    expect(stopped.session.state).toBe("stopped");

    await launchRuntime.stopSession(ids.session);
    await app.close();
  });

  it("persists a generated .swarm/plan.md into run state and artifact history", async () => {
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
    const cwd = await mkdtemp(join(tmpdir(), "codex-swarm-plan-proof-"));

    try {
      const createRunResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Generate and persist a leader plan",
          metadata: {
            scenario: "plan-proof"
          }
        }
      });

      expect(createRunResponse.statusCode).toBe(201);

      const createTaskAResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Define API scope",
          description: "Establish the first backend deliverable",
          role: "backend-developer",
          priority: 2,
          dependencyIds: [],
          definitionOfDone: ["control-plane route exists and is callable"],
          acceptanceCriteria: ["control-plane route exists"]
        }
      });

      const createTaskBResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Render review board",
          description: "Expose plan progress to reviewers",
          role: "frontend-developer",
          priority: 3,
          dependencyIds: [ids.taskA],
          definitionOfDone: ["board renders the task graph for reviewers"],
          acceptanceCriteria: ["board shows the task graph"]
        }
      });

      expect(createTaskAResponse.statusCode).toBe(201);
      expect(createTaskBResponse.statusCode).toBe(201);

      const markdown = buildPlanMarkdown({
        goal: "Generate and persist a leader plan",
        summary: "Leader emits the first durable plan artifact",
        tasks: [
          {
            title: "Define API scope",
            role: "backend-developer",
            description: "Establish the first backend deliverable",
            definitionOfDone: ["control-plane route exists and is callable"],
            acceptanceCriteria: ["control-plane route exists"]
          },
          {
            title: "Render review board",
            role: "frontend-developer",
            description: "Expose plan progress to reviewers",
            definitionOfDone: ["board renders the task graph for reviewers"],
            acceptanceCriteria: ["board shows the task graph"]
          }
        ]
      });

      const planArtifact = await materializePlanArtifact({
        cwd,
        plan: {
          goal: "Generate and persist a leader plan",
          summary: "Leader emits the first durable plan artifact",
          tasks: [
            {
              title: "Define API scope",
              role: "backend-developer",
              description: "Establish the first backend deliverable",
              definitionOfDone: ["control-plane route exists and is callable"],
              acceptanceCriteria: ["control-plane route exists"]
            },
            {
              title: "Render review board",
              role: "frontend-developer",
              description: "Expose plan progress to reviewers",
              definitionOfDone: ["board renders the task graph for reviewers"],
              acceptanceCriteria: ["board shows the task graph"]
            }
          ]
        }
      });

      expect(planArtifact.path).toBe(join(cwd, ".swarm/plan.md"));
      expect(await readFile(planArtifact.path, "utf8")).toBe(markdown);
      expect(markdown).toContain("Definition of Done:");
      expect(markdown).toContain("control-plane route exists and is callable");

      const createArtifactResponse = await app.inject({
        method: "POST",
        url: "/api/v1/artifacts",
        headers,
        payload: {
          runId: ids.run,
          kind: "plan",
          path: planArtifact.path,
          contentType: "text/markdown",
          metadata: {
            relativePath: planArtifact.relativePath,
            source: "leader-plan"
          }
        }
      });

      expect(createArtifactResponse.statusCode).toBe(201);
      expect(createArtifactResponse.json()).toMatchObject({
        runId: ids.run,
        kind: "plan",
        path: planArtifact.path,
        contentType: "text/markdown",
        url: expect.stringContaining("/api/v1/artifacts/"),
        sizeBytes: markdown.length,
        sha256: expect.any(String),
        metadata: {
          relativePath: ".swarm/plan.md",
          source: "leader-plan",
          storageKey: expect.any(String)
        }
      });

      const updateRunResponse = await app.inject({
        method: "PATCH",
        url: `/api/v1/runs/${ids.run}/status`,
        headers,
        payload: {
          status: "planning",
          planArtifactPath: planArtifact.path
        }
      });

      expect(updateRunResponse.statusCode).toBe(200);

      const getRunResponse = await app.inject({
        method: "GET",
        url: `/api/v1/runs/${ids.run}`,
        headers
      });
      const listArtifactsResponse = await app.inject({
        method: "GET",
        url: `/api/v1/artifacts?runId=${ids.run}`,
        headers
      });

      expect(getRunResponse.statusCode).toBe(200);
      expect(getRunResponse.json()).toMatchObject({
        id: ids.run,
        status: "planning",
        planArtifactPath: planArtifact.path
      });
      expect(listArtifactsResponse.statusCode).toBe(200);
      expect(listArtifactsResponse.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          runId: ids.run,
          kind: "plan",
          path: planArtifact.path,
          contentType: "text/markdown",
          metadata: expect.objectContaining({
            relativePath: ".swarm/plan.md",
            source: "leader-plan",
            storageKey: expect.any(String)
          })
        })
      ]));

      const createdArtifact = createArtifactResponse.json();
      const artifactContentResponse = await app.inject({
        method: "GET",
        url: `/api/v1/artifacts/${createdArtifact.id}/content`,
        headers
      });

      expect(artifactContentResponse.statusCode).toBe(200);
      expect(artifactContentResponse.headers["content-type"]).toContain("text/markdown");
      expect(artifactContentResponse.body).toBe(markdown);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await app.close();
    }
  });

  it("stores inline artifact content without relying on a local file path", async () => {
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

    try {
      const createRunResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Persist inline artifact",
          metadata: {}
        }
      });

      expect(createRunResponse.statusCode).toBe(201);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/artifacts",
        headers,
        payload: {
          runId: ids.run,
          kind: "report",
          path: "artifacts/report.json",
          contentType: "application/json",
          contentBase64: Buffer.from("{\"ok\":true}").toString("base64"),
          metadata: {
            source: "inline-test"
          }
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        kind: "report",
        url: expect.stringContaining("/api/v1/artifacts/"),
        sizeBytes: 11,
        metadata: {
          source: "inline-test",
          storageKey: expect.any(String)
        }
      });
    } finally {
      await app.close();
    }
  });

  it("stores worker outcome artifact content from resolvedArtifactPath metadata", async () => {
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

    const tempFile = await mkdtemp(join(tmpdir(), "artifact-route-"));
    const artifactPath = join(tempFile, "report.json");

    await writeFile(artifactPath, "{\"ok\":true,\"source\":\"worker-outcome\"}", "utf8");

    try {
      const createRunResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Persist worker artifact from filesystem",
          metadata: {}
        }
      });

      expect(createRunResponse.statusCode).toBe(201);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/artifacts",
        headers,
        payload: {
          runId: ids.run,
          kind: "report",
          path: "shared/.swarm/report.json",
          contentType: "application/json",
          metadata: {
            source: "worker-outcome",
            resolvedArtifactPath: artifactPath
          }
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        kind: "report",
        path: "shared/.swarm/report.json",
        sizeBytes: 37,
        metadata: {
          source: "worker-outcome",
          resolvedArtifactPath: artifactPath,
          storageKey: expect.any(String)
        }
      });
    } finally {
      await rm(tempFile, { recursive: true, force: true });
      await app.close();
    }
  });

  it("returns a 409 when the artifact source file does not exist and does not create a row", async () => {
    const controlPlane = new FakeVerticalSliceControlPlane();
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "127.0.0.1",
        DATABASE_URL: "postgres://unused/test",
        DEV_AUTH_TOKEN: "test-token",
        OPENAI_TRACING_DISABLED: true
      }),
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const headers = {
      authorization: "Bearer test-token"
    };

    try {
      const createRunResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Reject missing artifact source file",
          metadata: {}
        }
      });

      expect(createRunResponse.statusCode).toBe(201);

      const beforeArtifacts = await controlPlane.listArtifacts(ids.run);
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/artifacts",
        headers,
        payload: {
          runId: ids.run,
          kind: "report",
          path: "apps/api:test",
          contentType: "text/plain",
          metadata: {
            source: "worker-outcome",
            resolvedArtifactPath: "/definitely/missing/apps/api:test"
          }
        }
      });
      const afterArtifacts = await controlPlane.listArtifacts(ids.run);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: "artifact source file not found: /definitely/missing/apps/api:test",
        details: null
      });
      expect(afterArtifacts).toHaveLength(beforeArtifacts.length);
    } finally {
      await app.close();
    }
  });

  it("executes a leader planning loop and persists the generated task DAG", async () => {
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
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-swarm-leader-loop-"));

    try {
      const createRunResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Plan a leader-driven hello-world backend slice",
          concurrencyCap: 2,
          metadata: {
            scenario: "leader-planning-loop"
          }
        }
      });

      expect(createRunResponse.statusCode).toBe(201);

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed with ${response.statusCode}: ${response.body}`);
        }

        return response.json() as T;
      };

      const result = await runLeaderPlanningLoop({
        request,
        runId: ids.run,
        workspaceRoot,
        actorId: "tech-lead",
        runtimeConfig: {
          cwd: workspaceRoot,
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: true,
          workerNodeId: ids.workerNode,
          placementConstraintLabels: ["remote"]
        },
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async (toolRequest: unknown) => ({
          threadId: "thread-leader-plan",
          output: typeof toolRequest === "object" && toolRequest !== null && "tool" in toolRequest && toolRequest.tool === "codex"
            ? "leader-started"
            : JSON.stringify({
              summary: "Leader produced a plan and delegated the implementation",
              tasks: [
                {
                  key: "leader-plan",
                  title: "Draft the leader plan",
                  role: "tech-lead",
                  description: "Persist the plan artifact and review the DAG",
                  definitionOfDone: [
                    ".swarm/plan.md exists and includes the planned tasks",
                    "plan artifact is linked to the run detail"
                  ],
                  acceptanceCriteria: [
                    ".swarm/plan.md exists",
                    "plan artifact is linked to the run"
                  ],
                  dependencyKeys: []
                },
                {
                  key: "backend-impl",
                  title: "Implement the hello-world backend slice",
                  role: "backend-developer",
                  description: "Pick up the first delegated coding task",
                  definitionOfDone: [
                    "task is ready for implementation",
                    "leader handoff metadata is persisted for the worker"
                  ],
                  acceptanceCriteria: [
                    "task is ready for implementation",
                    "leader handoff is persisted"
                  ],
                  dependencyKeys: ["leader-plan"]
                }
              ]
            })
        })
      });

      const workerAgentResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "worker-distributed",
          role: "backend-developer",
          status: "idle",
          session: {
            threadId: "thread-worker-distributed",
            cwd: workspaceRoot,
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: false,
            workerNodeId: ids.workerNodeB,
            placementConstraintLabels: ["remote"],
            metadata: {
              source: "leader-worker-placement-test"
            }
          }
        }
      });

      expect(result.threadId).toBe("thread-leader-plan");
      expect(workerAgentResponse.statusCode).toBe(201);
      expect(result.tasks.map((task) => task.title)).toEqual([
        "Draft the leader plan",
        "Implement the hello-world backend slice"
      ]);
      expect(result.tasks[0]?.dependencyIds).toEqual([]);
      expect(result.tasks[1]?.dependencyIds).toEqual([result.tasks[0]?.id]);
      expect(result.continuedAt).toBeTruthy();

      const planMarkdown = await readFile(result.planArtifactPath, "utf8");
      expect(planMarkdown).toContain("Draft the leader plan");
      expect(planMarkdown).toContain("Implement the hello-world backend slice");
      expect(planMarkdown).toContain("Definition of Done:");
      expect(planMarkdown).toContain("plan artifact is linked to the run detail");

      const runDetailResponse = await app.inject({
        method: "GET",
        url: `/api/v1/runs/${ids.run}`,
        headers
      });

      expect(runDetailResponse.statusCode).toBe(200);
      expect(runDetailResponse.json()).toMatchObject({
        id: ids.run,
        status: "planning",
        planArtifactPath: result.planArtifactPath,
        sessions: [
          {
            threadId: "thread-leader-plan",
            workerNodeId: ids.workerNode,
            stickyNodeId: ids.workerNode
          },
          {
            threadId: "thread-worker-distributed",
            workerNodeId: ids.workerNodeB,
            stickyNodeId: ids.workerNodeB
          }
        ],
        tasks: [
          {
            title: "Draft the leader plan",
            status: "pending"
          },
          {
            title: "Implement the hello-world backend slice",
            status: "blocked"
          }
        ]
      });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("fails the planning loop when the leader returns cyclic task dependencies", async () => {
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
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-swarm-leader-loop-cycle-"));

    try {
      const createRunResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Verify cyclic leader plans fail instead of being silently serialized",
          concurrencyCap: 2
        }
      });

      expect(createRunResponse.statusCode).toBe(201);

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed with ${response.statusCode}: ${response.body}`);
        }

        return response.json() as T;
      };

      await expect(runLeaderPlanningLoop({
        request,
        runId: ids.run,
        workspaceRoot,
        actorId: "tech-lead",
        runtimeConfig: {
          cwd: workspaceRoot,
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: true,
          workerNodeId: ids.workerNode,
          placementConstraintLabels: ["remote"]
        },
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async (toolRequest: unknown) => ({
          threadId: "thread-leader-plan-cycle",
          output: typeof toolRequest === "object" && toolRequest !== null && "tool" in toolRequest && toolRequest.tool === "codex"
            ? "leader-started"
            : JSON.stringify({
              summary: "Return an invalid cyclic plan",
              tasks: [
                {
                  key: "env-check",
                  title: "Verify prerequisites",
                  role: "infrastructure-engineer",
                  description: "Check the environment",
                  definitionOfDone: ["environment prerequisites are verified before stack start"],
                  acceptanceCriteria: ["environment is ready"],
                  dependencyKeys: ["stack-start"]
                },
                {
                  key: "stack-start",
                  title: "Start the stack",
                  role: "backend-developer",
                  description: "Boot the local services",
                  definitionOfDone: ["local services start successfully"],
                  acceptanceCriteria: ["services start"],
                  dependencyKeys: ["env-check", "ui-validate"]
                },
                {
                  key: "ui-validate",
                  title: "Validate the UI",
                  role: "frontend-developer",
                  description: "Open the app",
                  definitionOfDone: ["UI is reachable after the stack starts"],
                  acceptanceCriteria: ["UI is reachable"],
                  dependencyKeys: ["stack-start"]
                }
              ]
            })
        })
      })).rejects.toThrow(/invalid cyclic dependencies|cycle/);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("builds the leader planning prompt from the run project team roles", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-swarm-leader-team-roles-"));
    const transcriptEntries: Array<{ kind: string; text: string }> = [];
    const taskStore: any[] = [];
    const runDetail: any = {
      id: ids.run,
      repositoryId: ids.repository,
      projectId: ids.project,
      projectTeamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      projectTeamName: "Web design studio",
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId,
      goal: "Plan a web design studio run with team-specific roles.",
      status: "pending",
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
      handoffConfig: {
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
      completedAt: null,
      metadata: {
        runContext: defaultRunContext
      },
      context: defaultRunContext,
      createdBy: "dev-user",
      createdAt: new Date("2026-03-28T00:00:00.000Z"),
      updatedAt: new Date("2026-03-28T00:00:00.000Z"),
      tasks: taskStore,
      agents: [],
      sessions: []
    };
    const projectTeamDetail = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workspaceId: defaultBoundary.workspaceId,
      teamId: defaultBoundary.teamId,
      projectId: ids.project,
      name: "Web design studio",
      description: null,
      concurrencyCap: 4,
      sourceBlueprintId: "web-design-studio",
      sourceTemplateId: "web-design-studio",
      createdAt: new Date("2026-03-28T00:00:00.000Z"),
      updatedAt: new Date("2026-03-28T00:00:00.000Z"),
      memberCount: 6,
      members: [
        {
          id: "m1",
          projectTeamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          key: "leader-1",
          position: 0,
          name: "Leader",
          role: "tech-lead",
          profile: "leader",
          responsibility: "Own sequencing.",
          createdAt: new Date("2026-03-28T00:00:00.000Z"),
          updatedAt: new Date("2026-03-28T00:00:00.000Z")
        },
        {
          id: "m2",
          projectTeamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          key: "research-1",
          position: 1,
          name: "Design Researcher",
          role: "design-researcher",
          profile: "design-researcher",
          responsibility: "Research topic and references.",
          createdAt: new Date("2026-03-28T00:00:00.000Z"),
          updatedAt: new Date("2026-03-28T00:00:00.000Z")
        },
        {
          id: "m3",
          projectTeamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          key: "art-1",
          position: 2,
          name: "Art Director",
          role: "art-director",
          profile: "art-director",
          responsibility: "Define the visual direction.",
          createdAt: new Date("2026-03-28T00:00:00.000Z"),
          updatedAt: new Date("2026-03-28T00:00:00.000Z")
        },
        {
          id: "m4",
          projectTeamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          key: "engineer-1",
          position: 3,
          name: "Design Engineer",
          role: "design-engineer",
          profile: "design-engineer",
          responsibility: "Implement the designed experience.",
          createdAt: new Date("2026-03-28T00:00:00.000Z"),
          updatedAt: new Date("2026-03-28T00:00:00.000Z")
        },
        {
          id: "m5",
          projectTeamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          key: "review-1",
          position: 4,
          name: "Visual Reviewer",
          role: "visual-reviewer",
          profile: "visual-reviewer",
          responsibility: "Review visual originality and hierarchy.",
          createdAt: new Date("2026-03-28T00:00:00.000Z"),
          updatedAt: new Date("2026-03-28T00:00:00.000Z")
        },
        {
          id: "m6",
          projectTeamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          key: "tester-1",
          position: 5,
          name: "Tester",
          role: "tester",
          profile: "tester",
          responsibility: "Validate the browser experience.",
          createdAt: new Date("2026-03-28T00:00:00.000Z"),
          updatedAt: new Date("2026-03-28T00:00:00.000Z")
        }
      ]
    };

    try {
      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        if (method === "POST" && path === `/api/v1/runs/${ids.run}/budget-checkpoints`) {
          return {
            decision: "within_budget",
            exceeded: [],
            updatedAt: new Date("2026-03-28T00:00:00.000Z").toISOString(),
            approvalId: null,
            continueAllowed: true
          } as T;
        }

        if (method === "POST" && path === "/api/v1/agents") {
          const agent = {
            id: ids.agent,
            runId: ids.run,
            projectTeamMemberId: null,
            name: "leader",
            role: "tech-lead",
            profile: "default",
            status: "idle",
            worktreePath: null,
            branchName: null,
            currentTaskId: null,
            lastHeartbeatAt: null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          const sessionPayload = payload?.session as Record<string, unknown>;
          const session = {
            id: ids.session,
            agentId: ids.agent,
            threadId: sessionPayload.threadId,
            cwd: sessionPayload.cwd,
            sandbox: sessionPayload.sandbox,
            approvalPolicy: sessionPayload.approvalPolicy,
            includePlanTool: sessionPayload.includePlanTool,
            workerNodeId: sessionPayload.workerNodeId ?? null,
            stickyNodeId: sessionPayload.workerNodeId ?? null,
            placementConstraintLabels: sessionPayload.placementConstraintLabels ?? [],
            lastHeartbeatAt: null,
            state: "active",
            staleReason: null,
            metadata: sessionPayload.metadata ?? {},
            createdAt: new Date(),
            updatedAt: new Date()
          };
          runDetail.agents = [agent];
          runDetail.sessions = [session];
          return { id: ids.agent } as T;
        }

        if (method === "GET" && path === `/api/v1/runs/${ids.run}`) {
          return runDetail as T;
        }

        if (method === "GET" && path === `/api/v1/project-teams/${projectTeamDetail.id}`) {
          return projectTeamDetail as T;
        }

        if (method === "POST" && path === `/api/v1/sessions/${ids.session}/transcript`) {
          transcriptEntries.push(...((payload?.entries as Array<{ kind: string; text: string }>) ?? []));
          return { ok: true } as T;
        }

        if (method === "POST" && path === "/api/v1/artifacts") {
          return { id: "artifact-1" } as T;
        }

        if (method === "PATCH" && path === `/api/v1/runs/${ids.run}/status`) {
          runDetail.status = payload?.status;
          runDetail.planArtifactPath = payload?.planArtifactPath;
          return runDetail as T;
        }

        if (method === "POST" && path === "/api/v1/tasks") {
          const task = {
            id: crypto.randomUUID(),
            runId: ids.run,
            parentTaskId: payload?.parentTaskId ?? null,
            title: payload?.title,
            description: payload?.description,
            role: payload?.role,
            status: Array.isArray(payload?.dependencyIds) && payload!.dependencyIds.length > 0 ? "blocked" : "pending",
            priority: payload?.priority ?? 1,
            ownerAgentId: null,
            dependencyIds: payload?.dependencyIds ?? [],
            definitionOfDone: payload?.definitionOfDone ?? [],
            acceptanceCriteria: payload?.acceptanceCriteria ?? [],
            validationTemplates: [],
            createdAt: new Date(),
            updatedAt: new Date()
          };
          taskStore.push(task);
          return task as T;
        }

        throw new Error(`unexpected request ${method} ${path}`);
      };

      await runLeaderPlanningLoop({
        request,
        runId: ids.run,
        workspaceRoot,
        actorId: "tech-lead",
        runtimeConfig: {
          cwd: workspaceRoot,
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: true,
          workerNodeId: ids.workerNode,
          placementConstraintLabels: ["remote"]
        },
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async (toolRequest: unknown) => ({
          threadId: "thread-team-role-plan",
          output: typeof toolRequest === "object" && toolRequest !== null && "tool" in toolRequest && toolRequest.tool === "codex"
            ? "leader-started"
            : JSON.stringify({
              summary: "Use the studio team roles.",
              tasks: [
                {
                  key: "research",
                  title: "Research the audience",
                  role: "design-researcher",
                  description: "Collect audience and reference context.",
                  definitionOfDone: ["research findings are captured for downstream design work"],
                  acceptanceCriteria: ["research plan exists"],
                  dependencyKeys: []
                },
                {
                  key: "direction",
                  title: "Set visual direction",
                  role: "art-director",
                  description: "Turn the research into art direction.",
                  definitionOfDone: ["visual direction is defined from the research findings"],
                  acceptanceCriteria: ["visual thesis is defined"],
                  dependencyKeys: ["research"]
                }
              ]
            })
        })
      });

      const planningPrompt = transcriptEntries.find((entry) =>
        entry.kind === "prompt" && entry.text.includes("You are the leader agent for a Codex Swarm orchestration run."));

      expect(planningPrompt?.text).toContain("Available team roles:");
      expect(planningPrompt?.text).toContain("design-researcher");
      expect(planningPrompt?.text).toContain("art-director");
      expect(planningPrompt?.text).toContain("design-engineer");
      expect(planningPrompt?.text).toContain("visual-reviewer");
      expect(planningPrompt?.text).toContain("do not invent task roles outside the available team role list");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("allows members to create runs and request approvals", async () => {
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

    const memberHeaders = {
      authorization: "Bearer test-token",
      "x-codex-role": "member",
      "x-codex-roles": "member"
    };

    const runResponse = await app.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers: memberHeaders,
      payload: {
        repositoryId: ids.repository,
        goal: "Member-owned run creation",
        metadata: {}
      }
    });

    expect(runResponse.statusCode).toBe(201);
    expect(runResponse.json()).toMatchObject({
      id: ids.run,
      createdBy: "dev-user"
    });

    const approvalResponse = await app.inject({
      method: "POST",
      url: "/api/v1/approvals",
      headers: memberHeaders,
      payload: {
        runId: ids.run,
        taskId: ids.taskA,
        kind: "plan",
        requestedBy: "ignored-by-route",
        requestedPayload: {
          summary: "Request execution review"
        }
      }
    });

    expect(approvalResponse.statusCode).toBe(201);
    expect(approvalResponse.json()).toMatchObject({
      status: "pending",
      requestedBy: "dev-user"
    });

    await app.close();
  });

  it("allows reviewers to review runs and resolve approvals", async () => {
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

    await app.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers: {
        authorization: "Bearer test-token"
      },
      payload: {
        repositoryId: ids.repository,
        goal: "Reviewer-governed run status",
        metadata: {}
      }
    });

    const reviewerHeaders = {
      authorization: "Bearer test-token",
      "x-codex-role": "reviewer",
      "x-codex-roles": "reviewer"
    };

    const reviewResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/runs/${ids.run}/status`,
      headers: reviewerHeaders,
      payload: {
        status: "completed"
      }
    });

    expect(reviewResponse.statusCode).toBe(200);
    expect(reviewResponse.json()).toMatchObject({
      status: "completed"
    });

    const approvalResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/approvals/${ids.workerNode}`,
      headers: reviewerHeaders,
      payload: {
        status: "approved",
        resolver: "ignored-by-route"
      }
    });

    expect(approvalResponse.statusCode).toBe(200);
    expect(approvalResponse.json()).toMatchObject({
      status: "approved",
      resolver: "dev-user"
    });

    await app.close();
  });

  it("allows operators to retry and stop runs", async () => {
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

    await app.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers: {
        authorization: "Bearer test-token"
      },
      payload: {
        repositoryId: ids.repository,
        goal: "Operator-owned stop and retry",
        metadata: {}
      }
    });

    const operatorHeaders = {
      authorization: "Bearer test-token",
      "x-codex-role": "operator",
      "x-codex-roles": "operator"
    };

    const retryResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/runs/${ids.run}/status`,
      headers: operatorHeaders,
      payload: {
        status: "in_progress"
      }
    });

    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.json()).toMatchObject({
      status: "in_progress"
    });

    const stopResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/runs/${ids.run}/status`,
      headers: operatorHeaders,
      payload: {
        status: "cancelled"
      }
    });

    expect(stopResponse.statusCode).toBe(200);
    expect(stopResponse.json()).toMatchObject({
      status: "cancelled"
    });

    await app.close();
  });

  it("rejects out-of-role governed actions with deterministic details", async () => {
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "127.0.0.1",
        DATABASE_URL: "postgres://unused/test",
        DEV_AUTH_TOKEN: "test-token",
        OPENAI_TRACING_DISABLED: true
      }),
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const createRunResponse = await app.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers: {
        authorization: "Bearer test-token",
        "x-codex-role": "reviewer",
        "x-codex-roles": "reviewer"
      },
      payload: {
        repositoryId: ids.repository,
        goal: "Denied run creation",
        metadata: {}
      }
    });

    expect(createRunResponse.statusCode).toBe(403);
    expect(createRunResponse.json()).toEqual({
      error: "actor role is not permitted to perform run.create",
      details: {
        action: "run.create",
        roles: ["reviewer"],
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      }
    });
    expect(controlPlane.createRun).not.toHaveBeenCalled();

    const stopResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/runs/${ids.run}/status`,
      headers: {
        authorization: "Bearer test-token",
        "x-codex-role": "member",
        "x-codex-roles": "member"
      },
      payload: {
        status: "cancelled"
      }
    });

    expect(stopResponse.statusCode).toBe(403);
    expect(stopResponse.json()).toEqual({
      error: "actor role is not permitted to perform run.stop",
      details: {
        action: "run.stop",
        roles: ["member"],
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      }
    });
    expect(controlPlane.updateRunStatus).not.toHaveBeenCalled();

    const requestApprovalResponse = await app.inject({
      method: "POST",
      url: "/api/v1/approvals",
      headers: {
        authorization: "Bearer test-token",
        "x-codex-role": "reviewer",
        "x-codex-roles": "reviewer"
      },
      payload: {
        runId: ids.run,
        taskId: ids.taskA,
        kind: "plan",
        requestedBy: "ignored-by-route",
        requestedPayload: {
          summary: "Denied approval request"
        }
      }
    });

    expect(requestApprovalResponse.statusCode).toBe(403);
    expect(requestApprovalResponse.json()).toEqual({
      error: "actor role is not permitted to perform approval.request",
      details: {
        action: "approval.request",
        roles: ["reviewer"],
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      }
    });
    expect(controlPlane.createApproval).not.toHaveBeenCalled();

    const resolveApprovalResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/approvals/${ids.workerNode}`,
      headers: {
        authorization: "Bearer test-token",
        "x-codex-role": "member",
        "x-codex-roles": "member"
      },
      payload: {
        status: "approved",
        resolver: "ignored-by-route"
      }
    });

    expect(resolveApprovalResponse.statusCode).toBe(403);
    expect(resolveApprovalResponse.json()).toEqual({
      error: "actor role is not permitted to perform approval.resolve",
      details: {
        action: "approval.resolve",
        roles: ["member"],
        workspaceId: defaultBoundary.workspaceId,
        teamId: defaultBoundary.teamId
      }
    });
    expect(controlPlane.resolveApproval).not.toHaveBeenCalled();

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

  it("prefers the lowest-load eligible node when claiming generic dispatch work", async () => {
    const app = await buildApp({
      controlPlane: new FakeVerticalSliceControlPlane() as unknown as ControlPlaneService
    });
    const headers = {
      authorization: "Bearer codex-swarm-dev-token"
    };

    const nodeAHeartbeatResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/worker-nodes/${ids.workerNode}/heartbeat`,
      headers,
      payload: {
        metadata: {
          queueDepth: 6,
          activeClaims: 2,
          utilization: {
            cpu: 0.9
          }
        }
      }
    });
    const nodeBHeartbeatResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/worker-nodes/${ids.workerNodeB}/heartbeat`,
      headers,
      payload: {
        metadata: {
          queueDepth: 1,
          activeClaims: 0,
          utilization: {
            cpu: 0.2
          }
        }
      }
    });

    expect(nodeAHeartbeatResponse.statusCode).toBe(200);
    expect(nodeBHeartbeatResponse.statusCode).toBe(200);

    const dispatchCreateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/worker-dispatch-assignments",
      headers,
      payload: {
        runId: ids.run,
        taskId: ids.taskA,
        agentId: ids.agent,
        repositoryId: ids.repository,
        repositoryName: "codex-swarm",
        requiredCapabilities: ["remote"],
        worktreePath: "/tmp/codex-swarm/run-1/worker-1",
        prompt: "Claim the healthiest eligible worker",
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request"
      }
    });

    expect(dispatchCreateResponse.statusCode).toBe(201);

    const overloadedClaimResponse = await app.inject({
      method: "POST",
      url: `/api/v1/worker-nodes/${ids.workerNode}/claim-dispatch`,
      headers
    });

    expect(overloadedClaimResponse.statusCode).toBe(200);
    expect(overloadedClaimResponse.json()).toBeNull();

    const healthyClaimResponse = await app.inject({
      method: "POST",
      url: `/api/v1/worker-nodes/${ids.workerNodeB}/claim-dispatch`,
      headers
    });

    expect(healthyClaimResponse.statusCode).toBe(200);
    expect(healthyClaimResponse.json()).toMatchObject({
      claimedByNodeId: ids.workerNodeB,
      stickyNodeId: ids.workerNodeB,
      preferredNodeId: ids.workerNodeB,
      state: "claimed"
    });

    await app.close();
  });

  it("runs a managed worker dispatch and feeds failures back into retry orchestration", async () => {
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
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-managed-dispatch-repo-"));

    try {
      await writeFile(join(repoRoot, "README.md"), "managed worker dispatch\n", "utf8");
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Swarm"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex-swarm@example.com"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["add", "README.md"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoRoot, stdio: "pipe" });
      (verticalSlice as any).repositories[0].url = repoRoot;

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed with ${response.statusCode}: ${response.body}`);
        }

        return response.json() as T;
      };

      const runResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Exercise managed worker dispatch orchestration",
          concurrencyCap: 1,
          metadata: {}
        }
      });

      expect(runResponse.statusCode).toBe(201);

      const agentResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "worker-managed",
          role: "backend-developer",
          status: "idle",
          session: {
            threadId: "thread-worker-managed",
            cwd: process.cwd(),
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: false,
            metadata: {
              source: "managed-worker-dispatch-test"
            }
          }
        }
      });

      expect(agentResponse.statusCode).toBe(201);
      const agentId = ids.agent;
      const sessionId = ids.session;

      const taskResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Managed worker dispatch task",
          description: "Execute the worker orchestration helper",
          role: "backend-developer",
          priority: 1,
          dependencyIds: [],
          acceptanceCriteria: ["worker dispatch completes after a retry"]
        }
      });

      expect(taskResponse.statusCode).toBe(201);
      const taskId = taskResponse.json().id as string;

      const worktreeRoot = await mkdtemp(join(tmpdir(), "codex-swarm-managed-dispatch-"));

      const dispatchResponse = await app.inject({
        method: "POST",
        url: "/api/v1/worker-dispatch-assignments",
        headers,
        payload: {
          runId: ids.run,
          taskId,
          agentId,
          sessionId,
          repositoryId: ids.repository,
          repositoryName: "codex-swarm",
          stickyNodeId: ids.workerNode,
          requiredCapabilities: ["remote"],
          worktreePath: join(worktreeRoot, "worker-managed"),
          prompt: "Continue the managed worker session",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request"
        }
      });

      expect(dispatchResponse.statusCode).toBe(201);

      const failedAttempt = await runManagedWorkerDispatch({
        request,
        nodeId: ids.workerNode,
        workspaceRoot: process.cwd(),
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async () => {
          throw new Error("worker_runtime_crash");
        }
      });

      expect(failedAttempt).toMatchObject({
        status: "retrying",
        error: "worker_runtime_crash",
        supervisorStatus: "failed"
      });

      const afterFailureRun = await app.inject({
        method: "GET",
        url: `/api/v1/runs/${ids.run}`,
        headers
      });

      expect(afterFailureRun.statusCode).toBe(200);
      expect(afterFailureRun.json()).toMatchObject({
        sessions: [
          {
            id: sessionId,
            state: "pending",
            staleReason: "worker_runtime_crash"
          }
        ]
      });

      const successfulAttempt = await runManagedWorkerDispatch({
        request,
        nodeId: ids.workerNode,
        workspaceRoot: process.cwd(),
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async () => ({
          threadId: "thread-worker-managed",
          output: JSON.stringify({
            summary: "worker completed",
            status: "completed",
            messages: [],
            blockingIssues: []
          })
        })
      });

      expect(successfulAttempt).toMatchObject({
        status: "completed",
        output: expect.stringContaining("\"status\":\"completed\""),
        supervisorStatus: "stopped"
      });

      const completedAssignments = await app.inject({
        method: "GET",
        url: `/api/v1/worker-dispatch-assignments?runId=${ids.run}&state=completed`,
        headers
      });

      expect(completedAssignments.statusCode).toBe(200);
      expect(completedAssignments.json()).toHaveLength(1);
      expect(completedAssignments.json()[0]).toMatchObject({
        id: dispatchResponse.json().id,
        state: "completed",
        attempt: 1
      });

      const transcriptResponse = await app.inject({
        method: "GET",
        url: `/api/v1/sessions/${sessionId}/transcript`,
        headers
      });

      expect(transcriptResponse.statusCode).toBe(200);
      expect(transcriptResponse.json()).toEqual([
        expect.objectContaining({
          sessionId,
          kind: "prompt",
          text: expect.stringContaining("Operator brief:\nContinue the managed worker session")
        }),
        expect.objectContaining({
          sessionId,
          kind: "response",
          text: expect.stringContaining("\"summary\":\"worker completed\"")
        })
      ]);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("uses the configured worker runtime profile instead of the assignment profile", async () => {
    vi.stubEnv("CODEX_SWARM_WORKER_PROFILE", "fallback-profile");

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
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-managed-dispatch-profile-repo-"));

    try {
      await writeFile(join(repoRoot, "README.md"), "managed worker profile dispatch\n", "utf8");
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Swarm"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex-swarm@example.com"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["add", "README.md"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoRoot, stdio: "pipe" });
      (verticalSlice as any).repositories[0].url = repoRoot;

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed with ${response.statusCode}: ${response.body}`);
        }

        return response.json() as T;
      };

      const runResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Exercise worker runtime profile selection",
          concurrencyCap: 1,
          metadata: {}
        }
      });

      expect(runResponse.statusCode).toBe(201);

      const agentResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "worker-profile",
          role: "design-engineer",
          status: "idle",
          session: {
            threadId: "thread-worker-profile",
            cwd: process.cwd(),
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: false,
            metadata: {
              source: "managed-worker-dispatch-profile-test"
            }
          }
        }
      });

      expect(agentResponse.statusCode).toBe(201);

      const taskResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Managed worker dispatch profile task",
          description: "Ensure worker dispatch uses the configured runtime profile",
          role: "design-engineer",
          priority: 1,
          dependencyIds: [],
          acceptanceCriteria: ["worker dispatch uses the configured runtime profile"]
        }
      });

      expect(taskResponse.statusCode).toBe(201);
      const taskId = taskResponse.json().id as string;

      const worktreeRoot = await mkdtemp(join(tmpdir(), "codex-swarm-managed-dispatch-profile-"));
      const dispatchResponse = await app.inject({
        method: "POST",
        url: "/api/v1/worker-dispatch-assignments",
        headers,
        payload: {
          runId: ids.run,
          taskId,
          agentId: ids.agent,
          repositoryId: ids.repository,
          repositoryName: "codex-swarm",
          stickyNodeId: ids.workerNode,
          requiredCapabilities: ["remote"],
          worktreePath: join(worktreeRoot, "worker-profile"),
          prompt: "Continue the managed worker session with the assigned role profile",
          profile: "design-engineer",
          sandbox: "workspace-write",
          approvalPolicy: "on-request"
        }
      });

      expect(dispatchResponse.statusCode).toBe(201);

      let seenProfile: string | null = null;
      const result = await runManagedWorkerDispatch({
        request,
        nodeId: ids.workerNode,
        workspaceRoot: process.cwd(),
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async (toolRequest) => {
          seenProfile = "input" in toolRequest
            ? (toolRequest as { input: { profile?: string } }).input.profile ?? null
            : (toolRequest as { message: { params?: { profile?: string } } }).message.params?.profile ?? null;

          return {
            threadId: "thread-worker-profile",
            output: JSON.stringify({
              summary: "worker completed",
              status: "completed",
              messages: [],
              blockingIssues: []
            })
          };
        }
      });

      expect(result).toMatchObject({
        status: "completed"
      });
      expect(seenProfile).toBe("fallback-profile");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("executes task validation templates and records artifact-backed validation results", async () => {
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
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-validation-dispatch-repo-"));
    const worktreeRoot = await mkdtemp(join(tmpdir(), "codex-swarm-validation-dispatch-"));

    try {
      await writeFile(join(repoRoot, "README.md"), "validation worker dispatch\n", "utf8");
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Swarm"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex-swarm@example.com"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["add", "README.md"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoRoot, stdio: "pipe" });
      (verticalSlice as any).repositories[0].url = repoRoot;

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed with ${response.statusCode}: ${response.body}`);
        }

        return response.json() as T;
      };

      const runResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Execute validation templates through a worker",
          concurrencyCap: 1,
          metadata: {}
        }
      });

      expect(runResponse.statusCode).toBe(201);

      const agentResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "worker-validation",
          role: "backend-developer",
          status: "idle",
          session: {
            threadId: "thread-worker-validation",
            cwd: process.cwd(),
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: false,
            metadata: {
              source: "worker-validation-runner-test"
            }
          }
        }
      });

      expect(agentResponse.statusCode).toBe(201);
      const agentId = ids.agent;
      const sessionId = ids.session;

      const taskResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Worker validation task",
          description: "Execute task validation templates in the provisioned worktree",
          role: "backend-developer",
          priority: 1,
          dependencyIds: [],
          acceptanceCriteria: ["validation command is executed by the worker"],
          validationTemplates: [
            {
              name: "unit",
              command: `${JSON.stringify(process.execPath)} --input-type=module -e "console.log('validation ok')"`,
              summary: "Run the worker validation command",
              artifactPath: "artifacts/validations/unit.json"
            }
          ]
        }
      });

      expect(taskResponse.statusCode).toBe(201);
      const taskId = taskResponse.json().id as string;

      const dispatchResponse = await app.inject({
        method: "POST",
        url: "/api/v1/worker-dispatch-assignments",
        headers,
        payload: {
          runId: ids.run,
          taskId,
          agentId,
          sessionId,
          repositoryId: ids.repository,
          repositoryName: "codex-swarm",
          stickyNodeId: ids.workerNode,
          requiredCapabilities: ["remote"],
          worktreePath: join(worktreeRoot, "worker-validation"),
          prompt: "Continue the worker session",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request"
        }
      });

      expect(dispatchResponse.statusCode).toBe(201);

      const result = await runManagedWorkerDispatch({
        request,
        nodeId: ids.workerNode,
        workspaceRoot: process.cwd(),
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async () => ({
          threadId: "thread-worker-validation",
          output: JSON.stringify({
            summary: "worker completed",
            status: "completed",
            messages: [],
            blockingIssues: []
          })
        })
      });

      expect(result).toMatchObject({
        status: "completed",
        output: expect.stringContaining("\"status\":\"completed\"")
      });

      const validationsResponse = await app.inject({
        method: "GET",
        url: `/api/v1/validations?runId=${ids.run}&taskId=${taskId}`,
        headers
      });

      expect(validationsResponse.statusCode).toBe(200);
      expect(validationsResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "unit",
            status: "passed",
            artifactPath: "artifacts/validations/unit.json",
            artifacts: expect.arrayContaining([
              expect.objectContaining({
                kind: "report",
                path: "artifacts/validations/unit.json",
                contentType: "application/json"
              })
            ])
          })
        ])
      );

      const createdValidation = validationsResponse.json().find((item: any) => item.name === "unit");
      const artifactId = createdValidation.artifacts[0].id as string;
      const artifactContentResponse = await app.inject({
        method: "GET",
        url: `/api/v1/artifacts/${artifactId}/content`,
        headers
      });

      expect(artifactContentResponse.statusCode).toBe(200);
      expect(artifactContentResponse.body).toContain("\"status\": \"passed\"");
      expect(artifactContentResponse.body).toContain("\"stdout\": \"validation ok");
    } finally {
      await rm(worktreeRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("bootstraps a fresh worker session without a forced retry", async () => {
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
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-bootstrap-dispatch-repo-"));
    const worktreeRoot = await mkdtemp(join(tmpdir(), "codex-swarm-bootstrap-dispatch-"));

    try {
      await writeFile(join(repoRoot, "README.md"), "bootstrap worker dispatch\n", "utf8");
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Swarm"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex-swarm@example.com"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["add", "README.md"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoRoot, stdio: "pipe" });
      (verticalSlice as any).repositories[0].url = repoRoot;

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed with ${response.statusCode}: ${response.body}`);
        }

        return response.json() as T;
      };

      const runResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Bootstrap a fresh worker session",
          concurrencyCap: 1,
          metadata: {}
        }
      });

      expect(runResponse.statusCode).toBe(201);

      const agentResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "worker-bootstrap",
          role: "backend-developer",
          status: "idle"
        }
      });

      expect(agentResponse.statusCode).toBe(201);
      const agentId = ids.agent;

      const taskResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Bootstrap worker dispatch task",
          description: "Start a fresh worker session and complete the task in one pass.",
          role: "backend-developer",
          priority: 1,
          dependencyIds: [],
          acceptanceCriteria: ["worker dispatch completes without a bootstrap retry"]
        }
      });

      expect(taskResponse.statusCode).toBe(201);
      const taskId = taskResponse.json().id as string;

      const dispatchResponse = await app.inject({
        method: "POST",
        url: "/api/v1/worker-dispatch-assignments",
        headers,
        payload: {
          runId: ids.run,
          taskId,
          agentId,
          repositoryId: ids.repository,
          repositoryName: "codex-swarm",
          stickyNodeId: ids.workerNode,
          requiredCapabilities: ["remote"],
          worktreePath: join(worktreeRoot, "worker-bootstrap"),
          prompt: "Bootstrap the worker session",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request"
        }
      });

      expect(dispatchResponse.statusCode).toBe(201);

      const result = await runManagedWorkerDispatch({
        request,
        nodeId: ids.workerNode,
        workspaceRoot: process.cwd(),
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async () => ({
          threadId: "thread-worker-bootstrap",
          output: JSON.stringify({
            summary: "bootstrap completed",
            status: "completed",
            messages: [],
            blockingIssues: []
          })
        })
      });

      expect(result).toMatchObject({
        status: "completed",
        output: expect.stringContaining("\"summary\":\"bootstrap completed\""),
        supervisorStatus: "stopped"
      });

      const completedAssignments = await app.inject({
        method: "GET",
        url: `/api/v1/worker-dispatch-assignments?runId=${ids.run}&state=completed`,
        headers
      });

      expect(completedAssignments.statusCode).toBe(200);
      expect(completedAssignments.json()).toHaveLength(1);
      expect(completedAssignments.json()[0]).toMatchObject({
        id: dispatchResponse.json().id,
        state: "completed",
        attempt: 0
      });

      const runDetailResponse = await app.inject({
        method: "GET",
        url: `/api/v1/runs/${ids.run}`,
        headers
      });

      expect(runDetailResponse.statusCode).toBe(200);
      const createdSession = runDetailResponse.json().sessions[0];
      expect(createdSession).toMatchObject({
        agentId,
        threadId: "thread-worker-bootstrap",
        state: "stopped"
      });

      const transcriptResponse = await app.inject({
        method: "GET",
        url: `/api/v1/sessions/${createdSession.id}/transcript`,
        headers
      });

      expect(transcriptResponse.statusCode).toBe(200);
      expect(transcriptResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sessionId: createdSession.id,
            kind: "prompt",
            text: expect.stringContaining("Operator brief:\nBootstrap the worker session")
          }),
          expect.objectContaining({
            sessionId: createdSession.id,
            kind: "response",
            text: expect.stringContaining("\"summary\":\"bootstrap completed\"")
          })
        ])
      );
    } finally {
      await rm(worktreeRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("records branch publish, PR handoff, and artifacts from a completed worker outcome", async () => {
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
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-handoff-dispatch-repo-"));
    const worktreeRoot = await mkdtemp(join(tmpdir(), "codex-swarm-handoff-dispatch-"));

    try {
      await writeFile(join(repoRoot, "README.md"), "handoff worker dispatch\n", "utf8");
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Swarm"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex-swarm@example.com"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["add", "README.md"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["checkout", "-b", "feature/handoff-proof"], { cwd: repoRoot, stdio: "pipe" });
      (verticalSlice as any).repositories[0].url = repoRoot;

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed with ${response.statusCode}: ${response.body}`);
        }

        return response.json() as T;
      };

      const runResponse = await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Publish the branch and record PR handoff",
          concurrencyCap: 1,
          metadata: {}
        }
      });

      expect(runResponse.statusCode).toBe(201);

      const agentResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "tech-lead-handoff",
          role: "tech-lead",
          status: "idle"
        }
      });

      expect(agentResponse.statusCode).toBe(201);
      const agentId = ids.agent;

      const taskResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Commit changes and open the initial scaffold PR",
          description: "Publish the working branch, record the PR handoff, and attach a PR summary artifact.",
          role: "tech-lead",
          priority: 1,
          dependencyIds: [],
          acceptanceCriteria: [
            "run records the published branch",
            "run records the pull request handoff",
            "summary artifact is attached to the run"
          ]
        }
      });

      expect(taskResponse.statusCode).toBe(201);
      const taskId = taskResponse.json().id as string;

      const dispatchResponse = await app.inject({
        method: "POST",
        url: "/api/v1/worker-dispatch-assignments",
        headers,
        payload: {
          runId: ids.run,
          taskId,
          agentId,
          repositoryId: ids.repository,
          repositoryName: "operations",
          stickyNodeId: ids.workerNode,
          requiredCapabilities: ["remote"],
          worktreePath: join(worktreeRoot, "handoff"),
          prompt: "Publish the branch and open the PR",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "never"
        }
      });

      expect(dispatchResponse.statusCode).toBe(201);

      const result = await runManagedWorkerDispatch({
        request,
        nodeId: ids.workerNode,
        workspaceRoot: process.cwd(),
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async () => ({
          threadId: "thread-worker-handoff",
          output: JSON.stringify({
            summary: "Published feature/handoff-proof and opened PR #24.",
            status: "completed",
            messages: [],
            blockingIssues: [],
            branchPublish: {
              branchName: "feature/handoff-proof",
              commitSha: "3a51f57",
              notes: "Published by worker outcome"
            },
            pullRequestHandoff: {
              title: "Scaffold initial IaC repository",
              body: "This PR adds the initial scaffold.",
              baseBranch: "main",
              headBranch: "feature/handoff-proof",
              url: "https://github.com/beisel-it/operations/pull/24",
              number: 24,
              status: "open"
            },
            artifacts: [
              {
                kind: "pr_link",
                path: "artifacts/pr-handoff.json",
                contentType: "application/json",
                contentBase64: Buffer.from(JSON.stringify({ pullRequestUrl: "https://github.com/beisel-it/operations/pull/24" }), "utf8").toString("base64"),
                metadata: {
                  source: "worker-test"
                }
              }
            ]
          })
        })
      });

      expect(result).toMatchObject({
        status: "completed",
        output: expect.stringContaining("\"branchPublish\"")
      });

      const runDetailResponse = await app.inject({
        method: "GET",
        url: `/api/v1/runs/${ids.run}`,
        headers
      });

      expect(runDetailResponse.statusCode).toBe(200);
      expect(runDetailResponse.json()).toMatchObject({
        id: ids.run,
        branchName: "feature/handoff-proof",
        publishedBranch: "feature/handoff-proof",
        pullRequestUrl: "https://github.com/beisel-it/operations/pull/24",
        pullRequestNumber: 24,
        pullRequestStatus: "open",
        handoffStatus: "pr_open"
      });

      const artifactResponse = await app.inject({
        method: "GET",
        url: `/api/v1/artifacts?runId=${ids.run}`,
        headers
      });

      expect(artifactResponse.statusCode).toBe(200);
      expect(artifactResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            runId: ids.run,
            taskId,
            kind: "pr_link",
            path: "artifacts/pr-handoff.json",
            contentType: "application/json"
          })
        ])
      );
    } finally {
      await rm(worktreeRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("consumes inbound agent messages and lets the leader reslice follow-on work automatically", async () => {
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
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-reslice-repo-"));
    const worktreeRoot = await mkdtemp(join(tmpdir(), "codex-swarm-reslice-dispatch-"));

    try {
      await writeFile(join(repoRoot, "README.md"), "reslice worker dispatch\n", "utf8");
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Swarm"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex-swarm@example.com"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["add", "README.md"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoRoot, stdio: "pipe" });
      (verticalSlice as any).repositories[0].url = repoRoot;

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed with ${response.statusCode}: ${response.body}`);
        }

        return response.json() as T;
      };

      await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Drive automatic reslicing through leader coordination",
          concurrencyCap: 4,
          metadata: {},
          context: {
            externalInput: {
              kind: "webhook",
              trigger: {
                id: crypto.randomUUID(),
                repeatableRunId: crypto.randomUUID(),
                name: "PR opened",
                kind: "webhook",
                metadata: {
                  provider: "github",
                  installationId: 7
                }
              },
              event: {
                sourceType: "webhook",
                eventId: "evt-pr-opened",
                eventName: "pull_request.opened",
                source: "github",
                payload: {
                  action: "opened",
                  repository: {
                    full_name: "beisel-it/codex-swarm"
                  }
                },
                receivedAt: new Date().toISOString(),
                request: {
                  method: "POST",
                  path: "/webhooks/project/pr-review",
                  headers: {
                    "x-github-event": "pull_request"
                  },
                  query: {},
                  receivedAt: new Date().toISOString()
                }
              },
              receivedAt: new Date().toISOString(),
              metadata: {
                receiptId: "receipt-reslice"
              }
            },
            values: {
              repeatableRunName: "PR review"
            }
          }
        }
      });

      const leaderResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "leader",
          role: "tech-lead",
          status: "idle",
          session: {
            threadId: "thread-leader-reslice",
            cwd: process.cwd(),
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: true,
            metadata: {
              source: "leader-reslice-test"
            }
          }
        }
      });

      expect(leaderResponse.statusCode).toBe(201);
      const leaderAgentId = leaderResponse.json().id as string;

      const workerResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "worker-primary",
          role: "backend-developer",
          status: "idle",
          session: {
            threadId: "thread-worker-reslice",
            cwd: process.cwd(),
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: false,
            metadata: {
              source: "worker-reslice-test"
            }
          }
        }
      });

      expect(workerResponse.statusCode).toBe(201);
      const workerAgentId = workerResponse.json().id as string;
      const workerRunDetailResponse = await app.inject({
        method: "GET",
        url: `/api/v1/runs/${ids.run}`,
        headers
      });
      const workerSessionId = workerRunDetailResponse.json().sessions.find((session: any) => session.agentId === workerAgentId).id as string;

      const peerResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "worker-frontend",
          role: "frontend-developer",
          status: "idle"
        }
      });

      expect(peerResponse.statusCode).toBe(201);
      const peerAgentId = peerResponse.json().id as string;

      const taskResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Oversized implementation slice",
          description: "Investigate the worker path and split it when the task spans multiple concerns.",
          role: "backend-developer",
          priority: 1,
          dependencyIds: [],
          acceptanceCriteria: ["follow-on slices are generated automatically when the worker asks for them"]
        }
      });

      const taskId = taskResponse.json().id as string;

      await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        headers,
        payload: {
          runId: ids.run,
          senderAgentId: leaderAgentId,
          recipientAgentId: workerAgentId,
          kind: "direct",
          body: "If the task is too large, ask for slicing and report the exact split."
        }
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        headers,
        payload: {
          runId: ids.run,
          senderAgentId: peerAgentId,
          recipientAgentId: workerAgentId,
          kind: "direct",
          body: "Frontend will need a smaller API-ready slice."
        }
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/worker-dispatch-assignments",
        headers,
        payload: {
          runId: ids.run,
          taskId,
          agentId: workerAgentId,
          sessionId: workerSessionId,
          repositoryId: ids.repository,
          repositoryName: "codex-swarm",
          stickyNodeId: ids.workerNode,
          requiredCapabilities: ["remote"],
          worktreePath: join(worktreeRoot, "worker-reslice"),
          prompt: "Primary worker dispatch prompt",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request"
        }
      });

      const prompts: string[] = [];
      let callCount = 0;
      const result = await runManagedWorkerDispatch({
        request,
        nodeId: ids.workerNode,
        workspaceRoot: process.cwd(),
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async (toolRequest: any) => {
          const prompt = "input" in toolRequest
            ? toolRequest.input.prompt
            : toolRequest.message.params.prompt;
          prompts.push(prompt);
          callCount += 1;

          if (callCount === 1) {
            return {
              threadId: "thread-worker-reslice",
              output: JSON.stringify({
                summary: "The worker path spans schema and API concerns and should be split.",
                status: "needs_slicing",
                messages: [
                  {
                    target: "leader",
                    body: "Please split this into schema prep and API follow-up slices."
                  },
                  {
                    target: "role:frontend-developer",
                    body: "Expect an API-ready handoff after the backend slices land."
                  }
                ],
                blockingIssues: [
                  "One worker task currently spans schema preparation and API wiring."
                ]
              })
            };
          }

          return {
            threadId: "thread-leader-reslice",
            output: JSON.stringify({
              summary: "Split the oversized worker slice into two follow-on tasks.",
              tasks: [
                {
                  key: "schema-slice",
                  title: "Prepare schema slice",
                  role: "backend-developer",
                  description: "Create the schema-facing preparation slice.",
                  definitionOfDone: ["schema concerns are isolated in a dedicated slice"],
                  acceptanceCriteria: ["schema concerns are isolated"],
                  dependencyKeys: []
                },
                {
                  key: "api-slice",
                  title: "Finish API follow-up slice",
                  role: "backend-developer",
                  description: "Finish the API wiring after the schema slice lands.",
                  definitionOfDone: ["API wiring follows the schema prep work cleanly"],
                  acceptanceCriteria: ["API wiring follows the schema prep work"],
                  dependencyKeys: ["schema-slice"]
                }
              ]
            })
          };
        }
      });

      expect(result).toMatchObject({
        status: "completed"
      });

      expect(prompts[0]).toContain("If the task is too large, ask for slicing");
      expect(prompts[0]).toContain("Frontend will need a smaller API-ready slice.");
      expect(prompts[0]).toContain("Run context:");
      expect(prompts[0]).toContain("\"eventName\": \"pull_request.opened\"");
      expect(prompts[0]).toContain("\"receiptId\": \"receipt-reslice\"");

      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/v1/messages?runId=${ids.run}`,
        headers
      });

      expect(messagesResponse.statusCode).toBe(200);
      expect(messagesResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            senderAgentId: workerAgentId,
            recipientAgentId: leaderAgentId,
            body: expect.stringContaining("needs_slicing")
          }),
          expect.objectContaining({
            senderAgentId: workerAgentId,
            recipientAgentId: leaderAgentId,
            body: "Please split this into schema prep and API follow-up slices."
          }),
          expect.objectContaining({
            senderAgentId: workerAgentId,
            recipientAgentId: peerAgentId,
            body: "Expect an API-ready handoff after the backend slices land."
          })
        ])
      );

      const tasksResponse = await app.inject({
        method: "GET",
        url: `/api/v1/tasks?runId=${ids.run}`,
        headers
      });

      expect(tasksResponse.statusCode).toBe(200);
      expect(tasksResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "Prepare schema slice",
            parentTaskId: taskId
          }),
          expect.objectContaining({
            title: "Finish API follow-up slice",
            parentTaskId: taskId,
            dependencyIds: expect.arrayContaining([expect.any(String)])
          })
        ])
      );
    } finally {
      await rm(worktreeRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("does not create follow-on tasks when a worker reports externally blocked work", async () => {
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
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-blocked-dispatch-repo-"));
    const worktreeRoot = await mkdtemp(join(tmpdir(), "codex-swarm-blocked-dispatch-"));

    try {
      await writeFile(join(repoRoot, "README.md"), "blocked worker dispatch\n", "utf8");
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Swarm"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex-swarm@example.com"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["add", "README.md"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoRoot, stdio: "pipe" });
      (verticalSlice as any).repositories[0].url = repoRoot;

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed: ${response.statusCode} ${response.body}`);
        }

        return response.json() as T;
      };

      await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Verify blocked worker outcomes do not auto-reslice",
          concurrencyCap: 2,
          metadata: {}
        }
      });

      const leaderResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "leader",
          role: "tech-lead",
          status: "idle",
          session: {
            threadId: "thread-leader-blocked",
            cwd: process.cwd(),
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: true,
            metadata: {
              source: "worker-blocked-test"
            }
          }
        }
      });

      expect(leaderResponse.statusCode).toBe(201);
      const leaderAgentId = leaderResponse.json().id as string;

      const workerResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "worker-primary",
          role: "tester",
          status: "idle",
          session: {
            threadId: "thread-worker-blocked",
            cwd: process.cwd(),
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: false,
            metadata: {
              source: "worker-blocked-test"
            }
          }
        }
      });

      expect(workerResponse.statusCode).toBe(201);
      const workerAgentId = workerResponse.json().id as string;
      const workerRunDetailResponse = await app.inject({
        method: "GET",
        url: `/api/v1/runs/${ids.run}`,
        headers
      });
      const workerSessionId = workerRunDetailResponse.json().sessions.find((session: any) => session.agentId === workerAgentId).id as string;

      const taskResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Inspect blocked workspace state",
          description: "Confirm the workspace state and report blockers without reslicing.",
          role: "tester",
          priority: 1,
          dependencyIds: [],
          acceptanceCriteria: ["reports a blocker without generating follow-on child tasks"],
          validationTemplates: []
        }
      });

      const taskId = taskResponse.json().id as string;

      await app.inject({
        method: "POST",
        url: "/api/v1/worker-dispatch-assignments",
        headers,
        payload: {
          runId: ids.run,
          taskId,
          agentId: workerAgentId,
          sessionId: workerSessionId,
          repositoryId: ids.repository,
          repositoryName: "codex-swarm",
          stickyNodeId: ids.workerNode,
          requiredCapabilities: ["remote"],
          worktreePath: join(worktreeRoot, "worker-blocked"),
          prompt: "Primary worker dispatch prompt",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request"
        }
      });

      const result = await runManagedWorkerDispatch({
        request,
        nodeId: ids.workerNode,
        workspaceRoot: process.cwd(),
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async () => ({
          threadId: "thread-worker-blocked",
          output: JSON.stringify({
            summary: "The required scaffold is missing in this workspace.",
            status: "blocked",
            blockerKind: "external",
            messages: [
              {
                target: "leader",
                body: "Blocked because the required scaffold is missing in this workspace."
              }
            ],
            blockingIssues: [
              "Current workspace does not contain the expected scaffold."
            ]
          })
        })
      });

      expect(result).toMatchObject({ status: "completed" });

      const tasksResponse = await app.inject({
        method: "GET",
        url: `/api/v1/tasks?runId=${ids.run}`,
        headers
      });

      expect(tasksResponse.statusCode).toBe(200);
      expect(tasksResponse.json().filter((task: any) => task.parentTaskId === taskId)).toEqual([]);

      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/v1/messages?runId=${ids.run}`,
        headers
      });

      expect(messagesResponse.statusCode).toBe(200);
      expect(messagesResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            senderAgentId: workerAgentId,
            recipientAgentId: leaderAgentId,
            body: "Blocked because the required scaffold is missing in this workspace."
          })
        ])
      );
    } finally {
      await rm(worktreeRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("creates unblock follow-on tasks when a worker reports an actionable blocker", async () => {
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
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-actionable-blocked-repo-"));
    const worktreeRoot = await mkdtemp(join(tmpdir(), "codex-swarm-actionable-blocked-"));

    try {
      await writeFile(join(repoRoot, "README.md"), "actionable blocked dispatch\n", "utf8");
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Swarm"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex-swarm@example.com"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["add", "README.md"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoRoot, stdio: "pipe" });
      (verticalSlice as any).repositories[0].url = repoRoot;

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed: ${response.statusCode} ${response.body}`);
        }

        return response.json() as T;
      };

      await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Verify actionable blocked worker outcomes expand into unblock tasks",
          concurrencyCap: 2,
          metadata: {}
        }
      });

      const leaderResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "leader",
          role: "tech-lead",
          status: "idle",
          session: {
            threadId: "thread-leader-unblock",
            cwd: process.cwd(),
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: true,
            metadata: {
              source: "worker-actionable-blocked-test"
            }
          }
        }
      });

      expect(leaderResponse.statusCode).toBe(201);
      const workerResponse = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "worker-primary",
          role: "tester",
          status: "idle",
          session: {
            threadId: "thread-worker-unblock",
            cwd: process.cwd(),
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: false,
            metadata: {
              source: "worker-actionable-blocked-test"
            }
          }
        }
      });

      expect(workerResponse.statusCode).toBe(201);
      const workerAgentId = workerResponse.json().id as string;
      const workerRunDetailResponse = await app.inject({
        method: "GET",
        url: `/api/v1/runs/${ids.run}`,
        headers
      });
      const workerSessionId = workerRunDetailResponse.json().sessions.find((session: any) => session.agentId === workerAgentId).id as string;

      const taskResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Implement feature behind missing scaffold",
          description: "Implementation is blocked until scaffold work exists.",
          role: "tester",
          priority: 1,
          dependencyIds: [],
          acceptanceCriteria: ["spawns unblock follow-on work"],
          validationTemplates: []
        }
      });

      const taskId = taskResponse.json().id as string;

      await app.inject({
        method: "POST",
        url: "/api/v1/worker-dispatch-assignments",
        headers,
        payload: {
          runId: ids.run,
          taskId,
          agentId: workerAgentId,
          sessionId: workerSessionId,
          repositoryId: ids.repository,
          repositoryName: "codex-swarm",
          stickyNodeId: ids.workerNode,
          requiredCapabilities: ["remote"],
          worktreePath: join(worktreeRoot, "worker-unblock"),
          prompt: "Primary worker dispatch prompt",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request"
        }
      });

      const result = await runManagedWorkerDispatch({
        request,
        nodeId: ids.workerNode,
        workspaceRoot: process.cwd(),
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async (toolRequest: any) => {
          const prompt = "input" in toolRequest
            ? toolRequest.input.prompt
            : toolRequest.message.params.prompt;

          if (prompt.includes("Primary worker dispatch prompt")) {
            return {
              threadId: "thread-worker-unblock",
              output: JSON.stringify({
                summary: "Implementation is blocked until scaffold tasks land.",
                status: "blocked",
                blockerKind: "actionable",
                messages: [
                  {
                    target: "leader",
                    body: "Please create scaffold and fixture follow-up tasks."
                  }
                ],
                blockingIssues: [
                  "Required scaffold files do not exist yet."
                ]
              })
            };
          }

          return {
            threadId: "thread-leader-unblock",
            output: JSON.stringify({
              summary: "Create the missing scaffold work before retrying implementation.",
              tasks: [
                {
                  key: "scaffold",
                  title: "Create scaffold files",
                  role: "backend-developer",
                  description: "Add the missing scaffold files needed by implementation.",
                  definitionOfDone: ["required scaffold files exist for the blocked task"],
                  acceptanceCriteria: ["scaffold files exist"],
                  dependencyKeys: []
                },
                {
                  key: "fixtures",
                  title: "Prepare scaffold fixtures",
                  role: "backend-developer",
                  description: "Add fixtures that validate the scaffold.",
                  definitionOfDone: ["fixtures validate the new scaffold files"],
                  acceptanceCriteria: ["fixtures cover the scaffold"],
                  dependencyKeys: ["scaffold"]
                }
              ]
            })
          };
        }
      });

      expect(result).toMatchObject({ status: "completed" });

      const tasksResponse = await app.inject({
        method: "GET",
        url: `/api/v1/tasks?runId=${ids.run}`,
        headers
      });

      const tasks = tasksResponse.json();
      const followOnTasks = tasks.filter((task: any) => task.parentTaskId === taskId);
      expect(followOnTasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "Create scaffold files",
            dependencyIds: []
          }),
          expect.objectContaining({
            title: "Prepare scaffold fixtures",
            dependencyIds: [expect.any(String)]
          })
        ])
      );
      expect(followOnTasks.some((task: any) => task.dependencyIds.includes(taskId))).toBe(false);
      const parentTask = tasks.find((task: any) => task.id === taskId);
      expect(parentTask.dependencyIds).toEqual(expect.arrayContaining(followOnTasks.map((task: any) => task.id)));
    } finally {
      await rm(worktreeRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("pauses a run behind policy-exception approval when execution exceeds the budget cap", async () => {
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
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-budget-dispatch-repo-"));
    const worktreeRoot = await mkdtemp(join(tmpdir(), "codex-swarm-budget-dispatch-"));

    try {
      await writeFile(join(repoRoot, "README.md"), "budget worker dispatch\n", "utf8");
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Swarm"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex-swarm@example.com"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["add", "README.md"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoRoot, stdio: "pipe" });
      (verticalSlice as any).repositories[0].url = repoRoot;

      const request: LeaderPlanningLoopRequest = async <T>(
        method: string,
        path: string,
        payload?: Record<string, unknown>
      ) => {
        const response = await (app.inject as any)({
          method,
          url: path,
          headers,
          ...(payload ? { payload } : {})
        }) as {
          statusCode: number;
          body: string;
          json(): T;
        };

        if (response.statusCode >= 400) {
          throw new Error(`${method} ${path} failed with ${response.statusCode}: ${response.body}`);
        }

        return response.json() as T;
      };

      await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Enforce runtime budget caps",
          budgetTokens: 100,
          budgetCostUsd: 0.25,
          concurrencyCap: 1,
          metadata: {}
        }
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers,
        payload: {
          runId: ids.run,
          name: "worker-budget",
          role: "backend-developer",
          status: "idle",
          session: {
            threadId: "thread-worker-budget",
            cwd: process.cwd(),
            sandbox: "workspace-write",
            approvalPolicy: "on-request",
            includePlanTool: false,
            metadata: {}
          }
        }
      });

      const taskResponse = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: {
          runId: ids.run,
          title: "Budget enforcement task",
          description: "Trip the run budget during execution",
          role: "backend-developer",
          priority: 1,
          dependencyIds: [],
          acceptanceCriteria: ["budget guard pauses the run"]
        }
      });

      const taskId = taskResponse.json().id as string;

      await app.inject({
        method: "POST",
        url: "/api/v1/worker-dispatch-assignments",
        headers,
        payload: {
          runId: ids.run,
          taskId,
          agentId: ids.agent,
          sessionId: ids.session,
          repositoryId: ids.repository,
          repositoryName: "codex-swarm",
          stickyNodeId: ids.workerNode,
          requiredCapabilities: ["remote"],
          worktreePath: join(worktreeRoot, "worker-budget"),
          prompt: "Continue the worker session",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request"
        }
      });

      const result = await runManagedWorkerDispatch({
        request,
        nodeId: ids.workerNode,
        workspaceRoot: process.cwd(),
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async () => ({
          threadId: "thread-worker-budget",
          output: JSON.stringify({
            summary: "worker completed",
            status: "completed",
            messages: [],
            blockingIssues: []
          }),
          metadata: {
            usage: {
              totalTokens: 120,
              costUsd: 0.5
            }
          }
        })
      });

      expect(result).toMatchObject({
        status: "completed"
      });

      const runResponse = await app.inject({
        method: "GET",
        url: `/api/v1/runs/${ids.run}`,
        headers
      });

      expect(runResponse.statusCode).toBe(200);
      expect(runResponse.json()).toMatchObject({
        status: "awaiting_approval",
        metadata: {
          budgetUsage: {
            tokensUsedTotal: 120,
            costUsdTotal: 0.5
          },
          budgetGuard: {
            decision: "awaiting_policy_exception",
            continueAllowed: false,
            exceeded: ["tokens", "cost"]
          }
        }
      });

      const approvalsResponse = await app.inject({
        method: "GET",
        url: `/api/v1/approvals?runId=${ids.run}`,
        headers
      });

      expect(approvalsResponse.statusCode).toBe(200);
      expect(approvalsResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "policy_exception",
            status: "pending",
            requestedPayload: expect.objectContaining({
              policyDecision: expect.objectContaining({
                policyKey: "run_budget",
                trigger: "budget_cap_exceeded",
                targetId: ids.run
              }),
              enforcement: expect.objectContaining({
                onApproval: "continue_run",
                onRejection: "remain_blocked"
              })
            })
          })
        ])
      );
    } finally {
      await rm(worktreeRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
      await app.close();
    }
  });

  it("allows later checkpoints after a budget policy exception is approved", async () => {
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

    try {
      await app.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers,
        payload: {
          repositoryId: ids.repository,
          goal: "Resume after budget exception approval",
          budgetTokens: 100,
          concurrencyCap: 1,
          metadata: {}
        }
      });

      const firstCheckpoint = await app.inject({
        method: "POST",
        url: `/api/v1/runs/${ids.run}/budget-checkpoints`,
        headers,
        payload: {
          source: "test.initial",
          tokensUsedDelta: 120,
          costUsdDelta: 0
        }
      });

      expect(firstCheckpoint.statusCode).toBe(200);
      expect(firstCheckpoint.json()).toMatchObject({
        continueAllowed: false,
        decision: "awaiting_policy_exception"
      });

      const pendingApproval = verticalSlice
        .listApprovals(ids.run)
        .then((approvals: any[]) => approvals.find((item) => item.kind === "policy_exception"));
      const approvalId = (await pendingApproval).id as string;

      await verticalSlice.resolveApproval(approvalId, {
        status: "approved",
        resolver: "reviewer-1",
        resolutionPayload: {
          outcome: "approved_exception",
          rationale: "Budget exception accepted for this run"
        }
      }, defaultBoundary);

      const secondCheckpoint = await app.inject({
        method: "POST",
        url: `/api/v1/runs/${ids.run}/budget-checkpoints`,
        headers,
        payload: {
          source: "test.after-approval",
          tokensUsedDelta: 0,
          costUsdDelta: 0
        }
      });

      expect(secondCheckpoint.statusCode).toBe(200);
      expect(secondCheckpoint.json()).toMatchObject({
        continueAllowed: true,
        decision: "approved_exception",
        exceeded: ["tokens"]
      });
    } finally {
      await app.close();
    }
  });
});
