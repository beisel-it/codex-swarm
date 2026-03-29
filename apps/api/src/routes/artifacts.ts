import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { artifactCreateSchema } from "../http/schemas.js";
import { controlPlaneEvents, timelineEvent } from "../lib/control-plane-events.js";
import { requireValue } from "../lib/require-value.js";

const querySchema = z.object({
  runId: z.uuid()
});

export const artifactRoutes: FastifyPluginAsync = async (app) => {
  app.get("/artifacts", async (request) => {
    const { runId } = querySchema.parse(request.query);
    return app.controlPlane.listArtifacts(runId, request.authContext);
  });

  app.post("/artifacts", async (request, reply) => {
    return app.observability.withTrace("api.artifacts.create", async () => {
      const input = artifactCreateSchema.parse(request.body);
      const artifact = requireValue(
        await app.controlPlane.createArtifact(input, request.authContext),
        "control plane returned no artifact"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.artifactCreated, {
        runId: artifact.runId,
        taskId: artifact.taskId,
        entityId: artifact.id,
        status: artifact.kind,
        summary: `Artifact ${artifact.kind} published`
      }));

      return reply.code(201).send(artifact);
    }, { route: "artifacts.create" });
  });
};
