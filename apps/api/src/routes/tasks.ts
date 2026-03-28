import type { FastifyPluginAsync } from "fastify";

import { idParamSchema, taskCreateSchema, taskStatusUpdateSchema } from "../http/schemas.js";

export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.get("/tasks", async (request) => {
    const runId = typeof request.query === "object" && request.query && "runId" in request.query
      ? String(request.query.runId)
      : undefined;

    return app.controlPlane.listTasks(runId);
  });

  app.post("/tasks", async (request, reply) => {
    const input = taskCreateSchema.parse(request.body);
    const task = await app.controlPlane.createTask(input);
    return reply.code(201).send(task);
  });

  app.patch("/tasks/:id/status", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = taskStatusUpdateSchema.parse(request.body);
    return app.controlPlane.updateTaskStatus(id, input);
  });
};
