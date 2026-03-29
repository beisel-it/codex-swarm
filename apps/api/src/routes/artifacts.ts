import { readFile } from "node:fs/promises";

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { artifactCreateSchema } from "../http/schemas.js";
import { persistArtifactBlob, readArtifactBlob } from "../lib/artifact-store.js";
import { controlPlaneEvents, timelineEvent } from "../lib/control-plane-events.js";
import { HttpError } from "../lib/http-error.js";
import { requireValue } from "../lib/require-value.js";

const querySchema = z.object({
  runId: z.uuid()
});

const paramsSchema = z.object({
  id: z.uuid()
});

export const artifactRoutes: FastifyPluginAsync = async (app) => {
  app.get("/artifacts", async (request) => {
    const { runId } = querySchema.parse(request.query);
    return app.controlPlane.listArtifacts(runId, request.authContext);
  });

  app.get("/artifacts/:id/content", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const artifact = await app.controlPlane.getArtifact(id, request.authContext);
    const storageKey = typeof artifact.metadata.storageKey === "string" ? artifact.metadata.storageKey : null;

    if (!storageKey) {
      throw new HttpError(409, `artifact ${id} does not have persisted blob storage`);
    }

    const { content, sizeBytes } = await readArtifactBlob(app.config, storageKey);

    return reply
      .header("content-type", artifact.contentType)
      .header("content-length", sizeBytes)
      .send(content);
  });

  app.post("/artifacts", async (request, reply) => {
    return app.observability.withTrace("api.artifacts.create", async () => {
      const input = artifactCreateSchema.parse(request.body);
      const artifact = requireValue(
        await app.controlPlane.createArtifact({
          ...input,
          metadata: {
            ...input.metadata
          }
        }, request.authContext),
        "control plane returned no artifact"
      );
      const content = input.contentBase64
        ? Buffer.from(input.contentBase64, "base64")
        : await readFile(input.path);
      const storedArtifact = await app.controlPlane.attachArtifactStorage(
        artifact.id,
        await persistArtifactBlob(app.config, artifact.id, content)
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.artifactCreated, {
        runId: storedArtifact.runId,
        taskId: storedArtifact.taskId,
        entityId: storedArtifact.id,
        status: storedArtifact.kind,
        summary: `Artifact ${storedArtifact.kind} published`
      }));

      return reply.code(201).send(storedArtifact);
    }, { route: "artifacts.create" });
  });
};
