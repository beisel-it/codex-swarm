import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  type ActorIdentity,
  type Approval,
  type ApprovalAuditEntry,
  type Artifact,
  type ArtifactCreateInput,
  type CleanupJobReport,
  type CleanupJobRunInput,
  type ControlPlaneEvent,
  type GovernanceAdminReport,
  type Run,
  type RunAuditExport,
  type Agent,
  type AgentCreateInput,
  type ApprovalCreateInput,
  type ApprovalResolveInput,
  type Repository,
  type RepositoryCreateInput,
  type RetentionPolicy,
  type RetentionReconcileReport,
  type RetentionWindowSummary,
  type RunCreateInput,
  type SecretIntegrationBoundary,
  type SecretAccessPlan,
  type WorkerDispatchAssignment,
  type WorkerDispatchCompleteInput,
  type WorkerDispatchCreateInput,
  type WorkerDispatchListQuery,
  type WorkerNodeReconcileInput,
  type WorkerNodeReconcileReport,
  type RunDetail,
  type RunStatusUpdateInput,
  type Session,
  type Task,
  type TaskCreateInput,
  type TaskStatusUpdateInput,
  type ValidationCreateInput,
  type ValidationHistoryEntry,
  type WorkerNode,
  type WorkerNodeDrainUpdateInput,
  type WorkerNodeHeartbeatInput,
  type WorkerNodeRegisterInput
} from "@codex-swarm/contracts";
import { resolveInitialTaskStatus } from "@codex-swarm/orchestration";
import { buildSessionRecoveryPlan } from "@codex-swarm/worker";

import type { AppDb } from "../db/client.js";
import {
  agents,
  approvals,
  artifacts,
  controlPlaneEvents,
  messages,
  repositories,
  runs,
  sessions,
  tasks,
  teams,
  validations,
  workerDispatchAssignments,
  workerNodes,
  workspaces
} from "../db/schema.js";
import type { Clock } from "../lib/clock.js";
import { HttpError } from "../lib/http-error.js";
import type {
  approvalCreateSchema,
  messageCreateSchema,
  runBranchPublishSchema,
  runPullRequestHandoffSchema,
  validationsListQuerySchema
} from "../http/schemas.js";
import { z } from "zod";

type RepositoryCreate = RepositoryCreateInput;
type RunCreate = RunCreateInput;
type RunStatusUpdate = RunStatusUpdateInput;
type TaskCreate = TaskCreateInput;
type TaskStatusUpdate = TaskStatusUpdateInput;
type AgentCreate = AgentCreateInput;
type MessageCreate = z.infer<typeof messageCreateSchema>;
type ApprovalCreate = ApprovalCreateInput;
type ApprovalResolve = ApprovalResolveInput;
type ValidationCreate = ValidationCreateInput;
type ArtifactCreate = ArtifactCreateInput;
type ValidationListQuery = z.infer<typeof validationsListQuerySchema>;
type RunBranchPublish = z.infer<typeof runBranchPublishSchema>;
type RunPullRequestHandoff = z.infer<typeof runPullRequestHandoffSchema>;
type WorkerNodeRegister = WorkerNodeRegisterInput;
type WorkerNodeHeartbeat = WorkerNodeHeartbeatInput;
type WorkerNodeDrainUpdate = WorkerNodeDrainUpdateInput;
type WorkerDispatchCreate = WorkerDispatchCreateInput;
type WorkerDispatchComplete = WorkerDispatchCompleteInput;
type WorkerNodeReconcile = WorkerNodeReconcileInput;
type AccessBoundary = Pick<ActorIdentity, "workspaceId" | "workspaceName" | "teamId" | "teamName">;

function assertAccessBoundary(access: AccessBoundary | undefined): asserts access is AccessBoundary & {
  workspaceId: string;
  teamId: string;
} {
  if (!access?.workspaceId || !access.teamId) {
    throw new HttpError(403, "workspace or team boundary is required");
  }
}

function requireAccessBoundary(access: AccessBoundary | undefined): {
  workspaceId: string;
  workspaceName: string | null;
  teamId: string;
  teamName: string | null;
} {
  assertAccessBoundary(access);

  return {
    workspaceId: access.workspaceId!,
    workspaceName: access.workspaceName ?? null,
    teamId: access.teamId!,
    teamName: access.teamName ?? null
  };
}

function workerNodeSupportsAssignment(
  workerNode: Pick<WorkerNode, "capabilityLabels" | "status" | "drainState" | "id">,
  assignment: Pick<WorkerDispatchAssignment, "stickyNodeId" | "requiredCapabilities">
) {
  if (!isWorkerNodeEligible(workerNode)) {
    return false;
  }

  if (assignment.stickyNodeId && assignment.stickyNodeId !== workerNode.id) {
    return false;
  }

  return assignment.requiredCapabilities.every((capability) => workerNode.capabilityLabels.includes(capability));
}

function workerDispatchRank(nodeId: string, assignment: Pick<WorkerDispatchAssignment, "stickyNodeId" | "preferredNodeId" | "createdAt">) {
  if (assignment.stickyNodeId === nodeId) {
    return 0;
  }

  if (assignment.preferredNodeId === nodeId) {
    return 1;
  }

  if (assignment.preferredNodeId === null) {
    return 2;
  }

  return 3;
}

function isWorkerNodeEligible(workerNode: Pick<WorkerNode, "status" | "drainState">) {
  return workerNode.status === "online" && workerNode.drainState === "active";
}

function createRetentionWindowSummary(
  dates: Array<Date | null | undefined>,
  retentionDays: number,
  now: Date
): RetentionWindowSummary {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const total = dates.filter((value): value is Date => value instanceof Date).length;
  const expired = dates.filter((value): value is Date => value instanceof Date && value.getTime() < cutoff.getTime()).length;

  return {
    total,
    expired,
    retained: total - expired
  };
}

