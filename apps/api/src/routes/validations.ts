import type { FastifyPluginAsync } from "fastify";

import {
  validationCreateSchema,
  validationsListQuerySchema,
} from "../http/schemas.js";
import {
  controlPlaneEvents,
  timelineEvent,
} from "../lib/control-plane-events.js";
import { requireValue } from "../lib/require-value.js";

export const validationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/validations", async (request) => {
    const query = validationsListQuerySchema.parse(request.query);
    return app.controlPlane.listValidations(query, request.authContext);
  });

  app.post("/validations", async (request, reply) => {
    return app.observability.withTrace(
      "api.validations.create",
      async () => {
        const input = validationCreateSchema.parse(request.body);
        const validation = requireValue(
          await app.controlPlane.createValidation(input, request.authContext),
          "control plane returned no validation",
        );

        await app.observability.recordTimelineEvent(
          timelineEvent(controlPlaneEvents.validationCreated, {
            runId: validation.runId,
            taskId: validation.taskId,
            entityId: validation.id,
            status: validation.status,
            summary: `Validation ${validation.name} recorded`,
          }),
        );

        return reply.code(201).send(validation);
      },
      { route: "validations.create" },
    );
  });
};
