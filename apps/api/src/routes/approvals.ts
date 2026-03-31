import type { FastifyPluginAsync } from "fastify";

import {
  approvalCreateSchema,
  approvalResolveSchema,
  approvalsListQuerySchema,
  idParamSchema,
} from "../http/schemas.js";
import { requireAuthorizedAction } from "../lib/authorization.js";
import {
  controlPlaneEvents,
  timelineEvent,
} from "../lib/control-plane-events.js";
import { requireValue } from "../lib/require-value.js";

export const approvalRoutes: FastifyPluginAsync = async (app) => {
  app.get("/approvals", async (request) => {
    const { runId } = approvalsListQuerySchema.parse(request.query);
    return app.controlPlane.listApprovals(runId, request.authContext);
  });

  app.get("/approvals/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return app.controlPlane.getApproval(id, request.authContext);
  });

  app.post("/approvals", async (request, reply) => {
    return app.observability.withTrace(
      "api.approvals.create",
      async () => {
        requireAuthorizedAction(request.authContext, "approval.request");
        const parsed = approvalCreateSchema.parse(request.body);
        const input = {
          ...parsed,
          requestedBy: request.authContext.principal,
        };
        const approval = requireValue(
          await app.controlPlane.createApproval(input, request.authContext),
          "control plane returned no approval",
        );

        await app.observability.recordTimelineEvent(
          timelineEvent(controlPlaneEvents.approvalCreated, {
            runId: approval.runId,
            taskId: approval.taskId,
            entityId: approval.id,
            status: approval.status,
            summary: `Approval ${approval.kind} requested`,
          }),
        );

        return reply.code(201).send(approval);
      },
      { route: "approvals.create" },
    );
  });

  app.patch("/approvals/:id", async (request) => {
    return app.observability.withTrace(
      "api.approvals.resolve",
      async () => {
        const { id } = idParamSchema.parse(request.params);
        requireAuthorizedAction(request.authContext, "approval.resolve");
        const parsed = approvalResolveSchema.parse(request.body);
        const input = {
          ...parsed,
          resolver: request.authContext.principal,
        };
        const approval = requireValue(
          await app.controlPlane.resolveApproval(
            id,
            input,
            request.authContext,
          ),
          "control plane returned no approval",
        );

        await app.observability.recordTimelineEvent(
          timelineEvent(controlPlaneEvents.approvalResolved, {
            runId: approval.runId,
            taskId: approval.taskId,
            entityId: approval.id,
            status: approval.status,
            summary: `Approval resolved as ${approval.status}`,
          }),
        );

        return approval;
      },
      { route: "approvals.resolve" },
    );
  });
};