function dedupeActors(actors: Array<ActorIdentity | null | undefined>) {
  const seen = new Set<string>();
  const result: ActorIdentity[] = [];

  for (const actor of actors) {
    if (!actor) {
      continue;
    }

    const key = `${actor.actorId}:${actor.teamId ?? "none"}:${actor.role}:${actor.policyProfile ?? "none"}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(actor);
  }

  return result;
}

function inferRepositoryProvider(url: string): Repository["provider"] {
  const normalizedUrl = url.toLowerCase();

  if (normalizedUrl.includes("github.com")) {
    return "github";
  }

  if (normalizedUrl.includes("gitlab")) {
    return "gitlab";
  }

  if (normalizedUrl.startsWith("file://") || normalizedUrl.includes("localhost")) {
    return "local";
  }

  return "other";
}

function dollarsToCents(value: number | undefined) {
  return value === undefined ? null : Math.round(value * 100);
}

function centsToDollars(value: number | null) {
  return value === null ? null : value / 100;
}

function expectPersistedRecord<T>(record: T | undefined, entity: string): T {
  if (!record) {
    throw new HttpError(500, `${entity} persistence failed`);
  }

  return record;
}

export class ControlPlaneService {
  constructor(
    private readonly db: AppDb,
    private readonly clock: Clock
  ) {}

  async listRepositories(access?: AccessBoundary) {
    const boundary = requireAccessBoundary(access);
    const rows = await this.db
      .select()
      .from(repositories)
      .where(and(
        eq(repositories.workspaceId, boundary.workspaceId),
        eq(repositories.teamId, boundary.teamId)
      ))
      .orderBy(asc(repositories.createdAt));
    return rows.map((repository) => this.mapRepository(repository));
  }

  async listWorkerNodes() {
    const rows = await this.db.select().from(workerNodes).orderBy(asc(workerNodes.createdAt));
    return rows.map((workerNode) => this.mapWorkerNode(workerNode));
  }

  async registerWorkerNode(input: WorkerNodeRegister) {
    const now = this.clock.now();
    const [workerNode] = await this.db.insert(workerNodes).values({
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      endpoint: input.endpoint ?? null,
      capabilityLabels: input.capabilityLabels,
      status: input.status,
      drainState: input.drainState,
      lastHeartbeatAt: now,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now
    }).returning();

    return this.mapWorkerNode(expectPersistedRecord(workerNode, "worker node"));
  }

  async recordWorkerNodeHeartbeat(nodeId: string, input: WorkerNodeHeartbeat) {
    await this.assertWorkerNodeExists(nodeId);
    const now = this.clock.now();
    const [workerNode] = await this.db.update(workerNodes).set({
      status: input.status,
      capabilityLabels: input.capabilityLabels,
      metadata: input.metadata,
      lastHeartbeatAt: now,
      updatedAt: now
    }).where(eq(workerNodes.id, nodeId)).returning();

    return this.mapWorkerNode(expectPersistedRecord(workerNode, "worker node"));
  }

  async updateWorkerNodeDrainState(nodeId: string, input: WorkerNodeDrainUpdate) {
    await this.assertWorkerNodeExists(nodeId);
    const now = this.clock.now();
    const [workerNode] = await this.db.update(workerNodes).set({
      drainState: input.drainState,
      metadata: input.reason ? { drainReason: input.reason } : undefined,
      updatedAt: now
    }).where(eq(workerNodes.id, nodeId)).returning();

    return this.mapWorkerNode(expectPersistedRecord(workerNode, "worker node"));
  }

  async createRepository(input: RepositoryCreate, access?: AccessBoundary) {
    const boundary = requireAccessBoundary(access);
    await this.ensureOwnershipBoundary(boundary);
    const id = crypto.randomUUID();
    const now = this.clock.now();

    const [repository] = await this.db.insert(repositories).values({
      id,
      workspaceId: boundary.workspaceId,
      teamId: boundary.teamId,
      name: input.name,
      url: input.url,
      provider: input.provider ?? inferRepositoryProvider(input.url),
      defaultBranch: input.defaultBranch,
      localPath: input.localPath ?? null,
      trustLevel: input.trustLevel,
      approvalProfile: input.approvalProfile,
      createdAt: now,
      updatedAt: now
    }).returning();

    return this.mapRepository(expectPersistedRecord(repository, "repository"));
  }

  async listRuns(repositoryId?: string, access?: AccessBoundary) {
    const boundary = requireAccessBoundary(access);
    if (repositoryId) {
      const repository = await this.assertRepositoryExists(repositoryId, boundary);
      const rows = await this.db.select().from(runs).where(and(
        eq(runs.repositoryId, repository.id),
        eq(runs.workspaceId, boundary.workspaceId),
        eq(runs.teamId, boundary.teamId)
      )).orderBy(asc(runs.createdAt));
      return rows.map((run) => this.mapRun(run));
    }

    const rows = await this.db.select().from(runs).where(and(
      eq(runs.workspaceId, boundary.workspaceId),
      eq(runs.teamId, boundary.teamId)
    )).orderBy(asc(runs.createdAt));
    return rows.map((run) => this.mapRun(run));
  }

  async getRun(runId: string, access?: AccessBoundary): Promise<RunDetail> {
    const run = await this.assertRunExists(runId, access);

    const [runTasks, runAgents, runSessions] = await Promise.all([
      this.db.select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.createdAt)),
      this.db.select().from(agents).where(eq(agents.runId, runId)).orderBy(asc(agents.createdAt)),
      this.db
        .select({ session: sessions })
        .from(sessions)
        .innerJoin(agents, eq(sessions.agentId, agents.id))
        .where(eq(agents.runId, runId))
        .orderBy(asc(sessions.createdAt))
    ]);

    return {
      ...this.mapRun(run),
      tasks: runTasks.map((task): Task => ({
        ...task,
        status: task.status as Task["status"]
      })),
      agents: runAgents.map((agent): Agent => ({
        ...agent,
        status: agent.status as Agent["status"]
      })),
      sessions: runSessions.map(({ session }): Session => this.mapSession(session))
    };
  }

  async createRun(input: RunCreate, createdBy: string, access?: AccessBoundary) {
    assertAccessBoundary(access);
    const repository = await this.assertRepositoryExists(input.repositoryId, access);

    const id = crypto.randomUUID();
    const now = this.clock.now();

    const [run] = await this.db.insert(runs).values({
      id,
      repositoryId: input.repositoryId,
      workspaceId: repository.workspaceId,
      teamId: repository.teamId,
      goal: input.goal,
      status: "pending",
      branchName: input.branchName ?? null,
      planArtifactPath: input.planArtifactPath ?? null,
      budgetTokens: input.budgetTokens ?? null,
      budgetCostUsd: dollarsToCents(input.budgetCostUsd),
      concurrencyCap: input.concurrencyCap,
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
      createdAt: now,
      updatedAt: now
    }).returning();

    return this.mapRun(expectPersistedRecord(run, "run"));
  }

  async updateRunStatus(runId: string, input: RunStatusUpdate, access?: AccessBoundary) {
    await this.assertRunExists(runId, access);
    const now = this.clock.now();

    const [run] = await this.db.update(runs).set({
      status: input.status,
      planArtifactPath: input.planArtifactPath ?? null,
      completedAt: input.status === "completed" ? now : null,
      updatedAt: now
    }).where(eq(runs.id, runId)).returning();

    return this.mapRun(expectPersistedRecord(run, "run"));
  }

  async publishRunBranch(runId: string, input: RunBranchPublish, access?: AccessBoundary) {
    const existingRun = await this.assertRunExists(runId, access);
    const now = this.clock.now();
    const branchName = input.branchName ?? existingRun.branchName;

    if (!branchName) {
      throw new HttpError(409, "run does not have a branch to publish");
    }

    const [run] = await this.db.update(runs).set({
      branchName,
      publishedBranch: branchName,
      branchPublishedAt: now,
      handoffStatus: "branch_published",
      updatedAt: now
    }).where(eq(runs.id, runId)).returning();

    return this.mapRun(expectPersistedRecord(run, "run"));
  }

  async createRunPullRequestHandoff(runId: string, input: RunPullRequestHandoff, access?: AccessBoundary) {
    const now = this.clock.now();
    const run = await this.assertRunExists(runId, access);
    const repository = await this.assertRepositoryExists(run.repositoryId, access);
    const headBranch = input.headBranch ?? run.publishedBranch ?? run.branchName;

    if (!headBranch) {
      throw new HttpError(409, "run must publish a branch before PR handoff");
    }

    const baseBranch = input.baseBranch ?? repository.defaultBranch;
    const handoffStatus = input.url
      ? input.status === "merged"
        ? "merged"
        : input.status === "closed"
          ? "closed"
          : "pr_open"
      : "manual_handoff";

    const [updatedRun] = await this.db.transaction(async (tx) => {
      const [persistedRun] = await tx.update(runs).set({
        publishedBranch: headBranch,
        pullRequestUrl: input.url ?? null,
        pullRequestNumber: input.number ?? null,
        pullRequestStatus: input.url ? input.status : null,
        handoffStatus,
        updatedAt: now
      }).where(eq(runs.id, runId)).returning();

      await tx.insert(artifacts).values({
        id: crypto.randomUUID(),
        runId,
        taskId: null,
        kind: input.url ? "pr_link" : "report",
        path: input.url ?? `.swarm/handoffs/${runId}/pull-request.json`,
        contentType: input.url ? "text/uri-list" : "application/json",
        metadata: {
          provider: input.provider ?? repository.provider,
          title: input.title,
          body: input.body,
          baseBranch,
          headBranch,
          pullRequestNumber: input.number ?? null,
          pullRequestStatus: input.url ? input.status : "manual_handoff",
          createdBy: input.createdBy
        },
        createdAt: now
      });

      return [persistedRun];
    });

    return this.mapRun(expectPersistedRecord(updatedRun, "run"));
  }

  async listTasks(runId?: string, access?: AccessBoundary) {
    const boundary = requireAccessBoundary(access);
    if (runId) {
      await this.assertRunExists(runId, boundary);
      return this.db.select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.createdAt));
    }

    return this.db.select({
      id: tasks.id,
      runId: tasks.runId,
      parentTaskId: tasks.parentTaskId,
      title: tasks.title,
      description: tasks.description,
      role: tasks.role,
      status: tasks.status,
      priority: tasks.priority,
      ownerAgentId: tasks.ownerAgentId,
      dependencyIds: tasks.dependencyIds,
      acceptanceCriteria: tasks.acceptanceCriteria,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt
    })
      .from(tasks)
      .innerJoin(runs, eq(tasks.runId, runs.id))
      .where(and(eq(runs.workspaceId, boundary.workspaceId), eq(runs.teamId, boundary.teamId)))
      .orderBy(asc(tasks.createdAt));
  }

  async createTask(input: TaskCreate, access?: AccessBoundary) {
    await this.assertRunExists(input.runId, access);

    if (input.ownerAgentId) {
      await this.assertAgentExists(input.ownerAgentId, access);
    }

    if (input.parentTaskId) {
      await this.assertTaskExists(input.parentTaskId, access);
    }

    await this.assertDependenciesBelongToRun(input.runId, input.dependencyIds);

    const id = crypto.randomUUID();
    const now = this.clock.now();
    const initialStatus = resolveInitialTaskStatus(input.dependencyIds);

    const [task] = await this.db.insert(tasks).values({
      id,
      runId: input.runId,
      parentTaskId: input.parentTaskId ?? null,
      title: input.title,
      description: input.description,
      role: input.role,
      status: initialStatus,
      priority: input.priority,
      ownerAgentId: input.ownerAgentId ?? null,
      dependencyIds: input.dependencyIds,
      acceptanceCriteria: input.acceptanceCriteria,
      createdAt: now,
      updatedAt: now
    }).returning();

    return expectPersistedRecord(task, "task");
  }

  async updateTaskStatus(taskId: string, input: TaskStatusUpdate, access?: AccessBoundary) {
    const task = await this.assertTaskExists(taskId, access);

    if (input.ownerAgentId) {
      await this.assertAgentExists(input.ownerAgentId, access);
    }

    const ready = await this.areDependenciesSatisfied(task.runId, task.dependencyIds);

    if (input.status === "in_progress" && !ready) {
      throw new HttpError(409, "task dependencies are not satisfied");
    }

    const effectiveStatus = ready && input.status === "blocked" ? "pending" : input.status;
    const now = this.clock.now();

    const [updated] = await this.db.update(tasks).set({
      status: effectiveStatus,
      ownerAgentId: input.ownerAgentId ?? task.ownerAgentId,
      updatedAt: now
    }).where(eq(tasks.id, taskId)).returning();

    await this.maybeUnblockDependentTasks(task.runId, taskId, effectiveStatus);

    return expectPersistedRecord(updated, "task");
  }

  async createAgent(input: AgentCreate, access?: AccessBoundary) {
    const run = await this.assertRunExists(input.runId, access);

    if (input.currentTaskId) {
      await this.assertTaskExists(input.currentTaskId, access);
    }

    const activeAgents = await this.db
      .select({ status: agents.status })
      .from(agents)
      .where(eq(agents.runId, input.runId));
    const activeAgentCount = activeAgents.filter((agent) =>
      agent.status === "provisioning"
      || agent.status === "idle"
      || agent.status === "busy"
      || agent.status === "paused").length;

    if (activeAgentCount >= run.concurrencyCap) {
      throw new HttpError(409, `run concurrency cap of ${run.concurrencyCap} active agents reached`);
    }

    const id = crypto.randomUUID();
    const now = this.clock.now();

    const [agent] = await this.db.transaction(async (tx) => {
      const [createdAgent] = await tx.insert(agents).values({
        id,
        runId: input.runId,
        name: input.name,
        role: input.role,
        status: input.status,
        worktreePath: input.worktreePath ?? null,
        branchName: input.branchName ?? null,
        currentTaskId: input.currentTaskId ?? null,
        lastHeartbeatAt: null,
        createdAt: now,
        updatedAt: now
      }).returning();

      if (input.session && createdAgent) {
        const sessionState: Session["state"] = "active";

        if (input.session.workerNodeId) {
          const workerNode = await this.assertWorkerNodeExists(input.session.workerNodeId);
          const missingLabels = input.session.placementConstraintLabels.filter((label) =>
            !workerNode.capabilityLabels.includes(label));

          if (!isWorkerNodeEligible(this.mapWorkerNode(workerNode))) {
            throw new HttpError(409, `worker node ${workerNode.id} is not eligible for scheduling`);
          }

          if (missingLabels.length > 0) {
            throw new HttpError(409, `worker node ${workerNode.id} is missing required capability labels: ${missingLabels.join(", ")}`);
          }
        }

        await tx.insert(sessions).values({
          id: crypto.randomUUID(),
          agentId: createdAgent.id,
          threadId: input.session.threadId,
          cwd: input.session.cwd,
          sandbox: input.session.sandbox,
          approvalPolicy: input.session.approvalPolicy,
          includePlanTool: input.session.includePlanTool,
          workerNodeId: input.session.workerNodeId ?? null,
          stickyNodeId: input.session.workerNodeId ?? null,
          placementConstraintLabels: input.session.placementConstraintLabels,
          state: sessionState,
          staleReason: null,
          metadata: input.session.metadata,
          createdAt: now,
          updatedAt: now
        });
      }

      return [createdAgent];
    });

    return expectPersistedRecord(agent, "agent");
  }

  async listAgents(runId?: string, access?: AccessBoundary) {
    const boundary = requireAccessBoundary(access);
    if (runId) {
      await this.assertRunExists(runId, boundary);
      return this.db.select().from(agents).where(eq(agents.runId, runId)).orderBy(asc(agents.createdAt));
    }

    return this.db.select({
      id: agents.id,
      runId: agents.runId,
      name: agents.name,
      role: agents.role,
      status: agents.status,
      worktreePath: agents.worktreePath,
      branchName: agents.branchName,
      currentTaskId: agents.currentTaskId,
      lastHeartbeatAt: agents.lastHeartbeatAt,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt
    })
      .from(agents)
      .innerJoin(runs, eq(agents.runId, runs.id))
      .where(and(eq(runs.workspaceId, boundary.workspaceId), eq(runs.teamId, boundary.teamId)))
      .orderBy(asc(agents.createdAt));
  }

  async createMessage(input: MessageCreate, access?: AccessBoundary) {
    await this.assertRunExists(input.runId, access);

    if (input.senderAgentId) {
      await this.assertAgentExists(input.senderAgentId, access);
    }

    if (input.recipientAgentId) {
      await this.assertAgentExists(input.recipientAgentId, access);
    }

    const [message] = await this.db.insert(messages).values({
      id: crypto.randomUUID(),
      runId: input.runId,
      senderAgentId: input.senderAgentId ?? null,
      recipientAgentId: input.recipientAgentId ?? null,
      kind: input.kind,
      body: input.body,
      createdAt: this.clock.now()
    }).returning();

    return expectPersistedRecord(message, "message");
  }

  async listMessages(runId: string, access?: AccessBoundary) {
    await this.assertRunExists(runId, access);
    return this.db.select().from(messages).where(eq(messages.runId, runId)).orderBy(asc(messages.createdAt));
  }

  async createApproval(input: ApprovalCreate, access?: AccessBoundary) {
    const run = await this.assertRunExists(input.runId, access);

    if (input.taskId) {
      await this.assertTaskExists(input.taskId, access);
    }

    const now = this.clock.now();
    const [approval] = await this.db.insert(approvals).values({
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
      resolver: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now
    }).returning();

    return expectPersistedRecord(approval, "approval");
  }

  async listApprovals(runId?: string, access?: AccessBoundary) {
    const boundary = requireAccessBoundary(access);
    if (runId) {
      await this.assertRunExists(runId, boundary);
      const rows = await this.db.select().from(approvals).where(and(
        eq(approvals.runId, runId),
        eq(approvals.workspaceId, boundary.workspaceId),
        eq(approvals.teamId, boundary.teamId)
      )).orderBy(asc(approvals.createdAt));
      return rows.map((approval): Approval => ({
        ...approval,
        kind: approval.kind as Approval["kind"],
        status: approval.status as Approval["status"]
      }));
    }

    const rows = await this.db.select().from(approvals).where(and(
      eq(approvals.workspaceId, boundary.workspaceId),
      eq(approvals.teamId, boundary.teamId)
    )).orderBy(asc(approvals.createdAt));
    return rows.map((approval): Approval => ({
      ...approval,
      kind: approval.kind as Approval["kind"],
      status: approval.status as Approval["status"]
    }));
  }

  async getApproval(approvalId: string, access?: AccessBoundary) {
    const [approval] = await this.db.select().from(approvals).where(eq(approvals.id, approvalId));

    if (!approval) {
      throw new HttpError(404, `approval ${approvalId} not found`);
    }

    this.assertBoundaryMatch(access, approval.workspaceId, approval.teamId, "approval", approvalId);

    return expectPersistedRecord(approval, "approval");
  }

  async resolveApproval(approvalId: string, input: ApprovalResolve, access?: AccessBoundary) {
    await this.getApproval(approvalId, access);
    const now = this.clock.now();

    const [approval] = await this.db.update(approvals).set({
      status: input.status,
      resolver: input.resolver,
      resolutionPayload: {
        ...input.resolutionPayload,
        feedback: input.feedback ?? null
      },
      resolvedAt: now,
      updatedAt: now
    }).where(eq(approvals.id, approvalId)).returning();

    if (!approval) {
      throw new HttpError(404, `approval ${approvalId} not found`);
    }

    return expectPersistedRecord(approval, "approval");
  }

  async createValidation(input: ValidationCreate, access?: AccessBoundary) {
    await this.assertRunExists(input.runId, access);

    if (input.taskId) {
      await this.assertTaskExists(input.taskId, access);
    }

    const artifactIds = await this.resolveValidationArtifactIds(
      input.runId,
      input.taskId ?? null,
      input.artifactIds,
      input.artifactPath ?? null
    );
    const now = this.clock.now();
    const [validation] = await this.db.insert(validations).values({
      id: crypto.randomUUID(),
      runId: input.runId,
      taskId: input.taskId ?? null,
      name: input.name,
      status: input.status,
      command: input.command,
      summary: input.summary ?? null,
      artifactPath: input.artifactPath ?? null,
      artifactIds,
      createdAt: now,
      updatedAt: now
    }).returning();

    return this.hydrateValidationHistoryEntry(expectPersistedRecord(validation, "validation"));
  }

  async listValidations(query: ValidationListQuery | string, access?: AccessBoundary): Promise<ValidationHistoryEntry[]> {
    const { runId, taskId } = typeof query === "string"
      ? { runId: query, taskId: undefined }
      : query;

    await this.assertRunExists(runId, access);

    const clauses = [eq(validations.runId, runId)];

    if (taskId) {
      clauses.push(eq(validations.taskId, taskId));
    }

    const rows = await this.db
      .select()
      .from(validations)
      .where(and(...clauses))
      .orderBy(asc(validations.createdAt));

    return this.hydrateValidationHistory(rows);
  }

  async createArtifact(input: ArtifactCreate, access?: AccessBoundary) {
    await this.assertRunExists(input.runId, access);

    if (input.taskId) {
      await this.assertTaskExists(input.taskId, access);
    }

    const [artifact] = await this.db.insert(artifacts).values({
      id: crypto.randomUUID(),
      runId: input.runId,
      taskId: input.taskId ?? null,
      kind: input.kind,
      path: input.path,
      contentType: input.contentType,
      metadata: input.metadata,
      createdAt: this.clock.now()
    }).returning();

    return expectPersistedRecord(artifact, "artifact");
  }

  async listWorkerDispatchAssignments(query: WorkerDispatchListQuery = {}) {
    const rows = await this.db.select().from(workerDispatchAssignments).orderBy(asc(workerDispatchAssignments.createdAt));

    return rows
      .filter((assignment) => query.runId ? assignment.runId === query.runId : true)
      .filter((assignment) => query.nodeId ? assignment.claimedByNodeId === query.nodeId : true)
      .filter((assignment) => query.state ? assignment.state === query.state : true)
      .map((assignment) => this.mapWorkerDispatchAssignment(assignment));
  }

  async createWorkerDispatchAssignment(input: WorkerDispatchCreate) {
    await this.assertRunExists(input.runId);
    await this.assertTaskExists(input.taskId);
    await this.assertAgentExists(input.agentId);
    await this.assertRepositoryExists(input.repositoryId);

    if (input.sessionId) {
      await this.assertSessionExists(input.sessionId);
    }

    if (input.stickyNodeId) {
      await this.assertWorkerNodeExists(input.stickyNodeId);
    }

    if (input.preferredNodeId) {
      await this.assertWorkerNodeExists(input.preferredNodeId);
    }

    const now = this.clock.now();
    const [assignment] = await this.db.insert(workerDispatchAssignments).values({
      id: crypto.randomUUID(),
      runId: input.runId,
      taskId: input.taskId,
      agentId: input.agentId,
      sessionId: input.sessionId ?? null,
      repositoryId: input.repositoryId,
      repositoryName: input.repositoryName,
      queue: input.queue,
      state: "queued",
      stickyNodeId: input.stickyNodeId,
      preferredNodeId: input.preferredNodeId,
      claimedByNodeId: null,
      requiredCapabilities: input.requiredCapabilities,
      worktreePath: input.worktreePath,
      branchName: input.branchName,
      prompt: input.prompt,
      profile: input.profile,
      sandbox: input.sandbox,
      approvalPolicy: input.approvalPolicy,
      includePlanTool: input.includePlanTool,
      metadata: input.metadata,
      attempt: 0,
      maxAttempts: input.maxAttempts,
      leaseTtlSeconds: input.leaseTtlSeconds,
      claimedAt: null,
      completedAt: null,
      lastFailureReason: null,
      createdAt: now,
      updatedAt: now
    }).returning();

    return this.mapWorkerDispatchAssignment(expectPersistedRecord(assignment, "worker dispatch assignment"));
  }

  async claimNextWorkerDispatch(nodeId: string) {
    const workerNode = this.mapWorkerNode(await this.assertWorkerNodeExists(nodeId));

    if (!isWorkerNodeEligible(workerNode)) {
      throw new HttpError(409, `worker node ${workerNode.id} is not eligible for scheduling`);
    }

    const rows = await this.db
      .select()
      .from(workerDispatchAssignments)
      .where(inArray(workerDispatchAssignments.state, ["queued", "retrying"]))
      .orderBy(asc(workerDispatchAssignments.createdAt));

    const candidates = rows
      .map((assignment) => this.mapWorkerDispatchAssignment(assignment))
      .filter((assignment) => workerNodeSupportsAssignment(workerNode, assignment))
      .sort((left, right) => {
        const leftRank = workerDispatchRank(nodeId, left);
        const rightRank = workerDispatchRank(nodeId, right);

        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return left.createdAt.getTime() - right.createdAt.getTime();
      });

    const nextAssignment = candidates[0];

    if (!nextAssignment) {
      return null;
    }

    const now = this.clock.now();
    const [updatedAssignment] = await this.db.update(workerDispatchAssignments).set({
      state: "claimed",
      stickyNodeId: nextAssignment.stickyNodeId ?? nodeId,
      preferredNodeId: nodeId,
      claimedByNodeId: nodeId,
      claimedAt: now,
      updatedAt: now
    }).where(eq(workerDispatchAssignments.id, nextAssignment.id)).returning();

    if (nextAssignment.sessionId) {
      await this.db.update(sessions).set({
        workerNodeId: nodeId,
        stickyNodeId: nextAssignment.stickyNodeId ?? nodeId,
        state: "active",
        staleReason: null,
        updatedAt: now
      }).where(eq(sessions.id, nextAssignment.sessionId));
    }

    await this.db.update(agents).set({
      status: "busy",
      lastHeartbeatAt: now,
      updatedAt: now
    }).where(eq(agents.id, nextAssignment.agentId));

    return this.mapWorkerDispatchAssignment(expectPersistedRecord(updatedAssignment, "worker dispatch assignment"));
  }

  async completeWorkerDispatch(assignmentId: string, input: WorkerDispatchComplete) {
    const assignment = this.mapWorkerDispatchAssignment(await this.assertWorkerDispatchAssignmentExists(assignmentId));

    if (assignment.claimedByNodeId && assignment.claimedByNodeId !== input.nodeId) {
      throw new HttpError(409, `worker dispatch assignment ${assignmentId} is claimed by a different node`);
    }

    return this.transitionWorkerDispatchFailureOrCompletion(assignment, input.status, input.reason ?? null, input.nodeId);
  }

  async reconcileWorkerNode(nodeId: string, input: WorkerNodeReconcile): Promise<WorkerNodeReconcileReport> {
    await this.assertWorkerNodeExists(nodeId);
    const now = this.clock.now();

    if (input.markOffline) {
      await this.db.update(workerNodes).set({
        status: "offline",
        drainState: "drained",
        updatedAt: now
      }).where(eq(workerNodes.id, nodeId));
    }

    const claimedAssignments = await this.db.select().from(workerDispatchAssignments)
      .where(and(
        eq(workerDispatchAssignments.claimedByNodeId, nodeId),
        eq(workerDispatchAssignments.state, "claimed")
      ))
      .orderBy(asc(workerDispatchAssignments.createdAt));
    const nodeAssignments = claimedAssignments.map((assignment) => this.mapWorkerDispatchAssignment(assignment));

    let retriedAssignments = 0;
    let failedAssignments = 0;

    for (const assignment of nodeAssignments) {
      const updated = await this.transitionWorkerDispatchFailureOrCompletion(
        assignment,
        "failed",
        `node_lost:${input.reason}`,
        nodeId
      );

      if (updated.state === "retrying") {
        retriedAssignments += 1;
      } else if (updated.state === "failed") {
        failedAssignments += 1;
      }
    }

    const strandedSessions = await this.db.select().from(sessions)
      .where(eq(sessions.workerNodeId, nodeId))
      .orderBy(asc(sessions.createdAt));
    const trackedSessionIds = new Set(nodeAssignments.map((assignment) => assignment.sessionId).filter((sessionId): sessionId is string => sessionId !== undefined));
    const orphanSessions = strandedSessions.filter((session) => !trackedSessionIds.has(session.id));

    for (const session of orphanSessions) {
      await this.db.update(sessions).set({
        workerNodeId: null,
        stickyNodeId: null,
        state: "stale",
        staleReason: `node_lost:${input.reason}`,
        updatedAt: now
      }).where(eq(sessions.id, session.id));
    }

    return {
      nodeId,
      retriedAssignments,
      failedAssignments,
      staleSessions: nodeAssignments.length + orphanSessions.length,
      completedAt: now
    };
  }

  async listArtifacts(runId: string, access?: AccessBoundary) {
    await this.assertRunExists(runId, access);
    const rows = await this.db.select().from(artifacts).where(eq(artifacts.runId, runId)).orderBy(asc(artifacts.createdAt));
    return rows.map((artifact): Artifact => ({
      ...artifact,
      kind: artifact.kind as Artifact["kind"]
    }));
  }

  async exportRunAudit(runId: string, exportedBy: ActorIdentity, retentionPolicy: RetentionPolicy, access?: AccessBoundary): Promise<RunAuditExport> {
    const [runDetail, approvalsList, validationsList, artifactsList, events, allWorkerNodes] = await Promise.all([
      this.getRun(runId, access),
      this.listApprovals(runId, access),
      this.listValidations(runId, access),
      this.listArtifacts(runId, access),
      this.db.select().from(controlPlaneEvents)
        .where(eq(controlPlaneEvents.runId, runId))
        .orderBy(asc(controlPlaneEvents.createdAt)),
      this.listWorkerNodes()
    ]);
    const repository = await this.assertRepositoryExists(runDetail.repositoryId, access);
    const now = this.clock.now();
    const mappedEvents = events.map((event): ControlPlaneEvent => event);
    const approvalAuditEntries = this.buildApprovalAuditEntries(
      approvalsList,
      runDetail,
      this.mapRepository(repository),
      mappedEvents
    );

    return {
      repository: this.mapRepository(repository),
      run: this.mapRun(await this.assertRunExists(runId, access)),
      tasks: runDetail.tasks,
      agents: runDetail.agents,
      sessions: runDetail.sessions,
      workerNodes: allWorkerNodes.filter((workerNode) =>
        runDetail.sessions.some((session) =>
          session.workerNodeId === workerNode.id || session.stickyNodeId === workerNode.id)),
      approvals: approvalsList,
      validations: validationsList,
      artifacts: artifactsList,
      events: mappedEvents,
      provenance: {
        exportedBy,
        approvals: approvalAuditEntries,
        eventActors: dedupeActors(mappedEvents.map((event) => event.actor)),
        generatedAt: now
      },
      retention: {
        policy: retentionPolicy,
        runs: createRetentionWindowSummary([runDetail.completedAt ?? runDetail.createdAt], retentionPolicy.runsDays, now),
        artifacts: createRetentionWindowSummary(artifactsList.map((artifact) => artifact.createdAt), retentionPolicy.artifactsDays, now),
        events: createRetentionWindowSummary(mappedEvents.map((event) => event.createdAt), retentionPolicy.eventsDays, now)
      },
      exportedAt: now
    };
  }

  async getGovernanceAdminReport(input: {
    requestedBy: ActorIdentity;
    retentionPolicy: RetentionPolicy;
    secrets: SecretIntegrationBoundary;
    access: AccessBoundary;
    runId?: string;
    limit?: number;
  }): Promise<GovernanceAdminReport> {
    const now = this.clock.now();
    assertAccessBoundary(input.access);
    const [repositoryRows, runRows, approvalRows] = await Promise.all([
      this.db.select().from(repositories)
        .where(and(eq(repositories.workspaceId, input.access.workspaceId), eq(repositories.teamId, input.access.teamId)))
        .orderBy(asc(repositories.createdAt)),
      input.runId
        ? this.db.select().from(runs).where(and(
          eq(runs.id, input.runId),
          eq(runs.workspaceId, input.access.workspaceId),
          eq(runs.teamId, input.access.teamId)
        )).orderBy(asc(runs.createdAt))
        : this.db.select().from(runs).where(and(
          eq(runs.workspaceId, input.access.workspaceId),
          eq(runs.teamId, input.access.teamId)
        )).orderBy(asc(runs.createdAt)),
      input.runId
        ? this.db.select().from(approvals).where(and(
          eq(approvals.runId, input.runId),
          eq(approvals.workspaceId, input.access.workspaceId),
          eq(approvals.teamId, input.access.teamId)
        )).orderBy(asc(approvals.createdAt))
        : this.db.select().from(approvals).where(and(
          eq(approvals.workspaceId, input.access.workspaceId),
          eq(approvals.teamId, input.access.teamId)
        )).orderBy(asc(approvals.createdAt))
    ]);
    const governedRunIds = runRows.map((run) => run.id);
    const [artifactRows, eventRows] = governedRunIds.length === 0
      ? [[], []]
      : await Promise.all([
        this.db.select().from(artifacts)
          .where(inArray(artifacts.runId, governedRunIds))
          .orderBy(asc(artifacts.createdAt)),
        this.db.select().from(controlPlaneEvents)
          .where(inArray(controlPlaneEvents.runId, governedRunIds))
          .orderBy(asc(controlPlaneEvents.createdAt))
      ]);

    const repositoriesById = new Map(repositoryRows.map((repository) => [repository.id, this.mapRepository(repository)] as const));
    const runsById = new Map(runRows.map((run) => [run.id, this.mapRun(run)] as const));
    const approvalHistory = approvalRows
      .map((approval): Approval => ({
        ...approval,
        kind: approval.kind as Approval["kind"],
        status: approval.status as Approval["status"]
      }))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, input.limit ?? 50)
      .map((approval) => {
        const run = runsById.get(approval.runId);
        const repository = run ? repositoriesById.get(run.repositoryId) : undefined;

        return this.buildApprovalAuditEntry(
          approval,
          run,
          repository,
          eventRows.map((event): ControlPlaneEvent => event)
        );
      });

    const repositoryProfiles = [...repositoriesById.values()]
      .reduce<Map<string, { profile: string; repositoryCount: number; runCount: number }>>((acc, repository) => {
        const entry = acc.get(repository.approvalProfile) ?? {
          profile: repository.approvalProfile,
          repositoryCount: 0,
          runCount: 0
        };
        entry.repositoryCount += 1;
        entry.runCount += runRows.filter((run) => run.repositoryId === repository.id).length;
        acc.set(repository.approvalProfile, entry);
        return acc;
      }, new Map());

    return {
      generatedAt: now,
      requestedBy: input.requestedBy,
      retention: {
        policy: input.retentionPolicy,
        runs: createRetentionWindowSummary(runRows.map((run) => run.completedAt ?? run.createdAt), input.retentionPolicy.runsDays, now),
        artifacts: createRetentionWindowSummary(artifactRows.map((artifact) => artifact.createdAt), input.retentionPolicy.artifactsDays, now),
        events: createRetentionWindowSummary(eventRows.map((event) => event.createdAt), input.retentionPolicy.eventsDays, now)
      },
      approvals: {
        total: approvalRows.length,
        pending: approvalRows.filter((approval) => approval.status === "pending").length,
        approved: approvalRows.filter((approval) => approval.status === "approved").length,
        rejected: approvalRows.filter((approval) => approval.status === "rejected").length,
        history: approvalHistory
      },
      policies: {
        repositoryProfiles: [...repositoryProfiles.values()],
        sensitiveRepositories: [...repositoriesById.values()]
          .filter((repository) => repository.trustLevel !== "trusted" || repository.approvalProfile !== "standard")
          .map((repository) => ({
            repositoryId: repository.id,
            repositoryName: repository.name,
            trustLevel: repository.trustLevel,
            approvalProfile: repository.approvalProfile
          }))
      },
      secrets: input.secrets
    };
  }

  async reconcileGovernanceRetention(input: {
    requestedBy: ActorIdentity;
    retentionPolicy: RetentionPolicy;
    dryRun: boolean;
    access: AccessBoundary;
    runId?: string;
  }): Promise<RetentionReconcileReport> {
    const now = this.clock.now();
    assertAccessBoundary(input.access);
    const runsRows = input.runId
      ? await this.db.select().from(runs).where(and(
        eq(runs.id, input.runId),
        eq(runs.workspaceId, input.access.workspaceId),
        eq(runs.teamId, input.access.teamId)
      ))
      : await this.db.select().from(runs).where(and(
        eq(runs.workspaceId, input.access.workspaceId),
        eq(runs.teamId, input.access.teamId)
      ));
    const governedRunIds = runsRows.map((run) => run.id);
    const [artifactRows, eventRows] = governedRunIds.length === 0
      ? [[], []]
      : await Promise.all([
        this.db.select().from(artifacts).where(inArray(artifacts.runId, governedRunIds)),
        this.db.select().from(controlPlaneEvents).where(inArray(controlPlaneEvents.runId, governedRunIds))
      ]);

    const reconcileMetadata = (existing: Record<string, unknown>, expiresAt: Date) => ({
      ...existing,
      retention: {
        expiresAt: expiresAt.toISOString(),
        lastAppliedAt: now.toISOString(),
        appliedBy: input.requestedBy.principal
      }
    });

    if (!input.dryRun) {
      for (const run of runsRows) {
        const expiresAt = new Date((run.completedAt ?? run.createdAt).getTime() + input.retentionPolicy.runsDays * 24 * 60 * 60 * 1000);
        await this.db.update(runs).set({
          metadata: reconcileMetadata(run.metadata, expiresAt),
          updatedAt: now
        }).where(eq(runs.id, run.id));
      }

      for (const artifact of artifactRows) {
        const expiresAt = new Date(artifact.createdAt.getTime() + input.retentionPolicy.artifactsDays * 24 * 60 * 60 * 1000);
        await this.db.update(artifacts).set({
          metadata: reconcileMetadata(artifact.metadata, expiresAt)
        }).where(eq(artifacts.id, artifact.id));
      }

      for (const event of eventRows) {
        const expiresAt = new Date(event.createdAt.getTime() + input.retentionPolicy.eventsDays * 24 * 60 * 60 * 1000);
        await this.db.update(controlPlaneEvents).set({
          metadata: reconcileMetadata(event.metadata, expiresAt)
        }).where(eq(controlPlaneEvents.id, event.id));
      }
    }

    return {
      dryRun: input.dryRun,
      appliedAt: now,
      requestedBy: input.requestedBy,
      runsUpdated: runsRows.length,
      artifactsUpdated: artifactRows.length,
      eventsUpdated: eventRows.length
    };
  }

  async getRepositorySecretAccessPlan(input: {
    repositoryId: string;
    secrets: SecretIntegrationBoundary;
    access: AccessBoundary;
  }): Promise<SecretAccessPlan> {
    const repository = this.mapRepository(await this.assertRepositoryExists(input.repositoryId, input.access));
    const trustAllowed = input.secrets.allowedRepositoryTrustLevels.includes(repository.trustLevel);
    const sensitivePolicy = input.secrets.sensitivePolicyProfiles.includes(repository.approvalProfile);
    const access = !trustAllowed
      ? "denied"
      : sensitivePolicy
        ? "brokered"
        : "allowed";

    return {
      repositoryId: repository.id,
      repositoryName: repository.name,
      trustLevel: repository.trustLevel,
      policyProfile: repository.approvalProfile,
      access,
      sourceMode: input.secrets.sourceMode,
      provider: input.secrets.provider,
      credentialEnvNames: input.secrets.remoteCredentialEnvNames,
      distributionBoundary: input.secrets.credentialDistribution,
      reason: access === "denied"
        ? `trust level ${repository.trustLevel} is outside the configured secret boundary`
        : access === "brokered"
          ? `policy profile ${repository.approvalProfile} requires brokered secret delivery for governed repos`
          : `repository can receive the standard ${input.secrets.sourceMode} secret path`
    };
  }

  async runCleanupJob(input: CleanupJobRunInput): Promise<CleanupJobReport> {
    const now = this.clock.now();
    const query = this.db
      .select({
        sessionId: sessions.id,
        runId: agents.runId,
        agentId: agents.id,
        worktreePath: agents.worktreePath,
        state: sessions.state,
        threadId: sessions.threadId,
        lastHeartbeatAt: agents.lastHeartbeatAt
      })
      .from(sessions)
      .innerJoin(agents, eq(sessions.agentId, agents.id));

    const rows = input.runId
      ? await query.where(eq(agents.runId, input.runId))
      : await query;

    const candidates = rows.map((row) => ({
      sessionId: row.sessionId,
      runId: row.runId,
      agentId: row.agentId,
      worktreePath: row.worktreePath ?? `untracked/${row.agentId}`,
      state: row.state as "pending" | "active" | "stopped" | "failed" | "stale" | "archived",
      threadId: row.threadId,
      lastHeartbeatAt: row.lastHeartbeatAt
    }));

    const recoveryPlan = buildSessionRecoveryPlan(candidates, {
      now,
      staleAfterMs: input.staleAfterMinutes * 60 * 1000,
      existingWorktreePaths: input.existingWorktreePaths
    });
    const rowBySessionId = new Map(rows.map((row) => [row.sessionId, row] as const));

    for (const item of recoveryPlan) {
      const row = rowBySessionId.get(item.sessionId);

      if (!row) {
        continue;
      }

      if (item.action === "resume") {
        await this.db.update(sessions).set({
          state: "active",
          staleReason: null,
          updatedAt: now
        }).where(eq(sessions.id, item.sessionId));
        continue;
      }

      if (item.action === "retry") {
        await this.db.update(sessions).set({
          state: "pending",
          staleReason: item.reason,
          updatedAt: now
        }).where(eq(sessions.id, item.sessionId));
        await this.db.update(agents).set({
          status: "idle",
          updatedAt: now
        }).where(eq(agents.id, row.agentId));
        continue;
      }

      if (item.action === "mark_stale") {
        await this.db.update(sessions).set({
          state: "stale",
          staleReason: item.reason,
          updatedAt: now
        }).where(eq(sessions.id, item.sessionId));
        await this.db.update(agents).set({
          status: "failed",
          updatedAt: now
        }).where(eq(agents.id, row.agentId));
        continue;
      }

      await this.db.update(sessions).set({
        state: "archived",
        staleReason: null,
        updatedAt: now
      }).where(eq(sessions.id, item.sessionId));
      await this.db.update(agents).set({
        status: "stopped",
        updatedAt: now
      }).where(eq(agents.id, row.agentId));
    }

    return {
      scannedSessions: recoveryPlan.length,
      resumed: recoveryPlan.filter((item) => item.action === "resume").length,
      retried: recoveryPlan.filter((item) => item.action === "retry").length,
      markedStale: recoveryPlan.filter((item) => item.action === "mark_stale").length,
      archived: recoveryPlan.filter((item) => item.action === "archive").length,
      items: recoveryPlan.map((item) => {
        const row = expectPersistedRecord(rowBySessionId.get(item.sessionId), "cleanup session row");

        return {
          sessionId: item.sessionId,
          runId: row.runId,
          agentId: row.agentId,
          worktreePath: row.worktreePath ?? `untracked/${item.sessionId}`,
          action: item.action,
          reason: item.reason
        };
      }),
      completedAt: now
    };
  }

  private async resolveValidationArtifactIds(
    runId: string,
    taskId: string | null,
    artifactIds: string[],
    artifactPath: string | null
  ) {
    if (artifactIds.length > 0) {
      await this.assertArtifactsBelongToRun(runId, artifactIds);
      return artifactIds;
    }

    if (!artifactPath) {
      return [];
    }

    const clauses = [eq(artifacts.runId, runId), eq(artifacts.path, artifactPath)];

    if (taskId) {
      clauses.push(eq(artifacts.taskId, taskId));
    }

    const [artifact] = await this.db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(and(...clauses))
      .orderBy(asc(artifacts.createdAt));

    return artifact ? [artifact.id] : [];
  }

  private async ensureOwnershipBoundary(access: AccessBoundary) {
    const now = this.clock.now();

    await this.db.execute(sql`
      insert into workspaces (id, name, created_at, updated_at)
      values (${access.workspaceId}, ${access.workspaceName ?? access.workspaceId}, ${now}, ${now})
      on conflict (id) do nothing
    `);

    await this.db.execute(sql`
      insert into teams (id, workspace_id, name, created_at, updated_at)
      values (${access.teamId}, ${access.workspaceId}, ${access.teamName ?? access.teamId}, ${now}, ${now})
      on conflict (id) do nothing
    `);
  }

  private assertBoundaryMatch(
    access: AccessBoundary | undefined,
    workspaceId: string,
    teamId: string,
    entityType: string,
    entityId: string
  ) {
    if (!access) {
      return;
    }

    assertAccessBoundary(access);

    if (access.workspaceId !== workspaceId || access.teamId !== teamId) {
      throw new HttpError(403, `${entityType} ${entityId} is outside the caller boundary`);
    }
  }

  private async assertRepositoryExists(repositoryId: string, access?: AccessBoundary) {
    const [repository] = await this.db.select().from(repositories).where(eq(repositories.id, repositoryId));

    if (!repository) {
      throw new HttpError(404, `repository ${repositoryId} not found`);
    }

    this.assertBoundaryMatch(access, repository.workspaceId, repository.teamId, "repository", repositoryId);

    return repository;
  }

  private async assertWorkerNodeExists(nodeId: string) {
    const [workerNode] = await this.db.select().from(workerNodes).where(eq(workerNodes.id, nodeId));

    if (!workerNode) {
      throw new HttpError(404, `worker node ${nodeId} not found`);
    }

    return workerNode;
  }

  private async assertSessionExists(sessionId: string) {
    const [session] = await this.db.select().from(sessions).where(eq(sessions.id, sessionId));

    if (!session) {
      throw new HttpError(404, `session ${sessionId} not found`);
    }

    return session;
  }

  private async assertWorkerDispatchAssignmentExists(assignmentId: string) {
    const [assignment] = await this.db.select().from(workerDispatchAssignments).where(eq(workerDispatchAssignments.id, assignmentId));

    if (!assignment) {
      throw new HttpError(404, `worker dispatch assignment ${assignmentId} not found`);
    }

    return assignment;
  }

  private async assertRunExists(runId: string, access?: AccessBoundary) {
    const [run] = await this.db.select().from(runs).where(eq(runs.id, runId));

    if (!run) {
      throw new HttpError(404, `run ${runId} not found`);
    }

    this.assertBoundaryMatch(access, run.workspaceId, run.teamId, "run", runId);

    return run;
  }

  private async assertTaskExists(taskId: string, access?: AccessBoundary) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));

    if (!task) {
      throw new HttpError(404, `task ${taskId} not found`);
    }

    await this.assertRunExists(task.runId, access);

    return task;
  }

  private async assertAgentExists(agentId: string, access?: AccessBoundary) {
    const [agent] = await this.db.select().from(agents).where(eq(agents.id, agentId));

    if (!agent) {
      throw new HttpError(404, `agent ${agentId} not found`);
    }

    await this.assertRunExists(agent.runId, access);

    return agent;
  }

  private async assertArtifactsBelongToRun(runId: string, artifactIds: string[]) {
    if (artifactIds.length === 0) {
      return;
    }

    const rows = await this.db
      .select({ id: artifacts.id, runId: artifacts.runId })
      .from(artifacts)
      .where(inArray(artifacts.id, artifactIds));

    if (rows.length !== artifactIds.length) {
      throw new HttpError(404, "one or more validation artifacts were not found");
    }

    if (rows.some((artifact) => artifact.runId !== runId)) {
      throw new HttpError(409, "validation artifacts must belong to the same run");
    }
  }

  private async hydrateValidationHistory(rows: typeof validations.$inferSelect[]): Promise<ValidationHistoryEntry[]> {
    if (rows.length === 0) {
      return [];
    }

    const artifactIds = [...new Set(rows.flatMap((row) => row.artifactIds))];
    const linkedArtifacts = artifactIds.length === 0
      ? []
      : await this.db
        .select()
        .from(artifacts)
        .where(inArray(artifacts.id, artifactIds))
        .orderBy(asc(artifacts.createdAt));

    const artifactsById = new Map<string, Artifact>(
      linkedArtifacts.map((artifact) => {
        const normalizedArtifact: Artifact = {
          ...artifact,
          kind: artifact.kind as Artifact["kind"]
        };

        return [artifact.id, normalizedArtifact] as const;
      })
    );

    return rows.map((row) => ({
      ...row,
      status: row.status as ValidationHistoryEntry["status"],
      artifacts: row.artifactIds
        .map((artifactId) => artifactsById.get(artifactId))
        .filter((artifact): artifact is Artifact => artifact !== undefined)
    }));
  }

  private async hydrateValidationHistoryEntry(row: typeof validations.$inferSelect): Promise<ValidationHistoryEntry> {
    const [validation] = await this.hydrateValidationHistory([row]);
    return expectPersistedRecord(validation, "validation");
  }

  private mapRepository(repository: typeof repositories.$inferSelect): Repository {
    return {
      ...repository,
      provider: repository.provider as Repository["provider"],
      trustLevel: repository.trustLevel as Repository["trustLevel"]
    };
  }

  private buildApprovalAuditEntries(
    approvalsList: Approval[],
    run: Run,
    repository: Repository,
    events: ControlPlaneEvent[]
  ) {
    return approvalsList.map((approval) => this.buildApprovalAuditEntry(approval, run, repository, events));
  }

  private buildApprovalAuditEntry(
    approval: Approval,
    run: Run | undefined,
    repository: Repository | undefined,
    events: ControlPlaneEvent[]
  ): ApprovalAuditEntry {
    const createdEvent = events.find((event) => event.entityId === approval.id && event.eventType === "approval.created");
    const resolvedEvent = events.find((event) => event.entityId === approval.id && event.eventType === "approval.resolved");

    return {
      approvalId: approval.id,
      runId: approval.runId,
      taskId: approval.taskId,
      repositoryId: run?.repositoryId ?? repository?.id ?? approval.runId,
      repositoryName: repository?.name ?? "unknown",
      kind: approval.kind,
      status: approval.status,
      requestedAt: approval.createdAt,
      resolvedAt: approval.resolvedAt,
      requestedBy: approval.requestedBy,
      requestedByActor: createdEvent?.actor ?? null,
      resolver: approval.resolver,
      resolverActor: resolvedEvent?.actor ?? null,
      policyProfile: run?.policyProfile ?? repository?.approvalProfile ?? null,
      requestedPayload: approval.requestedPayload,
      resolutionPayload: approval.resolutionPayload
    };
  }

  private mapSession(session: typeof sessions.$inferSelect): Session {
    return {
      ...session,
      state: session.state as Session["state"]
    };
  }

  private async transitionWorkerDispatchFailureOrCompletion(
    assignment: WorkerDispatchAssignment,
    status: "completed" | "failed",
    reason: string | null,
    nodeId: string
  ) {
    const now = this.clock.now();

    if (status === "completed") {
      const [updatedAssignment] = await this.db.update(workerDispatchAssignments).set({
        state: "completed",
        claimedByNodeId: nodeId,
        completedAt: now,
        lastFailureReason: null,
        updatedAt: now
      }).where(eq(workerDispatchAssignments.id, assignment.id)).returning();

      await this.db.update(agents).set({
        status: "idle",
        updatedAt: now
      }).where(eq(agents.id, assignment.agentId));

      return this.mapWorkerDispatchAssignment(expectPersistedRecord(updatedAssignment, "worker dispatch assignment"));
    }

    const nextAttempt = assignment.attempt + 1;
    const canRetry = nextAttempt < assignment.maxAttempts;
    const [updatedAssignment] = await this.db.update(workerDispatchAssignments).set({
      state: canRetry ? "retrying" : "failed",
      attempt: nextAttempt,
      stickyNodeId: canRetry ? null : assignment.stickyNodeId,
      preferredNodeId: canRetry ? null : assignment.preferredNodeId,
      claimedByNodeId: null,
      claimedAt: null,
      completedAt: canRetry ? null : now,
      lastFailureReason: reason,
      updatedAt: now
    }).where(eq(workerDispatchAssignments.id, assignment.id)).returning();

    if (assignment.sessionId) {
      await this.db.update(sessions).set({
        workerNodeId: null,
        stickyNodeId: canRetry ? null : assignment.stickyNodeId,
        state: canRetry ? "pending" : "stale",
        staleReason: reason,
        updatedAt: now
      }).where(eq(sessions.id, assignment.sessionId));
    }

    await this.db.update(agents).set({
      status: canRetry ? "idle" : "failed",
      updatedAt: now
    }).where(eq(agents.id, assignment.agentId));

    return this.mapWorkerDispatchAssignment(expectPersistedRecord(updatedAssignment, "worker dispatch assignment"));
  }

  private mapWorkerDispatchAssignment(
    assignment: typeof workerDispatchAssignments.$inferSelect
  ): WorkerDispatchAssignment {
    return {
      ...assignment,
      sessionId: assignment.sessionId ?? undefined,
      stickyNodeId: assignment.stickyNodeId ?? null,
      preferredNodeId: assignment.preferredNodeId ?? null,
      state: assignment.state as WorkerDispatchAssignment["state"],
      branchName: assignment.branchName ?? null
    };
  }

  private mapWorkerNode(workerNode: typeof workerNodes.$inferSelect): WorkerNode {
    return {
      ...workerNode,
      endpoint: workerNode.endpoint ?? null,
      status: workerNode.status as WorkerNode["status"],
      drainState: workerNode.drainState as WorkerNode["drainState"],
      eligibleForScheduling: isWorkerNodeEligible({
        status: workerNode.status as WorkerNode["status"],
        drainState: workerNode.drainState as WorkerNode["drainState"]
      })
    };
  }

  private mapRun(run: typeof runs.$inferSelect): Run {
    return {
      ...run,
      status: run.status as Run["status"],
      budgetCostUsd: centsToDollars(run.budgetCostUsd),
      pullRequestStatus: run.pullRequestStatus as Run["pullRequestStatus"],
      handoffStatus: run.handoffStatus as Run["handoffStatus"]
    };
  }

  private async assertDependenciesBelongToRun(runId: string, dependencyIds: string[]) {
    if (dependencyIds.length === 0) {
      return;
    }

    const dependencyTasks = await this.db.select({
      id: tasks.id,
      runId: tasks.runId
    }).from(tasks).where(inArray(tasks.id, dependencyIds));

    if (dependencyTasks.length !== dependencyIds.length) {
      throw new HttpError(404, "one or more dependency tasks were not found");
    }

    const foreignDependency = dependencyTasks.find((dependencyTask) => dependencyTask.runId !== runId);

    if (foreignDependency) {
      throw new HttpError(409, "dependency tasks must belong to the same run");
    }
  }

  private async areDependenciesSatisfied(runId: string, dependencyIds: string[]) {
    if (dependencyIds.length === 0) {
      return true;
    }

    const dependencyTasks = await this.db.select({
      id: tasks.id,
      status: tasks.status
    }).from(tasks).where(and(eq(tasks.runId, runId), inArray(tasks.id, dependencyIds)));

    return dependencyTasks.length === dependencyIds.length
      && dependencyTasks.every((dependency) => dependency.status === "completed");
  }

  private async maybeUnblockDependentTasks(runId: string, completedTaskId: string, completedTaskStatus: string) {
    if (completedTaskStatus !== "completed") {
      return;
    }

    const candidateTasks = await this.db.select().from(tasks).where(eq(tasks.runId, runId));
    const now = this.clock.now();

    for (const candidateTask of candidateTasks) {
      if (candidateTask.status !== "blocked" || !candidateTask.dependencyIds.includes(completedTaskId)) {
        continue;
      }

      const ready = await this.areDependenciesSatisfied(runId, candidateTask.dependencyIds);

      if (ready) {
        await this.db.update(tasks).set({
          status: "pending",
          updatedAt: now
        }).where(eq(tasks.id, candidateTask.id));
      }
    }
  }
}
