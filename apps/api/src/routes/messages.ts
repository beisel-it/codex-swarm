import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { messageCreateSchema } from "../http/schemas.js";
import { controlPlaneEvents, timelineEvent } from "../lib/control-plane-events.js";
import { requireValue } from "../lib/require-value.js";

const querySchema = z.object({
  runId: z.uuid()
});

export const messageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/messages", async (request) => {
    const { runId } = querySchema.parse(request.query);
    return app.controlPlane.listMessages(runId, request.authContext);
  });

  app.post("/messages", async (request, reply) => {
    return app.observability.withTrace("api.messages.create", async () => {
      const input = messageCreateSchema.parse(request.body);
      const message = requireValue(
        await app.controlPlane.createMessage(input, request.authContext),
        "control plane returned no message"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.messageCreated, {
        runId: message.runId,
        entityId: message.id,
        status: message.kind,
        summary: `Message ${message.kind} created`,
        metadata: {
          senderAgentId: message.senderAgentId,
          recipientAgentId: message.recipientAgentId
        }
      }));

      return reply.code(201).send(message);
    }, { route: "messages.create" });
  });
};
