import type { FastifyPluginAsync } from "fastify";

import {
  idParamSchema,
  sessionTranscriptAppendSchema,
} from "../http/schemas.js";

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/sessions/:id/transcript", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return app.controlPlane.listSessionTranscript(id, request.authContext);
  });

  app.post("/sessions/:id/transcript", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const input = sessionTranscriptAppendSchema.parse(request.body);
    const transcript = await app.controlPlane.appendSessionTranscript(
      id,
      input.entries,
      request.authContext,
    );
    return reply.code(201).send(transcript);
  });
};
