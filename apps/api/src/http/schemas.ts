import { z } from "zod";
import {
  agentCreateSchema,
  approvalCreateSchema as contractApprovalCreateSchema,
  approvalResolveSchema as contractApprovalResolveSchema,
  artifactCreateSchema as contractArtifactCreateSchema,
  cleanupJobRunSchema,
  approvalsListQuerySchema,
  eventsListQuerySchema,
  idParamSchema,
  runBudgetCheckpointSchema,
  repositoryCreateSchema,
  runBranchPublishSchema,
  runCreateSchema,
  runPullRequestHandoffSchema,
  runStatusUpdateSchema,
  sessionTranscriptAppendSchema as contractSessionTranscriptAppendSchema,
  sessionTranscriptEntryCreateSchema as contractSessionTranscriptEntrySchema,
  taskCreateSchema,
  taskStatusUpdateSchema,
  validationCreateSchema as contractValidationCreateSchema,
  validationsListQuerySchema,
  workerDispatchCompleteSchema,
  workerDispatchCreateSchema,
  workerDispatchListQuerySchema,
  workerNodeDrainUpdateSchema,
  workerNodeHeartbeatSchema,
  workerNodeReconcileSchema,
  workerNodeRegisterSchema
} from "@codex-swarm/contracts";

import { messageKinds } from "../domain/types.js";

const idSchema = z.uuid();
const policyExceptionCreatePayloadSchema = z.object({
  summary: z.string().min(1),
  policyDecision: z.object({
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
  }),
  enforcement: z.object({
    onApproval: z.enum(["continue_run"]),
    onRejection: z.enum(["remain_blocked"])
  })
});

export const messageCreateSchema = z.object({
  runId: idSchema,
  senderAgentId: idSchema.optional(),
  recipientAgentId: idSchema.optional(),
  kind: z.enum(messageKinds).default("direct"),
  body: z.string().min(1)
}).superRefine((value, ctx) => {
  if (value.kind === "direct" && !value.recipientAgentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recipientAgentId"],
      message: "direct messages require a recipientAgentId"
    });
  }
});

export const approvalCreateSchema = contractApprovalCreateSchema.superRefine((value, ctx) => {
  if (value.kind !== "policy_exception") {
    return;
  }

  const parsedPayload = policyExceptionCreatePayloadSchema.safeParse(value.requestedPayload);

  if (!parsedPayload.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requestedPayload"],
      message: "policy_exception approvals require a structured policy decision payload"
    });
    return;
  }

  if (parsedPayload.data.policyDecision.targetId !== value.runId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requestedPayload", "policyDecision", "targetId"],
      message: "policy_exception targetId must match runId"
    });
  }
});
export const approvalResolveSchema = contractApprovalResolveSchema;
export const validationCreateSchema = contractValidationCreateSchema;
export const artifactCreateSchema = contractArtifactCreateSchema;
export const agentSessionCreateSchema = z.object({
  threadId: z.string().min(1),
  cwd: z.string().min(1),
  sandbox: z.string().min(1),
  approvalPolicy: z.string().min(1),
  includePlanTool: z.boolean().default(false),
  workerNodeId: z.uuid().optional(),
  placementConstraintLabels: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});
export const workerDispatchSessionAttachSchema = z.object({
  sessionId: z.uuid()
});
export const sessionTranscriptEntrySchema = contractSessionTranscriptEntrySchema;
export const sessionTranscriptAppendSchema = contractSessionTranscriptAppendSchema;
export {
  agentCreateSchema,
  approvalsListQuerySchema,
  cleanupJobRunSchema,
  eventsListQuerySchema,
  idParamSchema,
  runBudgetCheckpointSchema,
  repositoryCreateSchema,
  runBranchPublishSchema,
  runCreateSchema,
  runPullRequestHandoffSchema,
  runStatusUpdateSchema,
  taskCreateSchema,
  taskStatusUpdateSchema,
  validationsListQuerySchema,
  workerDispatchCompleteSchema,
  workerDispatchCreateSchema,
  workerDispatchListQuerySchema,
  workerNodeDrainUpdateSchema,
  workerNodeHeartbeatSchema,
  workerNodeReconcileSchema,
  workerNodeRegisterSchema
};
