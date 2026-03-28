import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { messageCreateSchema } from "../http/schemas.js";

const querySchema = z.object({
  runId: z.uuid()
});

export const messageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/messages", async (request) => {
    const { runId } = querySchema.parse(request.query);
    return app.controlPlane.listMessages(runId);
  });

  app.post("/messages", async (request, reply) => {
    const input = messageCreateSchema.parse(request.body);
    const message = await app.controlPlane.createMessage(input);
    return reply.code(201).send(message);
  });
};
