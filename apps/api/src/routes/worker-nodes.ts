import type { FastifyPluginAsync } from "fastify";

import {
  idParamSchema,
  workerNodeDrainUpdateSchema,
  workerNodeHeartbeatSchema,
  workerNodeReconcileSchema,
  workerNodeRegisterSchema,
} from "../http/schemas.js";
import {
  controlPlaneEvents,
  timelineEvent,
} from "../lib/control-plane-events.js";
import { requireValue } from "../lib/require-value.js";

export const workerNodeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/worker-nodes", async () => {
    return app.controlPlane.listWorkerNodes();
  });

  app.post("/worker-nodes", async (request, reply) => {
    return app.observability.withTrace(
      "api.worker-nodes.register",
      async () => {
        const input = workerNodeRegisterSchema.parse(request.body);
        const workerNode = requireValue(
          await app.controlPlane.registerWorkerNode(input),
          "control plane returned no worker node",
        );

        await app.observability.recordTimelineEvent(
          timelineEvent(controlPlaneEvents.workerNodeRegistered, {
            entityId: workerNode.id,
            status: workerNode.status,
            summary: `Worker node ${workerNode.name} registered`,
          }),
        );

        return reply.code(201).send(workerNode);
      },
      { route: "worker-nodes.register" },
    );
  });

  app.patch("/worker-nodes/:id/heartbeat", async (request) => {
    return app.observability.withTrace(
      "api.worker-nodes.heartbeat",
      async () => {
        const { id } = idParamSchema.parse(request.params);
        const input = workerNodeHeartbeatSchema.parse(request.body);
        const workerNode = requireValue(
          await app.controlPlane.recordWorkerNodeHeartbeat(id, input),
          "control plane returned no worker node",
        );

        await app.observability.recordTimelineEvent(
          timelineEvent(controlPlaneEvents.workerNodeHeartbeatRecorded, {
            entityId: workerNode.id,
            status: workerNode.status,
            summary: `Worker node ${workerNode.name} heartbeat recorded`,
          }),
        );

        return workerNode;
      },
      { route: "worker-nodes.heartbeat" },
    );
  });

  app.patch("/worker-nodes/:id/drain", async (request) => {
    return app.observability.withTrace(
      "api.worker-nodes.drain",
      async () => {
        const { id } = idParamSchema.parse(request.params);
        const input = workerNodeDrainUpdateSchema.parse(request.body);
        const workerNode = requireValue(
          await app.controlPlane.updateWorkerNodeDrainState(id, input),
          "control plane returned no worker node",
        );

        await app.observability.recordTimelineEvent(
          timelineEvent(controlPlaneEvents.workerNodeDrainStateUpdated, {
            entityId: workerNode.id,
            status: workerNode.drainState,
            summary: `Worker node ${workerNode.name} drain state updated to ${workerNode.drainState}`,
            metadata: input.reason ? { reason: input.reason } : {},
          }),
        );

        return workerNode;
      },
      { route: "worker-nodes.drain" },
    );
  });

  app.post("/worker-nodes/:id/claim-dispatch", async (request) => {
    return app.observability.withTrace(
      "api.worker-nodes.claim-dispatch",
      async () => {
        const { id } = idParamSchema.parse(request.params);
        const assignment = await app.controlPlane.claimNextWorkerDispatch(id);

        if (!assignment) {
          return null;
        }

        await app.observability.recordTimelineEvent(
          timelineEvent(controlPlaneEvents.workerDispatchAssignmentClaimed, {
            runId: assignment.runId,
            taskId: assignment.taskId,
            agentId: assignment.agentId,
            entityId: assignment.id,
            status: assignment.state,
            summary: `Worker node ${id} claimed dispatch assignment ${assignment.id}`,
          }),
        );

        return assignment;
      },
      { route: "worker-nodes.claim-dispatch" },
    );
  });

  app.post("/worker-nodes/:id/reconcile", async (request) => {
    return app.observability.withTrace(
      "api.worker-nodes.reconcile",
      async () => {
        const { id } = idParamSchema.parse(request.params);
        const input = workerNodeReconcileSchema.parse(request.body);
        const report = requireValue(
          await app.controlPlane.reconcileWorkerNode(id, input),
          "control plane returned no worker node reconciliation report",
        );

        await app.observability.recordTimelineEvent(
          timelineEvent(controlPlaneEvents.workerNodeReconciled, {
            entityId: id,
            status: "completed",
            summary: `Worker node ${id} reconciled after ${input.reason}`,
            metadata: {
              retriedAssignments: report.retriedAssignments,
              failedAssignments: report.failedAssignments,
              staleSessions: report.staleSessions,
            },
          }),
        );

        return report;
      },
      { route: "worker-nodes.reconcile" },
    );
  });
};
