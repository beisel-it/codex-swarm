import type { FastifyPluginAsync } from "fastify";

import {
  idParamSchema,
  taskCreateSchema,
  taskStatusUpdateSchema,
} from "../http/schemas.js";
import {
  controlPlaneEvents,
  timelineEvent,
} from "../lib/control-plane-events.js";
import { requireValue } from "../lib/require-value.js";

export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.get("/tasks", async (request) => {
    const runId =
      typeof request.query === "object" &&
      request.query &&
      "runId" in request.query
        ? String(request.query.runId)
        : undefined;

    return app.controlPlane.listTasks(runId, request.authContext);
  });

  app.post("/tasks", async (request, reply) => {
    return app.observability.withTrace(
      "api.tasks.create",
      async () => {
        const input = taskCreateSchema.parse(request.body);
        const task = requireValue(
          await app.controlPlane.createTask(input, request.authContext),
          "control plane returned no task",
        );

        await app.observability.recordTimelineEvent(
          timelineEvent(controlPlaneEvents.taskCreated, {
            runId: task.runId,
            taskId: task.id,
            agentId: task.ownerAgentId,
            entityId: task.id,
            status: task.status,
            summary: `Task ${task.title} created`,
          }),
        );

        return reply.code(201).send(task);
      },
      { route: "tasks.create" },
    );
  });

  app.patch("/tasks/:id/status", async (request) => {
    return app.observability.withTrace(
      "api.tasks.update-status",
      async () => {
        const { id } = idParamSchema.parse(request.params);
        const input = taskStatusUpdateSchema.parse(request.body);
        const task = requireValue(
          await app.controlPlane.updateTaskStatus(
            id,
            input,
            request.authContext,
          ),
          "control plane returned no task",
        );

        await app.observability.recordTimelineEvent(
          timelineEvent(controlPlaneEvents.taskStatusUpdated, {
            runId: task.runId,
            taskId: task.id,
            agentId: task.ownerAgentId,
            entityId: task.id,
            status: task.status,
            summary: `Task ${task.title} status updated to ${task.status}`,
          }),
        );

        return task;
      },
      { route: "tasks.update-status" },
    );
  });
};
