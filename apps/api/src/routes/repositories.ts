import type { FastifyPluginAsync } from "fastify";

import { repositoryCreateSchema } from "../http/schemas.js";
import { isRecoverableDatabaseError } from "../lib/database-fallback.js";

export const repositoryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/repositories", async (_request, reply) => {
    try {
      return await app.controlPlane.listRepositories();
    } catch (error) {
      if (app.config.NODE_ENV !== "production" && isRecoverableDatabaseError(error)) {
        reply.header("x-codex-swarm-degraded", "database-unavailable");
        return [];
      }

      throw error;
    }
  });

  app.post("/repositories", async (request, reply) => {
    const input = repositoryCreateSchema.parse(request.body);
    const repository = await app.controlPlane.createRepository(input);
    return reply.code(201).send(repository);
  });
};
