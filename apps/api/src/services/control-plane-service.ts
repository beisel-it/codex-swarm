import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  controlPlaneEventSchema,
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
  type RunBudgetCheckpointInput,
  type RunBudgetState,
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
  type TuiAlert,
  type TuiOverview,
  type TuiOverviewRun,
  type TuiRunDrilldown,
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
import { buildSessionRecoveryPlan, cleanupWorktreePaths } from "@codex-swarm/worker";

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
import { inspectRepositoryProvider } from "../lib/repository-provider.js";
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
type RunBudgetCheckpoint = RunBudgetCheckpointInput;
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
type AccessBoundary = Pick<ActorIdentity, "workspaceId" | "workspaceName" | "teamId" | "teamName"> & {
  policyProfile?: ActorIdentity["policyProfile"];
};
type OwnershipBoundary = {
  workspaceId: string;
  workspaceName: string | null;
  teamId: string;
  teamName: string | null;
  policyProfile: string | null;
};
type TeamRecord = typeof teams.$inferSelect;

function normalizeLegacyGovernanceRole(role: unknown) {
  return role === "platform-admin" ? "workspace_admin" : role;
}

function normalizeLegacyEventActor<T>(value: T): T {
  if (!value || typeof value !== "object") {
    return value;
  }

  const event = value as Record<string, unknown>;
  const actor = event.actor;

  if (!actor || typeof actor !== "object") {
    return value;
  }

  const actorRecord = actor as Record<string, unknown>;
  const roles = Array.isArray(actorRecord.roles)
    ? actorRecord.roles.map((role) => normalizeLegacyGovernanceRole(role))
    : actorRecord.roles;

  return {
    ...event,
    actor: {
      ...actorRecord,
      role: normalizeLegacyGovernanceRole(actorRecord.role),
      roles
    }
  } as T;
}

function assertAccessBoundary(access: AccessBoundary | undefined): asserts access is AccessBoundary & {
  workspaceId: string;
  teamId: string;
} {
  if (!access?.workspaceId || !access.teamId) {
    throw new HttpError(403, "workspace or team boundary is required");
  }
}

