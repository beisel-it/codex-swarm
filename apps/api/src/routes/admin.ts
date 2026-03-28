import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getRetentionPolicy, getSecretIntegrationBoundary } from "../lib/governance-config.js";
import { requireAuthorizedAction } from "../lib/authorization.js";

const governanceReportQuerySchema = z.object({
  runId: z.uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50)
});

const retentionReconcileSchema = z.object({
  runId: z.uuid().optional(),
  dryRun: z.boolean().default(true)
});

const repositoryIdParamsSchema = z.object({
  id: z.uuid()
});

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/governance-report", async (request) => {
    return app.observability.withTrace("api.admin.governance-report", async () => {
      requireAuthorizedAction(request.authContext, "admin.read");
      const query = governanceReportQuerySchema.parse(request.query);
      const report = await app.controlPlane.getGovernanceAdminReport({
        requestedBy: request.authContext,
        retentionPolicy: getRetentionPolicy(app.config),
        secrets: getSecretIntegrationBoundary(app.config),
        access: request.authContext,
        limit: query.limit,
        ...(query.runId ? { runId: query.runId } : {})
      });

      await app.observability.recordTimelineEvent({
        runId: query.runId ?? null,
        eventType: "admin.governance_report_generated",
        entityType: "admin_report",
        entityId: query.runId ?? "global",
        status: "completed",
        summary: query.runId
          ? `Governance report generated for run ${query.runId}`
          : "Global governance report generated"
      });

      return report;
    }, { route: "admin.governance-report" });
  });

  app.get("/admin/secrets/integration-boundary", async (request) => {
    return app.observability.withTrace("api.admin.secrets-boundary", async () => {
      requireAuthorizedAction(request.authContext, "admin.read");
      return getSecretIntegrationBoundary(app.config);
    }, { route: "admin.secrets-boundary" });
  });

  app.get("/admin/secrets/access-plan/:id", async (request) => {
    return app.observability.withTrace("api.admin.secret-access-plan", async () => {
      requireAuthorizedAction(request.authContext, "admin.read");
      const { id } = repositoryIdParamsSchema.parse(request.params);
      return app.controlPlane.getRepositorySecretAccessPlan({
        repositoryId: id,
        secrets: getSecretIntegrationBoundary(app.config),
        access: request.authContext
      });
    }, { route: "admin.secret-access-plan" });
  });

  app.post("/admin/retention/reconcile", async (request) => {
    return app.observability.withTrace("api.admin.retention-reconcile", async () => {
      requireAuthorizedAction(request.authContext, "admin.write");
      const input = retentionReconcileSchema.parse(request.body);
      const report = await app.controlPlane.reconcileGovernanceRetention({
        requestedBy: request.authContext,
        retentionPolicy: getRetentionPolicy(app.config),
        dryRun: input.dryRun,
        access: request.authContext,
        ...(input.runId ? { runId: input.runId } : {})
      });

      await app.observability.recordTimelineEvent({
        runId: input.runId ?? null,
        eventType: "admin.retention_reconciled",
        entityType: "retention_policy",
        entityId: input.runId ?? "global",
        status: input.dryRun ? "dry_run" : "applied",
        summary: input.dryRun
          ? "Retention policy dry-run completed"
          : "Retention policy applied to governed data",
        metadata: {
          runsUpdated: report.runsUpdated,
          artifactsUpdated: report.artifactsUpdated,
          eventsUpdated: report.eventsUpdated
        }
      });

      return report;
    }, { route: "admin.retention-reconcile" });
  });
};
