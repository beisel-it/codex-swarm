import { z } from "zod";

export const runStatuses = ["pending", "planning", "in_progress", "awaiting_approval", "completed", "failed", "cancelled"] as const;
export const taskStatuses = ["pending", "blocked", "in_progress", "awaiting_review", "completed", "failed", "cancelled"] as const;
export const agentStatuses = ["provisioning", "idle", "busy", "paused", "stopped", "failed"] as const;
export const approvalStatuses = ["pending", "approved", "rejected"] as const;
export const approvalKinds = ["plan", "patch", "merge", "network", "policy_exception"] as const;
export const artifactKinds = ["plan", "patch", "log", "report", "diff", "screenshot", "pr_link", "other"] as const;
export const validationStatuses = ["pending", "passed", "failed"] as const;
export const messageKinds = ["direct", "broadcast", "system"] as const;
export const repositoryProviders = ["github", "gitlab", "local", "other"] as const;
export const repositoryTrustLevels = ["trusted", "sandboxed", "restricted"] as const;
export const pullRequestStatuses = ["draft", "open", "merged", "closed"] as const;
export const handoffStatuses = ["pending", "branch_published", "pr_open", "manual_handoff", "merged", "closed"] as const;
export const workerSessionStates = ["pending", "active", "stopped", "failed", "stale", "archived"] as const;
export const agentObservabilityModes = ["session", "transcript_visibility", "unavailable"] as const;
export const agentObservabilityLineageSources = ["active_session", "session_rollover", "task_reassignment", "task_state_transition", "terminal_session", "not_started"] as const;
export const workerNodeStates = ["active", "draining", "drained", "offline"] as const;
export const workerDispatchStates = ["queued", "claimed", "completed", "retrying", "failed"] as const;
export const workerNodeStatuses = ["online", "degraded", "offline"] as const;
export const workerNodeDrainStates = ["active", "draining", "drained"] as const;
export const governanceRoles = ["org_admin", "workspace_admin", "team_admin", "member", "reviewer", "operator", "service", "system"] as const;
export const governedActions = ["run.create", "run.review", "run.retry", "run.stop", "approval.request", "approval.resolve", "admin.read", "admin.write"] as const;
export const controlPlaneEventTypes = [
  "admin.governance_report_generated",
  "admin.retention_reconciled",
  "agent.created",
  "approval.created",
  "approval.resolved",
  "artifact.created",
  "maintenance.cleanup_completed",
  "message.created",
  "repository.created",
  "run.audit_exported",
  "run.branch_published",
  "run.completed",
  "run.created",
  "run.pull_request_handoff_created",
  "run.status_updated",
  "task.created",
  "task.status_updated",
  "task.unblocked",
  "validation.created",
  "worker_dispatch_assignment.claimed",
  "worker_dispatch_assignment.created",
  "worker_dispatch_assignment.updated",
  "worker_node.drain_state_updated",
  "worker_node.heartbeat_recorded",
  "worker_node.reconciled",
  "worker_node.registered"
] as const;
export const controlPlaneEventEntityTypes = [
  "admin_report",
  "agent",
  "approval",
  "artifact",
  "cleanup_job",
  "message",
  "repository",
  "retention_policy",
  "run",
  "task",
  "validation",
  "worker_dispatch_assignment",
  "worker_node"
] as const;

export const validationTemplateSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  summary: z.string().min(1).optional(),
  artifactPath: z.string().min(1).optional()
});

export const agentTeamTemplateMemberSchema = z.object({
  key: z.string().min(1),
  displayName: z.string().min(1),
  roleProfile: z.string().min(1),
  responsibility: z.string().min(1)
});

export const agentTeamTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  focus: z.enum(["delivery", "platform"]),
  suggestedGoal: z.string().min(1),
  suggestedConcurrencyCap: z.number().int().positive(),
  members: z.array(agentTeamTemplateMemberSchema).min(1)
});

export const repositoryCreateSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  provider: z.enum(repositoryProviders).optional(),
  defaultBranch: z.string().min(1).optional(),
  localPath: z.string().min(1).optional(),
  trustLevel: z.enum(repositoryTrustLevels).default("trusted"),
  approvalProfile: z.string().min(1).optional()
});

export const repositoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  provider: z.enum(repositoryProviders).optional(),
  defaultBranch: z.string().min(1).optional(),
  localPath: z.string().min(1).nullable().optional(),
  trustLevel: z.enum(repositoryTrustLevels).optional(),
  approvalProfile: z.string().min(1).optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "at least one repository field must be updated"
});

export const repositoryProviderSyncSchema = z.object({
  connectivityStatus: z.enum(["validated", "failed", "skipped"]),
  validatedAt: z.date().nullable().default(null),
  defaultBranch: z.string().min(1).nullable().default(null),
  branches: z.array(z.string().min(1)).default([]),
  providerRepoUrl: z.string().url().nullable().default(null),
  lastError: z.string().min(1).nullable().default(null)
});

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const teamSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  policyProfile: z.string().min(1).default("standard"),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const identityContextSchema = z.object({
  principal: z.string().min(1),
  subject: z.string().min(1),
  email: z.string().email().nullable().default(null),
  roles: z.array(z.string().min(1)).default([]),
  workspace: workspaceSchema.pick({
    id: true,
    name: true
  }),
  team: teamSchema.pick({
    id: true,
    workspaceId: true,
    name: true
  }),
  actorType: z.enum(["system", "user", "service"]).default("user")
});

