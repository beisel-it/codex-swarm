import type { FastifyPluginAsync } from "fastify";

import { repositoryCreateSchema } from "../http/schemas.js";

export const repositoryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/repositories", async () => app.controlPlane.listRepositories());

  app.post("/repositories", async (request, reply) => {
    const input = repositoryCreateSchema.parse(request.body);
    const repository = await app.controlPlane.createRepository(input);
    return reply.code(201).send(repository);
  });
};
