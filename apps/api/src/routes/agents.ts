import type { FastifyPluginAsync } from "fastify";

import {
  agentCreateSchema,
  agentSessionCreateSchema,
  idParamSchema
} from "../http/schemas.js";
import { controlPlaneEvents, timelineEvent } from "../lib/control-plane-events.js";
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

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.agentCreated, {
        runId: agent.runId,
        taskId: agent.currentTaskId,
        agentId: agent.id,
        entityId: agent.id,
        status: agent.status,
        summary: `Agent ${agent.name} created`
      }));

      return reply.code(201).send(agent);
    }, { route: "agents.create" });
  });

  app.post("/agents/:id/session", async (request, reply) => {
    return app.observability.withTrace("api.agents.create-session", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = agentSessionCreateSchema.parse(request.body);
      const session = requireValue(
        await app.controlPlane.createAgentSession(id, input, request.authContext),
        "control plane returned no session"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.agentCreated, {
        agentId: id,
        entityId: session.id,
        status: session.state,
        summary: `Session ${session.id} created for agent ${id}`
      }));

      return reply.code(201).send(session);
    }, { route: "agents.create-session" });
  });
};