export const runCreateSchema = z.object({
  repositoryId: z.uuid(),
  goal: z.string().min(1),
  branchName: z.string().min(1).optional(),
  planArtifactPath: z.string().min(1).optional(),
  budgetTokens: z.number().int().positive().optional(),
  budgetCostUsd: z.number().nonnegative().optional(),
  concurrencyCap: z.number().int().positive().default(1),
  policyProfile: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const runUpdateSchema = z.object({
  goal: z.string().min(1).optional(),
  branchName: z.string().min(1).nullable().optional(),
  budgetTokens: z.number().int().positive().nullable().optional(),
  budgetCostUsd: z.number().positive().nullable().optional(),
  concurrencyCap: z.number().int().positive().optional(),
  policyProfile: z.string().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "at least one run field must be updated"
});

export const runStatusUpdateSchema = z.object({
  status: z.enum(runStatuses),
  planArtifactPath: z.string().min(1).optional()
});

export const runBudgetCheckpointSchema = z.object({
  source: z.string().min(1),
  tokensUsedDelta: z.number().int().nonnegative().default(0),
  costUsdDelta: z.number().nonnegative().default(0),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const runBudgetStateSchema = z.object({
  runId: z.uuid(),
  continueAllowed: z.boolean(),
  decision: z.enum(["within_budget", "awaiting_policy_exception", "approved_exception"]),
  tokensUsedTotal: z.number().int().nonnegative(),
  costUsdTotal: z.number().nonnegative(),
  exceeded: z.array(z.enum(["tokens", "cost"])).default([]),
  approvalId: z.uuid().nullable().default(null),
  updatedAt: z.date()
});

export const taskCreateSchema = z.object({
  runId: z.uuid(),
  parentTaskId: z.uuid().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  role: z.string().min(1),
  priority: z.number().int().min(1).max(5).default(3),
  ownerAgentId: z.uuid().optional(),
  dependencyIds: z.array(z.uuid()).default([]),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  validationTemplates: z.array(validationTemplateSchema).default([])
});

export const taskStatusUpdateSchema = z.object({
  status: z.enum(taskStatuses),
  ownerAgentId: z.uuid().optional()
});

export const agentCreateSchema = z.object({
  runId: z.uuid(),
  name: z.string().min(1),
  role: z.string().min(1),
  status: z.enum(agentStatuses).default("provisioning"),
  worktreePath: z.string().min(1).optional(),
  branchName: z.string().min(1).optional(),
  currentTaskId: z.uuid().optional(),
  session: z.object({
    threadId: z.string().min(1),
    cwd: z.string().min(1),
    sandbox: z.string().min(1),
    approvalPolicy: z.string().min(1),
    includePlanTool: z.boolean().default(false),
    workerNodeId: z.uuid().optional(),
    placementConstraintLabels: z.array(z.string().min(1)).default([]),
    metadata: z.record(z.string(), z.unknown()).default({})
  }).optional()
});

export const workerNodeRegisterSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().min(1),
  endpoint: z.string().min(1).optional(),
  capabilityLabels: z.array(z.string().min(1)).default([]),
  status: z.enum(workerNodeStatuses).default("online"),
  drainState: z.enum(workerNodeDrainStates).default("active"),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const workerNodeHeartbeatSchema = z.object({
  status: z.enum(workerNodeStatuses).default("online"),
  capabilityLabels: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const workerNodeDrainUpdateSchema = z.object({
  drainState: z.enum(workerNodeDrainStates),
  reason: z.string().min(1).optional()
});

export const idParamSchema = z.object({
  id: z.uuid()
});

export const repositorySchema = repositoryCreateSchema.extend({
  id: z.uuid(),
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  provider: z.enum(repositoryProviders),
  defaultBranch: z.string().min(1),
  localPath: z.string().min(1).nullable(),
  trustLevel: z.enum(repositoryTrustLevels),
  approvalProfile: z.string().min(1),
  providerSync: repositoryProviderSyncSchema,
  createdAt: z.date(),
  updatedAt: z.date()
});

export const runSchema = runCreateSchema.extend({
  id: z.uuid(),
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  status: z.enum(runStatuses),
  branchName: z.string().min(1).nullable(),
  planArtifactPath: z.string().min(1).nullable(),
  budgetTokens: z.number().int().positive().nullable(),
  budgetCostUsd: z.number().nonnegative().nullable(),
  concurrencyCap: z.number().int().positive(),
  policyProfile: z.string().min(1).nullable(),
  publishedBranch: z.string().min(1).nullable(),
  branchPublishedAt: z.date().nullable(),
  branchPublishApprovalId: z.uuid().nullable(),
  pullRequestUrl: z.string().url().nullable(),
  pullRequestNumber: z.number().int().positive().nullable(),
  pullRequestStatus: z.enum(pullRequestStatuses).nullable(),
  pullRequestApprovalId: z.uuid().nullable(),
  handoffStatus: z.enum(handoffStatuses),
  completedAt: z.date().nullable(),
  createdBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const taskSchema = taskCreateSchema.extend({
  id: z.uuid(),
  status: z.enum(taskStatuses),
  parentTaskId: z.uuid().nullable(),
  ownerAgentId: z.uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const taskDagNodeSchema = z.object({
  taskId: z.uuid(),
  title: z.string().min(1),
  role: z.string().min(1),
  status: z.enum(taskStatuses),
  parentTaskId: z.uuid().nullable().default(null),
  dependencyIds: z.array(z.uuid()).default([]),
  dependentTaskIds: z.array(z.uuid()).default([]),
  blockedByTaskIds: z.array(z.uuid()).default([]),
  isRoot: z.boolean(),
  isBlocked: z.boolean()
});

export const taskDagEdgeSchema = z.object({
  id: z.string().min(1),
  sourceTaskId: z.uuid(),
  targetTaskId: z.uuid(),
  kind: z.literal("dependency"),
  isSatisfied: z.boolean(),
  isBlocking: z.boolean()
});

export const taskDagUnblockPathSchema = z.object({
  taskId: z.uuid(),
  blockingTaskIds: z.array(z.uuid()).default([]),
  pathTaskIds: z.array(z.uuid()).default([]),
  pathEdgeIds: z.array(z.string().min(1)).default([])
});

export const taskDagGraphSchema = z.object({
  nodes: z.array(taskDagNodeSchema),
  edges: z.array(taskDagEdgeSchema),
  rootTaskIds: z.array(z.uuid()).default([]),
  blockedTaskIds: z.array(z.uuid()).default([]),
  unblockPaths: z.array(taskDagUnblockPathSchema).default([])
});

export const agentObservabilitySchema = z.object({
  mode: z.enum(agentObservabilityModes).default("unavailable"),
  currentSessionId: z.uuid().nullable().default(null),
  currentSessionState: z.enum(workerSessionStates).nullable().default(null),
  visibleTranscriptSessionId: z.uuid().nullable().default(null),
  visibleTranscriptSessionState: z.enum(workerSessionStates).nullable().default(null),
  visibleTranscriptUpdatedAt: z.date().nullable().default(null),
  lineageSource: z.enum(agentObservabilityLineageSources).default("not_started")
}).superRefine((value, ctx) => {
  if (value.mode === "session" && !value.currentSessionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["currentSessionId"],
      message: "session mode requires currentSessionId"
    });
  }

  if (value.mode === "transcript_visibility" && !value.visibleTranscriptSessionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["visibleTranscriptSessionId"],
      message: "transcript_visibility mode requires visibleTranscriptSessionId"
    });
  }

  if (value.mode === "unavailable" && (value.currentSessionId || value.visibleTranscriptSessionId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mode"],
      message: "unavailable mode cannot expose session or transcript linkage"
    });
  }
});

export const agentSchema = agentCreateSchema.omit({ session: true }).extend({
  id: z.uuid(),
  worktreePath: z.string().min(1).nullable(),
  branchName: z.string().min(1).nullable(),
  currentTaskId: z.uuid().nullable(),
  lastHeartbeatAt: z.date().nullable(),
  observability: agentObservabilitySchema.default({
    mode: "unavailable",
    currentSessionId: null,
    currentSessionState: null,
    visibleTranscriptSessionId: null,
    visibleTranscriptSessionState: null,
    visibleTranscriptUpdatedAt: null,
    lineageSource: "not_started"
  }),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const sessionSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  threadId: z.string().min(1),
  cwd: z.string().min(1),
  sandbox: z.string().min(1),
  approvalPolicy: z.string().min(1),
  includePlanTool: z.boolean().default(false),
  workerNodeId: z.uuid().nullable(),
  stickyNodeId: z.uuid().nullable(),
  placementConstraintLabels: z.array(z.string().min(1)).default([]),
  lastHeartbeatAt: z.date().nullable(),
  state: z.enum(workerSessionStates),
  staleReason: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const sessionTranscriptEntrySchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  kind: z.enum(["prompt", "response", "system"]),
  text: z.string().min(1),
  createdAt: z.coerce.date(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const sessionTranscriptEntryCreateSchema = z.object({
  kind: z.enum(["prompt", "response", "system"]),
  text: z.string().min(1),
  createdAt: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const sessionTranscriptAppendSchema = z.object({
  entries: z.array(sessionTranscriptEntryCreateSchema).min(1)
});

export const workerNodeSchema = workerNodeRegisterSchema.extend({
  id: z.uuid(),
  endpoint: z.string().min(1).nullable(),
  status: z.enum(workerNodeStatuses),
  drainState: z.enum(workerNodeDrainStates),
  lastHeartbeatAt: z.date().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date()
}).extend({
  eligibleForScheduling: z.boolean()
});

export const approvalSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  taskId: z.uuid().nullable(),
  kind: z.enum(approvalKinds),
  status: z.enum(approvalStatuses),
  requestedPayload: z.record(z.string(), z.unknown()),
  resolutionPayload: z.record(z.string(), z.unknown()),
  requestedBy: z.string().min(1),
  delegation: z.object({
    delegateActorId: z.string().min(1),
    delegatedBy: z.string().min(1),
    delegatedAt: z.date(),
    reason: z.string().min(1).nullable().default(null)
  }).nullable().default(null),
  resolver: z.string().min(1).nullable(),
  resolvedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const approvalsListQuerySchema = z.object({
  runId: z.uuid().optional()
});

export const artifactSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  taskId: z.uuid().nullable(),
  kind: z.enum(artifactKinds),
  path: z.string().min(1),
  contentType: z.string().min(1),
  url: z.string().url().nullable().default(null),
  sizeBytes: z.number().int().nonnegative().nullable().default(null),
  sha256: z.string().min(1).nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date()
});

export const artifactDiffChangeTypes = ["added", "modified", "deleted", "renamed", "copied", "unknown"] as const;

export const artifactDiffFileSummarySchema = z.object({
  path: z.string().min(1),
  changeType: z.enum(artifactDiffChangeTypes),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
  summary: z.string().min(1).nullable().default(null),
  previousPath: z.string().min(1).nullable().default(null),
  providerUrl: z.string().url().nullable().default(null)
});

export const artifactDiffSummarySchema = z.object({
  title: z.string().min(1).nullable().default(null),
  changeSummary: z.string().min(1).nullable().default(null),
  filesChanged: z.number().int().nonnegative(),
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  truncated: z.boolean().default(false),
  fileSummaries: z.array(artifactDiffFileSummarySchema).default([]),
  diffPreview: z.string().nullable().default(null),
  rawDiff: z.string().nullable().default(null),
  providerUrl: z.string().url().nullable().default(null)
});

export const artifactDetailSchema = z.object({
  artifact: artifactSchema,
  contentState: z.enum(["available", "missing", "binary", "truncated"]),
  bodyText: z.string().nullable().default(null),
  diffSummary: artifactDiffSummarySchema.nullable().default(null)
});

export const artifactCreateSchema = z.object({
  runId: z.uuid(),
  taskId: z.uuid().optional(),
  kind: z.enum(artifactKinds),
  path: z.string().min(1),
  contentType: z.string().min(1),
  contentBase64: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const validationSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  taskId: z.uuid().nullable(),
  name: z.string().min(1),
  status: z.enum(validationStatuses),
  command: z.string().min(1),
  summary: z.string().min(1).nullable(),
  artifactPath: z.string().min(1).nullable(),
  artifactIds: z.array(z.uuid()).default([]),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const validationHistoryEntrySchema = validationSchema.extend({
  artifacts: z.array(artifactSchema)
});

export const validationCreateSchema = z.object({
  runId: z.uuid(),
  taskId: z.uuid().optional(),
  templateName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  status: z.enum(validationStatuses).default("pending"),
  command: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  artifactPath: z.string().min(1).optional(),
  artifactIds: z.array(z.uuid()).default([])
}).superRefine((value, ctx) => {
  if (!value.templateName && !value.name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["name"],
      message: "name is required when templateName is not provided"
    });
  }

  if (!value.templateName && !value.command) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["command"],
      message: "command is required when templateName is not provided"
    });
  }
});

export const validationsListQuerySchema = z.object({
  runId: z.uuid(),
  taskId: z.uuid().optional()
});

export const eventsListQuerySchema = z.object({
  runId: z.uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100)
});

export const actorIdentitySchema = z.object({
  principal: z.string().min(1),
  actorId: z.string().min(1),
  actorType: z.enum(["system", "user", "service"]).default("user"),
  email: z.string().email().nullable().default(null),
  role: z.string().min(1),
  roles: z.array(z.enum(governanceRoles)).default([]),
  workspaceId: z.string().min(1).nullable().default(null),
  workspaceName: z.string().min(1).nullable().default(null),
  teamId: z.string().min(1).nullable().default(null),
  teamName: z.string().min(1).nullable().default(null),
  policyProfile: z.string().min(1).nullable().default(null)
});

export const controlPlaneEventSchema = z.object({
  id: z.uuid(),
  runId: z.uuid().nullable(),
  taskId: z.string().nullable(),
  agentId: z.string().nullable(),
  traceId: z.string().min(1),
  eventType: z.enum(controlPlaneEventTypes),
  entityType: z.enum(controlPlaneEventEntityTypes),
  entityId: z.string().min(1),
  status: z.string().min(1),
  summary: z.string().min(1),
  actor: actorIdentitySchema.nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date()
});

export const retentionPolicySchema = z.object({
  runsDays: z.number().int().positive(),
  artifactsDays: z.number().int().positive(),
  eventsDays: z.number().int().positive()
});

export const retentionWindowSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
  retained: z.number().int().nonnegative()
});

export const controlPlaneMetricsSchema = z.object({
  queueDepth: z.object({
    runsPending: z.number().int().nonnegative(),
    tasksPending: z.number().int().nonnegative(),
    tasksBlocked: z.number().int().nonnegative(),
    approvalsPending: z.number().int().nonnegative(),
    busyAgents: z.number().int().nonnegative()
  }),
  retries: z.object({
    recoverableDatabaseFallbacks: z.number().int().nonnegative(),
    taskUnblocks: z.number().int().nonnegative()
  }),
  failures: z.object({
    runsFailed: z.number().int().nonnegative(),
    tasksFailed: z.number().int().nonnegative(),
    agentsFailed: z.number().int().nonnegative(),
    validationsFailed: z.number().int().nonnegative(),
    requestFailures: z.number().int().nonnegative()
  }),
  usage: z.object({
    repositories: z.number().int().nonnegative(),
    runsTotal: z.number().int().nonnegative(),
    runsActive: z.number().int().nonnegative(),
    runsCompleted: z.number().int().nonnegative(),
    tasksTotal: z.number().int().nonnegative(),
    approvalsTotal: z.number().int().nonnegative(),
    validationsTotal: z.number().int().nonnegative(),
    artifactsTotal: z.number().int().nonnegative(),
    workerNodesOnline: z.number().int().nonnegative(),
    workerNodesDraining: z.number().int().nonnegative()
  }),
  cost: z.object({
    runsWithBudget: z.number().int().nonnegative(),
    totalBudgetedRunCostUsd: z.number().nonnegative(),
    averageBudgetedRunCostUsd: z.number().nonnegative(),
    maxBudgetedRunCostUsd: z.number().nonnegative()
  }),
  performance: z.object({
    completedRunsMeasured: z.number().int().nonnegative(),
    approvalsMeasured: z.number().int().nonnegative(),
    validationsMeasured: z.number().int().nonnegative(),
    runDurationMs: z.object({
      p50: z.number().nonnegative(),
      p95: z.number().nonnegative(),
      max: z.number().nonnegative()
    }),
    approvalResolutionMs: z.object({
      p50: z.number().nonnegative(),
      p95: z.number().nonnegative(),
      max: z.number().nonnegative()
    }),
    validationTurnaroundMs: z.object({
      p50: z.number().nonnegative(),
      p95: z.number().nonnegative(),
      max: z.number().nonnegative()
    })
  }),
  slo: z.object({
    objectives: z.object({
      pendingApprovalMaxMinutes: z.number().int().positive(),
      activeRunMaxMinutes: z.number().int().positive(),
      taskQueueMax: z.number().int().positive(),
      supportResponseHours: z.number().int().positive()
    }),
    support: z.object({
      hoursUtc: z.string().min(1),
      escalation: z.array(z.string().min(1))
    }),
    status: z.object({
      pendingApprovalsWithinTarget: z.boolean(),
      activeRunsWithinTarget: z.boolean(),
      queueDepthWithinTarget: z.boolean(),
      withinEnvelope: z.boolean()
    }),
    measurements: z.object({
      oldestPendingApprovalAgeMinutes: z.number().nonnegative().nullable(),
      oldestActiveRunAgeMinutes: z.number().nonnegative().nullable(),
      pendingApprovals: z.number().int().nonnegative(),
      activeRuns: z.number().int().nonnegative(),
      tasksPending: z.number().int().nonnegative()
    })
  }),
  eventsRecorded: z.number().int().nonnegative(),
  recordedAt: z.date()
});

export const approvalCreateSchema = z.object({
  runId: z.uuid(),
  taskId: z.uuid().optional(),
  kind: z.enum(approvalKinds),
  requestedBy: z.string().min(1),
  requestedPayload: z.record(z.string(), z.unknown()).default({}),
  delegation: z.object({
    delegateActorId: z.string().min(1),
    reason: z.string().min(1).optional()
  }).optional()
});

export const approvalResolveSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  resolver: z.string().min(1),
  feedback: z.string().min(1).optional(),
  resolutionPayload: z.record(z.string(), z.unknown()).default({})
});

