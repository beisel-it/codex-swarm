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
export const workerNodeStates = ["active", "draining", "drained", "offline"] as const;
export const workerDispatchStates = ["queued", "claimed", "completed", "retrying", "failed"] as const;
export const workerNodeStatuses = ["online", "degraded", "offline"] as const;
export const workerNodeDrainStates = ["active", "draining", "drained"] as const;

export const repositoryCreateSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  provider: z.enum(repositoryProviders).optional(),
  defaultBranch: z.string().min(1).default("main"),
  localPath: z.string().min(1).optional(),
  trustLevel: z.enum(repositoryTrustLevels).default("trusted"),
  approvalProfile: z.string().min(1).default("standard")
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

export const runStatusUpdateSchema = z.object({
  status: z.enum(runStatuses),
  planArtifactPath: z.string().min(1).optional()
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
  acceptanceCriteria: z.array(z.string().min(1)).default([])
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
  provider: z.enum(repositoryProviders),
  localPath: z.string().min(1).nullable(),
  trustLevel: z.enum(repositoryTrustLevels),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const runSchema = runCreateSchema.extend({
  id: z.uuid(),
  status: z.enum(runStatuses),
  branchName: z.string().min(1).nullable(),
  planArtifactPath: z.string().min(1).nullable(),
  budgetTokens: z.number().int().positive().nullable(),
  budgetCostUsd: z.number().nonnegative().nullable(),
  concurrencyCap: z.number().int().positive(),
  policyProfile: z.string().min(1).nullable(),
  publishedBranch: z.string().min(1).nullable(),
  branchPublishedAt: z.date().nullable(),
  pullRequestUrl: z.string().url().nullable(),
  pullRequestNumber: z.number().int().positive().nullable(),
  pullRequestStatus: z.enum(pullRequestStatuses).nullable(),
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

export const agentSchema = agentCreateSchema.omit({ session: true }).extend({
  id: z.uuid(),
  worktreePath: z.string().min(1).nullable(),
  branchName: z.string().min(1).nullable(),
  currentTaskId: z.uuid().nullable(),
  lastHeartbeatAt: z.date().nullable(),
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
  state: z.enum(workerSessionStates),
  staleReason: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date()
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
  taskId: z.uuid().nullable(),
  kind: z.enum(approvalKinds),
  status: z.enum(approvalStatuses),
  requestedPayload: z.record(z.string(), z.unknown()),
  resolutionPayload: z.record(z.string(), z.unknown()),
  requestedBy: z.string().min(1),
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
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date()
});

export const artifactCreateSchema = z.object({
  runId: z.uuid(),
  taskId: z.uuid().optional(),
  kind: z.enum(artifactKinds),
  path: z.string().min(1),
  contentType: z.string().min(1),
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
  name: z.string().min(1),
  status: z.enum(validationStatuses).default("pending"),
  command: z.string().min(1),
  summary: z.string().min(1).optional(),
  artifactPath: z.string().min(1).optional(),
  artifactIds: z.array(z.uuid()).default([])
});

export const validationsListQuerySchema = z.object({
  runId: z.uuid(),
  taskId: z.uuid().optional()
});

export const eventsListQuerySchema = z.object({
  runId: z.uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100)
});

export const controlPlaneEventSchema = z.object({
  id: z.uuid(),
  runId: z.uuid().nullable(),
  taskId: z.string().nullable(),
  agentId: z.string().nullable(),
  traceId: z.string().min(1),
  eventType: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  status: z.string().min(1),
  summary: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date()
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
  eventsRecorded: z.number().int().nonnegative(),
  recordedAt: z.date()
});

export const approvalCreateSchema = z.object({
  runId: z.uuid(),
  taskId: z.uuid().optional(),
  kind: z.enum(approvalKinds),
  requestedBy: z.string().min(1),
  requestedPayload: z.record(z.string(), z.unknown()).default({})
});

export const approvalResolveSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  resolver: z.string().min(1),
  feedback: z.string().min(1).optional(),
  resolutionPayload: z.record(z.string(), z.unknown()).default({})
});

export const runBranchPublishSchema = z.object({
  branchName: z.string().min(1).optional(),
  publishedBy: z.string().min(1),
  remoteName: z.string().min(1).default("origin"),
  commitSha: z.string().min(1).optional(),
  notes: z.string().min(1).optional()
});

export const runPullRequestHandoffSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  createdBy: z.string().min(1),
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
  existingWorktreePaths: z.array(z.string().min(1)).default([])
});

export const cleanupJobItemSchema = z.object({
  sessionId: z.uuid(),
  runId: z.uuid(),
  agentId: z.uuid(),
  worktreePath: z.string().min(1),
  action: z.enum(["resume", "retry", "mark_stale", "archive"]),
  reason: z.enum(["resume_session", "retry_pending_session", "missing_thread", "missing_worktree", "heartbeat_timeout", "terminal_state"])
});

export const cleanupJobReportSchema = z.object({
  scannedSessions: z.number().int().nonnegative(),
  resumed: z.number().int().nonnegative(),
  retried: z.number().int().nonnegative(),
  markedStale: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
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

export const workerNodeRuntimeSchema = z.object({
  nodeId: z.string().min(1),
  nodeName: z.string().min(1),
  state: z.enum(workerNodeStates),
  workspaceRoot: z.string().min(1),
  codexCommand: z.array(z.string().min(1)).min(1),
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

export const runDetailSchema = runSchema.extend({
  tasks: z.array(taskSchema),
  agents: z.array(agentSchema),
  sessions: z.array(sessionSchema)
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
  exportedAt: z.date()
});

export type RepositoryCreateInput = z.infer<typeof repositoryCreateSchema>;
export type RunCreateInput = z.infer<typeof runCreateSchema>;
export type RunStatusUpdateInput = z.infer<typeof runStatusUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskStatusUpdateInput = z.infer<typeof taskStatusUpdateSchema>;
export type AgentCreateInput = z.infer<typeof agentCreateSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type Run = z.infer<typeof runSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type WorkerNode = z.infer<typeof workerNodeSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type RunDetail = z.infer<typeof runDetailSchema>;
export type RunAuditExport = z.infer<typeof runAuditExportSchema>;
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
export type ControlPlaneEvent = z.infer<typeof controlPlaneEventSchema>;
export type ControlPlaneMetrics = z.infer<typeof controlPlaneMetricsSchema>;
export type WorkerDispatchAssignment = z.infer<typeof workerDispatchAssignmentSchema>;
export type WorkerNodeRuntime = z.infer<typeof workerNodeRuntimeSchema>;
export type WorkerRuntimeDependencyCheck = z.infer<typeof workerRuntimeDependencyCheckSchema>;
export type RemoteWorkerBootstrap = z.infer<typeof remoteWorkerBootstrapSchema>;
export type WorkerDrainCommand = z.infer<typeof workerDrainCommandSchema>;
export type WorkerDrainStatus = z.infer<typeof workerDrainStatusSchema>;
