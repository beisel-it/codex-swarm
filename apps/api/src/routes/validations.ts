import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { validationCreateSchema } from "../http/schemas.js";

const querySchema = z.object({
  runId: z.uuid()
});

export const validationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/validations", async (request) => {
    const { runId } = querySchema.parse(request.query);
    return app.controlPlane.listValidations(runId);
  });

  app.post("/validations", async (request, reply) => {
    const input = validationCreateSchema.parse(request.body);
    const validation = await app.controlPlane.createValidation(input);
    return reply.code(201).send(validation);
  });
};
