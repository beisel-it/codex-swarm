import type { FastifyPluginAsync } from "fastify";

import { cleanupJobRunSchema } from "../http/schemas.js";
import { requireValue } from "../lib/require-value.js";

export const cleanupJobRoutes: FastifyPluginAsync = async (app) => {
  app.post("/cleanup-jobs/run", async (request) => {
    return app.observability.withTrace("api.cleanup-jobs.run", async () => {
      const input = cleanupJobRunSchema.parse(request.body);
      const report = requireValue(
        await app.controlPlane.runCleanupJob(input),
        "control plane returned no cleanup report"
      );

      await app.observability.recordTimelineEvent({
        runId: input.runId ?? null,
        eventType: "maintenance.cleanup_completed",
        entityType: "cleanup_job",
        entityId: `cleanup-${report.completedAt.toISOString()}`,
        status: "completed",
        summary: `Cleanup scanned ${report.scannedSessions} sessions`,
        metadata: {
          resumed: report.resumed,
          retried: report.retried,
          markedStale: report.markedStale,
          archived: report.archived
        }
      });

      return report;
    }, { route: "cleanup-jobs.run" });
  });
};