export const runBranchPublishSchema = z.object({
  branchName: z.string().min(1).optional(),
  approvalId: z.uuid().optional(),
  publishedBy: z.string().min(1),
  remoteName: z.string().min(1).default("origin"),
  commitSha: z.string().min(1).optional(),
  notes: z.string().min(1).optional()
});

export const runPullRequestHandoffSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  createdBy: z.string().min(1),
  approvalId: z.uuid().optional(),
  provider: z.enum(repositoryProviders).optional(),
  baseBranch: z.string().min(1).optional(),
  headBranch: z.string().min(1).optional(),
  url: z.string().url().optional(),
  number: z.number().int().positive().optional(),
  status: z.enum(pullRequestStatuses).default("draft")
});

export const cleanupJobRunSchema = z.object({
  runId: z.uuid().optional(),
  staleAfterMinutes: z.number().int().positive().default(15),
  existingWorktreePaths: z.array(z.string().min(1)).default([]),
  deleteStaleWorktrees: z.boolean().default(false)
});

export const cleanupJobItemSchema = z.object({
  sessionId: z.uuid(),
  runId: z.uuid(),
  agentId: z.uuid(),
  worktreePath: z.string().min(1),
  action: z.enum(["resume", "retry", "mark_stale", "archive"]),
  reason: z.enum(["resume_session", "retry_pending_session", "missing_thread", "missing_worktree", "heartbeat_timeout", "terminal_state"]),
  worktreeDeleted: z.boolean().default(false),
  worktreeDeleteReason: z.string().min(1).nullable().default(null)
});

