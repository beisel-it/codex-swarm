import type { FastifyPluginAsync } from "fastify";

import { repositoryCreateSchema } from "../http/schemas.js";
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
};
