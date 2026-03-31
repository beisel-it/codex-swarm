import { access } from "node:fs/promises";

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
  type ExternalEventReceipt,
  type GovernanceAdminReport,
  type Project,
  type ProjectCreateInput,
  type ProjectDetail,
  type ProjectRepositoryAssignment,
  type ProjectRunAssignment,
  type ProjectSummary,
  type ProjectTeam,
  type ProjectTeamCreateInput,
  type ProjectTeamDetail,
  type ProjectTeamImportInput,
  type ProjectTeamMember,
  type ProjectTeamMemberCreateInput,
  type ProjectTeamUpdateInput,
  type ProjectUpdateInput,
  type Run,
  type RunAuditExport,
  type RunBudgetCheckpointInput,
  type RunBudgetState,
  type RepeatableRunDefinitionCreateInput,
  type RepeatableRunTriggerCreateInput,
  type RunJobScope,
  type Agent,
  type AgentCreateInput,
  type ApprovalCreateInput,
  type ApprovalResolveInput,
  type Repository,
  type RepositoryCreateInput,
  type RepositoryUpdateInput,
  type RetentionPolicy,
  type RetentionReconcileReport,
  type RetentionWindowSummary,
  type RunCreateInput,
  type RepeatableRunDefinition,
  type RepeatableRunTrigger,
  type RunsByJobScope,
  type RunUpdateInput,
  type RunContext,
  type RunHandoffConfig,
  type RunHandoffExecution,
  type TuiAlert,
  type TuiOverview,
  type TuiOverviewRun,
  type TuiRunDrilldown,
  type SecretIntegrationBoundary,
  type SecretAccessPlan,
  type WorkerDispatchAssignment,
  type WorkerDispatchCompleteInput,
  type WorkerDispatchCompletionOutcome,
  type WorkerDispatchCreateInput,
  type WorkerDispatchListQuery,
  type WorkerNodeReconcileInput,
  type WorkerNodeReconcileReport,
  type RunDetail,
  type RunStatusUpdateInput,
  type Session,
  type SessionTranscriptEntry,
  type SessionTranscriptEntryCreateInput,
  type Task,
  type TaskDagGraph,
  type TaskCreateInput,
  type TaskStatusUpdateInput,
  type TaskVerificationStatus,
  type ValidationCreateInput,
  type ValidationHistoryEntry,
  type WorkerNode,
  type WorkerNodeDrainUpdateInput,
  type WorkerNodeHeartbeatInput,
  type WorkerNodeRegisterInput,
  inboundWebhookEventEnvelopeSchema,
  repeatableRunDefinitionSchema,
  repeatableRunTriggerSchema,
  runContextSchema,
  runHandoffConfigSchema,
  runHandoffExecutionSchema,
  projectTeamDetailSchema
} from "@codex-swarm/contracts";
import { formatRunExecutionContext, resolveInitialTaskStatus } from "@codex-swarm/orchestration";
import {
  buildSessionRecoveryPlan,
  cleanupWorktreePaths,
  createWorktreePath,
  resolveWorkspaceProvisioningMode
} from "@codex-swarm/worker";