export const cleanupJobReportSchema = z.object({
  scannedSessions: z.number().int().nonnegative(),
  resumed: z.number().int().nonnegative(),
  retried: z.number().int().nonnegative(),
  markedStale: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  deletedWorktrees: z.number().int().nonnegative(),
  worktreeDeleteFailures: z.number().int().nonnegative(),
  items: z.array(cleanupJobItemSchema),
  completedAt: z.date()
});

export const workerDispatchAssignmentSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  taskId: z.uuid(),
  agentId: z.uuid(),
  sessionId: z.uuid().optional(),
  repositoryId: z.uuid(),
  repositoryName: z.string().min(1),
  queue: z.string().min(1).default("worker-dispatch"),
  state: z.enum(workerDispatchStates).default("queued"),
  stickyNodeId: z.string().min(1).nullable().default(null),
  preferredNodeId: z.string().min(1).nullable().default(null),
  claimedByNodeId: z.string().min(1).nullable().default(null),
  requiredCapabilities: z.array(z.string().min(1)).default([]),
  worktreePath: z.string().min(1),
  branchName: z.string().min(1).nullable().default(null),
  prompt: z.string().min(1),
  profile: z.string().min(1),
  sandbox: z.string().min(1),
  approvalPolicy: z.string().min(1),
  includePlanTool: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
  attempt: z.number().int().nonnegative().default(0),
  maxAttempts: z.number().int().positive().default(3),
  leaseTtlSeconds: z.number().int().positive().default(300),
  createdAt: z.date()
});

