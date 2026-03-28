import { and, asc, eq, inArray } from "drizzle-orm";
import {
  type AgentCreateInput,
  type RepositoryCreateInput,
  type RunCreateInput,
  type RunStatusUpdateInput,
  type TaskCreateInput,
  type TaskStatusUpdateInput
} from "@codex-swarm/contracts";
import { resolveInitialTaskStatus } from "@codex-swarm/orchestration";

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
  approvalUpdateSchema,
  artifactCreateSchema,
  messageCreateSchema,
  validationCreateSchema
} from "../http/schemas.js";
import { z } from "zod";

type RepositoryCreate = RepositoryCreateInput;
type RunCreate = RunCreateInput;
type RunStatusUpdate = RunStatusUpdateInput;
type TaskCreate = TaskCreateInput;
type TaskStatusUpdate = TaskStatusUpdateInput;
type AgentCreate = AgentCreateInput;
type MessageCreate = z.infer<typeof messageCreateSchema>;
type ApprovalCreate = z.infer<typeof approvalCreateSchema>;
type ApprovalUpdate = z.infer<typeof approvalUpdateSchema>;
type ValidationCreate = z.infer<typeof validationCreateSchema>;
type ArtifactCreate = z.infer<typeof artifactCreateSchema>;

export class ControlPlaneService {
  constructor(
    private readonly db: AppDb,
    private readonly clock: Clock
  ) {}

  async listRepositories() {
    return this.db.select().from(repositories).orderBy(asc(repositories.createdAt));
  }

  async createRepository(input: RepositoryCreate) {
    const id = crypto.randomUUID();
    const now = this.clock.now();

    const [repository] = await this.db.insert(repositories).values({
      id,
      name: input.name,
      url: input.url,
      defaultBranch: input.defaultBranch,
      localPath: input.localPath ?? null,
      createdAt: now,
      updatedAt: now
    }).returning();

    return repository;
  }

  async listRuns(repositoryId?: string) {
    if (repositoryId) {
      return this.db.select().from(runs).where(eq(runs.repositoryId, repositoryId)).orderBy(asc(runs.createdAt));
    }

    return this.db.select().from(runs).orderBy(asc(runs.createdAt));
  }

  async getRun(runId: string) {
    const [run] = await this.db.select().from(runs).where(eq(runs.id, runId));

    if (!run) {
      throw new HttpError(404, `run ${runId} not found`);
    }

    const [runTasks, runAgents, runApprovals, runValidations, runArtifacts, runMessages] = await Promise.all([
      this.db.select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.createdAt)),
      this.db.select().from(agents).where(eq(agents.runId, runId)).orderBy(asc(agents.createdAt)),
      this.db.select().from(approvals).where(eq(approvals.runId, runId)).orderBy(asc(approvals.createdAt)),
      this.db.select().from(validations).where(eq(validations.runId, runId)).orderBy(asc(validations.createdAt)),
      this.db.select().from(artifacts).where(eq(artifacts.runId, runId)).orderBy(asc(artifacts.createdAt)),
      this.db.select().from(messages).where(eq(messages.runId, runId)).orderBy(asc(messages.createdAt))
    ]);

    return {
      ...run,
      tasks: runTasks,
      agents: runAgents,
      approvals: runApprovals,
      validations: runValidations,
      artifacts: runArtifacts,
      messages: runMessages
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
      metadata: input.metadata,
      createdBy,
      createdAt: now,
      updatedAt: now
    }).returning();

    return run;
  }

  async updateRunStatus(runId: string, input: RunStatusUpdate) {
    await this.assertRunExists(runId);
    const now = this.clock.now();

    const [run] = await this.db.update(runs).set({
      status: input.status,
      planArtifactPath: input.planArtifactPath ?? null,
      updatedAt: now
    }).where(eq(runs.id, runId)).returning();

    return run;
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

    return task;
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

    return updated;
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
        await tx.insert(sessions).values({
          id: crypto.randomUUID(),
          agentId: createdAgent.id,
          threadId: input.session.threadId,
          cwd: input.session.cwd,
          sandbox: input.session.sandbox,
          approvalPolicy: input.session.approvalPolicy,
          includePlanTool: input.session.includePlanTool,
          metadata: input.session.metadata,
          createdAt: now,
          updatedAt: now
        });
      }

      return [createdAgent];
    });

    return agent;
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

    return message;
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
      status: input.status,
      requestedBy: input.requestedBy,
      reviewer: input.reviewer ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now
    }).returning();

    return approval;
  }

  async updateApproval(approvalId: string, input: ApprovalUpdate) {
    const now = this.clock.now();

    const [approval] = await this.db.update(approvals).set({
      status: input.status,
      reviewer: input.reviewer ?? null,
      notes: input.notes ?? null,
      updatedAt: now
    }).where(eq(approvals.id, approvalId)).returning();

    if (!approval) {
      throw new HttpError(404, `approval ${approvalId} not found`);
    }

    return approval;
  }

  async createValidation(input: ValidationCreate) {
    await this.assertRunExists(input.runId);

    if (input.taskId) {
      await this.assertTaskExists(input.taskId);
    }

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
      createdAt: now,
      updatedAt: now
    }).returning();

    return validation;
  }

  async listValidations(runId: string) {
    await this.assertRunExists(runId);
    return this.db.select().from(validations).where(eq(validations.runId, runId)).orderBy(asc(validations.createdAt));
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

    return artifact;
  }

  async listArtifacts(runId: string) {
    await this.assertRunExists(runId);
    return this.db.select().from(artifacts).where(eq(artifacts.runId, runId)).orderBy(asc(artifacts.createdAt));
  }

  private async assertRepositoryExists(repositoryId: string) {
    const [repository] = await this.db.select({ id: repositories.id }).from(repositories).where(eq(repositories.id, repositoryId));

    if (!repository) {
      throw new HttpError(404, `repository ${repositoryId} not found`);
    }
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
