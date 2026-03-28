import type { FastifyPluginAsync } from "fastify";

import { idParamSchema, runCreateSchema, runStatusUpdateSchema } from "../http/schemas.js";
import { isRecoverableDatabaseError } from "../lib/database-fallback.js";

export const runRoutes: FastifyPluginAsync = async (app) => {
  app.get("/runs", async (request) => {
    const repositoryId = typeof request.query === "object" && request.query && "repositoryId" in request.query
      ? String(request.query.repositoryId)
      : undefined;

    try {
      return await app.controlPlane.listRuns(repositoryId);
    } catch (error) {
      if (app.config.NODE_ENV !== "production" && isRecoverableDatabaseError(error)) {
        return [];
      }

      throw error;
    }
  });

  app.get("/runs/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return app.controlPlane.getRun(id);
  });

  app.post("/runs", async (request, reply) => {
    const input = runCreateSchema.parse(request.body);
    const run = await app.controlPlane.createRun(input, request.authContext.principal);
    return reply.code(201).send(run);
  });

  app.patch("/runs/:id/status", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = runStatusUpdateSchema.parse(request.body);
    return app.controlPlane.updateRunStatus(id, input);
  });
};