export const workerDispatchCreateSchema = z.object({
  runId: z.uuid(),
  taskId: z.uuid(),
  agentId: z.uuid(),
  sessionId: z.uuid().optional(),
  repositoryId: z.uuid(),
  repositoryName: z.string().min(1),
  queue: z.string().min(1).default("worker-dispatch"),
  stickyNodeId: z.string().min(1).nullable().default(null),
  preferredNodeId: z.string().min(1).nullable().default(null),
  requiredCapabilities: z.array(z.string().min(1)).default([]),
  worktreePath: z.string().min(1),
  branchName: z.string().min(1).nullable().default(null),
  prompt: z.string().min(1),
  profile: z.string().min(1),
  sandbox: z.string().min(1),
  approvalPolicy: z.string().min(1),
  includePlanTool: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
  maxAttempts: z.number().int().positive().default(3),
  leaseTtlSeconds: z.number().int().positive().default(300)
});

export const workerDispatchListQuerySchema = z.object({
  runId: z.uuid().optional(),
  nodeId: z.uuid().optional(),
  state: z.enum(workerDispatchStates).optional()
});

export const workerDispatchCompleteSchema = z.object({
  nodeId: z.uuid(),
  status: z.enum(["completed", "failed"]),
  reason: z.string().min(1).optional()
});

