import type { FastifyPluginAsync } from "fastify";

import { agentCreateSchema } from "../http/schemas.js";
import { requireValue } from "../lib/require-value.js";

export const agentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/agents", async (request) => {
    const runId = typeof request.query === "object" && request.query && "runId" in request.query
      ? String(request.query.runId)
      : undefined;

    return app.controlPlane.listAgents(runId, request.authContext);
  });

  app.post("/agents", async (request, reply) => {
    return app.observability.withTrace("api.agents.create", async () => {
      const input = agentCreateSchema.parse(request.body);
      const agent = requireValue(
        await app.controlPlane.createAgent(input, request.authContext),
        "control plane returned no agent"
      );

      await app.observability.recordTimelineEvent({
        runId: agent.runId,
        taskId: agent.currentTaskId,
        agentId: agent.id,
        eventType: "agent.created",
        entityType: "agent",
        entityId: agent.id,
        status: agent.status,
        summary: `Agent ${agent.name} created`
      });

      return reply.code(201).send(agent);
    }, { route: "agents.create" });
  });
};
