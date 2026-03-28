import type { FastifyPluginAsync } from "fastify";

import { agentCreateSchema } from "../http/schemas.js";

export const agentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/agents", async (request) => {
    const runId = typeof request.query === "object" && request.query && "runId" in request.query
      ? String(request.query.runId)
      : undefined;

    return app.controlPlane.listAgents(runId);
  });

  app.post("/agents", async (request, reply) => {
    const input = agentCreateSchema.parse(request.body);
    const agent = await app.controlPlane.createAgent(input);
    return reply.code(201).send(agent);
  });
};
