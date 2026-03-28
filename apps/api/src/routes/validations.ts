import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { validationCreateSchema } from "../http/schemas.js";
import { requireValue } from "../lib/require-value.js";

const querySchema = z.object({
  runId: z.uuid()
});

export const validationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/validations", async (request) => {
    const { runId } = querySchema.parse(request.query);
    return app.controlPlane.listValidations(runId);
  });

  app.post("/validations", async (request, reply) => {
    return app.observability.withTrace("api.validations.create", async () => {
      const input = validationCreateSchema.parse(request.body);
      const validation = requireValue(
        await app.controlPlane.createValidation(input),
        "control plane returned no validation"
      );

      await app.observability.recordTimelineEvent({
        runId: validation.runId,
        taskId: validation.taskId,
        eventType: "validation.created",
        entityType: "validation",
        entityId: validation.id,
        status: validation.status,
        summary: `Validation ${validation.name} recorded`
      });

      return reply.code(201).send(validation);
    }, { route: "validations.create" });
  });
};
