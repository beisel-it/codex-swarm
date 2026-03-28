import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { artifactCreateSchema } from "../http/schemas.js";
import { requireValue } from "../lib/require-value.js";

const querySchema = z.object({
  runId: z.uuid()
});

export const artifactRoutes: FastifyPluginAsync = async (app) => {
  app.get("/artifacts", async (request) => {
    const { runId } = querySchema.parse(request.query);
    return app.controlPlane.listArtifacts(runId);
  });

  app.post("/artifacts", async (request, reply) => {
    return app.observability.withTrace("api.artifacts.create", async () => {
      const input = artifactCreateSchema.parse(request.body);
      const artifact = requireValue(
        await app.controlPlane.createArtifact(input),
        "control plane returned no artifact"
      );

      await app.observability.recordTimelineEvent({
        runId: artifact.runId,
        taskId: artifact.taskId,
        eventType: "artifact.created",
        entityType: "artifact",
        entityId: artifact.id,
        status: artifact.kind,
        summary: `Artifact ${artifact.kind} published`
      });

      return reply.code(201).send(artifact);
    }, { route: "artifacts.create" });
  });
};
