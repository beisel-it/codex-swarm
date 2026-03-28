import type { FastifyPluginAsync } from "fastify";

import { idParamSchema, runCreateSchema, runStatusUpdateSchema } from "../http/schemas.js";
import { isRecoverableDatabaseError } from "../lib/database-fallback.js";
import { requireValue } from "../lib/require-value.js";

export const runRoutes: FastifyPluginAsync = async (app) => {
  app.get("/runs", async (request) => {
    const repositoryId = typeof request.query === "object" && request.query && "repositoryId" in request.query
      ? String(request.query.repositoryId)
      : undefined;

    try {
      return await app.controlPlane.listRuns(repositoryId);
    } catch (error) {
      if (app.config.NODE_ENV !== "production" && isRecoverableDatabaseError(error)) {
        app.observability.recordRecoverableDatabaseFallback("runs.list", error);
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
    return app.observability.withTrace("api.runs.create", async () => {
      const input = runCreateSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.createRun(input, request.authContext.principal),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent({
        runId: run.id,
        eventType: "run.created",
        entityType: "run",
        entityId: run.id,
        status: run.status,
        summary: `Run created for repository ${run.repositoryId}`
      });

      return reply.code(201).send(run);
    }, { route: "runs.create" });
  });

  app.patch("/runs/:id/status", async (request) => {
    return app.observability.withTrace("api.runs.update-status", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runStatusUpdateSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.updateRunStatus(id, input),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent({
        runId: run.id,
        eventType: "run.status_updated",
        entityType: "run",
        entityId: run.id,
        status: run.status,
        summary: `Run status updated to ${run.status}`
      });

      return run;
    }, { route: "runs.update-status" });
  });
};
