import { z } from "zod";

export const runStatuses = ["pending", "planning", "in_progress", "awaiting_approval", "completed", "failed", "cancelled"] as const;
export const taskStatuses = ["pending", "blocked", "in_progress", "awaiting_review", "completed", "failed", "cancelled"] as const;
export const agentStatuses = ["provisioning", "idle", "busy", "paused", "stopped", "failed"] as const;

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

export type RepositoryCreateInput = z.infer<typeof repositoryCreateSchema>;
export type RunCreateInput = z.infer<typeof runCreateSchema>;
export type RunStatusUpdateInput = z.infer<typeof runStatusUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskStatusUpdateInput = z.infer<typeof taskStatusUpdateSchema>;
export type AgentCreateInput = z.infer<typeof agentCreateSchema>;