import type { AppDb } from "../db/client.js";
import {
  agents,
  approvals,
  artifacts,
  controlPlaneEvents,
  externalEventReceipts,
  messages,
  projectTeamMembers,
  projectTeams,
  repeatableRunDefinitions,
  repeatableRunTriggers,
  projects,
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
import { agentTeamBlueprints } from "../lib/team-templates.js";
import { HttpError } from "../lib/http-error.js";
import type { ProviderHandoffAdapter } from "../lib/provider-handoff.js";
import { inspectRepositoryProvider } from "../lib/repository-provider.js";
import type {
  agentSessionCreateSchema,
  approvalCreateSchema,
  messageCreateSchema,
  repeatableRunDefinitionUpdateSchema,
  repeatableRunTriggerUpdateSchema,
  runBranchPublishSchema,
  runPullRequestHandoffSchema,
  workerDispatchSessionAttachSchema,
  validationsListQuerySchema
} from "../http/schemas.js";
import { z } from "zod";
import { controlPlaneEvents as controlPlaneEventDefinitions } from "../lib/control-plane-events.js";

type RepositoryCreate = RepositoryCreateInput;
type RepositoryUpdate = RepositoryUpdateInput;
type RepeatableRunDefinitionCreate = RepeatableRunDefinitionCreateInput;
type RepeatableRunDefinitionUpdate = z.infer<typeof repeatableRunDefinitionUpdateSchema>;
type RepeatableRunTriggerCreate = RepeatableRunTriggerCreateInput;
type RepeatableRunTriggerUpdate = z.infer<typeof repeatableRunTriggerUpdateSchema>;
type ProjectCreate = ProjectCreateInput;
type ProjectUpdate = ProjectUpdateInput;
type ProjectTeamCreate = ProjectTeamCreateInput;
type ProjectTeamImport = ProjectTeamImportInput;
type ProjectTeamUpdate = ProjectTeamUpdateInput;
type RunCreate = RunCreateInput;
type RunUpdate = RunUpdateInput;
type RunStatusUpdate = RunStatusUpdateInput;
type RunBudgetCheckpoint = RunBudgetCheckpointInput;
type TaskCreate = TaskCreateInput;
type TaskStatusUpdate = TaskStatusUpdateInput;
type AgentCreate = AgentCreateInput;
type AgentSessionCreate = z.infer<typeof agentSessionCreateSchema>;
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
type WorkerDispatchSessionAttach = z.infer<typeof workerDispatchSessionAttachSchema>;
type SessionTranscriptEntryCreate = SessionTranscriptEntryCreateInput;
type WorkerNodeReconcile = WorkerNodeReconcileInput;
type WebhookEnvelope = z.infer<typeof inboundWebhookEventEnvelopeSchema>;
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
type ProjectRecord = typeof projects.$inferSelect;
type ProjectTeamRecord = typeof projectTeams.$inferSelect;
type ProjectTeamMemberRecord = typeof projectTeamMembers.$inferSelect;
type AgentRecord = typeof agents.$inferSelect;
type SessionRecord = typeof sessions.$inferSelect;
type TaskRecord = typeof tasks.$inferSelect;
type WorkerDispatchAssignmentRecord = typeof workerDispatchAssignments.$inferSelect;
type RepeatableRunDefinitionRecord = typeof repeatableRunDefinitions.$inferSelect;
type RepeatableRunTriggerRecord = typeof repeatableRunTriggers.$inferSelect;

const defaultRunHandoffConfig: RunHandoffConfig = {
  mode: "manual",
  provider: null,
  baseBranch: null,
  autoPublishBranch: false,
  autoCreatePullRequest: false,
  titleTemplate: null,
  bodyTemplate: null
};

const defaultRunHandoffExecution: RunHandoffExecution = {
  state: "idle",
  failureReason: null,
  attemptedAt: null,
  completedAt: null
};

export interface IngestWebhookInput {
  endpointPath: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
  contentType?: string | null;
  contentLengthBytes?: number | null;
  remoteAddress?: string | null;
  userAgent?: string | null;
}

export interface IngestWebhookResult {
  receipt: ExternalEventReceipt;
  run: Run | null;
}

const activeAgentStatuses = new Set<Agent["status"]>(["provisioning", "idle", "busy", "paused"]);
const preferredReviewerRoles = ["reviewer"];

function normalizeAssignmentKind(metadata: Record<string, unknown> | null | undefined) {
  const kind = metadata?.assignmentKind;
  return kind === "verification" ? "verification" : "worker";
}

function readWorkerAssignmentInvalidationReason(metadata: Record<string, unknown> | null | undefined) {
  const invalidationReason = metadata?.invalidationReason;
  return typeof invalidationReason === "string" && invalidationReason.length > 0
    ? invalidationReason
    : null;
}

function isInvalidatedWorkerDispatchAssignment(
  assignment: Pick<WorkerDispatchAssignment, "state" | "metadata">
) {
  return assignment.state === "failed" && readWorkerAssignmentInvalidationReason(assignment.metadata) !== null;
}

function normalizeReviewLikeRole(role: string) {
  return role.trim().toLowerCase().includes("review");
}

function taskRequiresVerification(task: Pick<Task, "definitionOfDone">) {
  return task.definitionOfDone.length > 0;
}

function readSessionTranscript(metadata: Record<string, unknown> | null | undefined) {
  const transcript = metadata?.transcript;

  if (!Array.isArray(transcript)) {
    return [] as SessionTranscriptEntry[];
  }

  return transcript
    .map((entry) => {
      const parsed = controlPlaneSessionTranscriptEntrySchema.safeParse(entry);
      return parsed.success ? parsed.data : null;
    })
    .filter((entry): entry is SessionTranscriptEntry => entry !== null);
}

const controlPlaneSessionTranscriptEntrySchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  kind: z.enum(["prompt", "response", "system"]),
  text: z.string().min(1),
  createdAt: z.coerce.date(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

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

function slugifyProjectTeamMemberKey(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "member";
}

function resolveRuntimeRole(profile: string, explicitRole?: string | null) {
  if (explicitRole && explicitRole.trim().length > 0) {
    return explicitRole.trim();
  }

  return profile === "leader" ? "tech-lead" : profile;
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

function normalizeValidationTemplates(templates: TaskCreate["validationTemplates"] | undefined) {
  return (templates ?? []).map((template) => ({
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

function createDefaultRunContext(): Run["context"] {
  return {
    kind: "ad_hoc",
    projectId: null,
    projectSlug: null,
    projectName: null,
    projectDescription: null,
    jobId: null,
    jobName: null,
    externalInput: null,
    values: {}
  };
}

function readOptionalString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" && record[key].trim().length > 0 ? record[key] as string : null;
}

function readOptionalUuid(record: Record<string, unknown>, key: string) {
  const value = readOptionalString(record, key);
  return value && z.string().uuid().safeParse(value).success ? value : null;
}

function normalizeStoredRunContext(metadata: Record<string, unknown> | null | undefined): Run["context"] {
  const stored = metadata?.runContext;
  const record = stored && typeof stored === "object"
    ? stored as Record<string, unknown>
    : metadata ?? {};
  const projectId = readOptionalUuid(record, "projectId");
  const projectSlug = readOptionalString(record, "projectSlug");
  const projectName = readOptionalString(record, "projectName");
  const projectDescription = readOptionalString(record, "projectDescription");
  const jobId = readOptionalString(record, "jobId");
  const jobName = readOptionalString(record, "jobName");
  const rawKind = readOptionalString(record, "kind");
  const kind: Run["context"]["kind"] = rawKind === "project" || (!rawKind && (projectId || projectSlug || projectName))
    ? "project"
    : "ad_hoc";

  const parsed = runContextSchema.safeParse({
    kind,
    projectId,
    projectSlug,
    projectName,
    projectDescription,
    jobId,
    jobName,
    externalInput: record.externalInput ?? null,
    values: typeof record.values === "object" && record.values && !Array.isArray(record.values)
      ? record.values as Record<string, unknown>
      : {}
  });

  return parsed.success ? parsed.data : createDefaultRunContext();
}

function resolveRunContext(
  context: RunCreate["context"] | RunUpdate["context"] | undefined,
  metadata: Record<string, unknown> | undefined,
  fallbackMetadata: Record<string, unknown> | null | undefined = undefined
): Run["context"] {
  if (context) {
    return runContextSchema.parse({
      kind: context.kind ?? "ad_hoc",
      projectId: context.projectId ?? null,
      projectSlug: context.projectSlug ?? null,
      projectName: context.projectName ?? null,
      projectDescription: context.projectDescription ?? null,
      jobId: context.jobId ?? null,
      jobName: context.jobName ?? null,
      externalInput: context.externalInput ?? null,
      values: context.values ?? {}
    });
  }

  if (metadata) {
    return normalizeStoredRunContext(metadata);
  }

  if (fallbackMetadata) {
    return normalizeStoredRunContext(fallbackMetadata);
  }

  return createDefaultRunContext();
}

function withRunContextMetadata(
  metadata: Record<string, unknown> | undefined,
  context: Run["context"]
) {
  return {
    ...(metadata ?? {}),
    runContext: context
  };
}

function normalizeStoredRunHandoffConfig(
  handoffConfig: Record<string, unknown> | null | undefined
): RunHandoffConfig {
  const parsed = runHandoffConfigSchema.safeParse(handoffConfig ?? defaultRunHandoffConfig);
  return parsed.success ? parsed.data : defaultRunHandoffConfig;
}

function resolveRunHandoffConfig(
  handoff: RunCreate["handoff"] | RunUpdate["handoff"] | undefined,
  existingConfig: Record<string, unknown> | null | undefined = undefined
): RunHandoffConfig {
  if (handoff) {
    return runHandoffConfigSchema.parse(handoff);
  }

  return normalizeStoredRunHandoffConfig(existingConfig);
}

function normalizeStoredRunHandoffExecution(
  handoffExecution: Record<string, unknown> | null | undefined
): RunHandoffExecution {
  const parsed = runHandoffExecutionSchema.safeParse(handoffExecution ?? defaultRunHandoffExecution);
  return parsed.success ? parsed.data : defaultRunHandoffExecution;
}

function summarizeCompletedTasks(tasksToSummarize: Task[]) {
  const completedTasks = tasksToSummarize
    .filter((task) => task.status === "completed")
    .map((task) => task.title.trim())
    .filter((title) => title.length > 0);

  return completedTasks.length > 0 ? completedTasks.join(", ") : "No completed tasks recorded";
}

function summarizeValidationResults(validationsToSummarize: ValidationHistoryEntry[]) {
  if (validationsToSummarize.length === 0) {
    return "No validations recorded";
  }

  const passed = validationsToSummarize.filter((validation) => validation.status === "passed").length;
  const failed = validationsToSummarize.filter((validation) => validation.status === "failed").length;
  return `${passed} passed, ${failed} failed`;
}

function renderHandoffTemplate(
  template: string | null | undefined,
  values: Record<string, string>
) {
  if (!template) {
    return null;
  }

  return template.replace(/\{([a-z_]+)\}/g, (_match, token) => values[token] ?? "");
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

function normalizeHeaderLookup(headers: Record<string, string>) {
  const normalized = new Map<string, string>();

  for (const [key, value] of Object.entries(headers)) {
    normalized.set(key.toLowerCase(), value);
  }

  return (name: string | null | undefined) => {
    if (!name) {
      return null;
    }

    return normalized.get(name.toLowerCase()) ?? null;
  };
}

function readWebhookAction(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>).action;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readWebhookBranch(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const ref = typeof record.ref === "string" && record.ref.length > 0
    ? record.ref.replace(/^refs\/heads\//, "")
    : null;

  if (ref) {
    return ref;
  }

  const pullRequest = record.pull_request;

  if (!pullRequest || typeof pullRequest !== "object") {
    return null;
  }

  const base = (pullRequest as Record<string, unknown>).base;

  if (!base || typeof base !== "object") {
    return null;
  }

  const branch = (base as Record<string, unknown>).ref;
  return typeof branch === "string" && branch.length > 0 ? branch : null;
}

export class ControlPlaneService {
  constructor(
    private readonly db: AppDb,
    private readonly clock: Clock,
    private readonly dependencies: {
      providerHandoff?: ProviderHandoffAdapter;
    } = {}
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

  async listProjects(access?: AccessBoundary): Promise<ProjectSummary[]> {
    const boundary = requireAccessBoundary(access);
    const [projectRows, repositoryRows, runRows, projectTeamRows] = await Promise.all([
      this.db
        .select()
        .from(projects)
        .where(and(
          eq(projects.workspaceId, boundary.workspaceId),
          eq(projects.teamId, boundary.teamId)
        ))
        .orderBy(asc(projects.createdAt)),
      this.db
        .select()
        .from(repositories)
        .where(and(
          eq(repositories.workspaceId, boundary.workspaceId),
          eq(repositories.teamId, boundary.teamId)
        ))
        .orderBy(asc(repositories.createdAt)),
      this.db
        .select()
        .from(runs)
        .where(and(
          eq(runs.workspaceId, boundary.workspaceId),
          eq(runs.teamId, boundary.teamId)
        ))
        .orderBy(asc(runs.createdAt)),
      this.db
        .select()
        .from(projectTeams)
        .where(and(
          eq(projectTeams.workspaceId, boundary.workspaceId),
          eq(projectTeams.teamId, boundary.teamId)
        ))
        .orderBy(asc(projectTeams.createdAt))
    ]);

    return projectRows.map((project) => this.mapProjectSummary(project, repositoryRows, runRows, projectTeamRows));
  }

  async getProject(projectId: string, access?: AccessBoundary): Promise<ProjectDetail> {
    const project = await this.assertProjectExists(projectId, access);
    const [repositoryRows, runRows, projectTeamRows] = await Promise.all([
      this.db
        .select()
        .from(repositories)
        .where(and(
          eq(repositories.workspaceId, project.workspaceId),
          eq(repositories.teamId, project.teamId)
        ))
        .orderBy(asc(repositories.createdAt)),
      this.db
        .select()
        .from(runs)
        .where(and(
          eq(runs.workspaceId, project.workspaceId),
          eq(runs.teamId, project.teamId)
        ))
        .orderBy(asc(runs.createdAt)),
      this.db
        .select()
        .from(projectTeams)
        .where(eq(projectTeams.projectId, project.id))
        .orderBy(asc(projectTeams.createdAt))
    ]);
    const projectTeamMemberRows = projectTeamRows.length === 0
      ? []
      : await this.db
        .select()
        .from(projectTeamMembers)
        .where(inArray(projectTeamMembers.projectTeamId, projectTeamRows.map((team) => team.id)))
        .orderBy(asc(projectTeamMembers.position), asc(projectTeamMembers.createdAt));

    return this.mapProjectDetail(project, repositoryRows, runRows, projectTeamRows, projectTeamMemberRows);
  }

  async createProject(input: ProjectCreate, access?: AccessBoundary): Promise<Project> {
    const boundary = requireAccessBoundary(access);
    await this.ensureOwnershipBoundary(boundary);
    const now = this.clock.now();
    const [project] = await this.db.insert(projects).values({
      id: crypto.randomUUID(),
      workspaceId: boundary.workspaceId,
      teamId: boundary.teamId,
      name: input.name,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now
    }).returning();

    return this.mapProject(expectPersistedRecord(project, "project"));
  }

  async updateProject(projectId: string, input: ProjectUpdate, access?: AccessBoundary): Promise<Project> {
    const existingProject = await this.assertProjectExists(projectId, access);
    const now = this.clock.now();
    const [project] = await this.db.update(projects).set({
      name: input.name ?? existingProject.name,
      description: input.description === undefined ? existingProject.description : input.description,
      updatedAt: now
    }).where(eq(projects.id, projectId)).returning();

    return this.mapProject(expectPersistedRecord(project, "project"));
  }

  async deleteProject(projectId: string, access?: AccessBoundary) {
    await this.assertProjectExists(projectId, access);

    await this.db.transaction(async (tx) => {
      const now = this.clock.now();
      const teamRows = await tx.select().from(projectTeams).where(eq(projectTeams.projectId, projectId));
      const teamIds = teamRows.map((team) => team.id);
      if (teamIds.length > 0) {
        const definitionRows = await tx.select({ id: repeatableRunDefinitions.id }).from(repeatableRunDefinitions)
          .where(inArray(repeatableRunDefinitions.projectTeamId, teamIds));
        const definitionIds = definitionRows.map((row) => row.id);
        if (definitionIds.length > 0) {
          await tx.delete(repeatableRunTriggers).where(inArray(repeatableRunTriggers.repeatableRunId, definitionIds));
          await tx.delete(repeatableRunDefinitions).where(inArray(repeatableRunDefinitions.id, definitionIds));
        }
        await tx.delete(projectTeamMembers).where(inArray(projectTeamMembers.projectTeamId, teamIds));
        await tx.delete(projectTeams).where(inArray(projectTeams.id, teamIds));
      }
      await tx.update(repositories).set({
        projectId: null,
        updatedAt: now
      }).where(eq(repositories.projectId, projectId));
      await tx.update(runs).set({
        projectId: null,
        projectTeamId: null,
        projectTeamName: null,
        updatedAt: now
      }).where(eq(runs.projectId, projectId));
      await tx.delete(projects).where(eq(projects.id, projectId));
    });
  }

  async listProjectTeams(projectId?: string, access?: AccessBoundary): Promise<ProjectTeamDetail[]> {
    const boundary = requireAccessBoundary(access);
    const conditions = [
      eq(projectTeams.workspaceId, boundary.workspaceId),
      eq(projectTeams.teamId, boundary.teamId)
    ];
    if (projectId) {
      conditions.push(eq(projectTeams.projectId, projectId));
    }
    const teamRows = await this.db.select().from(projectTeams).where(and(...conditions)).orderBy(asc(projectTeams.createdAt));
    if (teamRows.length === 0) {
      return [];
    }
    const memberRows = await this.db.select().from(projectTeamMembers)
      .where(inArray(projectTeamMembers.projectTeamId, teamRows.map((team) => team.id)))
      .orderBy(asc(projectTeamMembers.position), asc(projectTeamMembers.createdAt));

    return teamRows.map((team) => this.mapProjectTeamDetail(team, memberRows));
  }

  async createProjectTeam(input: ProjectTeamCreate, access?: AccessBoundary): Promise<ProjectTeamDetail> {
    const boundary = requireAccessBoundary(access);
    await this.ensureOwnershipBoundary(boundary);
    const project = await this.assertProjectExists(input.projectId, boundary);
    const now = this.clock.now();
    const teamId = crypto.randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.insert(projectTeams).values({
        id: teamId,
        projectId: project.id,
        workspaceId: project.workspaceId,
        teamId: project.teamId,
        name: input.name,
        description: input.description ?? null,
        concurrencyCap: input.concurrencyCap,
        sourceTemplateId: null,
        createdAt: now,
        updatedAt: now
      });
      await this.replaceProjectTeamMembers(tx, teamId, input.members, now);
    });

    return this.getProjectTeam(teamId, boundary);
  }

  async importProjectTeam(input: ProjectTeamImport, access?: AccessBoundary): Promise<ProjectTeamDetail> {
    const blueprintId = input.blueprintId ?? input.templateId;
    const blueprint = agentTeamBlueprints.find((candidate) => candidate.id === blueprintId);
    if (!blueprintId || !blueprint) {
      throw new HttpError(404, `team blueprint ${blueprintId ?? "unknown"} not found`);
    }

    const boundary = requireAccessBoundary(access);
    await this.ensureOwnershipBoundary(boundary);
    const project = await this.assertProjectExists(input.projectId, boundary);
    const now = this.clock.now();
    const teamId = crypto.randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.insert(projectTeams).values({
        id: teamId,
        projectId: project.id,
        workspaceId: project.workspaceId,
        teamId: project.teamId,
        name: input.name ?? blueprint.name,
        description: input.description ?? blueprint.summary,
        concurrencyCap: blueprint.suggestedConcurrencyCap,
        sourceTemplateId: blueprint.id,
        createdAt: now,
        updatedAt: now
      });
      await this.replaceProjectTeamMembers(tx, teamId, blueprint.members.map((member) => ({
        name: member.displayName,
        role: resolveRuntimeRole(member.roleProfile),
        profile: member.roleProfile,
        responsibility: member.responsibility
      })), now);
    });

    return this.getProjectTeam(teamId, boundary);
  }

  async getProjectTeam(projectTeamId: string, access?: AccessBoundary): Promise<ProjectTeamDetail> {
    const team = await this.assertProjectTeamExists(projectTeamId, access);
    const memberRows = await this.db.select().from(projectTeamMembers)
      .where(eq(projectTeamMembers.projectTeamId, projectTeamId))
      .orderBy(asc(projectTeamMembers.position), asc(projectTeamMembers.createdAt));
    return this.mapProjectTeamDetail(team, memberRows);
  }

  async updateProjectTeam(projectTeamId: string, input: ProjectTeamUpdate, access?: AccessBoundary): Promise<ProjectTeamDetail> {
    const existing = await this.assertProjectTeamExists(projectTeamId, access);
    const now = this.clock.now();

    await this.db.transaction(async (tx) => {
      await tx.update(projectTeams).set({
        name: input.name ?? existing.name,
        description: input.description === undefined ? existing.description : input.description,
        concurrencyCap: input.concurrencyCap ?? existing.concurrencyCap,
        updatedAt: now
      }).where(eq(projectTeams.id, projectTeamId));

      if (input.members) {
        await this.replaceProjectTeamMembers(tx, projectTeamId, input.members, now);
      }
    });

    const [updatedTeam] = await this.db.select().from(projectTeams).where(eq(projectTeams.id, projectTeamId));
    if (input.name && updatedTeam) {
      await this.db.update(runs).set({
        projectTeamName: input.name,
        updatedAt: now
      }).where(eq(runs.projectTeamId, projectTeamId));
      await this.db.update(repeatableRunDefinitions).set({
        projectTeamName: input.name,
        updatedAt: now
      }).where(eq(repeatableRunDefinitions.projectTeamId, projectTeamId));
    }

    return this.getProjectTeam(projectTeamId, access);
  }

  async deleteProjectTeam(projectTeamId: string, access?: AccessBoundary) {
    await this.assertProjectTeamExists(projectTeamId, access);
    const linkedDefinition = await this.db.select({ id: repeatableRunDefinitions.id, name: repeatableRunDefinitions.name })
      .from(repeatableRunDefinitions)
      .where(eq(repeatableRunDefinitions.projectTeamId, projectTeamId));
    if (linkedDefinition[0]) {
      throw new HttpError(409, `project team is still referenced by repeatable run ${linkedDefinition[0].name}`);
    }
    const linkedRun = await this.db.select({ id: runs.id, goal: runs.goal })
      .from(runs)
      .where(eq(runs.projectTeamId, projectTeamId));
    if (linkedRun[0]) {
      throw new HttpError(409, `project team is still referenced by run ${linkedRun[0].goal}`);
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(projectTeamMembers).where(eq(projectTeamMembers.projectTeamId, projectTeamId));
      await tx.delete(projectTeams).where(eq(projectTeams.id, projectTeamId));
    });
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
    if (input.projectId) {
      await this.assertProjectExists(input.projectId, boundary);
    }
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
      projectId: input.projectId ?? null,
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

  async updateRepository(repositoryId: string, input: RepositoryUpdate, access?: AccessBoundary) {
    const existingRepository = await this.assertRepositoryExists(repositoryId, access);
    if (input.projectId) {
      await this.assertProjectExists(input.projectId, access);
    }
    const now = this.clock.now();
    const provider = (input.provider ?? existingRepository.provider) as Repository["provider"];
    const url = input.url ?? existingRepository.url;
    const localPath = input.localPath === undefined ? existingRepository.localPath : input.localPath;
    const providerInspection = await inspectRepositoryProvider({
      provider,
      url,
      localPath: localPath ?? null
    });
    const defaultBranch = input.defaultBranch
      ?? providerInspection.defaultBranch
      ?? existingRepository.defaultBranch;

    const [repository] = await this.db.update(repositories).set({
      name: input.name ?? existingRepository.name,
      url,
      provider,
      defaultBranch,
      localPath,
      projectId: input.projectId === undefined ? existingRepository.projectId : input.projectId,
      trustLevel: input.trustLevel ?? existingRepository.trustLevel,
      approvalProfile: input.approvalProfile ?? existingRepository.approvalProfile,
      providerSync: {
        connectivityStatus: providerInspection.connectivityStatus,
        validatedAt: providerInspection.validatedAt?.toISOString() ?? null,
        defaultBranch: providerInspection.defaultBranch ?? defaultBranch,
        branches: providerInspection.branches,
        providerRepoUrl: providerInspection.providerRepoUrl,
        lastError: providerInspection.lastError
      },
      updatedAt: now
    }).where(eq(repositories.id, repositoryId)).returning();

    return this.mapRepository(expectPersistedRecord(repository, "repository"));
  }

  async deleteRepository(repositoryId: string, access?: AccessBoundary) {
    await this.assertRepositoryExists(repositoryId, access);
    const relatedRuns = await this.db.select({ id: runs.id }).from(runs).where(eq(runs.repositoryId, repositoryId));

    if (relatedRuns.length > 0) {
      throw new HttpError(409, "repository cannot be deleted while runs still reference it");
    }

    await this.db.delete(repositories).where(eq(repositories.id, repositoryId));
  }

  async listRepeatableRunDefinitions(repositoryId?: string, access?: AccessBoundary) {
    const boundary = requireAccessBoundary(access);

    if (repositoryId) {
      await this.assertRepositoryExists(repositoryId, boundary);
    }

    const conditions = [
      eq(repeatableRunDefinitions.workspaceId, boundary.workspaceId),
      eq(repeatableRunDefinitions.teamId, boundary.teamId)
    ];

    if (repositoryId) {
      conditions.push(eq(repeatableRunDefinitions.repositoryId, repositoryId));
    }

    const rows = await this.db
      .select()
      .from(repeatableRunDefinitions)
      .where(and(...conditions))
      .orderBy(asc(repeatableRunDefinitions.createdAt));

    return rows.map((definition) => this.mapRepeatableRunDefinition(definition));
  }

  async createRepeatableRunDefinition(input: RepeatableRunDefinitionCreate, access?: AccessBoundary) {
    const boundary = requireAccessBoundary(access);
    const repository = await this.assertRepositoryExists(input.repositoryId, boundary);
    const projectTeam = await this.assertProjectTeamExists(input.projectTeamId, boundary);
    if (!repository.projectId) {
      throw new HttpError(409, "repeatable runs require a repository assigned to a project");
    }
    if (projectTeam.projectId !== repository.projectId) {
      throw new HttpError(409, `project team ${projectTeam.id} does not belong to repository project ${repository.projectId}`);
    }
    const now = this.clock.now();

    const [definition] = await this.db.insert(repeatableRunDefinitions).values({
      id: crypto.randomUUID(),
      repositoryId: repository.id,
      projectTeamId: projectTeam.id,
      projectTeamName: projectTeam.name,
      workspaceId: repository.workspaceId,
      teamId: repository.teamId,
      name: input.name,
      description: input.description ?? null,
      status: input.status,
      execution: input.execution,
      createdAt: now,
      updatedAt: now
    }).returning();

    return this.mapRepeatableRunDefinition(expectPersistedRecord(definition, "repeatable run definition"));
  }

  async updateRepeatableRunDefinition(repeatableRunId: string, input: RepeatableRunDefinitionUpdate, access?: AccessBoundary) {
    const existing = await this.assertRepeatableRunDefinitionExists(repeatableRunId, access);
    const repository = input.repositoryId
      ? await this.assertRepositoryExists(input.repositoryId, access)
      : await this.assertRepositoryExists(existing.repositoryId, access);
    const projectTeam = input.projectTeamId
      ? await this.assertProjectTeamExists(input.projectTeamId, access)
      : existing.projectTeamId
        ? await this.assertProjectTeamExists(existing.projectTeamId, access)
        : null;
    const preservingLegacyTeamlessDefinition = !existing.projectTeamId
      && input.projectTeamId === undefined
      && input.repositoryId === undefined;
    if (!repository.projectId) {
      throw new HttpError(409, "repeatable runs require a repository assigned to a project");
    }
    if (!projectTeam && !preservingLegacyTeamlessDefinition) {
      throw new HttpError(400, "project repeatable runs require projectTeamId");
    }
    if (projectTeam && projectTeam.projectId !== repository.projectId) {
      throw new HttpError(409, `project team ${projectTeam.id} does not belong to repository project ${repository.projectId}`);
    }
    const now = this.clock.now();

    const [definition] = await this.db.update(repeatableRunDefinitions).set({
      repositoryId: repository.id,
      projectTeamId: projectTeam?.id ?? existing.projectTeamId ?? undefined,
      projectTeamName: projectTeam?.name ?? existing.projectTeamName ?? undefined,
      workspaceId: repository.workspaceId,
      teamId: repository.teamId,
      name: input.name ?? existing.name,
      description: input.description === undefined ? existing.description : input.description,
      status: input.status ?? existing.status,
      execution: input.execution ?? existing.execution,
      updatedAt: now
    }).where(eq(repeatableRunDefinitions.id, repeatableRunId)).returning();

    return this.mapRepeatableRunDefinition(expectPersistedRecord(definition, "repeatable run definition"));
  }

  async deleteRepeatableRunDefinition(repeatableRunId: string, access?: AccessBoundary) {
    await this.assertRepeatableRunDefinitionExists(repeatableRunId, access);
    const relatedTriggers = await this.db
      .select({ id: repeatableRunTriggers.id })
      .from(repeatableRunTriggers)
      .where(eq(repeatableRunTriggers.repeatableRunId, repeatableRunId));

    if (relatedTriggers.length > 0) {
      throw new HttpError(409, "repeatable run cannot be deleted while triggers still reference it");
    }

    await this.db.delete(repeatableRunDefinitions).where(eq(repeatableRunDefinitions.id, repeatableRunId));
  }

  async listRepeatableRunTriggers(
    query: {
      repositoryId?: string | undefined;
      repeatableRunId?: string | undefined;
    },
    access?: AccessBoundary
  ) {
    const boundary = requireAccessBoundary(access);
    const definitions = await this.listRepeatableRunDefinitions(query.repositoryId, boundary);
    const definitionIds = new Set(
      definitions
        .filter((definition) => !query.repeatableRunId || definition.id === query.repeatableRunId)
        .map((definition) => definition.id)
    );

    if (definitionIds.size === 0) {
      return [] as RepeatableRunTrigger[];
    }

    const rows = await this.db
      .select()
      .from(repeatableRunTriggers)
      .where(and(
        eq(repeatableRunTriggers.workspaceId, boundary.workspaceId),
        eq(repeatableRunTriggers.teamId, boundary.teamId),
        inArray(repeatableRunTriggers.repeatableRunId, [...definitionIds])
      ))
      .orderBy(asc(repeatableRunTriggers.createdAt));

    return rows.map((trigger) => this.mapRepeatableRunTrigger(trigger));
  }

  async createRepeatableRunTrigger(input: RepeatableRunTriggerCreate, access?: AccessBoundary) {
    const definition = await this.assertRepeatableRunDefinitionExists(input.repeatableRunId, access);
    const triggerId = crypto.randomUUID();
    const now = this.clock.now();
    const config = input.kind === "webhook"
      ? {
        ...input.config,
        endpointPath: this.buildWebhookEndpointPath(triggerId)
      }
      : input.config;
    const [trigger] = await this.db.insert(repeatableRunTriggers).values({
      id: triggerId,
      repeatableRunId: definition.id,
      workspaceId: definition.workspaceId,
      teamId: definition.teamId,
      name: input.name,
      description: input.description ?? null,
      enabled: input.enabled,
      kind: input.kind,
      config,
      createdAt: now,
      updatedAt: now
    }).returning();

    return this.mapRepeatableRunTrigger(expectPersistedRecord(trigger, "repeatable run trigger"));
  }

  async updateRepeatableRunTrigger(triggerId: string, input: RepeatableRunTriggerUpdate, access?: AccessBoundary) {
    const existing = await this.assertRepeatableRunTriggerExists(triggerId, access);
    const definition = input.repeatableRunId
      ? await this.assertRepeatableRunDefinitionExists(input.repeatableRunId, access)
      : await this.assertRepeatableRunDefinitionExists(existing.repeatableRunId, access);
    const nextConfig = input.config
      ? {
        ...existing.config,
        ...input.config,
        endpointPath: existing.config.endpointPath,
        filters: {
          ...existing.config.filters,
          ...(input.config.filters ?? {})
        },
        metadata: input.config.metadata ?? existing.config.metadata
      }
      : existing.config;

    const now = this.clock.now();
    const [trigger] = await this.db.update(repeatableRunTriggers).set({
      repeatableRunId: definition.id,
      workspaceId: definition.workspaceId,
      teamId: definition.teamId,
      name: input.name ?? existing.name,
      description: input.description === undefined ? existing.description : input.description,
      enabled: input.enabled ?? existing.enabled,
      config: nextConfig,
      updatedAt: now
    }).where(eq(repeatableRunTriggers.id, triggerId)).returning();

    return this.mapRepeatableRunTrigger(expectPersistedRecord(trigger, "repeatable run trigger"));
  }

  async deleteRepeatableRunTrigger(triggerId: string, access?: AccessBoundary) {
    await this.assertRepeatableRunTriggerExists(triggerId, access);
    const relatedReceipts = await this.db
      .select({ id: externalEventReceipts.id })
      .from(externalEventReceipts)
      .where(eq(externalEventReceipts.repeatableRunTriggerId, triggerId));

    if (relatedReceipts.length > 0) {
      throw new HttpError(409, "repeatable run trigger cannot be deleted after receiving events");
    }

    await this.db.delete(repeatableRunTriggers).where(eq(repeatableRunTriggers.id, triggerId));
  }

  async listExternalEventReceipts(
    query: {
      repositoryId?: string | undefined;
      repeatableRunId?: string | undefined;
      repeatableRunTriggerId?: string | undefined;
    },
    access?: AccessBoundary
  ) {
    const boundary = requireAccessBoundary(access);
    const conditions = [
      eq(externalEventReceipts.workspaceId, boundary.workspaceId),
      eq(externalEventReceipts.teamId, boundary.teamId)
    ];

    if (query.repositoryId) {
      await this.assertRepositoryExists(query.repositoryId, boundary);
      conditions.push(eq(externalEventReceipts.repositoryId, query.repositoryId));
    }

    if (query.repeatableRunId) {
      await this.assertRepeatableRunDefinitionExists(query.repeatableRunId, boundary);
      conditions.push(eq(externalEventReceipts.repeatableRunId, query.repeatableRunId));
    }

    if (query.repeatableRunTriggerId) {
      await this.assertRepeatableRunTriggerExists(query.repeatableRunTriggerId, boundary);
      conditions.push(eq(externalEventReceipts.repeatableRunTriggerId, query.repeatableRunTriggerId));
    }

    const rows = await this.db
      .select()
      .from(externalEventReceipts)
      .where(and(...conditions))
      .orderBy(asc(externalEventReceipts.createdAt));

    return rows.map((receipt) => this.mapExternalEventReceipt(receipt));
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
      await Promise.all(rows.map((run) => this.repairRunStateFromDispatchAssignments(run.id)));
      for (const run of rows) {
        const runDetail = await this.getRun(run.id, boundary);

        if ((runDetail.status === "pending" || runDetail.status === "in_progress")
          && runDetail.tasks.some((task) => task.status === "pending")
          && runDetail.agents.length > 0) {
          await this.enqueueRunnableWorkerDispatches(run.id, boundary);
          await this.reconcileRunExecutionState(run.id, boundary);
        }
      }
      const refreshedRows = await this.db.select().from(runs).where(and(
        eq(runs.repositoryId, repository.id),
        eq(runs.workspaceId, boundary.workspaceId),
        eq(runs.teamId, boundary.teamId)
      )).orderBy(asc(runs.createdAt));
      return refreshedRows.map((run) => this.mapRun(run, repository.projectId ?? null));
    }

    const rows = await this.db.select().from(runs).where(and(
      eq(runs.workspaceId, boundary.workspaceId),
      eq(runs.teamId, boundary.teamId)
    )).orderBy(asc(runs.createdAt));
    await Promise.all(rows.map((run) => this.repairRunStateFromDispatchAssignments(run.id)));
    for (const run of rows) {
      const runDetail = await this.getRun(run.id, boundary);

      if ((runDetail.status === "pending" || runDetail.status === "in_progress")
        && runDetail.tasks.some((task) => task.status === "pending")
        && runDetail.agents.length > 0) {
        await this.enqueueRunnableWorkerDispatches(run.id, boundary);
        await this.reconcileRunExecutionState(run.id, boundary);
      }
    }
    const refreshedRows = await this.db.select().from(runs).where(and(
      eq(runs.workspaceId, boundary.workspaceId),
      eq(runs.teamId, boundary.teamId)
    )).orderBy(asc(runs.createdAt));
    const repositoriesById = new Map(
      (await this.listRepositories(boundary)).map((repository) => [repository.id, repository] as const)
    );

    return refreshedRows.map((run) => this.mapRun(run, repositoriesById.get(run.repositoryId)?.projectId ?? null));
  }

  async listRunsByJobScope(repositoryId?: string, access?: AccessBoundary): Promise<RunsByJobScope> {
    const runList = await this.listRuns(repositoryId, access);

    return {
      projectJobs: runList.filter((run) => run.jobScope?.kind === "project"),
      adHocJobs: runList.filter((run) => run.jobScope?.kind !== "project")
    };
  }

  async getRun(runId: string, access?: AccessBoundary): Promise<RunDetail> {
    await this.repairRunStateFromDispatchAssignments(runId);
    const run = await this.assertRunExists(runId, access);
    const repository = await this.assertRepositoryExists(run.repositoryId, access);

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

    const mappedTasks = runTasks.map((task) => this.mapTask(task));

    const mappedSessions = runSessions.map(({ session }): Session => this.mapSession(session));

    return {
      ...this.mapRun(run, repository.projectId ?? null),
      tasks: mappedTasks,
      agents: this.mapAgents(runAgents, runSessions.map(({ session }) => session)),
      sessions: mappedSessions,
      taskDag: this.buildTaskDag(mappedTasks)
    };
  }

  async createRun(input: RunCreate, createdBy: string, access?: AccessBoundary) {
    assertAccessBoundary(access);
    const repository = await this.assertRepositoryExists(input.repositoryId, access);
    const projectId = input.projectId === undefined ? repository.projectId : input.projectId;
    if (projectId) {
      await this.assertProjectExists(projectId, access);
    }
    const projectTeam = input.projectTeamId
      ? await this.assertProjectTeamExists(input.projectTeamId, access)
      : null;
    if (projectId && !projectTeam) {
      throw new HttpError(400, "project runs require projectTeamId");
    }
    if (!projectId && projectTeam) {
      throw new HttpError(400, "ad-hoc runs cannot set projectTeamId");
    }
    if (projectTeam && projectTeam.projectId !== projectId) {
      throw new HttpError(409, `project team ${projectTeam.id} does not belong to project ${projectId}`);
    }

    const id = crypto.randomUUID();
    const now = this.clock.now();
    const policyProfile = input.policyProfile ?? repository.approvalProfile;
    const concurrencyCap = requiresSensitiveDefaults(repository, policyProfile)
      ? 1
      : input.concurrencyCap;
    const context = resolveRunContext(input.context, input.metadata);
    const handoff = resolveRunHandoffConfig(input.handoff);

    const [run] = await this.db.insert(runs).values({
      id,
      repositoryId: input.repositoryId,
      workspaceId: repository.workspaceId,
      teamId: repository.teamId,
      projectId,
      projectTeamId: projectTeam?.id ?? null,
      projectTeamName: projectTeam?.name ?? null,
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
      handoffConfig: handoff,
      handoffExecution: defaultRunHandoffExecution,
      completedAt: null,
      context: input.context,
      metadata: withRunContextMetadata(input.metadata, context),
      createdBy,
      createdAt: now,
      updatedAt: now
    }).returning();

    return this.mapRun(expectPersistedRecord(run, "run"), repository.projectId ?? null);
  }

  async ingestWebhook(input: IngestWebhookInput): Promise<IngestWebhookResult> {
    const now = this.clock.now();
    const trigger = await this.resolveWebhookTriggerByPath(input.endpointPath);
    const repeatableRun = await this.assertRepeatableRunDefinitionExists(trigger.repeatableRunId);
    const repository = await this.assertRepositoryExists(repeatableRun.repositoryId, {
      workspaceId: repeatableRun.workspaceId,
      workspaceName: null,
      teamId: repeatableRun.teamId,
      teamName: null
    });
    const headerValue = normalizeHeaderLookup(input.headers);
    const signatureValue = headerValue(trigger.config.signatureHeader);
    const deliveryId = headerValue(trigger.config.deliveryIdHeader) ?? crypto.randomUUID();
    const eventName = headerValue(trigger.config.eventNameHeader);
    const action = readWebhookAction(input.body);
    const event = inboundWebhookEventEnvelopeSchema.parse({
      sourceType: "webhook",
      eventId: deliveryId,
      eventName,
      action,
      source: "webhook",
      payload: input.body ?? null,
      request: {
        method: input.method,
        path: input.endpointPath,
        query: input.query,
        headers: input.headers,
        contentType: input.contentType ?? null,
        contentLengthBytes: input.contentLengthBytes ?? null,
        receivedAt: now,
        remoteAddress: input.remoteAddress ?? null,
        userAgent: input.userAgent ?? null,
        deliveryId,
        signature: trigger.config.signatureHeader && signatureValue
          ? {
              header: trigger.config.signatureHeader,
              value: signatureValue,
              algorithm: null,
              valid: null
            }
          : null
      },
      metadata: {
        endpointPath: input.endpointPath
      }
    });

    const [receiptRow] = await this.db.insert(externalEventReceipts).values({
      id: crypto.randomUUID(),
      repeatableRunTriggerId: trigger.id,
      repeatableRunId: repeatableRun.id,
      repositoryId: repeatableRun.repositoryId,
      workspaceId: repeatableRun.workspaceId,
      teamId: repeatableRun.teamId,
      sourceType: "webhook",
      status: "received",
      event,
      rejectionReason: null,
      createdRunId: null,
      createdAt: now,
      updatedAt: now
    }).returning();

    const receiptId = expectPersistedRecord(receiptRow, "external event receipt").id;
    const rejectionReason = this.validateWebhookTriggerRequest(trigger, repeatableRun, input, event);

    if (rejectionReason) {
      const [updatedReceipt] = await this.db.update(externalEventReceipts).set({
        status: "rejected",
        rejectionReason,
        updatedAt: now,
        event: {
          ...event,
          request: {
            ...event.request,
            signature: event.request.signature
              ? {
                  ...event.request.signature,
                  valid: false
                }
              : null
          }
        }
      }).where(eq(externalEventReceipts.id, receiptId)).returning();

      return {
        receipt: this.mapExternalEventReceipt(expectPersistedRecord(updatedReceipt, "external event receipt")),
        run: null
      };
    }

    try {
      const runContext: RunContext = {
        kind: "ad_hoc",
        projectId: null,
        projectSlug: null,
        projectName: null,
        projectDescription: null,
        jobId: null,
        jobName: null,
        externalInput: {
          kind: "webhook",
          trigger: {
            id: trigger.id,
            repeatableRunId: repeatableRun.id,
            name: trigger.name,
            kind: "webhook",
            metadata: trigger.config.metadata
          },
          event: {
            ...event,
            request: {
              ...event.request,
              signature: event.request.signature
                ? {
                    ...event.request.signature,
                    valid: trigger.config.secretRef ? true : null
                  }
                : null
            }
          },
          receivedAt: now,
          metadata: {
            receiptId
          }
        },
        values: {}
      };
      const run = await this.createRun({
        repositoryId: repository.id,
        projectId: repository.projectId ?? null,
        projectTeamId: repeatableRun.projectTeamId,
        goal: repeatableRun.execution.goal,
        branchName: repeatableRun.execution.branchName ?? undefined,
        planArtifactPath: repeatableRun.execution.planArtifactPath ?? undefined,
        budgetTokens: repeatableRun.execution.budgetTokens ?? undefined,
        budgetCostUsd: repeatableRun.execution.budgetCostUsd ?? undefined,
        concurrencyCap: repeatableRun.execution.concurrencyCap,
        policyProfile: repeatableRun.execution.policyProfile ?? undefined,
        handoff: repeatableRun.execution.handoff,
        metadata: {
          ...repeatableRun.execution.metadata,
          repeatableRun: {
            id: repeatableRun.id,
            name: repeatableRun.name
          },
          externalEventReceiptId: receiptId
        },
        context: runContext
      }, "external-trigger", {
        workspaceId: repeatableRun.workspaceId,
        workspaceName: null,
        teamId: repeatableRun.teamId,
        teamName: null,
        policyProfile: repository.approvalProfile
      });

      const [updatedReceipt] = await this.db.update(externalEventReceipts).set({
        status: "run_created",
        createdRunId: run.id,
        updatedAt: now
      }).where(eq(externalEventReceipts.id, receiptId)).returning();

      return {
        receipt: this.mapExternalEventReceipt(expectPersistedRecord(updatedReceipt, "external event receipt")),
        run
      };
    } catch (error) {
      await this.db.update(externalEventReceipts).set({
        status: "failed",
        rejectionReason: error instanceof Error ? error.message : "webhook_processing_failed",
        updatedAt: now
      }).where(eq(externalEventReceipts.id, receiptId));
      throw error;
    }
  }

  async updateRunStatus(runId: string, input: RunStatusUpdate, access?: AccessBoundary) {
    const existingRun = await this.assertRunExists(runId, access);
    const now = this.clock.now();

    const [run] = await this.db.update(runs).set({
      status: input.status,
      planArtifactPath: input.planArtifactPath === undefined
        ? existingRun.planArtifactPath
        : input.planArtifactPath,
      completedAt: input.status === "completed" ? now : null,
      updatedAt: now
    }).where(eq(runs.id, runId)).returning();

    const repository = await this.assertRepositoryExists(existingRun.repositoryId, access);
    const mappedRun = this.mapRun(expectPersistedRecord(run, "run"), repository.projectId ?? null);

    if (mappedRun.status === "completed") {
      await this.maybeExecuteAutoHandoff(mappedRun.id, access);
      return this.getRun(mappedRun.id, access);
    }

    return mappedRun;
  }

  async updateRun(runId: string, input: RunUpdate, access?: AccessBoundary) {
    const existingRun = await this.assertRunExists(runId, access);
    if (input.projectId) {
      await this.assertProjectExists(input.projectId, access);
    }
    const nextProjectId = input.projectId === undefined ? existingRun.projectId : input.projectId;
    const nextProjectTeam = input.projectTeamId === undefined
      ? existingRun.projectTeamId
        ? await this.assertProjectTeamExists(existingRun.projectTeamId, access)
        : null
      : input.projectTeamId
        ? await this.assertProjectTeamExists(input.projectTeamId, access)
        : null;
    if (nextProjectId && !nextProjectTeam) {
      throw new HttpError(400, "project runs require projectTeamId");
    }
    if (!nextProjectId && nextProjectTeam) {
      throw new HttpError(400, "ad-hoc runs cannot set projectTeamId");
    }
    if (nextProjectTeam && nextProjectTeam.projectId !== nextProjectId) {
      throw new HttpError(409, `project team ${nextProjectTeam.id} does not belong to project ${nextProjectId}`);
    }
    const now = this.clock.now();
    const context = resolveRunContext(input.context, input.metadata, existingRun.metadata);
    const handoff = resolveRunHandoffConfig(input.handoff, existingRun.handoffConfig);

    const [run] = await this.db.update(runs).set({
      projectId: nextProjectId,
      projectTeamId: nextProjectTeam?.id ?? null,
      projectTeamName: nextProjectTeam?.name ?? null,
      goal: input.goal ?? existingRun.goal,
      branchName: input.branchName === undefined ? existingRun.branchName : input.branchName,
      budgetTokens: input.budgetTokens === undefined ? existingRun.budgetTokens : input.budgetTokens,
      budgetCostUsd: input.budgetCostUsd === undefined
        ? existingRun.budgetCostUsd
        : input.budgetCostUsd === null
          ? null
          : dollarsToCents(input.budgetCostUsd),
      concurrencyCap: input.concurrencyCap ?? existingRun.concurrencyCap,
      policyProfile: input.policyProfile === undefined ? existingRun.policyProfile : input.policyProfile,
      handoffConfig: handoff,
      context: input.context === undefined ? existingRun.context : input.context,
      metadata: input.metadata === undefined
        ? withRunContextMetadata(existingRun.metadata, context)
        : withRunContextMetadata(input.metadata, context),
      updatedAt: now
    }).where(eq(runs.id, runId)).returning();

    const repository = await this.assertRepositoryExists(existingRun.repositoryId, access);
    return this.mapRun(expectPersistedRecord(run, "run"), repository.projectId ?? null);
  }

  async deleteRun(runId: string, access?: AccessBoundary) {
    await this.assertRunExists(runId, access);

    await this.db.transaction(async (tx) => {
      await tx.delete(controlPlaneEvents).where(eq(controlPlaneEvents.runId, runId));
      await tx.delete(artifacts).where(eq(artifacts.runId, runId));
      await tx.delete(validations).where(eq(validations.runId, runId));
      await tx.delete(approvals).where(eq(approvals.runId, runId));
      await tx.delete(messages).where(eq(messages.runId, runId));
      await tx.delete(workerDispatchAssignments).where(eq(workerDispatchAssignments.runId, runId));
      await tx.delete(tasks).where(eq(tasks.runId, runId));

      const runAgents = await tx.select({ id: agents.id }).from(agents).where(eq(agents.runId, runId));
      const agentIds = runAgents.map((agent) => agent.id);
      if (agentIds.length > 0) {
        await tx.delete(sessions).where(inArray(sessions.agentId, agentIds));
      }
      await tx.delete(agents).where(eq(agents.runId, runId));
      await tx.delete(runs).where(eq(runs.id, runId));
    });
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
    const repository = await this.assertRepositoryExists(existingRun.repositoryId, access);
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

    return this.mapRun(expectPersistedRecord(run, "run"), repository.projectId ?? null);
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

    return this.mapRun(expectPersistedRecord(updatedRun, "run"), repository.projectId ?? null);
  }

  async listTasks(runId?: string, access?: AccessBoundary) {
    const boundary = requireAccessBoundary(access);
    if (runId) {
      await this.assertRunExists(runId, boundary);
      const taskRows = await this.db.select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.createdAt));
      return taskRows.map((task) => this.mapTask(task));
    }

    const taskRows = await this.db.select({
      id: tasks.id,
      runId: tasks.runId,
      parentTaskId: tasks.parentTaskId,
      title: tasks.title,
      description: tasks.description,
      role: tasks.role,
      status: tasks.status,
      priority: tasks.priority,
      ownerAgentId: tasks.ownerAgentId,
      verificationStatus: tasks.verificationStatus,
      verifierAgentId: tasks.verifierAgentId,
      latestVerificationSummary: tasks.latestVerificationSummary,
      latestVerificationFindings: tasks.latestVerificationFindings,
      latestVerificationChangeRequests: tasks.latestVerificationChangeRequests,
      latestVerificationEvidence: tasks.latestVerificationEvidence,
      dependencyIds: tasks.dependencyIds,
      definitionOfDone: tasks.definitionOfDone,
      acceptanceCriteria: tasks.acceptanceCriteria,
      validationTemplates: tasks.validationTemplates,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt
    })
      .from(tasks)
      .innerJoin(runs, eq(tasks.runId, runs.id))
      .where(and(eq(runs.workspaceId, boundary.workspaceId), eq(runs.teamId, boundary.teamId)))
      .orderBy(asc(tasks.createdAt));

    return taskRows.map((task) => this.mapTask(task));
  }

  async createTask(input: TaskCreate, access?: AccessBoundary) {
    const run = await this.assertRunExists(input.runId, access);
    const definitionOfDone = input.definitionOfDone ?? [];
    const acceptanceCriteria = input.acceptanceCriteria ?? [];

    if (input.ownerAgentId) {
      await this.assertAgentExists(input.ownerAgentId, access);
    }

    if (input.parentTaskId) {
      await this.assertTaskExists(input.parentTaskId, access);
    }

    await this.assertDependenciesBelongToRun(input.runId, input.dependencyIds);

    const id = crypto.randomUUID();
    const now = this.clock.now();
    const dependenciesReady = input.dependencyIds.length === 0
      ? true
      : await this.areDependenciesSatisfied(input.runId, input.dependencyIds);
    const initialStatus = dependenciesReady ? "pending" : resolveInitialTaskStatus(input.dependencyIds);

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
      verificationStatus: definitionOfDone.length > 0 ? "pending" : "not_required",
      verifierAgentId: null,
      latestVerificationSummary: null,
      latestVerificationFindings: [],
      latestVerificationChangeRequests: [],
      latestVerificationEvidence: [],
      dependencyIds: input.dependencyIds,
      definitionOfDone,
      acceptanceCriteria,
      validationTemplates: normalizeValidationTemplates(input.validationTemplates),
      createdAt: now,
      updatedAt: now
    }).returning();

    const persistedTask = expectPersistedRecord(task, "task");

    if (run.status === "in_progress") {
      await this.enqueueRunnableWorkerDispatches(input.runId, access);
    }

    return this.mapTask(persistedTask);
  }

  async updateTaskStatus(taskId: string, input: TaskStatusUpdate, access?: AccessBoundary) {
    const task = await this.assertTaskExists(taskId, access);

    if (input.ownerAgentId) {
      await this.assertAgentExists(input.ownerAgentId, access);
    }

    const nextDependencyIds = input.dependencyIds ?? task.dependencyIds;
    await this.assertDependenciesBelongToRun(task.runId, nextDependencyIds);
    const ready = await this.areDependenciesSatisfied(task.runId, nextDependencyIds);

    if (input.status === "in_progress" && !ready) {
      throw new HttpError(409, "task dependencies are not satisfied");
    }

    const effectiveStatus = ready && input.status === "blocked" ? "pending" : input.status;
    const now = this.clock.now();

    const [updated] = await this.db.update(tasks).set({
      status: effectiveStatus,
      ownerAgentId: input.ownerAgentId ?? task.ownerAgentId,
      dependencyIds: nextDependencyIds,
      updatedAt: now
    }).where(eq(tasks.id, taskId)).returning();

    await this.maybeUnblockDependentTasks(task.runId, taskId, effectiveStatus);

    const run = await this.assertRunExists(task.runId, access);

    if (run.status === "in_progress") {
      await this.enqueueRunnableWorkerDispatches(task.runId, access);
      await this.reconcileRunExecutionState(task.runId, access);
    }

    return this.mapTask(expectPersistedRecord(updated, "task"));
  }

  async createAgent(input: AgentCreate, access?: AccessBoundary) {
    const run = await this.assertRunExists(input.runId, access);

    if (input.currentTaskId) {
      await this.assertTaskExists(input.currentTaskId, access);
    }

    const activeAgents = await this.db
      .select({ status: agents.status, role: agents.role })
      .from(agents)
      .where(eq(agents.runId, input.runId));
    const activeAgentCount = activeAgents.filter((agent) =>
      agent.role !== "tech-lead" && (
      agent.status === "provisioning"
      || agent.status === "idle"
      || agent.status === "busy"
      || agent.status === "paused")).length;

    if (activeAgentCount >= run.concurrencyCap) {
      throw new HttpError(409, `run concurrency cap of ${run.concurrencyCap} active agents reached`);
    }

    const id = crypto.randomUUID();
    const now = this.clock.now();

    const [agent] = await this.db.transaction(async (tx) => {
      const [createdAgent] = await tx.insert(agents).values({
        id,
        runId: input.runId,
        projectTeamMemberId: input.projectTeamMemberId ?? null,
        name: input.name,
        role: input.role,
        profile: input.profile ?? "default",
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

    const persistedAgent = expectPersistedRecord(agent, "agent");
    const persistedSessions = await this.db.select().from(sessions).where(eq(sessions.agentId, persistedAgent.id)).orderBy(asc(sessions.createdAt));

    return this.mapAgent(persistedAgent, persistedSessions);
  }

  async createAgentSession(agentId: string, input: AgentSessionCreate, access?: AccessBoundary) {
    const agent = await this.assertAgentExists(agentId, access);
    const now = this.clock.now();

    const [session] = await this.db.insert(sessions).values({
      id: crypto.randomUUID(),
      agentId: agent.id,
      threadId: input.threadId,
      cwd: input.cwd,
      sandbox: input.sandbox,
      approvalPolicy: input.approvalPolicy,
      includePlanTool: input.includePlanTool,
      workerNodeId: input.workerNodeId ?? null,
      stickyNodeId: input.workerNodeId ?? null,
      placementConstraintLabels: input.placementConstraintLabels,
      lastHeartbeatAt: now,
      state: "active",
      staleReason: null,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now
    }).returning();

    await this.db.update(agents).set({
      status: "busy",
      worktreePath: input.cwd,
      lastHeartbeatAt: now,
      updatedAt: now
    }).where(eq(agents.id, agent.id));

    return this.mapSession(expectPersistedRecord(session, "session"));
  }

  async listAgents(runId?: string, access?: AccessBoundary) {
  const boundary = requireAccessBoundary(access);
  if (runId) {
      await this.assertRunExists(runId, boundary);
      const agentRows = await this.db.select().from(agents).where(eq(agents.runId, runId)).orderBy(asc(agents.createdAt));
      const agentSessions = agentRows.length === 0
        ? []
        : await this.db.select().from(sessions).where(inArray(sessions.agentId, agentRows.map((agent) => agent.id))).orderBy(asc(sessions.createdAt));

      return this.mapAgents(agentRows, agentSessions);
    }

    const agentRows = await this.db.select({
      id: agents.id,
      runId: agents.runId,
      projectTeamMemberId: agents.projectTeamMemberId,
      name: agents.name,
      role: agents.role,
      profile: agents.profile,
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

    const agentSessions = agentRows.length === 0
      ? []
      : await this.db.select().from(sessions).where(inArray(sessions.agentId, agentRows.map((agent) => agent.id))).orderBy(asc(sessions.createdAt));

    return this.mapAgents(agentRows, agentSessions);
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

  async listSessionTranscript(sessionId: string, access?: AccessBoundary) {
    const session = await this.assertSessionExists(sessionId);
    await this.assertAgentExists(session.agentId, access);

    return readSessionTranscript(session.metadata);
  }

  async appendSessionTranscript(
    sessionId: string,
    entries: SessionTranscriptEntryCreate[],
    access?: AccessBoundary
  ) {
    const session = await this.assertSessionExists(sessionId);
    await this.assertAgentExists(session.agentId, access);

    const now = this.clock.now();
    const nextEntries = [
      ...readSessionTranscript(session.metadata),
      ...entries.map((entry) => ({
        id: crypto.randomUUID(),
        sessionId,
        kind: entry.kind,
        text: entry.text,
        createdAt: entry.createdAt ?? now,
        metadata: entry.metadata ?? {}
      }))
    ];

    const nextMetadata = {
      ...session.metadata,
      transcript: nextEntries.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString()
      }))
    };

    await this.db.update(sessions).set({
      metadata: nextMetadata,
      updatedAt: this.clock.now()
    }).where(eq(sessions.id, sessionId));

    return nextEntries;
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

  async attachSessionToWorkerDispatchAssignment(assignmentId: string, sessionId: string) {
    const assignment = this.mapWorkerDispatchAssignment(await this.assertWorkerDispatchAssignmentExists(assignmentId));
    const session = this.mapSession(await this.assertSessionExists(sessionId));

    if (session.agentId !== assignment.agentId) {
      throw new HttpError(409, `session ${sessionId} does not belong to agent ${assignment.agentId}`);
    }

    const [updatedAssignment] = await this.db.update(workerDispatchAssignments).set({
      sessionId,
      updatedAt: this.clock.now()
    }).where(eq(workerDispatchAssignments.id, assignmentId)).returning();

    return this.mapWorkerDispatchAssignment(expectPersistedRecord(updatedAssignment, "worker dispatch assignment"));
  }

  private async loadRunProjectTeam(projectTeamId: string | null, access?: AccessBoundary): Promise<ProjectTeamDetail | null> {
    if (!projectTeamId) {
      return null;
    }

    return this.getProjectTeam(projectTeamId, access);
  }

  private selectProjectTeamMemberForRole(
    projectTeam: ProjectTeamDetail | null,
    role: string,
    runAgents: Agent[]
  ): ProjectTeamMember | null {
    if (!projectTeam) {
      return null;
    }

    const candidates = projectTeam.members
      .filter((member) => member.role === role)
      .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name));

    if (candidates.length === 0) {
      return null;
    }

    const assignmentCounts = new Map<string, number>(candidates.map((member) => [member.id, 0]));
    for (const agent of runAgents) {
      if (!agent.projectTeamMemberId || !assignmentCounts.has(agent.projectTeamMemberId)) {
        continue;
      }
      assignmentCounts.set(agent.projectTeamMemberId, (assignmentCounts.get(agent.projectTeamMemberId) ?? 0) + 1);
    }

    return [...candidates].sort((left, right) =>
      (assignmentCounts.get(left.id) ?? 0) - (assignmentCounts.get(right.id) ?? 0)
      || left.position - right.position
      || left.name.localeCompare(right.name)
    )[0] ?? null;
  }

  private selectVerifierProjectTeamMember(
    projectTeam: ProjectTeamDetail | null,
    taskRole: string,
    runAgents: Agent[],
    workerAgentId: string
  ): ProjectTeamMember | null {
    if (!projectTeam) {
      return null;
    }

    const selectCandidate = (roles: string[], excludeMemberId?: string | null) => {
      const candidates = projectTeam.members
        .filter((member) => roles.includes(member.role))
        .filter((member) => member.id !== excludeMemberId)
        .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name));

      if (candidates.length === 0) {
        return null;
      }

      const assignmentCounts = new Map<string, number>(candidates.map((member) => [member.id, 0]));
      for (const agent of runAgents) {
        if (agent.id === workerAgentId || !agent.projectTeamMemberId || !assignmentCounts.has(agent.projectTeamMemberId)) {
          continue;
        }

        assignmentCounts.set(agent.projectTeamMemberId, (assignmentCounts.get(agent.projectTeamMemberId) ?? 0) + 1);
      }

      return [...candidates].sort((left, right) =>
        (assignmentCounts.get(left.id) ?? 0) - (assignmentCounts.get(right.id) ?? 0)
        || left.position - right.position
        || left.name.localeCompare(right.name)
      )[0] ?? null;
    };

    const workerAgent = runAgents.find((agent) => agent.id === workerAgentId) ?? null;
    const workerMemberId = workerAgent?.projectTeamMemberId ?? null;
    const explicitReviewer = selectCandidate(preferredReviewerRoles, workerMemberId);

    if (explicitReviewer) {
      return explicitReviewer;
    }

    const reviewLikeRoles = projectTeam.members
      .map((member) => member.role)
      .filter((role, index, allRoles) => allRoles.indexOf(role) === index)
      .filter((role) => !preferredReviewerRoles.includes(role) && normalizeReviewLikeRole(role));
    const reviewLikeMember = selectCandidate(reviewLikeRoles, workerMemberId);

    if (reviewLikeMember) {
      return reviewLikeMember;
    }

    return selectCandidate([taskRole], workerMemberId);
  }

  async enqueueRunnableWorkerDispatches(runId: string, access?: AccessBoundary) {
    const runDetail = await this.getRun(runId, access);
    const repository = this.mapRepository(await this.assertRepositoryExists(runDetail.repositoryId, access));
    const projectTeam = await this.loadRunProjectTeam(runDetail.projectTeamId, access);

    if (["awaiting_approval", "completed", "failed", "cancelled"].includes(runDetail.status)) {
      return [];
    }

    const assignmentRows = await this.db.select().from(workerDispatchAssignments)
      .where(eq(workerDispatchAssignments.runId, runId))
      .orderBy(asc(workerDispatchAssignments.createdAt));
    const activeAssignmentTaskIds = new Set(
      assignmentRows
        .filter((assignment) => assignment.state === "queued" || assignment.state === "claimed" || assignment.state === "retrying")
        .map((assignment) => assignment.taskId)
    );
    const now = this.clock.now();
    const activeExecutionTaskIds = new Set<string>();

    for (const assignment of assignmentRows) {
      if (assignment.state === "queued" || assignment.state === "claimed" || assignment.state === "retrying") {
        activeExecutionTaskIds.add(assignment.taskId);
      }
    }

    for (const task of runDetail.tasks) {
      if (task.status === "in_progress" || task.status === "awaiting_review") {
        activeExecutionTaskIds.add(task.id);
      }
    }

    const availableSlots = Math.max(0, runDetail.concurrencyCap - activeExecutionTaskIds.size);
    const tasksToQueue = runDetail.tasks
      .filter((task) => task.status === "pending" && !activeAssignmentTaskIds.has(task.id))
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }

        return left.createdAt.getTime() - right.createdAt.getTime();
      })
      .slice(0, availableSlots);
    const existingAgentsByTaskId = new Map(
      runDetail.agents
        .filter((agent) => agent.currentTaskId)
        .map((agent) => [agent.currentTaskId!, agent] as const)
    );
    const existingSessionsByAgentId = new Map(
      runDetail.sessions.map((session) => [session.agentId, session] as const)
    );
    const leaderAgent = runDetail.agents.find((agent) => agent.role === "tech-lead") ?? null;
    const queuedAssignments: WorkerDispatchAssignment[] = [];
    const workerSandbox = process.env.CODEX_SWARM_WORKER_SANDBOX?.trim() || "workspace-write";
    const workerApprovalPolicy = process.env.CODEX_SWARM_WORKER_APPROVAL_POLICY?.trim() || "on-request";
    const workspaceProvisioningMode = resolveWorkspaceProvisioningMode();

    for (const task of tasksToQueue) {
      const projectTeamMember = this.selectProjectTeamMemberForRole(projectTeam, task.role, runDetail.agents);
      if (runDetail.projectTeamId && !projectTeamMember) {
        throw new HttpError(409, `project team ${runDetail.projectTeamName ?? runDetail.projectTeamId} has no member for role ${task.role}`);
      }
      const existingAgent = existingAgentsByTaskId.get(task.id);
      const agent = existingAgent ?? await this.createAgent({
        runId,
        projectTeamMemberId: projectTeamMember?.id,
        name: (projectTeamMember?.name ?? `${task.role}-${task.title}`).slice(0, 72),
        role: projectTeamMember?.role ?? task.role,
        profile: projectTeamMember?.profile ?? "default",
        status: "idle",
        branchName: runDetail.branchName ?? repository.defaultBranch,
        currentTaskId: task.id
      }, access);
      const worktreePath = agent.worktreePath ?? createWorktreePath({
        rootDir: this.getWorkspaceRoot(),
        repositorySlug: repository.name,
        runId,
        agentId: agent.id,
        taskId: task.id,
        mode: workspaceProvisioningMode
      });

      const [updatedAgent] = await this.db.update(agents).set({
        worktreePath,
        currentTaskId: task.id,
        updatedAt: now
      }).where(eq(agents.id, agent.id)).returning();
      const session = existingSessionsByAgentId.get(agent.id) ?? null;

      const assignment = await this.createWorkerDispatchAssignment({
        runId,
        taskId: task.id,
        agentId: updatedAgent?.id ?? agent.id,
        sessionId: session?.id ?? undefined,
        queue: "worker-dispatch",
        stickyNodeId: null,
        preferredNodeId: null,
        repositoryId: repository.id,
        repositoryName: repository.name,
        worktreePath,
        branchName: runDetail.branchName ?? repository.defaultBranch,
        prompt: this.buildTaskExecutionPrompt(runDetail, repository, task),
        profile: updatedAgent?.profile ?? agent.profile,
        sandbox: workerSandbox,
        approvalPolicy: workerApprovalPolicy,
        includePlanTool: false,
        requiredCapabilities: ["workspace-write"],
        metadata: {
          assignmentKind: "worker",
          runContext: runDetail.context
        },
        maxAttempts: 3,
        leaseTtlSeconds: 300
      });

      if (leaderAgent && leaderAgent.id !== (updatedAgent?.id ?? agent.id)) {
        await this.createMessage({
          runId,
          senderAgentId: leaderAgent.id,
          recipientAgentId: updatedAgent?.id ?? agent.id,
          kind: "direct",
          body: [
            `Take task ${task.title}.`,
            task.description,
            task.definitionOfDone.length > 0
              ? `Definition of done: ${task.definitionOfDone.join("; ")}`
              : "Definition of done: no persisted task-specific checks were provided.",
            task.acceptanceCriteria.length > 0
              ? `Acceptance criteria: ${task.acceptanceCriteria.join("; ")}`
              : "Acceptance criteria: complete the assigned slice and report blockers."
          ].join(" ")
        }, access);
      }

      queuedAssignments.push(assignment);
    }

    return queuedAssignments;
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

    let nextAssignment: WorkerDispatchAssignment | null = null;
    const invalidatedRunIds = new Set<string>();

    for (const candidate of candidates) {
      if (normalizeAssignmentKind(candidate.metadata) !== "verification") {
        const task = await this.getTaskRecord(candidate.taskId);
        const resolution = task
          ? await this.resolveWorkerAssignmentTaskState(task, candidate.state)
          : { valid: false, effectiveTaskStatus: null as Task["status"] | null };

        if (!resolution.valid) {
          await this.invalidateWorkerDispatchAssignment(candidate, {
            reason: task ? "task_not_runnable" : "task_missing",
            task,
            taskStatus: resolution.effectiveTaskStatus
          });
          invalidatedRunIds.add(candidate.runId);
          continue;
        }
      }

      nextAssignment = candidate;
      break;
    }

    if (!nextAssignment) {
      await Promise.all([...invalidatedRunIds].map((runId) => this.reconcileRunExecutionState(runId)));
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

    if (normalizeAssignmentKind(nextAssignment.metadata) === "verification") {
      await this.db.update(tasks).set({
        status: "awaiting_review",
        ownerAgentId: nextAssignment.agentId,
        verificationStatus: "in_progress",
        verifierAgentId: nextAssignment.agentId,
        updatedAt: now
      }).where(eq(tasks.id, nextAssignment.taskId));
    } else {
      await this.db.update(tasks).set({
        status: "in_progress",
        ownerAgentId: nextAssignment.agentId,
        updatedAt: now
      }).where(eq(tasks.id, nextAssignment.taskId));
    }

    await this.reconcileRunExecutionState(nextAssignment.runId);

    return this.mapWorkerDispatchAssignment(expectPersistedRecord(updatedAssignment, "worker dispatch assignment"));
  }

  async completeWorkerDispatch(assignmentId: string, input: WorkerDispatchComplete) {
    const assignment = this.mapWorkerDispatchAssignment(await this.assertWorkerDispatchAssignmentExists(assignmentId));

    if (assignment.claimedByNodeId && assignment.claimedByNodeId !== input.nodeId) {
      throw new HttpError(409, `worker dispatch assignment ${assignmentId} is claimed by a different node`);
    }

    return this.transitionWorkerDispatchFailureOrCompletion(assignment, input);
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
        {
          nodeId,
          status: "failed",
          reason: `node_lost:${input.reason}`
        }
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
        } else if (assignment.state === "failed" && !isInvalidatedWorkerDispatchAssignment(assignment)) {
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

      if (assignment.state === "failed" && !isInvalidatedWorkerDispatchAssignment(assignment)) {
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
      run: this.mapRun(await this.assertRunExists(runId, access), repository.projectId ?? null),
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
    const runsById = new Map(
      runRows.map((run) => [run.id, this.mapRun(run, repositoriesById.get(run.repositoryId)?.projectId ?? null)] as const)
    );
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
    const worktreeCleanup = input.deleteStaleWorktrees && resolveWorkspaceProvisioningMode() === "isolated"
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

  private async assertProjectExists(projectId: string, access?: AccessBoundary) {
    const [project] = await this.db.select().from(projects).where(eq(projects.id, projectId));

    if (!project) {
      throw new HttpError(404, `project ${projectId} not found`);
    }

    this.assertBoundaryMatch(access, project.workspaceId, project.teamId, "project", projectId);

    return project;
  }

  private async assertProjectTeamExists(projectTeamId: string, access?: AccessBoundary) {
    const [projectTeam] = await this.db.select().from(projectTeams).where(eq(projectTeams.id, projectTeamId));

    if (!projectTeam) {
      throw new HttpError(404, `project team ${projectTeamId} not found`);
    }

    this.assertBoundaryMatch(access, projectTeam.workspaceId, projectTeam.teamId, "project team", projectTeamId);

    return projectTeam;
  }

  private async assertRepositoryExists(repositoryId: string, access?: AccessBoundary) {
    const [repository] = await this.db.select().from(repositories).where(eq(repositories.id, repositoryId));

    if (!repository) {
      throw new HttpError(404, `repository ${repositoryId} not found`);
    }

    this.assertBoundaryMatch(access, repository.workspaceId, repository.teamId, "repository", repositoryId);

    return repository;
  }

  private async replaceProjectTeamMembers(
    tx: Pick<AppDb, "delete" | "insert">,
    projectTeamId: string,
    members: ProjectTeamMemberCreateInput[],
    now: Date
  ) {
    await tx.delete(projectTeamMembers).where(eq(projectTeamMembers.projectTeamId, projectTeamId));
    if (members.length === 0) {
      return;
    }

    await tx.insert(projectTeamMembers).values(
      members.map((member, index) => ({
        id: crypto.randomUUID(),
        projectTeamId,
        key: `${slugifyProjectTeamMemberKey(member.name)}-${index + 1}`,
        position: index,
        name: member.name,
        role: member.role,
        profile: member.profile,
        responsibility: member.responsibility ?? null,
        createdAt: now,
        updatedAt: now
      }))
    );
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

  private mapProject(project: ProjectRecord): Project {
    return {
      ...project,
      description: project.description ?? null
    };
  }

  private mapProjectSummary(
    project: ProjectRecord,
    repositoryRows: Array<typeof repositories.$inferSelect>,
    runRows: Array<typeof runs.$inferSelect>,
    projectTeamRows: ProjectTeamRecord[]
  ): ProjectSummary {
    const projectRuns = runRows.filter((run) => run.projectId === project.id);

    return {
      ...this.mapProject(project),
      teamCount: projectTeamRows.filter((team) => team.projectId === project.id).length,
      repositoryCount: repositoryRows.filter((repository) => repository.projectId === project.id).length,
      runCount: projectRuns.length,
      latestRunAt: projectRuns.length === 0
        ? null
        : [...projectRuns]
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0]!.createdAt
    };
  }

  private mapProjectRepositoryAssignment(projectId: string, repository: typeof repositories.$inferSelect): ProjectRepositoryAssignment {
    return {
      projectId,
      repositoryId: repository.id,
      repository: this.mapRepository(repository)
    };
  }

  private mapProjectRunAssignment(projectId: string, run: typeof runs.$inferSelect): ProjectRunAssignment {
    return {
      projectId,
      runId: run.id,
      run: {
        ...this.mapRun(run),
        projectId: run.projectId ?? null
      }
    };
  }

  private mapProjectDetail(
    project: ProjectRecord,
    repositoryRows: Array<typeof repositories.$inferSelect>,
    runRows: Array<typeof runs.$inferSelect>,
    projectTeamRows: ProjectTeamRecord[],
    projectTeamMemberRows: ProjectTeamMemberRecord[] = []
  ): ProjectDetail {
    const summary = this.mapProjectSummary(project, repositoryRows, runRows, projectTeamRows);

    return {
      ...summary,
      projectTeams: projectTeamRows
        .filter((team) => team.projectId === project.id)
        .map((team) => this.mapProjectTeamDetail(team, projectTeamMemberRows)),
      repositoryAssignments: repositoryRows
        .filter((repository) => repository.projectId === project.id)
        .map((repository) => this.mapProjectRepositoryAssignment(project.id, repository)),
      runAssignments: runRows
        .filter((run) => run.projectId === project.id)
        .map((run) => this.mapProjectRunAssignment(project.id, run))
    };
  }

  private mapProjectTeamMember(record: ProjectTeamMemberRecord): ProjectTeamMember {
    return {
      ...record,
      responsibility: record.responsibility ?? null
    };
  }

  private mapProjectTeam(record: ProjectTeamRecord): ProjectTeam {
    return {
      ...record,
      description: record.description ?? null,
      sourceBlueprintId: record.sourceTemplateId ?? null,
      sourceTemplateId: record.sourceTemplateId ?? null
    };
  }

  private mapProjectTeamDetail(
    record: ProjectTeamRecord,
    memberRows: ProjectTeamMemberRecord[]
  ): ProjectTeamDetail {
    return projectTeamDetailSchema.parse({
      ...this.mapProjectTeam(record),
      members: memberRows
        .filter((member) => member.projectTeamId === record.id)
        .map((member) => this.mapProjectTeamMember(member)),
      memberCount: memberRows.filter((member) => member.projectTeamId === record.id).length
    });
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
      projectId: repository.projectId ?? null,
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

  private mapTask(task: typeof tasks.$inferSelect): Task {
    return {
      ...task,
      status: task.status as Task["status"],
      verificationStatus: task.verificationStatus as TaskVerificationStatus,
      verifierAgentId: task.verifierAgentId ?? null,
      latestVerificationSummary: task.latestVerificationSummary ?? null,
      latestVerificationFindings: task.latestVerificationFindings ?? [],
      latestVerificationChangeRequests: task.latestVerificationChangeRequests ?? [],
      latestVerificationEvidence: task.latestVerificationEvidence ?? []
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

  private getWorkspaceRoot() {
    return process.env.CODEX_SWARM_WORKSPACE_ROOT?.trim() || ".swarm/worktrees";
  }

  private buildTaskExecutionPrompt(run: RunDetail, repository: Repository, task: Task) {
    const definitionOfDone = task.definitionOfDone.length > 0
      ? task.definitionOfDone.map((criterion) => `- ${criterion}`).join("\n")
      : "- No persisted definition of done was provided.";
    const acceptanceCriteria = task.acceptanceCriteria.length > 0
      ? task.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")
      : "- Complete the assigned task and leave clear implementation notes.";
    const runContext = formatRunExecutionContext(run.context);

    return [
      `Repository: ${repository.name}`,
      `Run goal: ${run.goal}`,
      ...(runContext ? [runContext] : []),
      `Task: ${task.title}`,
      `Role: ${task.role}`,
      "",
      task.description,
      "",
      "Definition of done:",
      definitionOfDone,
      "",
      "Acceptance criteria:",
      acceptanceCriteria
    ].join("\n");
  }

  private buildVerifierAssignmentPrompt(run: RunDetail, repository: Repository, task: Task, workerSummary: string) {
    const definitionOfDone = task.definitionOfDone.length > 0
      ? task.definitionOfDone.map((criterion) => `- ${criterion}`).join("\n")
      : "- No persisted definition of done was provided.";
    const acceptanceCriteria = task.acceptanceCriteria.length > 0
      ? task.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")
      : "- No separate acceptance summary was provided.";
    const runContext = formatRunExecutionContext(run.context);

    return [
      `Repository: ${repository.name}`,
      `Run goal: ${run.goal}`,
      ...(runContext ? [runContext] : []),
      `Task: ${task.title}`,
      `Worker role: ${task.role}`,
      "",
      task.description,
      "",
      "Definition of done:",
      definitionOfDone,
      "",
      "Acceptance criteria:",
      acceptanceCriteria,
      "",
      `Worker summary: ${workerSummary}`,
      "",
      "Review the delivered work against the persisted task contract."
    ].join("\n");
  }

  private async enqueueVerifierAssignment(input: {
    run: RunDetail;
    repository: Repository;
    projectTeam: ProjectTeamDetail | null;
    task: Task;
    workerAssignment: WorkerDispatchAssignment;
    workerOutcome: Extract<WorkerDispatchCompletionOutcome, { kind: "worker" }>;
    access?: AccessBoundary;
  }) {
    const now = this.clock.now();
    const workerAgent = input.run.agents.find((agent) => agent.id === input.workerAssignment.agentId) ?? null;
    const verifierMember = this.selectVerifierProjectTeamMember(
      input.projectTeam,
      input.task.role,
      input.run.agents,
      input.workerAssignment.agentId
    );
    const fallbackReviewerAgent = input.run.agents.find((agent) =>
      agent.id !== input.workerAssignment.agentId && (
      preferredReviewerRoles.includes(agent.role) || normalizeReviewLikeRole(agent.role)
      )) ?? null;
    const fallbackRole = verifierMember?.role
      ?? fallbackReviewerAgent?.role
      ?? input.task.role;
    const fallbackProfile = verifierMember?.profile
      ?? fallbackReviewerAgent?.profile
      ?? workerAgent?.profile
      ?? "default";
    const verifierAgent = await this.createAgent({
      runId: input.run.id,
      projectTeamMemberId: verifierMember?.id,
      name: (verifierMember?.name ?? `${fallbackRole}-${input.task.title}-verifier`).slice(0, 72),
      role: fallbackRole,
      profile: fallbackProfile,
      status: "idle",
      worktreePath: input.workerAssignment.worktreePath,
      branchName: input.run.branchName ?? input.repository.defaultBranch,
      currentTaskId: input.task.id
    }, input.access);
    const verifierPrompt = this.buildVerifierAssignmentPrompt(
      input.run,
      input.repository,
      input.task,
      input.workerOutcome.summary
    );
    const verifierAssignment = await this.createWorkerDispatchAssignment({
      runId: input.run.id,
      taskId: input.task.id,
      agentId: verifierAgent.id,
      repositoryId: input.repository.id,
      repositoryName: input.repository.name,
      queue: "worker-dispatch",
      stickyNodeId: null,
      preferredNodeId: null,
      requiredCapabilities: ["workspace-write"],
      worktreePath: input.workerAssignment.worktreePath,
      branchName: input.run.branchName ?? input.repository.defaultBranch,
      prompt: verifierPrompt,
      profile: verifierAgent.profile,
      sandbox: process.env.CODEX_SWARM_WORKER_SANDBOX?.trim() || "workspace-write",
      approvalPolicy: process.env.CODEX_SWARM_WORKER_APPROVAL_POLICY?.trim() || "on-request",
      includePlanTool: false,
      metadata: {
        assignmentKind: "verification",
        workerAssignmentId: input.workerAssignment.id,
        workerAgentId: input.workerAssignment.agentId,
        workerSummary: input.workerOutcome.summary,
        workerOutcomeStatus: input.workerOutcome.outcomeStatus,
        blockingIssues: input.workerOutcome.blockingIssues,
        requestedAt: now.toISOString(),
        runContext: input.run.context
      },
      maxAttempts: 3,
      leaseTtlSeconds: 300
    });

    await this.db.update(tasks).set({
      status: "awaiting_review",
      ownerAgentId: input.workerAssignment.agentId,
      verificationStatus: "requested",
      verifierAgentId: verifierAgent.id,
      latestVerificationSummary: `Verification requested after worker completion: ${input.workerOutcome.summary}`,
      latestVerificationFindings: [],
      latestVerificationChangeRequests: [],
      latestVerificationEvidence: [],
      updatedAt: now
    }).where(eq(tasks.id, input.task.id));

    await this.db.update(agents).set({
      currentTaskId: null,
      updatedAt: now
    }).where(eq(agents.id, input.workerAssignment.agentId));

    await this.recordControlPlaneEvent(controlPlaneEventDefinitions.taskVerificationRequested, {
      runId: input.run.id,
      entityId: input.task.id,
      status: "requested",
      summary: `Verification requested for task ${input.task.title}`,
      metadata: {
        workerAgentId: input.workerAssignment.agentId,
        verifierAgentId: verifierAgent.id,
        verifierAssignmentId: verifierAssignment.id
      }
    });

    return verifierAssignment;
  }

  private async repairRunStateFromDispatchAssignments(runId: string) {
    const [run, taskRows, assignmentRows] = await Promise.all([
      this.db.select().from(runs).where(eq(runs.id, runId)).then((rows) => rows[0]),
      this.db.select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.createdAt)),
      this.db.select().from(workerDispatchAssignments).where(eq(workerDispatchAssignments.runId, runId)).orderBy(asc(workerDispatchAssignments.createdAt))
    ]);

    if (!run || assignmentRows.length === 0) {
      return;
    }

    const now = this.clock.now();
    const latestAssignmentByTask = new Map<string, typeof workerDispatchAssignments.$inferSelect>();

    for (const assignment of assignmentRows) {
      latestAssignmentByTask.set(assignment.taskId, assignment);
    }

    const agentIdsToStop = new Set<string>();
    const agentIdsToBusy = new Set<string>();
    const agentIdsToIdle = new Set<string>();
    const agentIdsToFail = new Set<string>();
    const sessionIdsToStop = new Map<string, { workerNodeId: string | null; stickyNodeId: string | null }>();
    const sessionIdsToActivate = new Map<string, { workerNodeId: string | null; stickyNodeId: string | null }>();
    const sessionIdsToReset = new Set<string>();
    const sessionIdsToStale = new Set<string>();

    for (const task of taskRows) {
      const assignment = latestAssignmentByTask.get(task.id);

      if (!assignment) {
        continue;
      }

      const assignmentKind = normalizeAssignmentKind(assignment.metadata);

      if (assignment.state === "completed") {
        if (assignmentKind === "verification") {
          const verificationStatus = task.verificationStatus as TaskVerificationStatus;
          const expectedStatus: Task["status"] = verificationStatus === "passed"
            ? "completed"
            : verificationStatus === "blocked"
              ? "blocked"
              : "awaiting_review";

          if (task.status !== expectedStatus || task.ownerAgentId !== assignment.agentId || task.verifierAgentId !== assignment.agentId) {
            await this.db.update(tasks).set({
              status: expectedStatus,
              ownerAgentId: assignment.agentId,
              verifierAgentId: assignment.agentId,
              updatedAt: now
            }).where(eq(tasks.id, task.id));
          }
        } else {
          const workerOutcomeStatus = assignment.metadata?.workerOutcomeStatus;
          const expectedStatus: Task["status"] = workerOutcomeStatus === "blocked"
            ? "blocked"
            : taskRequiresVerification(this.mapTask(task))
              ? "awaiting_review"
              : "completed";

          if (task.status !== expectedStatus || task.ownerAgentId !== assignment.agentId) {
            await this.db.update(tasks).set({
              status: expectedStatus,
              ownerAgentId: assignment.agentId,
              updatedAt: now
            }).where(eq(tasks.id, task.id));
          }
        }

        agentIdsToStop.add(assignment.agentId);

        if (assignment.sessionId) {
          sessionIdsToStop.set(assignment.sessionId, {
            workerNodeId: assignment.claimedByNodeId,
            stickyNodeId: assignment.claimedByNodeId ?? assignment.stickyNodeId
          });
        }

        continue;
      }

      if (assignment.state === "claimed") {
        if (assignmentKind === "verification") {
          if (task.status !== "awaiting_review" || task.ownerAgentId !== assignment.agentId || task.verificationStatus !== "in_progress" || task.verifierAgentId !== assignment.agentId) {
            await this.db.update(tasks).set({
              status: "awaiting_review",
              ownerAgentId: assignment.agentId,
              verificationStatus: "in_progress",
              verifierAgentId: assignment.agentId,
              updatedAt: now
            }).where(eq(tasks.id, task.id));
          }
        } else {
          const resolution = await this.resolveWorkerAssignmentTaskState(task, assignment.state);

          if (!resolution.valid) {
            await this.invalidateWorkerDispatchAssignment(this.mapWorkerDispatchAssignment(assignment), {
              reason: "task_not_runnable",
              task,
              taskStatus: resolution.effectiveTaskStatus
            });
            continue;
          }

          if (task.status !== "in_progress" || task.ownerAgentId !== assignment.agentId) {
            await this.db.update(tasks).set({
              status: "in_progress",
              ownerAgentId: assignment.agentId,
              updatedAt: now
            }).where(eq(tasks.id, task.id));
          }
        }

        agentIdsToBusy.add(assignment.agentId);

        if (assignment.sessionId) {
          sessionIdsToActivate.set(assignment.sessionId, {
            workerNodeId: assignment.claimedByNodeId,
            stickyNodeId: assignment.claimedByNodeId ?? assignment.stickyNodeId
          });
        }

        continue;
      }

      if (assignment.state === "queued" || assignment.state === "retrying") {
        if (assignmentKind === "verification") {
          if (task.status !== "awaiting_review" || task.ownerAgentId !== assignment.agentId || task.verificationStatus !== "requested" || task.verifierAgentId !== assignment.agentId) {
            await this.db.update(tasks).set({
              status: "awaiting_review",
              ownerAgentId: assignment.agentId,
              verificationStatus: "requested",
              verifierAgentId: assignment.agentId,
              updatedAt: now
            }).where(eq(tasks.id, task.id));
          }
        } else {
          const resolution = await this.resolveWorkerAssignmentTaskState(task, assignment.state);

          if (!resolution.valid) {
            await this.invalidateWorkerDispatchAssignment(this.mapWorkerDispatchAssignment(assignment), {
              reason: "task_not_runnable",
              task,
              taskStatus: resolution.effectiveTaskStatus
            });
            continue;
          }

          if (task.status !== "pending" || task.ownerAgentId !== assignment.agentId) {
            await this.db.update(tasks).set({
              status: "pending",
              ownerAgentId: assignment.agentId,
              updatedAt: now
            }).where(eq(tasks.id, task.id));
          }
        }

        agentIdsToIdle.add(assignment.agentId);

        if (assignment.sessionId) {
          sessionIdsToReset.add(assignment.sessionId);
        }

        continue;
      }

      if (assignment.state === "failed") {
        if (assignmentKind !== "verification" && isInvalidatedWorkerDispatchAssignment(this.mapWorkerDispatchAssignment(assignment))) {
          agentIdsToIdle.add(assignment.agentId);

          if (assignment.sessionId) {
            sessionIdsToReset.add(assignment.sessionId);
          }

          continue;
        }

        if (task.status !== "failed" || task.ownerAgentId !== assignment.agentId) {
          await this.db.update(tasks).set({
            status: "failed",
            ownerAgentId: assignment.agentId,
            updatedAt: now
          }).where(eq(tasks.id, task.id));
        }

        agentIdsToFail.add(assignment.agentId);

        if (assignment.sessionId) {
          sessionIdsToStale.add(assignment.sessionId);
        }
      }
    }

    if (agentIdsToStop.size > 0) {
      await this.db.update(agents).set({
        status: "stopped",
        updatedAt: now
      }).where(inArray(agents.id, [...agentIdsToStop]));
    }

    if (agentIdsToBusy.size > 0) {
      await this.db.update(agents).set({
        status: "busy",
        updatedAt: now
      }).where(inArray(agents.id, [...agentIdsToBusy]));
    }

    if (agentIdsToIdle.size > 0) {
      await this.db.update(agents).set({
        status: "idle",
        updatedAt: now
      }).where(inArray(agents.id, [...agentIdsToIdle]));
    }

    if (agentIdsToFail.size > 0) {
      await this.db.update(agents).set({
        status: "failed",
        updatedAt: now
      }).where(inArray(agents.id, [...agentIdsToFail]));
    }

    for (const [sessionId, placement] of sessionIdsToStop) {
      await this.db.update(sessions).set({
        workerNodeId: placement.workerNodeId,
        stickyNodeId: placement.stickyNodeId,
        state: "stopped",
        staleReason: null,
        updatedAt: now
      }).where(eq(sessions.id, sessionId));
    }

    for (const [sessionId, placement] of sessionIdsToActivate) {
      await this.db.update(sessions).set({
        workerNodeId: placement.workerNodeId,
        stickyNodeId: placement.stickyNodeId,
        state: "active",
        staleReason: null,
        updatedAt: now
      }).where(eq(sessions.id, sessionId));
    }

    if (sessionIdsToReset.size > 0) {
      await this.db.update(sessions).set({
        workerNodeId: null,
        stickyNodeId: null,
        state: "pending",
        staleReason: null,
        updatedAt: now
      }).where(inArray(sessions.id, [...sessionIdsToReset]));
    }

    if (sessionIdsToStale.size > 0) {
      await this.db.update(sessions).set({
        state: "stale",
        updatedAt: now
      }).where(inArray(sessions.id, [...sessionIdsToStale]));
    }

    const [refreshedTasks, refreshedAssignments] = await Promise.all([
      this.db.select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.createdAt)),
      this.db.select().from(workerDispatchAssignments).where(eq(workerDispatchAssignments.runId, runId)).orderBy(asc(workerDispatchAssignments.createdAt))
    ]);
    const activeAssignments = refreshedAssignments.filter((assignment) =>
      assignment.state === "queued" || assignment.state === "claimed" || assignment.state === "retrying");
    const anyFailedTask = refreshedTasks.some((task) => task.status === "failed");
    const allTasksCompleted = refreshedTasks.length > 0 && refreshedTasks.every((task) => task.status === "completed");
    const currentStatus = run.status as Run["status"];
    const nextStatus: Run["status"] =
      anyFailedTask ? "failed"
        : allTasksCompleted ? "completed"
          : refreshedTasks.length > 0 && (activeAssignments.length > 0 || refreshedTasks.some((task) =>
            task.status === "in_progress" || task.status === "awaiting_review" || task.status === "pending"))
            ? "in_progress"
            : currentStatus;

    if (nextStatus !== currentStatus) {
      await this.db.update(runs).set({
        status: nextStatus,
        completedAt: nextStatus === "completed" ? now : null,
        updatedAt: now
      }).where(eq(runs.id, runId));
    }

    if (nextStatus === "completed") {
      await this.maybeExecuteAutoHandoff(runId);
    }
  }

  async reconcileRunExecutionState(runId: string, access?: AccessBoundary) {
    const runDetail = await this.getRun(runId, access);

    if (runDetail.status === "awaiting_approval" || runDetail.status === "cancelled") {
      return runDetail;
    }

    const now = this.clock.now();
    const assignmentRows = await this.db.select().from(workerDispatchAssignments)
      .where(eq(workerDispatchAssignments.runId, runId))
      .orderBy(asc(workerDispatchAssignments.createdAt));
    const activeAssignments = assignmentRows.filter((assignment) =>
      assignment.state === "queued" || assignment.state === "claimed" || assignment.state === "retrying");
    const anyFailedTask = runDetail.tasks.some((task) => task.status === "failed");
    const allTasksCompleted = runDetail.tasks.length > 0 && runDetail.tasks.every((task) => task.status === "completed");
    const nextStatus: Run["status"] =
      anyFailedTask ? "failed"
        : allTasksCompleted ? "completed"
          : runDetail.tasks.length > 0 && (activeAssignments.length > 0 || runDetail.tasks.some((task) => task.status === "in_progress" || task.status === "awaiting_review" || task.status === "pending"))
            ? "in_progress"
            : runDetail.status;

    if (nextStatus === runDetail.status) {
      if (runDetail.status === "completed") {
        await this.maybeExecuteAutoHandoff(runId, access);
        return this.getRun(runId, access);
      }

      return runDetail;
    }

    const [updatedRun] = await this.db.update(runs).set({
      status: nextStatus,
      completedAt: nextStatus === "completed" ? now : null,
      updatedAt: now
    }).where(eq(runs.id, runId)).returning();

    const repository = await this.assertRepositoryExists(runDetail.repositoryId, access);
    const mappedRun = this.mapRun(expectPersistedRecord(updatedRun, "run"), repository.projectId ?? null);

    if (mappedRun.status === "completed") {
      await this.maybeExecuteAutoHandoff(runId, access);
      return this.getRun(runId, access);
    }

    return mappedRun;
  }

  private async recordControlPlaneEvent(
    definition: { eventType: ControlPlaneEvent["eventType"]; entityType: ControlPlaneEvent["entityType"] },
    input: {
      runId?: string | null;
      entityId: string;
      status: string;
      summary: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    const now = this.clock.now();
    await this.db.insert(controlPlaneEvents).values({
      id: crypto.randomUUID(),
      runId: input.runId ?? null,
      taskId: null,
      agentId: null,
      traceId: crypto.randomUUID(),
      eventType: definition.eventType,
      entityType: definition.entityType,
      entityId: input.entityId,
      status: input.status,
      summary: input.summary,
      actor: null,
      metadata: input.metadata ?? {},
      createdAt: now
    });
  }

  private async updateRunHandoffExecutionState(
    runId: string,
    execution: Partial<RunHandoffExecution>
  ) {
    const existingRun = await this.assertRunExists(runId);
    const nextExecution: RunHandoffExecution = {
      ...normalizeStoredRunHandoffExecution(existingRun.handoffExecution),
      ...execution
    };

    await this.db.update(runs).set({
      handoffExecution: nextExecution,
      updatedAt: this.clock.now()
    }).where(eq(runs.id, runId));
  }

  private async resolveRunWorkspacePath(runId: string, repository: { localPath: string | null }) {
    const assignmentRows = await this.db.select().from(workerDispatchAssignments)
      .where(eq(workerDispatchAssignments.runId, runId))
      .orderBy(sql`${workerDispatchAssignments.updatedAt} desc`);

    for (const assignment of assignmentRows) {
      try {
        await access(assignment.worktreePath);
        return assignment.worktreePath;
      } catch {
        continue;
      }
    }

    if (repository.localPath) {
      await access(repository.localPath);
      return repository.localPath;
    }

    throw new Error("auto handoff requires an accessible workspace path");
  }

  private async listRunValidations(runId: string, access?: AccessBoundary) {
    return this.listValidations({ runId }, access);
  }

  private async pickApprovedHandoffApprovalId(
    runId: string,
    kind: Approval["kind"],
    access?: AccessBoundary
  ) {
    const approvalsForRun = await this.listApprovals(runId, access);

    const approved = approvalsForRun
      .filter((approval) => approval.kind === kind && approval.status === "approved")
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());

    return approved[0]?.id;
  }

  private buildAutoHandoffPullRequestContent(
    runDetail: Run,
    runTasks: Task[],
    repository: {
      defaultBranch: string;
    },
    handoff: RunHandoffConfig
  ) {
    const baseBranch = handoff.baseBranch ?? repository.defaultBranch;
    const branchName = runDetail.publishedBranch ?? runDetail.branchName ?? repository.defaultBranch;
    const completedTasks = summarizeCompletedTasks(runTasks);

    return this.listRunValidations(runDetail.id).then((validations) => {
      const validationSummary = summarizeValidationResults(validations);
      const templateValues = {
        run_goal: runDetail.goal,
        branch_name: branchName,
        base_branch: baseBranch,
        completed_tasks: completedTasks,
        validation_summary: validationSummary
      };

      const title = renderHandoffTemplate(handoff.titleTemplate, templateValues)
        ?? runDetail.goal;
      const body = renderHandoffTemplate(handoff.bodyTemplate, templateValues)
        ?? [
          `## Summary`,
          runDetail.goal,
          ``,
          `## Completed Tasks`,
          completedTasks.split(", ").map((taskTitle) => `- ${taskTitle}`).join("\n"),
          ``,
          `## Validation`,
          `- ${validationSummary}`
        ].join("\n");

      return {
        baseBranch,
        branchName,
        title,
        body
      };
    });
  }

  async maybeExecuteAutoHandoff(runId: string, access?: AccessBoundary) {
    const runRecord = await this.assertRunExists(runId, access);
    const repository = await this.assertRepositoryExists(runRecord.repositoryId, access);
    const runDetail = this.mapRun(runRecord, repository.projectId ?? null);
    const runTasks = (await this.db.select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.createdAt)))
      .map((task) => this.mapTask(task));
    const handoff = runDetail.handoff;
    const handoffExecution = runDetail.handoffExecution;

    if (runDetail.status !== "completed" || handoff.mode !== "auto") {
      return runDetail;
    }

    if (handoffExecution.state === "completed" || handoffExecution.state === "in_progress" || handoffExecution.state === "failed") {
      return runDetail;
    }

    if (handoff.provider !== "github") {
      await this.updateRunHandoffExecutionState(runId, {
        state: "failed",
        failureReason: "auto handoff currently supports github only",
        attemptedAt: this.clock.now(),
        completedAt: null
      });
      return this.getRun(runId, access);
    }

    const adapter = this.dependencies.providerHandoff;

    if (!adapter) {
      await this.updateRunHandoffExecutionState(runId, {
        state: "failed",
        failureReason: "provider handoff adapter is not configured",
        attemptedAt: this.clock.now(),
        completedAt: null
      });
      return this.getRun(runId, access);
    }

    const attemptedAt = this.clock.now();
    await this.updateRunHandoffExecutionState(runId, {
      state: "in_progress",
      failureReason: null,
      attemptedAt,
      completedAt: null
    });
    await this.recordControlPlaneEvent({
      eventType: "run.auto_handoff_started",
      entityType: "run"
    }, {
      runId,
      entityId: runId,
      status: "in_progress",
      summary: "Automatic handoff started"
    });

    try {
      const workspacePath = await this.resolveRunWorkspacePath(runId, repository);
      const { baseBranch, branchName, title, body } = await this.buildAutoHandoffPullRequestContent(runDetail, runTasks, repository, handoff);
      const patchApprovalId = await this.pickApprovedHandoffApprovalId(runId, "patch", access);
      const mergeApprovalId = await this.pickApprovedHandoffApprovalId(runId, "merge", access);

      if (handoff.autoPublishBranch && !runDetail.publishedBranch) {
        await adapter.publishBranch({
          workspacePath,
          branchName,
          remoteName: "origin"
        });
        await this.publishRunBranch(runId, {
          branchName,
          publishedBy: "system:auto-handoff",
          remoteName: "origin",
          ...(patchApprovalId ? { approvalId: patchApprovalId } : {})
        }, access);
      }

      if (handoff.autoCreatePullRequest && !runDetail.pullRequestUrl) {
        const pullRequest = await adapter.createGitHubPullRequest({
          workspacePath,
          baseBranch,
          headBranch: branchName,
          title,
          body
        });

        await this.createRunPullRequestHandoff(runId, {
          title,
          body,
          createdBy: "system:auto-handoff",
          provider: "github",
          baseBranch,
          headBranch: branchName,
          url: pullRequest.url,
          ...(pullRequest.number ? { number: pullRequest.number } : {}),
          status: pullRequest.status,
          ...(mergeApprovalId ? { approvalId: mergeApprovalId } : {})
        }, access);
      }

      const completedAt = this.clock.now();
      await this.updateRunHandoffExecutionState(runId, {
        state: "completed",
        failureReason: null,
        attemptedAt,
        completedAt
      });
      await this.recordControlPlaneEvent({
        eventType: "run.auto_handoff_completed",
        entityType: "run"
      }, {
        runId,
        entityId: runId,
        status: "completed",
        summary: "Automatic handoff completed"
      });
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      await this.updateRunHandoffExecutionState(runId, {
        state: "failed",
        failureReason,
        attemptedAt,
        completedAt: null
      });
      await this.recordControlPlaneEvent({
        eventType: "run.auto_handoff_failed",
        entityType: "run"
      }, {
        runId,
        entityId: runId,
        status: "failed",
        summary: "Automatic handoff failed",
        metadata: {
          reason: failureReason
        }
      });
    }

    return this.getRun(runId, access);
  }

  private mapSession(session: typeof sessions.$inferSelect): Session {
    return {
      ...session,
      state: session.state as Session["state"]
    };
  }

  private mapAgents(agentRows: AgentRecord[], sessionRows: SessionRecord[]) {
    const sessionsByAgentId = new Map<string, SessionRecord[]>();

    for (const session of sessionRows) {
      const existing = sessionsByAgentId.get(session.agentId) ?? [];
      existing.push(session);
      sessionsByAgentId.set(session.agentId, existing);
    }

    return agentRows.map((agent) => this.mapAgent(agent, sessionsByAgentId.get(agent.id) ?? []));
  }

  private mapAgent(agent: AgentRecord, agentSessions: SessionRecord[]): Agent {
    return {
      ...agent,
      profile: agent.profile ?? "default",
      projectTeamMemberId: agent.projectTeamMemberId ?? null,
      status: agent.status as Agent["status"],
      observability: this.buildAgentObservability(agent, agentSessions)
    };
  }

  private buildAgentObservability(agent: AgentRecord, agentSessions: SessionRecord[]): Agent["observability"] {
    const orderedSessions = [...agentSessions].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const currentSession = [...orderedSessions].reverse().find((session) => session.state === "active" || session.state === "pending") ?? null;

    let visibleTranscriptSession: SessionRecord | null = null;
    let visibleTranscriptUpdatedAt: Date | null = null;
    let latestReachableSession: SessionRecord | null = null;

    for (let index = orderedSessions.length - 1; index >= 0; index -= 1) {
      const candidate = orderedSessions[index]!;

      if (!latestReachableSession && candidate.state !== "archived") {
        latestReachableSession = candidate;
      }

      const transcript = readSessionTranscript(candidate.metadata);

      if (transcript.length === 0) {
        continue;
      }

      visibleTranscriptSession = candidate;
      visibleTranscriptUpdatedAt = transcript[transcript.length - 1]?.createdAt ?? null;
      break;
    }

    const fallbackVisibleSession = visibleTranscriptSession ?? (
      currentSession ? null : latestReachableSession
    );

    if (currentSession) {
      return {
        mode: "session",
        currentSessionId: currentSession.id,
        currentSessionState: currentSession.state as Agent["observability"]["currentSessionState"],
        visibleTranscriptSessionId: visibleTranscriptSession?.id ?? null,
        visibleTranscriptSessionState: (visibleTranscriptSession?.state ?? null) as Agent["observability"]["visibleTranscriptSessionState"],
        visibleTranscriptUpdatedAt,
        lineageSource: visibleTranscriptSession && visibleTranscriptSession.id !== currentSession.id
          ? "session_rollover"
          : "active_session"
      };
    }

    if (fallbackVisibleSession) {
      return {
        mode: "transcript_visibility",
        currentSessionId: null,
        currentSessionState: null,
        visibleTranscriptSessionId: fallbackVisibleSession.id,
        visibleTranscriptSessionState: fallbackVisibleSession.state as Agent["observability"]["visibleTranscriptSessionState"],
        visibleTranscriptUpdatedAt,
        lineageSource: activeAgentStatuses.has(agent.status as Agent["status"])
          ? "session_rollover"
          : agent.currentTaskId
            ? "task_state_transition"
            : "terminal_session"
      };
    }

    return {
      mode: "unavailable",
      currentSessionId: null,
      currentSessionState: null,
      visibleTranscriptSessionId: null,
      visibleTranscriptSessionState: null,
      visibleTranscriptUpdatedAt: null,
      lineageSource: "not_started"
    };
  }

  private async transitionWorkerDispatchFailureOrCompletion(
    assignment: WorkerDispatchAssignment,
    input: WorkerDispatchComplete
  ) {
    const now = this.clock.now();
    const sessionId = assignment.sessionId ?? null;
    const assignmentKind = input.outcome?.kind ?? normalizeAssignmentKind(assignment.metadata);
    const task = await this.assertTaskExists(assignment.taskId);

    if (input.status === "completed") {
      const nextMetadata = {
        ...assignment.metadata,
        assignmentKind,
        ...(input.outcome?.kind === "worker"
          ? {
            workerSummary: input.outcome.summary,
            workerOutcomeStatus: input.outcome.outcomeStatus,
            blockingIssues: input.outcome.blockingIssues
          }
          : {}),
        ...(input.outcome?.kind === "verification"
          ? {
            verificationSummary: input.outcome.summary,
            verificationOutcomeStatus: input.outcome.outcomeStatus,
            verificationFindings: input.outcome.findings,
            verificationChangeRequests: input.outcome.changeRequests,
            verificationEvidence: input.outcome.evidence
          }
          : {})
      };
      const [updatedAssignment] = await this.db.update(workerDispatchAssignments).set({
        state: "completed",
        claimedByNodeId: input.nodeId,
        completedAt: now,
        lastFailureReason: null,
        metadata: nextMetadata,
        updatedAt: now
      }).where(eq(workerDispatchAssignments.id, assignment.id)).returning();

      await this.db.update(agents).set({
        status: "stopped",
        currentTaskId: null,
        updatedAt: now
      }).where(eq(agents.id, assignment.agentId));

      if (sessionId) {
        await this.db.update(sessions).set({
          workerNodeId: input.nodeId,
          stickyNodeId: input.nodeId,
          state: "stopped",
          staleReason: null,
          updatedAt: now
        }).where(eq(sessions.id, sessionId));
      }

      if (assignmentKind === "verification" && input.outcome?.kind === "verification") {
        const verificationStatus = input.outcome.outcomeStatus;
        const taskStatus: Task["status"] = verificationStatus === "passed"
          ? "completed"
          : verificationStatus === "blocked"
            ? "blocked"
            : "awaiting_review";
        await this.db.update(tasks).set({
          status: taskStatus,
          ownerAgentId: assignment.agentId,
          verificationStatus,
          verifierAgentId: assignment.agentId,
          latestVerificationSummary: input.outcome.summary,
          latestVerificationFindings: input.outcome.findings,
          latestVerificationChangeRequests: input.outcome.changeRequests,
          latestVerificationEvidence: input.outcome.evidence,
          updatedAt: now
        }).where(eq(tasks.id, assignment.taskId));

        await this.recordControlPlaneEvent(
          verificationStatus === "passed"
            ? controlPlaneEventDefinitions.taskVerificationPassed
            : verificationStatus === "blocked"
              ? controlPlaneEventDefinitions.taskVerificationBlocked
              : controlPlaneEventDefinitions.taskVerificationFailed,
          {
            runId: assignment.runId,
            entityId: assignment.taskId,
            status: verificationStatus,
            summary: input.outcome.summary,
            metadata: {
              verifierAgentId: assignment.agentId,
              findings: input.outcome.findings,
              changeRequests: input.outcome.changeRequests,
              evidence: input.outcome.evidence
            }
          }
        );

        if (verificationStatus === "passed") {
          await this.maybeUnblockDependentTasks(assignment.runId, assignment.taskId, "completed");
        }
      } else {
        const workerOutcome = input.outcome?.kind === "worker"
          ? input.outcome
          : {
            kind: "worker" as const,
            summary: "Assignment completed.",
            outcomeStatus: "completed" as const,
            blockingIssues: []
          };

        if (workerOutcome.outcomeStatus === "completed") {
          if (taskRequiresVerification(this.mapTask(task))) {
            const runDetail = await this.getRun(assignment.runId);
            const repository = this.mapRepository(await this.assertRepositoryExists(runDetail.repositoryId));
            const projectTeam = await this.loadRunProjectTeam(runDetail.projectTeamId);
            await this.enqueueVerifierAssignment({
              run: runDetail,
              repository,
              projectTeam,
              task: this.mapTask(task),
              workerAssignment: assignment,
              workerOutcome
            });
          } else {
            await this.db.update(tasks).set({
              status: "completed",
              ownerAgentId: assignment.agentId,
              verificationStatus: "not_required",
              verifierAgentId: null,
              latestVerificationSummary: null,
              latestVerificationFindings: [],
              latestVerificationChangeRequests: [],
              latestVerificationEvidence: [],
              updatedAt: now
            }).where(eq(tasks.id, assignment.taskId));
            await this.maybeUnblockDependentTasks(assignment.runId, assignment.taskId, "completed");
          }
        } else if (workerOutcome.outcomeStatus === "blocked") {
          await this.db.update(tasks).set({
            status: "blocked",
            ownerAgentId: assignment.agentId,
            updatedAt: now
          }).where(eq(tasks.id, assignment.taskId));
        }
      }

      await this.enqueueRunnableWorkerDispatches(assignment.runId);
      await this.reconcileRunExecutionState(assignment.runId);

      return this.mapWorkerDispatchAssignment(expectPersistedRecord(updatedAssignment, "worker dispatch assignment"));
    }

    const nextAttempt = assignment.attempt + 1;
    const canRetry = nextAttempt < assignment.maxAttempts;
    const nextMetadata = {
      ...assignment.metadata,
      assignmentKind
    };
    const [updatedAssignment] = await this.db.update(workerDispatchAssignments).set({
      state: canRetry ? "retrying" : "failed",
      attempt: nextAttempt,
      stickyNodeId: canRetry ? null : assignment.stickyNodeId,
      preferredNodeId: canRetry ? null : assignment.preferredNodeId,
      claimedByNodeId: null,
      claimedAt: null,
      completedAt: canRetry ? null : now,
      lastFailureReason: input.reason ?? null,
      metadata: nextMetadata,
      updatedAt: now
    }).where(eq(workerDispatchAssignments.id, assignment.id)).returning();

    if (sessionId) {
      await this.db.update(sessions).set({
        workerNodeId: null,
        stickyNodeId: canRetry ? null : assignment.stickyNodeId,
        state: canRetry ? "pending" : "stale",
        staleReason: input.reason ?? null,
        updatedAt: now
      }).where(eq(sessions.id, sessionId));
    }

    await this.db.update(agents).set({
      status: canRetry ? "idle" : "failed",
      currentTaskId: canRetry ? assignment.taskId : null,
      updatedAt: now
    }).where(eq(agents.id, assignment.agentId));

    await this.db.update(tasks).set({
      status: assignmentKind === "verification"
        ? (canRetry ? "awaiting_review" : "failed")
        : (canRetry ? "pending" : "failed"),
      ownerAgentId: assignment.agentId,
      verificationStatus: assignmentKind === "verification"
        ? (canRetry ? "requested" : "blocked")
        : task.verificationStatus,
      verifierAgentId: assignmentKind === "verification"
        ? assignment.agentId
        : task.verifierAgentId,
      latestVerificationSummary: assignmentKind === "verification" && !canRetry
        ? `Verification dispatch failed: ${input.reason ?? "unknown failure"}`
        : task.latestVerificationSummary,
      updatedAt: now
    }).where(eq(tasks.id, assignment.taskId));

    if (canRetry) {
      await this.enqueueRunnableWorkerDispatches(assignment.runId);
    }

    await this.reconcileRunExecutionState(assignment.runId);

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

  private buildTaskDag(runTasks: Task[]): TaskDagGraph {
    const tasksById = new Map(runTasks.map((task) => [task.id, task] as const));
    const dependentTaskIds = new Map<string, string[]>();

    for (const task of runTasks) {
      dependentTaskIds.set(task.id, []);
    }

    for (const task of runTasks) {
      for (const dependencyId of task.dependencyIds) {
        dependentTaskIds.get(dependencyId)?.push(task.id);
      }
    }

    const edgeId = (sourceTaskId: string, targetTaskId: string) => `${sourceTaskId}->${targetTaskId}`;
    const blockedByTaskIds = new Map<string, string[]>();

    for (const task of runTasks) {
      blockedByTaskIds.set(task.id, task.dependencyIds.filter((dependencyId) => {
        const dependencyTask = tasksById.get(dependencyId);
        return dependencyTask !== undefined && dependencyTask.status !== "completed";
      }));
    }

    const nodes: TaskDagGraph["nodes"] = runTasks.map((task) => ({
      taskId: task.id,
      title: task.title,
      role: task.role,
      status: task.status,
      parentTaskId: task.parentTaskId ?? null,
      dependencyIds: task.dependencyIds,
      dependentTaskIds: dependentTaskIds.get(task.id) ?? [],
      blockedByTaskIds: blockedByTaskIds.get(task.id) ?? [],
      isRoot: task.dependencyIds.length === 0,
      isBlocked: task.status === "blocked"
    }));

    const edges: TaskDagGraph["edges"] = runTasks.flatMap((task) => task.dependencyIds.flatMap((dependencyId) => {
      const dependencyTask = tasksById.get(dependencyId);

      if (!dependencyTask) {
        return [];
      }

      return [{
        id: edgeId(dependencyId, task.id),
        sourceTaskId: dependencyId,
        targetTaskId: task.id,
        kind: "dependency" as const,
        isSatisfied: dependencyTask.status === "completed",
        isBlocking: (blockedByTaskIds.get(task.id) ?? []).includes(dependencyId)
      }];
    }));

    const rootTaskIds = nodes.filter((node) => node.isRoot).map((node) => node.taskId);
    const blockedTaskIds = nodes.filter((node) => node.isBlocked).map((node) => node.taskId);

    const collectBlockingAncestors = (
      taskId: string,
      pathTaskIds: Set<string>,
      pathEdgeIds: Set<string>,
      visitedTaskIds: Set<string>
    ) => {
      if (visitedTaskIds.has(taskId)) {
        return;
      }

      visitedTaskIds.add(taskId);
      pathTaskIds.add(taskId);

      for (const dependencyId of blockedByTaskIds.get(taskId) ?? []) {
        pathEdgeIds.add(edgeId(dependencyId, taskId));
        collectBlockingAncestors(dependencyId, pathTaskIds, pathEdgeIds, visitedTaskIds);
      }
    };

    const unblockPaths: TaskDagGraph["unblockPaths"] = blockedTaskIds.map((taskId) => {
      const pathTaskIds = new Set<string>([taskId]);
      const pathEdgeIds = new Set<string>();
      const directBlockingTaskIds = blockedByTaskIds.get(taskId) ?? [];

      for (const blockingTaskId of directBlockingTaskIds) {
        pathEdgeIds.add(edgeId(blockingTaskId, taskId));
        collectBlockingAncestors(blockingTaskId, pathTaskIds, pathEdgeIds, new Set<string>([taskId]));
      }

      return {
        taskId,
        blockingTaskIds: directBlockingTaskIds,
        pathTaskIds: runTasks.map((task) => task.id).filter((candidateId) => pathTaskIds.has(candidateId)),
        pathEdgeIds: edges.map((edge) => edge.id).filter((candidateId) => pathEdgeIds.has(candidateId))
      };
    });

    return {
      nodes,
      edges,
      rootTaskIds,
      blockedTaskIds,
      unblockPaths
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

  private async resolveWebhookTriggerByPath(endpointPath: string): Promise<RepeatableRunTrigger> {
    const rows = await this.db.select().from(repeatableRunTriggers).orderBy(asc(repeatableRunTriggers.createdAt));
    const matches = rows
      .map((row) => this.mapRepeatableRunTrigger(row))
      .filter((trigger) => trigger.kind === "webhook" && trigger.config.endpointPath === endpointPath);

    if (matches.length === 0) {
      throw new HttpError(404, `no webhook trigger is configured for ${endpointPath}`);
    }

    if (matches.length > 1) {
      throw new HttpError(409, `multiple webhook triggers are configured for ${endpointPath}`);
    }

    return matches[0]!;
  }

  private async assertRepeatableRunDefinitionExists(repeatableRunId: string, access?: AccessBoundary): Promise<RepeatableRunDefinition> {
    const rows = await this.db.select().from(repeatableRunDefinitions).where(eq(repeatableRunDefinitions.id, repeatableRunId));
    const definition = rows[0];

    if (!definition) {
      throw new HttpError(404, `repeatable run ${repeatableRunId} was not found`);
    }

    if (access) {
      const boundary = requireAccessBoundary(access);

      if (definition.workspaceId !== boundary.workspaceId || definition.teamId !== boundary.teamId) {
        throw new HttpError(404, `repeatable run ${repeatableRunId} was not found`);
      }
    }

    return this.mapRepeatableRunDefinition(definition);
  }

  private async assertRepeatableRunTriggerExists(triggerId: string, access?: AccessBoundary): Promise<RepeatableRunTrigger> {
    const rows = await this.db.select().from(repeatableRunTriggers).where(eq(repeatableRunTriggers.id, triggerId));
    const trigger = rows[0];

    if (!trigger) {
      throw new HttpError(404, `repeatable run trigger ${triggerId} was not found`);
    }

    if (access) {
      const boundary = requireAccessBoundary(access);

      if (trigger.workspaceId !== boundary.workspaceId || trigger.teamId !== boundary.teamId) {
        throw new HttpError(404, `repeatable run trigger ${triggerId} was not found`);
      }
    }

    return this.mapRepeatableRunTrigger(trigger);
  }

  private buildWebhookEndpointPath(triggerId: string) {
    return `/webhooks/triggers/${triggerId}`;
  }

  private validateWebhookTriggerRequest(
    trigger: RepeatableRunTrigger,
    repeatableRun: RepeatableRunDefinition,
    input: IngestWebhookInput,
    event: WebhookEnvelope
  ) {
    const headerValue = normalizeHeaderLookup(input.headers);

    if (!trigger.enabled) {
      return "trigger is disabled";
    }

    if (repeatableRun.status !== "active") {
      return `repeatable run is ${repeatableRun.status}`;
    }

    if (!trigger.config.allowedMethods.includes(input.method as "POST" | "PUT")) {
      return `method ${input.method} is not allowed`;
    }

    if ((input.contentLengthBytes ?? 0) > trigger.config.maxPayloadBytes) {
      return `payload exceeds configured limit of ${trigger.config.maxPayloadBytes} bytes`;
    }

    if (trigger.config.secretRef) {
      if (!trigger.config.signatureHeader) {
        return "trigger secretRef requires signatureHeader configuration";
      }

      const expectedSecret = process.env[trigger.config.secretRef];

      if (!expectedSecret) {
        return `configured secret ${trigger.config.secretRef} is unavailable`;
      }

      const providedSignature = headerValue(trigger.config.signatureHeader);

      if (!providedSignature || providedSignature !== expectedSecret) {
        return "webhook signature validation failed";
      }
    }

    if (trigger.config.filters.eventNames.length > 0 && !trigger.config.filters.eventNames.includes(event.eventName ?? "")) {
      return `event ${event.eventName ?? "unknown"} is not accepted`;
    }

    if (trigger.config.filters.actions.length > 0 && !trigger.config.filters.actions.includes(event.action ?? "")) {
      return `action ${event.action ?? "unknown"} is not accepted`;
    }

    const branch = readWebhookBranch(input.body);

    if (trigger.config.filters.branches.length > 0 && !trigger.config.filters.branches.includes(branch ?? "")) {
      return `branch ${branch ?? "unknown"} is not accepted`;
    }

    if (Object.keys(trigger.config.filters.metadata).length > 0) {
      const payloadMetadata = input.body && typeof input.body === "object" && !Array.isArray(input.body)
        ? ((input.body as Record<string, unknown>).metadata ?? {})
        : {};

      if (!payloadMetadata || typeof payloadMetadata !== "object" || Array.isArray(payloadMetadata)) {
        return "metadata filters require payload.metadata object";
      }

      for (const [key, value] of Object.entries(trigger.config.filters.metadata)) {
        if ((payloadMetadata as Record<string, unknown>)[key] !== value) {
          return `metadata filter ${key} did not match`;
        }
      }
    }

    return null;
  }

  private mapRepeatableRunDefinition(record: RepeatableRunDefinitionRecord): RepeatableRunDefinition {
    return repeatableRunDefinitionSchema.parse({
      ...record,
      projectTeamId: record.projectTeamId ?? null,
      projectTeamName: record.projectTeamName ?? null
    });
  }

  private mapRepeatableRunTrigger(record: RepeatableRunTriggerRecord): RepeatableRunTrigger {
    return repeatableRunTriggerSchema.parse(record);
  }

  private mapExternalEventReceipt(record: typeof externalEventReceipts.$inferSelect): ExternalEventReceipt {
    return {
      ...record,
      sourceType: record.sourceType as ExternalEventReceipt["sourceType"],
      status: record.status as ExternalEventReceipt["status"],
      event: inboundWebhookEventEnvelopeSchema.parse(record.event)
    };
  }

  private mapRun(run: typeof runs.$inferSelect, repositoryProjectId: string | null = null): Run {
    const context = normalizeStoredRunContext(run.metadata);
    const handoff = normalizeStoredRunHandoffConfig(run.handoffConfig);
    const handoffExecution = normalizeStoredRunHandoffExecution(run.handoffExecution);
    const runProjectId = run.projectId ?? null;
    return {
      ...run,
      projectId: runProjectId,
      projectTeamId: run.projectTeamId ?? null,
      projectTeamName: run.projectTeamName ?? null,
      status: run.status as Run["status"],
      budgetCostUsd: centsToDollars(run.budgetCostUsd),
      branchPublishApprovalId: run.branchPublishApprovalId ?? null,
      pullRequestStatus: run.pullRequestStatus as Run["pullRequestStatus"],
      pullRequestApprovalId: run.pullRequestApprovalId ?? null,
      handoffStatus: run.handoffStatus as Run["handoffStatus"],
      handoff,
      handoffExecution,
      context,
      jobScope: this.resolveRunJobScope(runProjectId, repositoryProjectId)
    };
  }

  private resolveRunJobScope(runProjectId: string | null, repositoryProjectId: string | null): RunJobScope {
    if (runProjectId) {
      if (!repositoryProjectId) {
        return {
          kind: "project",
          projectId: runProjectId,
          repositoryProjectId: null,
          reason: "run_assigned_repository_unassigned"
        };
      }

      return {
        kind: "project",
        projectId: runProjectId,
        repositoryProjectId,
        reason: repositoryProjectId === runProjectId
          ? "run_assigned"
          : "run_assigned_repository_mismatch"
      };
    }

    return {
      kind: "ad_hoc",
      projectId: null,
      repositoryProjectId,
      reason: repositoryProjectId ? "run_unassigned" : "repository_unassigned"
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

  private async getTaskRecord(taskId: string) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    return task ?? null;
  }

  private async resolveWorkerAssignmentTaskState(
    task: TaskRecord,
    assignmentState: WorkerDispatchAssignment["state"]
  ): Promise<{ valid: boolean; effectiveTaskStatus: Task["status"] }> {
    const dependenciesSatisfied = await this.areDependenciesSatisfied(task.runId, task.dependencyIds);

    if (!dependenciesSatisfied) {
      return {
        valid: false,
        effectiveTaskStatus: "blocked"
      };
    }

    if (assignmentState === "claimed") {
      return {
        valid: task.status === "pending" || task.status === "in_progress",
        effectiveTaskStatus: task.status as Task["status"]
      };
    }

    if (assignmentState === "queued" || assignmentState === "retrying") {
      return {
        valid: task.status === "pending",
        effectiveTaskStatus: task.status as Task["status"]
      };
    }

    return {
      valid: false,
      effectiveTaskStatus: task.status as Task["status"]
    };
  }

  private async invalidateWorkerDispatchAssignment(
    assignment: WorkerDispatchAssignment,
    input: {
      reason: string;
      task: TaskRecord | null;
      taskStatus: Task["status"] | null;
    }
  ) {
    const now = this.clock.now();
    const nextMetadata = {
      ...assignment.metadata,
      assignmentKind: normalizeAssignmentKind(assignment.metadata),
      invalidationReason: input.reason,
      terminalOutcome: "invalidated"
    };

    await this.db.update(workerDispatchAssignments).set({
      state: "failed",
      attempt: assignment.maxAttempts,
      stickyNodeId: null,
      preferredNodeId: null,
      claimedByNodeId: null,
      claimedAt: null,
      completedAt: now,
      lastFailureReason: input.reason,
      metadata: nextMetadata,
      updatedAt: now
    }).where(eq(workerDispatchAssignments.id, assignment.id));

    if (assignment.sessionId) {
      await this.db.update(sessions).set({
        workerNodeId: null,
        stickyNodeId: null,
        state: "pending",
        staleReason: input.reason,
        updatedAt: now
      }).where(eq(sessions.id, assignment.sessionId));
    }

    await this.db.update(agents).set({
      status: "idle",
      updatedAt: now
    }).where(eq(agents.id, assignment.agentId));

    if (input.task) {
      await this.db.update(tasks).set({
        status: input.taskStatus ?? (input.task.status as Task["status"]),
        ownerAgentId: assignment.agentId,
        updatedAt: now
      }).where(eq(tasks.id, input.task.id));
    }

    await this.recordControlPlaneEvent(controlPlaneEventDefinitions.workerDispatchAssignmentUpdated, {
      runId: assignment.runId,
      entityId: assignment.id,
      status: "failed",
      summary: `Worker dispatch assignment invalidated: ${input.reason}`,
      metadata: {
        taskId: assignment.taskId,
        agentId: assignment.agentId,
        reason: input.reason
      }
    });
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

  private async findLatestCompletedWorkerAssignmentForTask(runId: string, taskId: string) {
    const assignmentRows = await this.db.select().from(workerDispatchAssignments)
      .where(eq(workerDispatchAssignments.runId, runId))
      .orderBy(asc(workerDispatchAssignments.createdAt));

    return [...assignmentRows].reverse().find((assignment) =>
      assignment.taskId === taskId
      && assignment.state === "completed"
      && normalizeAssignmentKind(assignment.metadata) === "worker"
      && assignment.metadata?.workerOutcomeStatus === "completed"
    ) ?? null;
  }

  private async retryBlockedVerificationTask(runId: string, task: TaskRecord) {
    const latestWorkerAssignment = await this.findLatestCompletedWorkerAssignmentForTask(runId, task.id);

    if (!latestWorkerAssignment) {
      await this.recordControlPlaneEvent(controlPlaneEventDefinitions.taskVerificationBlocked, {
        runId,
        entityId: task.id,
        status: "blocked",
        summary: `Verification retry could not be requested for task ${task.title}`,
        metadata: {
          reason: "missing_completed_worker_assignment"
        }
      });
      return false;
    }

    const workerSummary = typeof latestWorkerAssignment.metadata?.workerSummary === "string"
      ? latestWorkerAssignment.metadata.workerSummary
      : "Worker completed and is ready for verification.";
    const blockingIssues = Array.isArray(latestWorkerAssignment.metadata?.blockingIssues)
      ? latestWorkerAssignment.metadata.blockingIssues.filter((issue): issue is string => typeof issue === "string")
      : [];
    const runDetail = await this.getRun(runId);
    const repository = this.mapRepository(await this.assertRepositoryExists(runDetail.repositoryId));
    const projectTeam = await this.loadRunProjectTeam(runDetail.projectTeamId);

    await this.enqueueVerifierAssignment({
      run: runDetail,
      repository,
      projectTeam,
      task: this.mapTask(task),
      workerAssignment: this.mapWorkerDispatchAssignment(latestWorkerAssignment),
      workerOutcome: {
        kind: "worker",
        summary: workerSummary,
        outcomeStatus: "completed",
        blockingIssues
      }
    });

    return true;
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
        if (candidateTask.verificationStatus === "blocked") {
          await this.retryBlockedVerificationTask(runId, candidateTask);
          continue;
        }

        await this.db.update(tasks).set({
          status: "pending",
          updatedAt: now
        }).where(eq(tasks.id, candidateTask.id));
      }
    }
  }
}
