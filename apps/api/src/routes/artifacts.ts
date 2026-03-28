import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { artifactCreateSchema } from "../http/schemas.js";

const querySchema = z.object({
  runId: z.uuid()
});

export const artifactRoutes: FastifyPluginAsync = async (app) => {
  app.get("/artifacts", async (request) => {
    const { runId } = querySchema.parse(request.query);
    return app.controlPlane.listArtifacts(runId);
  });

  app.post("/artifacts", async (request, reply) => {
    const input = artifactCreateSchema.parse(request.body);
    const artifact = await app.controlPlane.createArtifact(input);
    return reply.code(201).send(artifact);
  });
};
