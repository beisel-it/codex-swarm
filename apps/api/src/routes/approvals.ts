import type { FastifyPluginAsync } from "fastify";

import { approvalCreateSchema, approvalUpdateSchema, approvalsListQuerySchema, idParamSchema } from "../http/schemas.js";

export const approvalRoutes: FastifyPluginAsync = async (app) => {
  app.get("/approvals", async (request) => {
    const { runId } = approvalsListQuerySchema.parse(request.query);
    return app.controlPlane.listApprovals(runId);
  });

  app.post("/approvals", async (request, reply) => {
    const input = approvalCreateSchema.parse(request.body);
    const approval = await app.controlPlane.createApproval(input);
    return reply.code(201).send(approval);
  });

  app.patch("/approvals/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = approvalUpdateSchema.parse(request.body);
    return app.controlPlane.updateApproval(id, input);
  });
};
