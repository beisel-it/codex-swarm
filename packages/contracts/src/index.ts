import { z } from "zod";

export const runStatuses = ["pending", "planning", "in_progress", "awaiting_approval", "completed", "failed", "cancelled"] as const;
export const taskStatuses = ["pending", "blocked", "in_progress", "awaiting_review", "completed", "failed", "cancelled"] as const;
export const agentStatuses = ["provisioning", "idle", "busy", "paused", "stopped", "failed"] as const;
export const approvalStatuses = ["pending", "approved", "rejected"] as const;
export const approvalKinds = ["plan", "patch", "merge", "network", "policy_exception"] as const;
export const artifactKinds = ["plan", "patch", "log", "report", "diff", "screenshot", "other"] as const;
export const validationStatuses = ["pending", "passed", "failed"] as const;
export const messageKinds = ["direct", "broadcast", "system"] as const;

export const repositoryCreateSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  defaultBranch: z.string().min(1).default("main"),
  localPath: z.string().min(1).optional()
});

export const runCreateSchema = z.object({
  repositoryId: z.uuid(),
  goal: z.string().min(1),
  branchName: z.string().min(1).optional(),
  planArtifactPath: z.string().min(1).optional(),
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
    metadata: z.record(z.string(), z.unknown()).default({})
  }).optional()
});

export const idParamSchema = z.object({
  id: z.uuid()
});

export const repositorySchema = repositoryCreateSchema.extend({
  id: z.uuid(),
  localPath: z.string().min(1).nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const runSchema = runCreateSchema.extend({
  id: z.uuid(),
  status: z.enum(runStatuses),
  branchName: z.string().min(1).nullable(),
  planArtifactPath: z.string().min(1).nullable(),
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
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date()
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

export const runDetailSchema = runSchema.extend({
  tasks: z.array(taskSchema),
  agents: z.array(agentSchema),
  sessions: z.array(sessionSchema)
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
export type Approval = z.infer<typeof approvalSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type RunDetail = z.infer<typeof runDetailSchema>;
export type ApprovalsListQuery = z.infer<typeof approvalsListQuerySchema>;
export type ApprovalCreateInput = z.infer<typeof approvalCreateSchema>;
export type ApprovalResolveInput = z.infer<typeof approvalResolveSchema>;
export type ArtifactCreateInput = z.infer<typeof artifactCreateSchema>;
export type Validation = z.infer<typeof validationSchema>;
export type ValidationHistoryEntry = z.infer<typeof validationHistoryEntrySchema>;
export type ValidationCreateInput = z.infer<typeof validationCreateSchema>;
export type ValidationsListQuery = z.infer<typeof validationsListQuerySchema>;
export type EventsListQuery = z.infer<typeof eventsListQuerySchema>;
export type ControlPlaneEvent = z.infer<typeof controlPlaneEventSchema>;
export type ControlPlaneMetrics = z.infer<typeof controlPlaneMetricsSchema>;
