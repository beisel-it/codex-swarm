import { z } from "zod";
import {
  agentCreateSchema,
  idParamSchema,
  repositoryCreateSchema,
  runCreateSchema,
  runStatusUpdateSchema,
  taskCreateSchema,
  taskStatusUpdateSchema
} from "@codex-swarm/contracts";

import {
  agentStatuses,
  approvalStatuses,
  artifactKinds,
  messageKinds,
  runStatuses,
  taskStatuses,
  validationStatuses
} from "../domain/types.js";

const idSchema = z.uuid();

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

export const approvalCreateSchema = z.object({
  runId: idSchema,
  taskId: idSchema.optional(),
  kind: z.string().min(1),
  requestedBy: z.string().min(1),
  reviewer: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
  status: z.enum(approvalStatuses).default("pending")
});

export const approvalUpdateSchema = z.object({
  status: z.enum(approvalStatuses),
  reviewer: z.string().min(1).optional(),
  notes: z.string().min(1).optional()
});

export const validationCreateSchema = z.object({
  runId: idSchema,
  taskId: idSchema.optional(),
  name: z.string().min(1),
  status: z.enum(validationStatuses).default("pending"),
  command: z.string().min(1),
  summary: z.string().min(1).optional(),
  artifactPath: z.string().min(1).optional()
});

export const artifactCreateSchema = z.object({
  runId: idSchema,
  taskId: idSchema.optional(),
  kind: z.enum(artifactKinds),
  path: z.string().min(1),
  contentType: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});
export {
  agentCreateSchema,
  idParamSchema,
  repositoryCreateSchema,
  runCreateSchema,
  runStatusUpdateSchema,
  taskCreateSchema,
  taskStatusUpdateSchema
};
