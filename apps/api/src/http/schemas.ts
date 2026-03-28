import { z } from "zod";
import {
  agentCreateSchema,
  approvalCreateSchema as contractApprovalCreateSchema,
  approvalResolveSchema as contractApprovalResolveSchema,
  artifactCreateSchema as contractArtifactCreateSchema,
  approvalsListQuerySchema,
  eventsListQuerySchema,
  idParamSchema,
  repositoryCreateSchema,
  runCreateSchema,
  runStatusUpdateSchema,
  taskCreateSchema,
  taskStatusUpdateSchema,
  validationCreateSchema as contractValidationCreateSchema,
  validationsListQuerySchema
} from "@codex-swarm/contracts";

import { messageKinds } from "../domain/types.js";

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

export const approvalCreateSchema = contractApprovalCreateSchema;
export const approvalResolveSchema = contractApprovalResolveSchema;
export const validationCreateSchema = contractValidationCreateSchema;
export const artifactCreateSchema = contractArtifactCreateSchema;
export {
  agentCreateSchema,
  approvalsListQuerySchema,
  eventsListQuerySchema,
  idParamSchema,
  repositoryCreateSchema,
  runCreateSchema,
  runStatusUpdateSchema,
  taskCreateSchema,
  taskStatusUpdateSchema,
  validationsListQuerySchema
};
