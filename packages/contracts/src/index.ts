import { z } from "zod";

export const runStatuses = ["pending", "planning", "in_progress", "awaiting_approval", "completed", "failed", "cancelled"] as const;
export const taskStatuses = ["pending", "blocked", "in_progress", "awaiting_review", "completed", "failed", "cancelled"] as const;
export const agentStatuses = ["provisioning", "idle", "busy", "paused", "stopped", "failed"] as const;
export const approvalStatuses = ["pending", "approved", "rejected"] as const;
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
  kind: z.string().min(1),
  status: z.enum(approvalStatuses),
  requestedBy: z.string().min(1),
  reviewer: z.string().min(1).nullable(),
  notes: z.string().min(1).nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const approvalsListQuerySchema = z.object({
  runId: z.uuid().optional()
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
export type RunDetail = z.infer<typeof runDetailSchema>;
export type ApprovalsListQuery = z.infer<typeof approvalsListQuerySchema>;
