import { and, asc, eq, inArray } from "drizzle-orm";
import {
  type Artifact,
  type ArtifactCreateInput,
  type CleanupJobReport,
  type CleanupJobRunInput,
  type Run,
  type Agent,
  type AgentCreateInput,
  type ApprovalCreateInput,
  type ApprovalResolveInput,
  type Repository,
  type RepositoryCreateInput,
  type RunCreateInput,
  type RunDetail,
  type RunStatusUpdateInput,
  type Session,
  type Task,
  type TaskCreateInput,
  type TaskStatusUpdateInput,
  type ValidationCreateInput,
  type ValidationHistoryEntry
} from "@codex-swarm/contracts";
import { resolveInitialTaskStatus } from "@codex-swarm/orchestration";
import { buildSessionRecoveryPlan } from "@codex-swarm/worker";

import type { AppDb } from "../db/client.js";
import {
  agents,
  approvals,
  artifacts,
  messages,
  repositories,
  runs,
  sessions,
  tasks,
  validations
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

  async listRepositories() {
    const rows = await this.db.select().from(repositories).orderBy(asc(repositories.createdAt));
    return rows.map((repository) => this.mapRepository(repository));
  }

  async createRepository(input: RepositoryCreate) {
    const id = crypto.randomUUID();
    const now = this.clock.now();

    const [repository] = await this.db.insert(repositories).values({
      id,
      name: input.name,
      url: input.url,
      provider: input.provider ?? inferRepositoryProvider(input.url),
      defaultBranch: input.defaultBranch,
      localPath: input.localPath ?? null,
      trustLevel: input.trustLevel,
      createdAt: now,
      updatedAt: now
    }).returning();

    return this.mapRepository(expectPersistedRecord(repository, "repository"));
  }

  async listRuns(repositoryId?: string) {
    if (repositoryId) {
      const rows = await this.db.select().from(runs).where(eq(runs.repositoryId, repositoryId)).orderBy(asc(runs.createdAt));
      return rows.map((run) => this.mapRun(run));
    }

    const rows = await this.db.select().from(runs).orderBy(asc(runs.createdAt));
    return rows.map((run) => this.mapRun(run));
  }

  async getRun(runId: string): Promise<RunDetail> {
    const [run] = await this.db.select().from(runs).where(eq(runs.id, runId));

    if (!run) {
      throw new HttpError(404, `run ${runId} not found`);
    }

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

  async createRun(input: RunCreate, createdBy: string) {
    await this.assertRepositoryExists(input.repositoryId);

    const id = crypto.randomUUID();
    const now = this.clock.now();

    const [run] = await this.db.insert(runs).values({
      id,
      repositoryId: input.repositoryId,
      goal: input.goal,
      status: "pending",
      branchName: input.branchName ?? null,
      planArtifactPath: input.planArtifactPath ?? null,
      budgetTokens: input.budgetTokens ?? null,
      budgetCostUsd: dollarsToCents(input.budgetCostUsd),
      concurrencyCap: input.concurrencyCap,
      policyProfile: input.policyProfile ?? null,
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

  async updateRunStatus(runId: string, input: RunStatusUpdate) {
    await this.assertRunExists(runId);
    const now = this.clock.now();

    const [run] = await this.db.update(runs).set({
      status: input.status,
      planArtifactPath: input.planArtifactPath ?? null,
      completedAt: input.status === "completed" ? now : null,
      updatedAt: now
    }).where(eq(runs.id, runId)).returning();

    return this.mapRun(expectPersistedRecord(run, "run"));
  }

  async publishRunBranch(runId: string, input: RunBranchPublish) {
    const existingRun = await this.assertRunExists(runId);
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

  async createRunPullRequestHandoff(runId: string, input: RunPullRequestHandoff) {
    const now = this.clock.now();
    const run = await this.assertRunExists(runId);
    const repository = await this.assertRepositoryExists(run.repositoryId);
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

  async listTasks(runId?: string) {
    if (runId) {
      return this.db.select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.createdAt));
    }

    return this.db.select().from(tasks).orderBy(asc(tasks.createdAt));
  }

  async createTask(input: TaskCreate) {
    await this.assertRunExists(input.runId);

    if (input.ownerAgentId) {
      await this.assertAgentExists(input.ownerAgentId);
    }

    if (input.parentTaskId) {
      await this.assertTaskExists(input.parentTaskId);
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

  async updateTaskStatus(taskId: string, input: TaskStatusUpdate) {
    const task = await this.assertTaskExists(taskId);

    if (input.ownerAgentId) {
      await this.assertAgentExists(input.ownerAgentId);
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

  async createAgent(input: AgentCreate) {
    await this.assertRunExists(input.runId);

    if (input.currentTaskId) {
      await this.assertTaskExists(input.currentTaskId);
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

        await tx.insert(sessions).values({
          id: crypto.randomUUID(),
          agentId: createdAgent.id,
          threadId: input.session.threadId,
          cwd: input.session.cwd,
          sandbox: input.session.sandbox,
          approvalPolicy: input.session.approvalPolicy,
          includePlanTool: input.session.includePlanTool,
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

  async listAgents(runId?: string) {
    if (runId) {
      return this.db.select().from(agents).where(eq(agents.runId, runId)).orderBy(asc(agents.createdAt));
    }

    return this.db.select().from(agents).orderBy(asc(agents.createdAt));
  }

  async createMessage(input: MessageCreate) {
    await this.assertRunExists(input.runId);

    if (input.senderAgentId) {
      await this.assertAgentExists(input.senderAgentId);
    }

    if (input.recipientAgentId) {
      await this.assertAgentExists(input.recipientAgentId);
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

  async listMessages(runId: string) {
    await this.assertRunExists(runId);
    return this.db.select().from(messages).where(eq(messages.runId, runId)).orderBy(asc(messages.createdAt));
  }

  async createApproval(input: ApprovalCreate) {
    await this.assertRunExists(input.runId);

    if (input.taskId) {
      await this.assertTaskExists(input.taskId);
    }

    const now = this.clock.now();
    const [approval] = await this.db.insert(approvals).values({
      id: crypto.randomUUID(),
      runId: input.runId,
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

  async listApprovals(runId?: string) {
    if (runId) {
      await this.assertRunExists(runId);
      return this.db.select().from(approvals).where(eq(approvals.runId, runId)).orderBy(asc(approvals.createdAt));
    }

    return this.db.select().from(approvals).orderBy(asc(approvals.createdAt));
  }

  async getApproval(approvalId: string) {
    const [approval] = await this.db.select().from(approvals).where(eq(approvals.id, approvalId));

    if (!approval) {
      throw new HttpError(404, `approval ${approvalId} not found`);
    }

    return expectPersistedRecord(approval, "approval");
  }

  async resolveApproval(approvalId: string, input: ApprovalResolve) {
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

  async createValidation(input: ValidationCreate) {
    await this.assertRunExists(input.runId);

    if (input.taskId) {
      await this.assertTaskExists(input.taskId);
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

  async listValidations(query: ValidationListQuery | string): Promise<ValidationHistoryEntry[]> {
    const { runId, taskId } = typeof query === "string"
      ? { runId: query, taskId: undefined }
      : query;

    await this.assertRunExists(runId);

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

  async createArtifact(input: ArtifactCreate) {
    await this.assertRunExists(input.runId);

    if (input.taskId) {
      await this.assertTaskExists(input.taskId);
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

  async listArtifacts(runId: string) {
    await this.assertRunExists(runId);
    return this.db.select().from(artifacts).where(eq(artifacts.runId, runId)).orderBy(asc(artifacts.createdAt));
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

  private async assertRepositoryExists(repositoryId: string) {
    const [repository] = await this.db.select().from(repositories).where(eq(repositories.id, repositoryId));

    if (!repository) {
      throw new HttpError(404, `repository ${repositoryId} not found`);
    }

    return repository;
  }

  private async assertRunExists(runId: string) {
    const [run] = await this.db.select().from(runs).where(eq(runs.id, runId));

    if (!run) {
      throw new HttpError(404, `run ${runId} not found`);
    }

    return run;
  }

  private async assertTaskExists(taskId: string) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));

    if (!task) {
      throw new HttpError(404, `task ${taskId} not found`);
    }

    return task;
  }

  private async assertAgentExists(agentId: string) {
    const [agent] = await this.db.select().from(agents).where(eq(agents.id, agentId));

    if (!agent) {
      throw new HttpError(404, `agent ${agentId} not found`);
    }

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

  private mapSession(session: typeof sessions.$inferSelect): Session {
    return {
      ...session,
      state: session.state as Session["state"]
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