export const workerNodeReconcileSchema = z.object({
  reason: z.string().min(1),
  markOffline: z.boolean().default(true)
});

export const workerNodeReconcileReportSchema = z.object({
  nodeId: z.uuid(),
  retriedAssignments: z.number().int().nonnegative(),
  failedAssignments: z.number().int().nonnegative(),
  staleSessions: z.number().int().nonnegative(),
  completedAt: z.date()
});

export const codexMcpTransportSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("stdio")
  }),
  z.object({
    kind: z.literal("streamable_http"),
    url: z.string().url(),
    headers: z.record(z.string().min(1), z.string()).default({}),
    protocolVersion: z.string().min(1).default("2025-11-25")
  })
]);

export const workerNodeRuntimeSchema = z.object({
  nodeId: z.string().min(1),
  nodeName: z.string().min(1),
  state: z.enum(workerNodeStates),
  workspaceRoot: z.string().min(1),
  codexCommand: z.array(z.string().min(1)).min(1),
  codexTransport: codexMcpTransportSchema.default({
    kind: "stdio"
  }),
  controlPlaneUrl: z.string().url(),
  artifactBaseUrl: z.string().url().optional(),
  postgresUrl: z.string().min(1),
  redisUrl: z.string().min(1),
  queueKeyPrefix: z.string().min(1).default("codex-swarm"),
  capabilities: z.array(z.string().min(1)).default([]),
  credentialEnvNames: z.array(z.string().min(1)).default([]),
  heartbeatIntervalSeconds: z.number().int().positive().default(30)
});

export const workerRuntimeDependencyCheckSchema = z.object({
  name: z.enum(["control_plane", "postgres", "redis", "artifact_store", "codex_cli", "workspace_root"]),
  status: z.enum(["ready", "missing", "degraded"]),
  detail: z.string().min(1)
});

export const remoteWorkerBootstrapSchema = z.object({
  runtime: workerNodeRuntimeSchema,
  dispatch: workerDispatchAssignmentSchema,
  environment: z.record(z.string(), z.string()),
  checks: z.array(workerRuntimeDependencyCheckSchema)
});

export const workerDrainCommandSchema = z.object({
  nodeId: z.string().min(1),
  targetState: z.enum(["active", "draining", "drained"]),
  reason: z.string().min(1),
  allowActiveAssignments: z.boolean().default(true)
});

export const workerDrainStatusSchema = z.object({
  nodeId: z.string().min(1),
  previousState: z.enum(workerNodeStates),
  targetState: z.enum(workerNodeStates),
  shouldAcceptAssignments: z.boolean(),
  shouldKeepHeartbeats: z.boolean(),
  requiresRedisPause: z.boolean(),
  reason: z.string().min(1)
});

export const approvalAuditEntrySchema = z.object({
  approvalId: z.uuid(),
  runId: z.uuid(),
  taskId: z.uuid().nullable(),
  repositoryId: z.uuid(),
  repositoryName: z.string().min(1),
  kind: z.enum(approvalKinds),
  status: z.enum(approvalStatuses),
  requestedAt: z.date(),
  resolvedAt: z.date().nullable(),
  requestedBy: z.string().min(1),
  requestedByActor: actorIdentitySchema.nullable().default(null),
  delegation: z.object({
    delegateActorId: z.string().min(1),
    delegatedBy: z.string().min(1),
    delegatedAt: z.date(),
    reason: z.string().min(1).nullable().default(null)
  }).nullable().default(null),
  resolver: z.string().min(1).nullable(),
  resolverActor: actorIdentitySchema.nullable().default(null),
  resolvedByDelegate: z.boolean().default(false),
  policyProfile: z.string().min(1).nullable(),
  requestedPayload: z.record(z.string(), z.unknown()).default({}),
  resolutionPayload: z.record(z.string(), z.unknown()).default({})
});

export const auditProvenanceSchema = z.object({
  exportedBy: actorIdentitySchema,
  approvals: z.array(approvalAuditEntrySchema),
  eventActors: z.array(actorIdentitySchema),
  generatedAt: z.date()
});

export const secretIntegrationBoundarySchema = z.object({
  sourceMode: z.enum(["environment", "external_manager"]).default("environment"),
  provider: z.string().min(1).nullable().default(null),
  remoteCredentialEnvNames: z.array(z.string().min(1)).default([]),
  allowedRepositoryTrustLevels: z.array(z.enum(repositoryTrustLevels)).default(["trusted"]),
  sensitivePolicyProfiles: z.array(z.string().min(1)).default([]),
  credentialDistribution: z.array(z.string().min(1)).default([]),
  policyDrivenAccess: z.boolean().default(false)
});

export const governanceAdminReportSchema = z.object({
  generatedAt: z.date(),
  requestedBy: actorIdentitySchema,
  retention: z.object({
    policy: retentionPolicySchema,
    runs: retentionWindowSummarySchema,
    artifacts: retentionWindowSummarySchema,
    events: retentionWindowSummarySchema
  }),
  approvals: z.object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    history: z.array(approvalAuditEntrySchema)
  }),
  policies: z.object({
    repositoryProfiles: z.array(z.object({
      profile: z.string().min(1),
      repositoryCount: z.number().int().nonnegative(),
      runCount: z.number().int().nonnegative()
    })),
    sensitiveRepositories: z.array(z.object({
      repositoryId: z.uuid(),
      repositoryName: z.string().min(1),
      trustLevel: z.enum(repositoryTrustLevels),
      approvalProfile: z.string().min(1)
    }))
  }),
  secrets: secretIntegrationBoundarySchema
});