function requireAccessBoundary(access: AccessBoundary | undefined): OwnershipBoundary {
  assertAccessBoundary(access);

  return {
    workspaceId: access.workspaceId!,
    workspaceName: access.workspaceName ?? null,
    teamId: access.teamId!,
    teamName: access.teamName ?? null,
    policyProfile: access.policyProfile ?? null
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

function workerNodeLoadTuple(
  workerNode: Pick<WorkerNode, "metadata" | "lastHeartbeatAt" | "id">,
  now: Date
) {
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
      ? Math.max(0, now.getTime() - workerNode.lastHeartbeatAt.getTime())
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
  left: Pick<WorkerNode, "id" | "metadata" | "lastHeartbeatAt">,
  right: Pick<WorkerNode, "id" | "metadata" | "lastHeartbeatAt">,
  assignment: Pick<WorkerDispatchAssignment, "stickyNodeId" | "preferredNodeId">,
  now: Date
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

  const leftTuple = workerNodeLoadTuple(left, now);
  const rightTuple = workerNodeLoadTuple(right, now);
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

function normalizeValidationTemplates(templates: TaskCreate["validationTemplates"]) {
  return templates.map((template) => ({
    name: template.name,
    command: template.command,
    ...(template.summary ? { summary: template.summary } : {}),
    ...(template.artifactPath ? { artifactPath: template.artifactPath } : {})
  }));
}

function isApprovedHandoffApproval(approval: Approval | null | undefined, kind: Approval["kind"], runId: string) {
  return approval?.runId === runId && approval.kind === kind && approval.status === "approved";
}

function createEmptyTuiTaskCounts(): TuiOverviewRun["taskCounts"] {
  return {
    pending: 0,
    blocked: 0,
    inProgress: 0,
    awaitingReview: 0,
    completed: 0,
    failed: 0,
    cancelled: 0
  };
}

function createEmptyTuiApprovalCounts(): TuiOverviewRun["approvalCounts"] {
  return {
    pending: 0,
    approved: 0,
    rejected: 0
  };
}

function createEmptyTuiValidationCounts(): TuiOverviewRun["validationCounts"] {
  return {
    pending: 0,
    passed: 0,
    failed: 0
  };
}

function createEmptyTuiDispatchCounts(): TuiOverviewRun["dispatchCounts"] {
  return {
    queued: 0,
    claimed: 0,
    completed: 0,
    retrying: 0,
    failed: 0
  };
}

function isActiveRunStatus(status: Run["status"]) {
  return status === "pending"
    || status === "planning"
    || status === "in_progress"
    || status === "awaiting_approval";
}

function pushUnique(values: string[], value: string | null | undefined) {
  if (value && !values.includes(value)) {
    values.push(value);
  }
}

const policyExceptionDecisionSchema = z.object({
  policyKey: z.enum(["run_budget"]),
  trigger: z.enum(["budget_cap_exceeded"]),
  targetType: z.enum(["run"]),
  targetId: z.uuid(),
  requestedAction: z.enum(["continue_run"]),
  decision: z.enum(["block_pending_approval"]),
  policyProfile: z.string().min(1),
  checkpointSource: z.string().min(1),
  observed: z.object({
    totalTokens: z.number().nonnegative().nullable().default(null),
    totalCostUsd: z.number().nonnegative().nullable().default(null)
  }),
  threshold: z.object({
    budgetTokens: z.number().int().positive().nullable().default(null),
    budgetCostUsd: z.number().nonnegative().nullable().default(null)
  })
});

const policyExceptionRequestPayloadSchema = z.object({
  summary: z.string().min(1),
  policyDecision: policyExceptionDecisionSchema,
  enforcement: z.object({
    onApproval: z.enum(["continue_run"]),
    onRejection: z.enum(["remain_blocked"])
  })
});

const policyExceptionResolutionPayloadSchema = z.object({
  outcome: z.enum(["approved_exception", "rejected_exception"]),
  rationale: z.string().min(1).optional(),
  feedback: z.string().nullable().default(null)
});

function isBudgetPolicyExceptionApproval(approval: Pick<Approval, "kind" | "requestedPayload" | "runId">, runId: string) {
  if (approval.kind !== "policy_exception" || approval.runId !== runId) {
    return false;
  }

  const parsedPayload = policyExceptionRequestPayloadSchema.safeParse(approval.requestedPayload);

  if (parsedPayload.success) {
    return parsedPayload.data.policyDecision.policyKey === "run_budget"
      && parsedPayload.data.policyDecision.targetId === runId;
  }

  return approval.requestedPayload
    && typeof approval.requestedPayload === "object"
    && (approval.requestedPayload as Record<string, unknown>).reason === "budget_cap_exceeded";
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

function dollarsToStoredCents(value: number) {
  return Math.round(value * 100);
}

function readRunBudgetUsage(metadata: Record<string, unknown>) {
  const budgetUsage = metadata.budgetUsage;

  if (!budgetUsage || typeof budgetUsage !== "object") {
    return {
      tokensUsedTotal: 0,
      costUsdTotal: 0
    };
  }

  return {
    tokensUsedTotal: typeof (budgetUsage as { tokensUsedTotal?: unknown }).tokensUsedTotal === "number"
      ? Math.max(0, Math.trunc((budgetUsage as { tokensUsedTotal: number }).tokensUsedTotal))
      : 0,
    costUsdTotal: typeof (budgetUsage as { costUsdTotal?: unknown }).costUsdTotal === "number"
      ? Math.max(0, (budgetUsage as { costUsdTotal: number }).costUsdTotal)
      : 0
  };
}

function getArtifactStorageMetadata(metadata: Record<string, unknown>) {
  return {
    url: typeof metadata.url === "string" ? metadata.url : null,
    sizeBytes: typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : null,
    sha256: typeof metadata.sha256 === "string" ? metadata.sha256 : null
  };
}

function expectPersistedRecord<T>(record: T | undefined, entity: string): T {
  if (!record) {
    throw new HttpError(500, `${entity} persistence failed`);
  }

  return record;
}

function mapApprovalRecord(record: typeof approvals.$inferSelect): Approval {
  return {
    ...record,
    kind: record.kind as Approval["kind"],
    status: record.status as Approval["status"],
    delegation: record.delegateActorId
      ? {
          delegateActorId: record.delegateActorId,
          delegatedBy: record.delegatedBy ?? record.requestedBy,
          delegatedAt: record.delegatedAt ?? record.createdAt,
          reason: record.delegationReason ?? null
        }
      : null
  };
}

function resolveRepositoryApprovalProfile(
  input: Pick<RepositoryCreate, "approvalProfile" | "trustLevel">,
  teamPolicyProfile: string
) {
  if (input.approvalProfile) {
    return input.approvalProfile;
  }

  if (input.trustLevel !== "trusted" && teamPolicyProfile === "standard") {
    return "sensitive";
  }

  return teamPolicyProfile;
}

function requiresSensitiveDefaults(
  repository: { trustLevel: string; approvalProfile: string },
  policyProfile: string
) {
  return repository.trustLevel !== "trusted" || policyProfile !== "standard";
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
    const team = await this.ensureOwnershipBoundary(boundary);
    const id = crypto.randomUUID();
    const now = this.clock.now();
    const approvalProfile = resolveRepositoryApprovalProfile(input, team.policyProfile);
    const provider = input.provider ?? inferRepositoryProvider(input.url);
    const providerInspection = await inspectRepositoryProvider({
      provider,
      url: input.url,
      localPath: input.localPath ?? null
    });
    const defaultBranch = input.defaultBranch
      ?? providerInspection.defaultBranch
      ?? "main";

    const [repository] = await this.db.insert(repositories).values({
      id,
      workspaceId: boundary.workspaceId,
      teamId: boundary.teamId,
      name: input.name,
      url: input.url,
      provider,
      defaultBranch,
      localPath: input.localPath ?? null,
      trustLevel: input.trustLevel,
      approvalProfile,
      providerSync: {
        connectivityStatus: providerInspection.connectivityStatus,
        validatedAt: providerInspection.validatedAt?.toISOString() ?? null,
        defaultBranch: providerInspection.defaultBranch ?? defaultBranch,
        branches: providerInspection.branches,
        providerRepoUrl: providerInspection.providerRepoUrl,
        lastError: providerInspection.lastError
      },
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
    const policyProfile = input.policyProfile ?? repository.approvalProfile;
    const concurrencyCap = requiresSensitiveDefaults(repository, policyProfile)
      ? 1
      : input.concurrencyCap;

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
      concurrencyCap,
      policyProfile,
      publishedBranch: null,
      branchPublishedAt: null,
      branchPublishApprovalId: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      pullRequestApprovalId: null,
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

  async recordRunBudgetCheckpoint(runId: string, input: RunBudgetCheckpoint, access?: AccessBoundary): Promise<RunBudgetState> {
    const run = await this.assertRunExists(runId, access);
    const now = this.clock.now();
    const currentUsage = readRunBudgetUsage(run.metadata);
    const tokensUsedTotal = currentUsage.tokensUsedTotal + input.tokensUsedDelta;
    const costUsdTotal = currentUsage.costUsdTotal + input.costUsdDelta;
    const exceeded: Array<"tokens" | "cost"> = [];

    if (run.budgetTokens !== null && tokensUsedTotal >= run.budgetTokens) {
      exceeded.push("tokens");
    }

    const budgetCostUsd = centsToDollars(run.budgetCostUsd);

    if (budgetCostUsd !== null && dollarsToStoredCents(costUsdTotal) >= run.budgetCostUsd!) {
      exceeded.push("cost");
    }

    const policyExceptionRows = await this.db.select().from(approvals)
      .where(and(
        eq(approvals.runId, runId),
        eq(approvals.kind, "policy_exception")
      ))
      .orderBy(asc(approvals.createdAt));
    const approvedBudgetException = policyExceptionRows.find((approval) =>
      approval.status === "approved"
      && isBudgetPolicyExceptionApproval(mapApprovalRecord(approval), runId));
    const pendingBudgetException = policyExceptionRows.find((approval) =>
      approval.status === "pending"
      && isBudgetPolicyExceptionApproval(mapApprovalRecord(approval), runId));

    let decision: RunBudgetState["decision"] = "within_budget";
    let continueAllowed = true;
    let approvalId: string | null = null;

    if (exceeded.length > 0) {
      if (approvedBudgetException) {
        decision = "approved_exception";
        approvalId = approvedBudgetException.id;
      } else {
        decision = "awaiting_policy_exception";
        continueAllowed = false;

        const approval = pendingBudgetException ?? expectPersistedRecord((await this.db.insert(approvals).values({
          id: crypto.randomUUID(),
          runId,
          workspaceId: run.workspaceId,
          teamId: run.teamId,
          taskId: null,
          kind: "policy_exception",
          status: "pending",
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
                budgetCostUsd
              }
            },
            enforcement: {
              onApproval: "continue_run",
              onRejection: "remain_blocked"
            }
          },
          resolutionPayload: {},
          requestedBy: "system:budget-guard",
          delegateActorId: null,
          delegatedBy: null,
          delegatedAt: null,
          delegationReason: null,
          resolver: null,
          resolvedAt: null,
          createdAt: now,
          updatedAt: now
        }).returning())[0], "approval");

        approvalId = approval.id;
      }
    }

    const [updatedRun] = await this.db.update(runs).set({
      status: decision === "awaiting_policy_exception" ? "awaiting_approval" : run.status,
      metadata: {
        ...run.metadata,
        budgetUsage: {
          tokensUsedTotal,
          costUsdTotal,
          lastCheckpointAt: now.toISOString(),
          lastCheckpointSource: input.source,
          ...input.metadata
        },
        budgetGuard: {
          decision,
          continueAllowed,
          exceeded,
          approvalId,
          updatedAt: now.toISOString()
        }
      },
      updatedAt: now
    }).where(eq(runs.id, runId)).returning();

    expectPersistedRecord(updatedRun, "run");

    return {
      runId,
      continueAllowed,
      decision,
      tokensUsedTotal,
      costUsdTotal,
      exceeded,
      approvalId,
      updatedAt: now
    };
  }

  async publishRunBranch(runId: string, input: RunBranchPublish, access?: AccessBoundary) {
    const existingRun = await this.assertRunExists(runId, access);
    const now = this.clock.now();
    const branchName = input.branchName ?? existingRun.branchName;

    if (!branchName) {
      throw new HttpError(409, "run does not have a branch to publish");
    }

    const branchApproval = await this.resolveRequiredHandoffApproval(runId, "patch", input.approvalId, access);

    const [run] = await this.db.update(runs).set({
      branchName,
      publishedBranch: branchName,
      branchPublishedAt: now,
      branchPublishApprovalId: branchApproval?.id ?? existingRun.branchPublishApprovalId ?? null,
      handoffStatus: "branch_published",
      updatedAt: now
    }).where(eq(runs.id, runId)).returning();

    return this.mapRun(expectPersistedRecord(run, "run"));
  }

  async createRunPullRequestHandoff(runId: string, input: RunPullRequestHandoff, access?: AccessBoundary) {
    const now = this.clock.now();
    const run = await this.assertRunExists(runId, access);
    const repository = await this.assertRepositoryExists(run.repositoryId, access);
    const mergeApproval = await this.resolveRequiredHandoffApproval(runId, "merge", input.approvalId, access);
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

    const updatedRun = await this.db.transaction(async (tx) => {
      const [persistedRun] = await tx.update(runs).set({
        publishedBranch: headBranch,
        pullRequestUrl: input.url ?? null,
        pullRequestNumber: input.number ?? null,
        pullRequestStatus: input.url ? input.status : null,
        pullRequestApprovalId: mergeApproval?.id ?? run.pullRequestApprovalId ?? null,
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

      return persistedRun;
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
      validationTemplates: tasks.validationTemplates,
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
      validationTemplates: normalizeValidationTemplates(input.validationTemplates),
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

    if (input.kind === "policy_exception") {
      const parsedPolicyException = policyExceptionRequestPayloadSchema.safeParse(input.requestedPayload);

      if (!parsedPolicyException.success) {
        throw new HttpError(400, "policy_exception approvals require a structured policy decision payload");
      }

      if (parsedPolicyException.data.policyDecision.targetId !== input.runId) {
        throw new HttpError(409, "policy_exception approval targetId must match the approval runId");
      }
    }

    const now = this.clock.now();
    const delegation = input.delegation
      ? {
          delegateActorId: input.delegation.delegateActorId,
          delegatedBy: input.requestedBy,
          delegatedAt: now,
          delegationReason: input.delegation.reason ?? null
        }
      : null;
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
      delegateActorId: delegation?.delegateActorId ?? null,
      delegatedBy: delegation?.delegatedBy ?? null,
      delegatedAt: delegation?.delegatedAt ?? null,
      delegationReason: delegation?.delegationReason ?? null,
      resolver: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now
    }).returning();

    return mapApprovalRecord(expectPersistedRecord(approval, "approval"));
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
      return rows.map((approval) => mapApprovalRecord(approval));
    }

    const rows = await this.db.select().from(approvals).where(and(
      eq(approvals.workspaceId, boundary.workspaceId),
      eq(approvals.teamId, boundary.teamId)
    )).orderBy(asc(approvals.createdAt));
    return rows.map((approval) => mapApprovalRecord(approval));
  }

  async getApproval(approvalId: string, access?: AccessBoundary) {
    const [approval] = await this.db.select().from(approvals).where(eq(approvals.id, approvalId));

    if (!approval) {
      throw new HttpError(404, `approval ${approvalId} not found`);
    }

    this.assertBoundaryMatch(access, approval.workspaceId, approval.teamId, "approval", approvalId);

    return mapApprovalRecord(expectPersistedRecord(approval, "approval"));
  }

  async resolveApproval(approvalId: string, input: ApprovalResolve, access?: AccessBoundary) {
    const existingApproval = await this.getApproval(approvalId, access);
    const resolutionPayload = {
      ...input.resolutionPayload,
      feedback: input.feedback ?? null
    };

    if (existingApproval.kind === "policy_exception") {
      const parsedResolution = policyExceptionResolutionPayloadSchema.safeParse(resolutionPayload);

      if (!parsedResolution.success) {
        throw new HttpError(400, "policy_exception approvals require an explicit resolution outcome");
      }

      const expectedOutcome = input.status === "approved" ? "approved_exception" : "rejected_exception";

      if (parsedResolution.data.outcome !== expectedOutcome) {
        throw new HttpError(409, `policy_exception resolution outcome must be ${expectedOutcome} when status is ${input.status}`);
      }
    }

    const now = this.clock.now();

    const [approval] = await this.db.update(approvals).set({
      status: input.status,
      resolver: input.resolver,
      resolutionPayload,
      resolvedAt: now,
      updatedAt: now
    }).where(eq(approvals.id, approvalId)).returning();

    if (!approval) {
      throw new HttpError(404, `approval ${approvalId} not found`);
    }

    return mapApprovalRecord(expectPersistedRecord(approval, "approval"));
  }

  async createValidation(input: ValidationCreate, access?: AccessBoundary) {
    await this.assertRunExists(input.runId, access);

    const task = input.taskId
      ? await this.assertTaskExists(input.taskId, access)
      : null;
    const template = input.templateName
      ? task?.validationTemplates.find((candidate) => candidate.name === input.templateName) ?? null
      : null;

    if (input.templateName && !task) {
      throw new HttpError(400, "taskId is required when templateName is provided");
    }

    if (input.templateName && !template) {
      throw new HttpError(404, `validation template ${input.templateName} not found`);
    }

    const name = input.name ?? template?.name;
    const command = input.command ?? template?.command;

    if (!name || !command) {
      throw new HttpError(400, "validation name and command are required");
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
      name,
      status: input.status,
      command,
      summary: input.summary ?? template?.summary ?? null,
      artifactPath: input.artifactPath ?? template?.artifactPath ?? null,
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

    const storage = getArtifactStorageMetadata(input.metadata);
    const [artifact] = await this.db.insert(artifacts).values({
      id: crypto.randomUUID(),
      runId: input.runId,
      taskId: input.taskId ?? null,
      kind: input.kind,
      path: input.path,
      contentType: input.contentType,
      url: storage.url,
      sizeBytes: storage.sizeBytes,
      sha256: storage.sha256,
      metadata: input.metadata,
      createdAt: this.clock.now()
    }).returning();

    return this.mapArtifact(expectPersistedRecord(artifact, "artifact"));
  }

  async attachArtifactStorage(
    artifactId: string,
    storage: {
      storageKey: string;
      url: string;
      sizeBytes: number;
      sha256: string;
    }
  ) {
    const [artifact] = await this.db.update(artifacts).set({
      url: storage.url,
      sizeBytes: storage.sizeBytes,
      sha256: storage.sha256,
      metadata: sql`jsonb_set(jsonb_set(jsonb_set(jsonb_set(metadata, '{storageKey}', to_jsonb(${storage.storageKey}::text), true), '{url}', to_jsonb(${storage.url}::text), true), '{sizeBytes}', to_jsonb(${storage.sizeBytes}::int), true), '{sha256}', to_jsonb(${storage.sha256}::text), true)`
    }).where(eq(artifacts.id, artifactId)).returning();

    return this.mapArtifact(expectPersistedRecord(artifact, "artifact"));
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
    const now = this.clock.now();

    if (!isWorkerNodeEligible(workerNode)) {
      throw new HttpError(409, `worker node ${workerNode.id} is not eligible for scheduling`);
    }

    const rows = await this.db
      .select()
      .from(workerDispatchAssignments)
      .where(inArray(workerDispatchAssignments.state, ["queued", "retrying"]))
      .orderBy(asc(workerDispatchAssignments.createdAt));
    const workerNodeRows = await this.db
      .select()
      .from(workerNodes)
      .orderBy(asc(workerNodes.createdAt));
    const availableWorkerNodes = workerNodeRows
      .map((row) => this.mapWorkerNode(row))
      .filter((candidate) => isWorkerNodeEligible(candidate));

    const candidates = rows
      .map((assignment) => this.mapWorkerDispatchAssignment(assignment))
      .filter((assignment) => {
        if (!workerNodeSupportsAssignment(workerNode, assignment)) {
          return false;
        }

        const preferredWorkerNode = availableWorkerNodes
          .filter((candidate) => workerNodeSupportsAssignment(candidate, assignment))
          .sort((left, right) => compareWorkerNodesForAssignment(left, right, assignment, now))[0];

        return !preferredWorkerNode || preferredWorkerNode.id === nodeId;
      })
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
    return rows.map((artifact) => this.mapArtifact(artifact));
  }

  async getArtifact(artifactId: string, access?: AccessBoundary) {
    const [artifact] = await this.db.select().from(artifacts).where(eq(artifacts.id, artifactId));

    if (!artifact) {
      throw new HttpError(404, `artifact ${artifactId} not found`);
    }

    await this.assertRunExists(artifact.runId, access);
    return this.mapArtifact(artifact);
  }

  async getTuiOverview(access?: AccessBoundary): Promise<TuiOverview> {
    const now = this.clock.now();
    const [repositoriesList, runsList, approvalsList, workerNodesList, dispatchAssignments] = await Promise.all([
      this.listRepositories(access),
      this.listRuns(undefined, access),
      this.listApprovals(undefined, access),
      this.listWorkerNodes(),
      this.listWorkerDispatchAssignments()
    ]);
    const runIds = new Set(runsList.map((run) => run.id));
    const scopedDispatchAssignments = dispatchAssignments.filter((assignment) => runIds.has(assignment.runId));
    const [runDetails, validationsByRun] = await Promise.all([
      Promise.all(runsList.map((run) => this.getRun(run.id, access))),
      Promise.all(runsList.map((run) => this.listValidations(run.id, access)))
    ]);
    const repositoriesById = new Map(repositoriesList.map((repository) => [repository.id, repository] as const));
    const approvalsByRunId = new Map<string, Approval[]>();
    const dispatchByRunId = new Map<string, WorkerDispatchAssignment[]>();

    for (const approval of approvalsList) {
      approvalsByRunId.set(approval.runId, [...(approvalsByRunId.get(approval.runId) ?? []), approval]);
    }

    for (const assignment of scopedDispatchAssignments) {
      dispatchByRunId.set(assignment.runId, [...(dispatchByRunId.get(assignment.runId) ?? []), assignment]);
    }

    const runSummaries = runsList.map((run, index): TuiOverviewRun => {
      const repository = repositoriesById.get(run.repositoryId);

      if (!repository) {
        throw new HttpError(500, `repository ${run.repositoryId} missing from TUI overview aggregation`);
      }

      const runDetail = runDetails[index]!;
      const validations = validationsByRun[index]!;
      const runApprovals = approvalsByRunId.get(run.id) ?? [];
      const runDispatchAssignments = dispatchByRunId.get(run.id) ?? [];
      const taskCounts = createEmptyTuiTaskCounts();
      const approvalCounts = createEmptyTuiApprovalCounts();
      const validationCounts = createEmptyTuiValidationCounts();
      const dispatchCounts = createEmptyTuiDispatchCounts();
      const workerNodeIds: string[] = [];

      for (const task of runDetail.tasks) {
        if (task.status === "pending") {
          taskCounts.pending += 1;
        } else if (task.status === "blocked") {
          taskCounts.blocked += 1;
        } else if (task.status === "in_progress") {
          taskCounts.inProgress += 1;
        } else if (task.status === "awaiting_review") {
          taskCounts.awaitingReview += 1;
        } else if (task.status === "completed") {
          taskCounts.completed += 1;
        } else if (task.status === "failed") {
          taskCounts.failed += 1;
        } else if (task.status === "cancelled") {
          taskCounts.cancelled += 1;
        }
      }

      for (const approval of runApprovals) {
        if (approval.status === "pending") {
          approvalCounts.pending += 1;
        } else if (approval.status === "approved") {
          approvalCounts.approved += 1;
        } else if (approval.status === "rejected") {
          approvalCounts.rejected += 1;
        }
      }

      for (const validation of validations) {
        if (validation.status === "pending") {
          validationCounts.pending += 1;
        } else if (validation.status === "passed") {
          validationCounts.passed += 1;
        } else if (validation.status === "failed") {
          validationCounts.failed += 1;
        }
      }

      for (const assignment of runDispatchAssignments) {
        if (assignment.state === "queued") {
          dispatchCounts.queued += 1;
        } else if (assignment.state === "claimed") {
          dispatchCounts.claimed += 1;
        } else if (assignment.state === "completed") {
          dispatchCounts.completed += 1;
        } else if (assignment.state === "retrying") {
          dispatchCounts.retrying += 1;
        } else if (assignment.state === "failed") {
          dispatchCounts.failed += 1;
        }

        pushUnique(workerNodeIds, assignment.claimedByNodeId);
        pushUnique(workerNodeIds, assignment.stickyNodeId);
        pushUnique(workerNodeIds, assignment.preferredNodeId);
      }

      for (const session of runDetail.sessions) {
        pushUnique(workerNodeIds, session.workerNodeId);
        pushUnique(workerNodeIds, session.stickyNodeId);
      }

      return {
        run,
        repository: {
          id: repository.id,
          name: repository.name,
          provider: repository.provider,
          trustLevel: repository.trustLevel,
          approvalProfile: repository.approvalProfile
        },
        taskCounts,
        approvalCounts,
        validationCounts,
        dispatchCounts,
        activeSessionCount: runDetail.sessions.filter((session) => session.state === "active").length,
        workerNodeIds,
        blockedTaskIds: runDetail.tasks.filter((task) => task.status === "blocked").map((task) => task.id),
        pendingApprovalIds: runApprovals.filter((approval) => approval.status === "pending").map((approval) => approval.id),
        failedValidationIds: validations.filter((validation) => validation.status === "failed").map((validation) => validation.id)
      };
    });

    const alerts: TuiAlert[] = [];

    for (const runSummary of runSummaries) {
      if (runSummary.run.status === "awaiting_approval" || runSummary.approvalCounts.pending > 0) {
        alerts.push({
          kind: "run_awaiting_approval",
          severity: "warning",
          runId: runSummary.run.id,
          entityId: runSummary.pendingApprovalIds[0] ?? runSummary.run.id,
          summary: `${runSummary.run.goal} is waiting on ${runSummary.approvalCounts.pending} approval${runSummary.approvalCounts.pending === 1 ? "" : "s"}`
        });
      }

      for (const task of runDetails.find((detail) => detail.id === runSummary.run.id)?.tasks ?? []) {
        if (task.status === "blocked") {
          alerts.push({
            kind: "task_blocked",
            severity: "warning",
            runId: runSummary.run.id,
            entityId: task.id,
            summary: `Task ${task.title} is blocked`
          });
        }
      }

      for (const validation of validationsByRun[runsList.findIndex((run) => run.id === runSummary.run.id)] ?? []) {
        if (validation.status === "failed") {
          alerts.push({
            kind: "validation_failed",
            severity: "critical",
            runId: runSummary.run.id,
            entityId: validation.id,
            summary: `Validation ${validation.name} failed`
          });
        }
      }
    }

    for (const workerNode of workerNodesList) {
      if (workerNode.status === "degraded") {
        alerts.push({
          kind: "worker_node_degraded",
          severity: "warning",
          runId: null,
          entityId: workerNode.id,
          summary: `Worker node ${workerNode.name} is degraded`
        });
      }

      if (workerNode.status === "offline") {
        alerts.push({
          kind: "worker_node_offline",
          severity: "critical",
          runId: null,
          entityId: workerNode.id,
          summary: `Worker node ${workerNode.name} is offline`
        });
      }
    }

    for (const assignment of scopedDispatchAssignments) {
      if (assignment.state === "retrying") {
        alerts.push({
          kind: "dispatch_retrying",
          severity: "warning",
          runId: assignment.runId,
          entityId: assignment.id,
          summary: `Dispatch ${assignment.id} is retrying`
        });
      }

      if (assignment.state === "failed") {
        alerts.push({
          kind: "dispatch_failed",
          severity: "critical",
          runId: assignment.runId,
          entityId: assignment.id,
          summary: `Dispatch ${assignment.id} failed`
        });
      }
    }

    return {
      generatedAt: now,
      summary: {
        repositories: repositoriesList.length,
        runsTotal: runsList.length,
        runsActive: runsList.filter((run) => isActiveRunStatus(run.status)).length,
        approvalsPending: approvalsList.filter((approval) => approval.status === "pending").length,
        validationsFailed: validationsByRun.flat().filter((validation) => validation.status === "failed").length,
        tasksBlocked: runDetails.flatMap((runDetail) => runDetail.tasks).filter((task) => task.status === "blocked").length,
        workerNodesOnline: workerNodesList.filter((workerNode) => workerNode.status === "online").length,
        workerNodesDegraded: workerNodesList.filter((workerNode) => workerNode.status === "degraded").length,
        workerNodesOffline: workerNodesList.filter((workerNode) => workerNode.status === "offline").length,
        dispatchQueued: scopedDispatchAssignments.filter((assignment) => assignment.state === "queued").length,
        dispatchRetrying: scopedDispatchAssignments.filter((assignment) => assignment.state === "retrying").length
      },
      runs: runSummaries,
      fleet: {
        workerNodes: workerNodesList,
        dispatchAssignments: scopedDispatchAssignments
      },
      alerts
    };
  }

  async getTuiRunDrilldown(runId: string, access?: AccessBoundary): Promise<TuiRunDrilldown> {
    const [runDetail, approvalsList, validationsList, artifactsList, allWorkerNodes, dispatchAssignments, eventRows] = await Promise.all([
      this.getRun(runId, access),
      this.listApprovals(runId, access),
      this.listValidations(runId, access),
      this.listArtifacts(runId, access),
      this.listWorkerNodes(),
      this.listWorkerDispatchAssignments({ runId }),
      this.db.select().from(controlPlaneEvents)
        .where(eq(controlPlaneEvents.runId, runId))
        .orderBy(asc(controlPlaneEvents.createdAt))
    ]);
    const repositoryRecord = await this.assertRepositoryExists(runDetail.repositoryId, access);
    const generatedAt = this.clock.now();
    const workerNodeIds: string[] = [];

    for (const session of runDetail.sessions) {
      pushUnique(workerNodeIds, session.workerNodeId);
      pushUnique(workerNodeIds, session.stickyNodeId);
    }

    for (const assignment of dispatchAssignments) {
      pushUnique(workerNodeIds, assignment.claimedByNodeId);
      pushUnique(workerNodeIds, assignment.stickyNodeId);
      pushUnique(workerNodeIds, assignment.preferredNodeId);
    }

    return {
      generatedAt,
      repository: this.mapRepository(repositoryRecord),
      run: runDetail,
      approvals: approvalsList,
      validations: validationsList,
      artifacts: artifactsList,
      workerNodes: allWorkerNodes.filter((workerNode) => workerNodeIds.includes(workerNode.id)),
      dispatchAssignments,
      events: eventRows.map((event) => controlPlaneEventSchema.parse(normalizeLegacyEventActor(event)))
    };
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
    const mappedEvents = events.map((event) => controlPlaneEventSchema.parse(normalizeLegacyEventActor(event)));
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
      .map((approval) => mapApprovalRecord(approval))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, input.limit ?? 50)
      .map((approval) => {
        const run = runsById.get(approval.runId);
        const repository = run ? repositoriesById.get(run.repositoryId) : undefined;

        return this.buildApprovalAuditEntry(
          approval,
          run,
          repository,
          eventRows.map((event) => controlPlaneEventSchema.parse(normalizeLegacyEventActor(event)))
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
    const worktreeCleanup = input.deleteStaleWorktrees
      ? await cleanupWorktreePaths(
        recoveryPlan
          .filter((item) => item.action === "mark_stale" || item.action === "archive")
          .map((item) => {
            const row = rowBySessionId.get(item.sessionId);
            return row?.worktreePath ?? `untracked/${item.sessionId}`;
          })
      )
      : [];
    const cleanupByPath = new Map(worktreeCleanup.map((item) => [item.path, item] as const));

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
      deletedWorktrees: worktreeCleanup.filter((item) => item.deleted).length,
      worktreeDeleteFailures: worktreeCleanup.filter((item) => !item.deleted && item.reason !== "placeholder_path").length,
      items: recoveryPlan.map((item) => {
        const row = expectPersistedRecord(rowBySessionId.get(item.sessionId), "cleanup session row");
        const worktreePath = row.worktreePath ?? `untracked/${item.sessionId}`;
        const cleanup = cleanupByPath.get(worktreePath);

        return {
          sessionId: item.sessionId,
          runId: row.runId,
          agentId: row.agentId,
          worktreePath,
          action: item.action,
          reason: item.reason,
          worktreeDeleted: cleanup?.deleted ?? false,
          worktreeDeleteReason: cleanup?.reason ?? null
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

  private async ensureOwnershipBoundary(access: OwnershipBoundary): Promise<TeamRecord> {
    const now = this.clock.now();
    const seededPolicyProfile = access.policyProfile ?? "standard";

    await this.db.execute(sql`
      insert into workspaces (id, name, created_at, updated_at)
      values (${access.workspaceId}, ${access.workspaceName ?? access.workspaceId}, ${now}, ${now})
      on conflict (id) do nothing
    `);

    await this.db.execute(sql`
      insert into teams (id, workspace_id, name, policy_profile, created_at, updated_at)
      values (${access.teamId}, ${access.workspaceId}, ${access.teamName ?? access.teamId}, ${seededPolicyProfile}, ${now}, ${now})
      on conflict (id) do nothing
    `);

    const [team] = await this.db.select().from(teams).where(eq(teams.id, access.teamId));

    if (!team) {
      throw new HttpError(500, `team ${access.teamId} persistence failed`);
    }

    if (
      access.policyProfile
      && access.policyProfile !== team.policyProfile
      && team.policyProfile === "standard"
    ) {
      const [updatedTeam] = await this.db.update(teams).set({
        policyProfile: access.policyProfile,
        updatedAt: now
      }).where(eq(teams.id, access.teamId)).returning();

      return expectPersistedRecord(updatedTeam, "team");
    }

    return team;
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

  private async resolveRequiredHandoffApproval(
    runId: string,
    kind: "patch" | "merge",
    approvalId: string | undefined,
    access?: AccessBoundary
  ) {
    const approvalsForRun = await this.listApprovals(runId, access);
    const approvalsOfKind = approvalsForRun.filter((approval) => approval.kind === kind);

    if (approvalId) {
      const approval = approvalsOfKind.find((candidate) => candidate.id === approvalId);

      if (!approval) {
        throw new HttpError(404, `${kind} approval ${approvalId} not found`);
      }

      if (!isApprovedHandoffApproval(approval, kind, runId)) {
        throw new HttpError(409, `${kind} approval ${approvalId} must be approved before handoff`);
      }

      return approval;
    }

    if (approvalsOfKind.length === 0) {
      return null;
    }

    throw new HttpError(409, `${kind} approval linkage is required for this handoff`);
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
        const normalizedArtifact = this.mapArtifact(artifact);

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
    const providerSync = repository.providerSync ?? {
      connectivityStatus: "skipped",
      validatedAt: null,
      defaultBranch: null,
      branches: [],
      providerRepoUrl: null,
      lastError: null
    };

    return {
      ...repository,
      provider: repository.provider as Repository["provider"],
      trustLevel: repository.trustLevel as Repository["trustLevel"],
      providerSync: {
        connectivityStatus: providerSync.connectivityStatus,
        validatedAt: providerSync.validatedAt ? new Date(providerSync.validatedAt) : null,
        defaultBranch: providerSync.defaultBranch,
        branches: providerSync.branches,
        providerRepoUrl: providerSync.providerRepoUrl,
        lastError: providerSync.lastError
      }
    };
  }

  private mapArtifact(artifact: typeof artifacts.$inferSelect): Artifact {
    return {
      ...artifact,
      kind: artifact.kind as Artifact["kind"]
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
      delegation: approval.delegation,
      resolver: approval.resolver,
      resolverActor: resolvedEvent?.actor ?? null,
      resolvedByDelegate: approval.delegation?.delegateActorId === approval.resolver,
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
      branchPublishApprovalId: run.branchPublishApprovalId ?? null,
      pullRequestStatus: run.pullRequestStatus as Run["pullRequestStatus"],
      pullRequestApprovalId: run.pullRequestApprovalId ?? null,
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
