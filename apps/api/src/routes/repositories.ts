import type { FastifyPluginAsync } from "fastify";

import { idParamSchema, repositoryCreateSchema, repositoryUpdateSchema } from "../http/schemas.js";
import { controlPlaneEvents, timelineEvent } from "../lib/control-plane-events.js";
import { isRecoverableDatabaseError } from "../lib/database-fallback.js";
import { requireValue } from "../lib/require-value.js";

export const repositoryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/repositories", async (_request, reply) => {
    try {
      return await app.controlPlane.listRepositories(_request.authContext);
    } catch (error) {
      if (app.config.NODE_ENV !== "production" && isRecoverableDatabaseError(error)) {
        app.observability.recordRecoverableDatabaseFallback("repositories.list", error);
        reply.header("x-codex-swarm-degraded", "database-unavailable");
        return [];
      }

      throw error;
    }
  });

  app.post("/repositories", async (request, reply) => {
    return app.observability.withTrace("api.repositories.create", async () => {
      const input = repositoryCreateSchema.parse(request.body);
      const repository = requireValue(
        await app.controlPlane.createRepository(input, request.authContext),
        "control plane returned no repository"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.repositoryCreated, {
        entityId: repository.id,
        status: "completed",
        summary: `Repository ${repository.name} created`
      }));

      return reply.code(201).send(repository);
    }, { route: "repositories.create" });
  });

  app.patch("/repositories/:id", async (request) => {
    return app.observability.withTrace("api.repositories.update", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = repositoryUpdateSchema.parse(request.body);
      return app.controlPlane.updateRepository(id, input, request.authContext);
    }, { route: "repositories.update" });
  });

  app.delete("/repositories/:id", async (request, reply) => {
    return app.observability.withTrace("api.repositories.delete", async () => {
      const { id } = idParamSchema.parse(request.params);
      await app.controlPlane.deleteRepository(id, request.authContext);
      return reply.code(204).send();
    }, { route: "repositories.delete" });
  });
};
