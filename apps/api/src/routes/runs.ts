import { mkdir } from "node:fs/promises";

import type { FastifyPluginAsync } from "fastify";
import type {
  RunBudgetCheckpointInput
} from "@codex-swarm/contracts";

import {
  idParamSchema,
  runBudgetCheckpointSchema,
  runBranchPublishSchema,
  runCreateSchema,
  runPullRequestHandoffSchema,
  runUpdateSchema,
  runStatusUpdateSchema
} from "../http/schemas.js";
import { requireAuthorizedAction, resolveRunStatusAction } from "../lib/authorization.js";
import { controlPlaneEvents, timelineEvent } from "../lib/control-plane-events.js";
import { getRetentionPolicy } from "../lib/governance-config.js";
import { isRecoverableDatabaseError } from "../lib/database-fallback.js";
import { requireValue } from "../lib/require-value.js";
import { startRunNow } from "../lib/start-run.js";

export const runRoutes: FastifyPluginAsync = async (app) => {
  app.get("/runs", async (request) => {
    const repositoryId = typeof request.query === "object" && request.query && "repositoryId" in request.query
      ? String(request.query.repositoryId)
      : undefined;
    const view = typeof request.query === "object" && request.query && "view" in request.query
      ? String(request.query.view)
      : undefined;

    try {
      if (view === "job_scope") {
        return await app.controlPlane.listRunsByJobScope(repositoryId, request.authContext);
      }

      return await app.controlPlane.listRuns(repositoryId, request.authContext);
    } catch (error) {
      if (app.config.NODE_ENV !== "production" && isRecoverableDatabaseError(error)) {
        app.observability.recordRecoverableDatabaseFallback("runs.list", error);
        return view === "job_scope"
          ? {
            projectJobs: [],
            adHocJobs: []
          }
          : [];
      }

      throw error;
    }
  });

  app.get("/runs/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return app.controlPlane.getRun(id, request.authContext);
  });

  app.get("/runs/:id/stream", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await app.controlPlane.getRun(id, request.authContext);

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    reply.raw.flushHeaders?.();

    const writeFrame = (eventName: string, data: Record<string, unknown>) => {
      if (reply.raw.destroyed || reply.raw.writableEnded) {
        return;
      }

      reply.raw.write(`event: ${eventName}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const writeHeartbeat = () => {
      writeFrame("heartbeat", {
        runId: id,
        ts: new Date().toISOString()
      });
    };

    let closed = false;
    const unsubscribe = app.observability.subscribeToRunEvents(id, (event) => {
      writeFrame("control_plane_event", event);
    });
    const heartbeatTimer = setInterval(writeHeartbeat, 15000);

    const cleanup = () => {
      if (closed) {
        return;
      }

      closed = true;
      clearInterval(heartbeatTimer);
      unsubscribe();
    };

    reply.raw.on("close", cleanup);
    reply.raw.on("error", cleanup);
    writeHeartbeat();
  });

  app.get("/runs/:id/audit-export", async (request) => {
    return app.observability.withTrace("api.runs.audit-export", async () => {
      const { id } = idParamSchema.parse(request.params);
      const auditExport = requireValue(
        await app.controlPlane.exportRunAudit(id, request.authContext, getRetentionPolicy(app.config), request.authContext),
        "control plane returned no audit export"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runAuditExported, {
        runId: id,
        entityId: id,
        status: auditExport.run.status,
        summary: `Audit export generated for run ${id}`
      }));

      return auditExport;
    }, { route: "runs.audit-export" });
  });

  app.post("/runs", async (request, reply) => {
    return app.observability.withTrace("api.runs.create", async () => {
      requireAuthorizedAction(request.authContext, "run.create");
      const input = runCreateSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.createRun(input, request.authContext.principal, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runCreated, {
        runId: run.id,
        entityId: run.id,
        status: run.status,
        summary: `Run created for repository ${run.repositoryId}`
      }));

      return reply.code(201).send(run);
    }, { route: "runs.create" });
  });

  app.post("/runs/:id/start", async (request) => {
    return app.observability.withTrace("api.runs.start", async () => {
      const { id } = idParamSchema.parse(request.params);
      requireAuthorizedAction(request.authContext, "run.create");
      return startRunNow(app, {
        authContext: request.authContext,
        runId: id,
        startedFrom: "the web control surface"
      });
    }, { route: "runs.start" });
  });

  app.patch("/runs/:id/status", async (request) => {
    return app.observability.withTrace("api.runs.update-status", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runStatusUpdateSchema.parse(request.body);
      requireAuthorizedAction(request.authContext, resolveRunStatusAction(input.status));
      const run = requireValue(
        await app.controlPlane.updateRunStatus(id, input, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent(timelineEvent(
        input.status === "completed" ? controlPlaneEvents.runCompleted : controlPlaneEvents.runStatusUpdated,
        {
        runId: run.id,
        entityId: run.id,
        status: run.status,
        summary: `Run status updated to ${run.status}`
      }));

      return run;
    }, { route: "runs.update-status" });
  });

  app.patch("/runs/:id", async (request) => {
    return app.observability.withTrace("api.runs.update", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runUpdateSchema.parse(request.body);
      requireAuthorizedAction(request.authContext, "run.create");
      return app.controlPlane.updateRun(id, input, request.authContext);
    }, { route: "runs.update" });
  });

  app.delete("/runs/:id", async (request, reply) => {
    return app.observability.withTrace("api.runs.delete", async () => {
      const { id } = idParamSchema.parse(request.params);
      requireAuthorizedAction(request.authContext, "run.create");
      await app.controlPlane.deleteRun(id, request.authContext);
      return reply.code(204).send();
    }, { route: "runs.delete" });
  });

  app.post("/runs/:id/budget-checkpoints", async (request) => {
    return app.observability.withTrace("api.runs.budget-checkpoints", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runBudgetCheckpointSchema.parse(request.body);
      const budgetState = requireValue(
        await app.controlPlane.recordRunBudgetCheckpoint(id, input, request.authContext),
        "control plane returned no run budget state"
      );

      if (budgetState.decision === "awaiting_policy_exception") {
        await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runStatusUpdated, {
          runId: id,
          entityId: id,
          status: "awaiting_approval",
          summary: `Run paused for budget policy exception review after ${input.source}`
        }));
      }

      return budgetState;
    }, { route: "runs.budget-checkpoints" });
  });

  app.post("/runs/:id/publish-branch", async (request) => {
    return app.observability.withTrace("api.runs.publish-branch", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runBranchPublishSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.publishRunBranch(id, input, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runBranchPublished, {
        runId: run.id,
        entityId: run.id,
        status: run.handoffStatus,
        summary: `Branch ${run.publishedBranch ?? run.branchName ?? "unknown"} published`
      }));

      return run;
    }, { route: "runs.publish-branch" });
  });

  app.post("/runs/:id/pull-request-handoff", async (request) => {
    return app.observability.withTrace("api.runs.pull-request-handoff", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runPullRequestHandoffSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.createRunPullRequestHandoff(id, input, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runPullRequestHandoffCreated, {
        runId: run.id,
        entityId: run.id,
        status: run.handoffStatus,
        summary: run.pullRequestUrl
          ? `Pull request handoff created at ${run.pullRequestUrl}`
          : "Manual pull request handoff prepared"
      }));

      return run;
    }, { route: "runs.pull-request-handoff" });
  });
};