export const retentionReconcileReportSchema = z.object({
  dryRun: z.boolean(),
  appliedAt: z.date(),
  requestedBy: actorIdentitySchema,
  runsUpdated: z.number().int().nonnegative(),
  artifactsUpdated: z.number().int().nonnegative(),
  eventsUpdated: z.number().int().nonnegative()
});

export const secretAccessPlanSchema = z.object({
  repositoryId: z.uuid(),
  repositoryName: z.string().min(1),
  trustLevel: z.enum(repositoryTrustLevels),
  policyProfile: z.string().min(1),
  access: z.enum(["allowed", "brokered", "denied"]),
  sourceMode: z.enum(["environment", "external_manager"]),
  provider: z.string().min(1).nullable().default(null),
  credentialEnvNames: z.array(z.string().min(1)).default([]),
  distributionBoundary: z.array(z.string().min(1)).default([]),
  reason: z.string().min(1)
});

export const identityEntrypointSchema = identityContextSchema;

export const runDetailSchema = runSchema.extend({
  tasks: z.array(taskSchema),
  agents: z.array(agentSchema),
  sessions: z.array(sessionSchema),
  taskDag: taskDagGraphSchema
});

export const runAuditExportSchema = z.object({
  repository: repositorySchema,
  run: runSchema,
  tasks: z.array(taskSchema),
  agents: z.array(agentSchema),
  sessions: z.array(sessionSchema),
  workerNodes: z.array(workerNodeSchema),
  approvals: z.array(approvalSchema),
  validations: z.array(validationHistoryEntrySchema),
  artifacts: z.array(artifactSchema),
  events: z.array(controlPlaneEventSchema),
  provenance: auditProvenanceSchema,
  retention: z.object({
    policy: retentionPolicySchema,
    runs: retentionWindowSummarySchema,
    artifacts: retentionWindowSummarySchema,
    events: retentionWindowSummarySchema
  }),
  exportedAt: z.date()
});

export const tuiRunTaskCountsSchema = z.object({
  pending: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  awaitingReview: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative()
});

export const tuiRunApprovalCountsSchema = z.object({
  pending: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative()
});

export const tuiRunValidationCountsSchema = z.object({
  pending: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative()
});

export const tuiRunDispatchCountsSchema = z.object({
  queued: z.number().int().nonnegative(),
  claimed: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  retrying: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative()
});

export const tuiOverviewRunSchema = z.object({
  run: runSchema,
  repository: repositorySchema.pick({
    id: true,
    name: true,
    provider: true,
    trustLevel: true,
    approvalProfile: true
  }),
  taskCounts: tuiRunTaskCountsSchema,
  approvalCounts: tuiRunApprovalCountsSchema,
  validationCounts: tuiRunValidationCountsSchema,
  dispatchCounts: tuiRunDispatchCountsSchema,
  activeSessionCount: z.number().int().nonnegative(),
  workerNodeIds: z.array(z.string().min(1)).default([]),
  blockedTaskIds: z.array(z.uuid()).default([]),
  pendingApprovalIds: z.array(z.uuid()).default([]),
  failedValidationIds: z.array(z.uuid()).default([])
});

export const tuiAlertSchema = z.object({
  kind: z.enum([
    "run_awaiting_approval",
    "task_blocked",
    "validation_failed",
    "worker_node_degraded",
    "worker_node_offline",
    "dispatch_retrying",
    "dispatch_failed"
  ]),
  severity: z.enum(["info", "warning", "critical"]),
  runId: z.uuid().nullable().default(null),
  entityId: z.string().min(1).nullable().default(null),
  summary: z.string().min(1)
});

export const tuiOverviewSchema = z.object({
  generatedAt: z.date(),
  summary: z.object({
    repositories: z.number().int().nonnegative(),
    runsTotal: z.number().int().nonnegative(),
    runsActive: z.number().int().nonnegative(),
    approvalsPending: z.number().int().nonnegative(),
    validationsFailed: z.number().int().nonnegative(),
    tasksBlocked: z.number().int().nonnegative(),
    workerNodesOnline: z.number().int().nonnegative(),
    workerNodesDegraded: z.number().int().nonnegative(),
    workerNodesOffline: z.number().int().nonnegative(),
    dispatchQueued: z.number().int().nonnegative(),
    dispatchRetrying: z.number().int().nonnegative()
  }),
  runs: z.array(tuiOverviewRunSchema),
  fleet: z.object({
    workerNodes: z.array(workerNodeSchema),
    dispatchAssignments: z.array(workerDispatchAssignmentSchema)
  }),
  alerts: z.array(tuiAlertSchema)
});

export const tuiRunDrilldownSchema = z.object({
  generatedAt: z.date(),
  repository: repositorySchema,
  run: runDetailSchema,
  approvals: z.array(approvalSchema),
  validations: z.array(validationHistoryEntrySchema),
  artifacts: z.array(artifactSchema),
  workerNodes: z.array(workerNodeSchema),
  dispatchAssignments: z.array(workerDispatchAssignmentSchema),
  events: z.array(controlPlaneEventSchema)
});

