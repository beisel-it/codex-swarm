import type { FastifyPluginAsync } from "fastify";

import {
  idParamSchema,
  runBranchPublishSchema,
  runCreateSchema,
  runPullRequestHandoffSchema,
  runStatusUpdateSchema
} from "../http/schemas.js";
import { getRetentionPolicy } from "../lib/governance-config.js";
import { isRecoverableDatabaseError } from "../lib/database-fallback.js";
import { requireValue } from "../lib/require-value.js";

export const runRoutes: FastifyPluginAsync = async (app) => {
  app.get("/runs", async (request) => {
    const repositoryId = typeof request.query === "object" && request.query && "repositoryId" in request.query
      ? String(request.query.repositoryId)
      : undefined;

    try {
        return await app.controlPlane.listRuns(repositoryId, request.authContext);
    } catch (error) {
      if (app.config.NODE_ENV !== "production" && isRecoverableDatabaseError(error)) {
        app.observability.recordRecoverableDatabaseFallback("runs.list", error);
        return [];
      }

      throw error;
    }
  });

  app.get("/runs/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return app.controlPlane.getRun(id, request.authContext);
  });

  app.get("/runs/:id/audit-export", async (request) => {
    return app.observability.withTrace("api.runs.audit-export", async () => {
      const { id } = idParamSchema.parse(request.params);
      const auditExport = requireValue(
        await app.controlPlane.exportRunAudit(id, request.authContext, getRetentionPolicy(app.config), request.authContext),
        "control plane returned no audit export"
      );

      await app.observability.recordTimelineEvent({
        runId: id,
        eventType: "run.audit_exported",
        entityType: "run",
        entityId: id,
        status: auditExport.run.status,
        summary: `Audit export generated for run ${id}`
      });

      return auditExport;
    }, { route: "runs.audit-export" });
  });

  app.post("/runs", async (request, reply) => {
    return app.observability.withTrace("api.runs.create", async () => {
      const input = runCreateSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.createRun(input, request.authContext.principal, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent({
        runId: run.id,
        eventType: "run.created",
        entityType: "run",
        entityId: run.id,
        status: run.status,
        summary: `Run created for repository ${run.repositoryId}`
      });

      return reply.code(201).send(run);
    }, { route: "runs.create" });
  });

  app.patch("/runs/:id/status", async (request) => {
    return app.observability.withTrace("api.runs.update-status", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runStatusUpdateSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.updateRunStatus(id, input, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent({
        runId: run.id,
        eventType: "run.status_updated",
        entityType: "run",
        entityId: run.id,
        status: run.status,
        summary: `Run status updated to ${run.status}`
      });

      return run;
    }, { route: "runs.update-status" });
  });

  app.post("/runs/:id/publish-branch", async (request) => {
    return app.observability.withTrace("api.runs.publish-branch", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runBranchPublishSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.publishRunBranch(id, input, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent({
        runId: run.id,
        eventType: "run.branch_published",
        entityType: "run",
        entityId: run.id,
        status: run.handoffStatus,
        summary: `Branch ${run.publishedBranch ?? run.branchName ?? "unknown"} published`
      });

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

      await app.observability.recordTimelineEvent({
        runId: run.id,
        eventType: "run.pull_request_handoff_created",
        entityType: "run",
        entityId: run.id,
        status: run.handoffStatus,
        summary: run.pullRequestUrl
          ? `Pull request handoff created at ${run.pullRequestUrl}`
          : "Manual pull request handoff prepared"
      });

      return run;
    }, { route: "runs.pull-request-handoff" });
  });
};
