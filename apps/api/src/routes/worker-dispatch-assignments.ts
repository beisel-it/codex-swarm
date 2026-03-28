import type { FastifyPluginAsync } from "fastify";

import {
  idParamSchema,
  workerDispatchCompleteSchema,
  workerDispatchCreateSchema,
  workerDispatchListQuerySchema
} from "../http/schemas.js";
import { requireValue } from "../lib/require-value.js";

export const workerDispatchAssignmentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/worker-dispatch-assignments", async (request) => {
    const query = workerDispatchListQuerySchema.parse(request.query);
    return app.controlPlane.listWorkerDispatchAssignments(query);
  });

  app.post("/worker-dispatch-assignments", async (request, reply) => {
    return app.observability.withTrace("api.worker-dispatch-assignments.create", async () => {
      const input = workerDispatchCreateSchema.parse(request.body);
      const assignment = requireValue(
        await app.controlPlane.createWorkerDispatchAssignment(input),
        "control plane returned no worker dispatch assignment"
      );

      await app.observability.recordTimelineEvent({
        runId: assignment.runId,
        taskId: assignment.taskId,
        agentId: assignment.agentId,
        eventType: "worker_dispatch_assignment.created",
        entityType: "worker_dispatch_assignment",
        entityId: assignment.id,
        status: assignment.state,
        summary: `Worker dispatch assignment ${assignment.id} created`
      });

      return reply.code(201).send(assignment);
    }, { route: "worker-dispatch-assignments.create" });
  });

  app.patch("/worker-dispatch-assignments/:id", async (request) => {
    return app.observability.withTrace("api.worker-dispatch-assignments.complete", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = workerDispatchCompleteSchema.parse(request.body);
      const assignment = requireValue(
        await app.controlPlane.completeWorkerDispatch(id, input),
        "control plane returned no worker dispatch assignment"
      );

      await app.observability.recordTimelineEvent({
        runId: assignment.runId,
        taskId: assignment.taskId,
        agentId: assignment.agentId,
        eventType: "worker_dispatch_assignment.updated",
        entityType: "worker_dispatch_assignment",
        entityId: assignment.id,
        status: assignment.state,
        summary: `Worker dispatch assignment ${assignment.id} updated to ${assignment.state}`
      });

      return assignment;
    }, { route: "worker-dispatch-assignments.complete" });
  });
};