export type RepositoryCreateInput = z.infer<typeof repositoryCreateSchema>;
export type RepositoryUpdateInput = z.infer<typeof repositoryUpdateSchema>;
export type RunCreateInput = z.infer<typeof runCreateSchema>;
export type RunUpdateInput = z.infer<typeof runUpdateSchema>;
export type RunStatusUpdateInput = z.infer<typeof runStatusUpdateSchema>;
export type RunBudgetCheckpointInput = z.infer<typeof runBudgetCheckpointSchema>;
export type AgentTeamTemplateMember = z.infer<typeof agentTeamTemplateMemberSchema>;
export type AgentTeamTemplate = z.infer<typeof agentTeamTemplateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskStatusUpdateInput = z.infer<typeof taskStatusUpdateSchema>;
export type AgentCreateInput = z.infer<typeof agentCreateSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type Run = z.infer<typeof runSchema>;
export type RunBudgetState = z.infer<typeof runBudgetStateSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Team = z.infer<typeof teamSchema>;
export type IdentityContext = z.infer<typeof identityContextSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskDagNode = z.infer<typeof taskDagNodeSchema>;
export type TaskDagEdge = z.infer<typeof taskDagEdgeSchema>;
export type TaskDagUnblockPath = z.infer<typeof taskDagUnblockPathSchema>;
export type TaskDagGraph = z.infer<typeof taskDagGraphSchema>;
export type AgentObservability = z.infer<typeof agentObservabilitySchema>;
export type Agent = z.infer<typeof agentSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SessionTranscriptEntry = z.infer<typeof sessionTranscriptEntrySchema>;
export type SessionTranscriptEntryCreateInput = z.infer<typeof sessionTranscriptEntryCreateSchema>;
export type WorkerNode = z.infer<typeof workerNodeSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type ArtifactDiffFileSummary = z.infer<typeof artifactDiffFileSummarySchema>;
export type ArtifactDiffSummary = z.infer<typeof artifactDiffSummarySchema>;
export type ArtifactDetail = z.infer<typeof artifactDetailSchema>;
export type RunDetail = z.infer<typeof runDetailSchema>;
export type RunAuditExport = z.infer<typeof runAuditExportSchema>;
export type TuiOverviewRun = z.infer<typeof tuiOverviewRunSchema>;
export type TuiAlert = z.infer<typeof tuiAlertSchema>;
export type TuiOverview = z.infer<typeof tuiOverviewSchema>;
export type TuiRunDrilldown = z.infer<typeof tuiRunDrilldownSchema>;
export type ApprovalsListQuery = z.infer<typeof approvalsListQuerySchema>;
export type WorkerNodeRegisterInput = z.infer<typeof workerNodeRegisterSchema>;
export type WorkerNodeHeartbeatInput = z.infer<typeof workerNodeHeartbeatSchema>;
export type WorkerNodeDrainUpdateInput = z.infer<typeof workerNodeDrainUpdateSchema>;
export type ApprovalCreateInput = z.infer<typeof approvalCreateSchema>;
export type ApprovalResolveInput = z.infer<typeof approvalResolveSchema>;
export type ArtifactCreateInput = z.infer<typeof artifactCreateSchema>;
export type Validation = z.infer<typeof validationSchema>;
export type ValidationHistoryEntry = z.infer<typeof validationHistoryEntrySchema>;
export type ValidationCreateInput = z.infer<typeof validationCreateSchema>;
export type ValidationsListQuery = z.infer<typeof validationsListQuerySchema>;
export type RunBranchPublishInput = z.infer<typeof runBranchPublishSchema>;
export type RunPullRequestHandoffInput = z.infer<typeof runPullRequestHandoffSchema>;
export type CleanupJobRunInput = z.infer<typeof cleanupJobRunSchema>;
export type CleanupJobItem = z.infer<typeof cleanupJobItemSchema>;
export type CleanupJobReport = z.infer<typeof cleanupJobReportSchema>;
export type EventsListQuery = z.infer<typeof eventsListQuerySchema>;
export type ActorIdentity = z.infer<typeof actorIdentitySchema>;
export type GovernanceRole = typeof governanceRoles[number];
export type GovernedAction = typeof governedActions[number];
export type ControlPlaneEventType = typeof controlPlaneEventTypes[number];
export type ControlPlaneEventEntityType = typeof controlPlaneEventEntityTypes[number];
export type ControlPlaneEvent = z.infer<typeof controlPlaneEventSchema>;
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;
export type RetentionWindowSummary = z.infer<typeof retentionWindowSummarySchema>;
export type ControlPlaneMetrics = z.infer<typeof controlPlaneMetricsSchema>;
export type WorkerDispatchAssignment = z.infer<typeof workerDispatchAssignmentSchema>;
export type WorkerDispatchCreateInput = z.infer<typeof workerDispatchCreateSchema>;
export type WorkerDispatchListQuery = z.infer<typeof workerDispatchListQuerySchema>;
export type WorkerDispatchCompleteInput = z.infer<typeof workerDispatchCompleteSchema>;
export type CodexMcpTransport = z.infer<typeof codexMcpTransportSchema>;
export type WorkerNodeRuntime = z.infer<typeof workerNodeRuntimeSchema>;
export type WorkerRuntimeDependencyCheck = z.infer<typeof workerRuntimeDependencyCheckSchema>;
export type RemoteWorkerBootstrap = z.infer<typeof remoteWorkerBootstrapSchema>;
export type WorkerDrainCommand = z.infer<typeof workerDrainCommandSchema>;
export type WorkerDrainStatus = z.infer<typeof workerDrainStatusSchema>;
export type WorkerNodeReconcileInput = z.infer<typeof workerNodeReconcileSchema>;
export type WorkerNodeReconcileReport = z.infer<typeof workerNodeReconcileReportSchema>;
export type ApprovalAuditEntry = z.infer<typeof approvalAuditEntrySchema>;
export type AuditProvenance = z.infer<typeof auditProvenanceSchema>;
export type SecretIntegrationBoundary = z.infer<typeof secretIntegrationBoundarySchema>;
export type GovernanceAdminReport = z.infer<typeof governanceAdminReportSchema>;
export type RetentionReconcileReport = z.infer<typeof retentionReconcileReportSchema>;
export type SecretAccessPlan = z.infer<typeof secretAccessPlanSchema>;
export type IdentityEntrypoint = z.infer<typeof identityEntrypointSchema>;
