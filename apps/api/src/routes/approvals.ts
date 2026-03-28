import type { FastifyPluginAsync } from "fastify";

import { approvalCreateSchema, approvalResolveSchema, approvalsListQuerySchema, idParamSchema } from "../http/schemas.js";
import { requireValue } from "../lib/require-value.js";

export const approvalRoutes: FastifyPluginAsync = async (app) => {
  app.get("/approvals", async (request) => {
    const { runId } = approvalsListQuerySchema.parse(request.query);
    return app.controlPlane.listApprovals(runId);
  });

  app.get("/approvals/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return app.controlPlane.getApproval(id);
  });

  app.post("/approvals", async (request, reply) => {
    return app.observability.withTrace("api.approvals.create", async () => {
      const input = approvalCreateSchema.parse(request.body);
      const approval = requireValue(
        await app.controlPlane.createApproval(input),
        "control plane returned no approval"
      );

      await app.observability.recordTimelineEvent({
        runId: approval.runId,
        taskId: approval.taskId,
        eventType: "approval.created",
        entityType: "approval",
        entityId: approval.id,
        status: approval.status,
        summary: `Approval ${approval.kind} requested`
      });

      return reply.code(201).send(approval);
    }, { route: "approvals.create" });
  });

  app.patch("/approvals/:id", async (request) => {
    return app.observability.withTrace("api.approvals.resolve", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = approvalResolveSchema.parse(request.body);
      const approval = requireValue(
        await app.controlPlane.resolveApproval(id, input),
        "control plane returned no approval"
      );

      await app.observability.recordTimelineEvent({
        runId: approval.runId,
        taskId: approval.taskId,
        eventType: "approval.resolved",
        entityType: "approval",
        entityId: approval.id,
        status: approval.status,
        summary: `Approval resolved as ${approval.status}`
      });

      return approval;
    }, { route: "approvals.resolve" });
  });
};
