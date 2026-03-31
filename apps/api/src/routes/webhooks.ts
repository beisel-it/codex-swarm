import type { ActorIdentity } from "@codex-swarm/contracts";
import type { FastifyPluginAsync } from "fastify";

import { controlPlaneEvents, timelineEvent } from "../lib/control-plane-events.js";
import { startRunNow } from "../lib/start-run.js";

function normalizeHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(Object.entries(headers).flatMap(([key, value]) => {
    if (typeof value === "undefined") {
      return [];
    }

    return [[key, Array.isArray(value) ? value.join(",") : value]];
  }));
}

function normalizeQuery(query: unknown) {
  if (!query || typeof query !== "object") {
    return {};
  }

  const normalized: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (typeof value === "string") {
      normalized[key] = value;
      continue;
    }

    if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
      normalized[key] = value as string[];
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      normalized[key] = String(value);
    }
  }

  return normalized;
}

function readContentLength(headers: Record<string, string>) {
  const value = headers["content-length"];

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
    url: "/webhooks/*",
    handler: async (request, reply) => {
      return app.observability.withTrace("api.webhooks.ingest", async () => {
        const wildcard = (request.params as { "*": string })["*"] ?? "";
        const endpointPath = `/webhooks/${wildcard}`;
        const headers = normalizeHeaders(request.headers);
        const result = await app.controlPlane.ingestWebhook({
          endpointPath,
          method: request.method,
          headers,
          query: normalizeQuery(request.query),
          body: request.body ?? null,
          contentType: request.headers["content-type"]?.toString() ?? null,
          contentLengthBytes: readContentLength(headers),
          remoteAddress: request.ip ?? null,
          userAgent: request.headers["user-agent"]?.toString() ?? null
        });

        if (result.run) {
          const webhookAuthContext: ActorIdentity = {
            ...request.authContext,
            workspaceId: result.receipt.workspaceId,
            workspaceName: request.authContext.workspaceName ?? null,
            teamId: result.receipt.teamId,
            teamName: request.authContext.teamName ?? null
          };

          await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runCreated, {
            runId: result.run.id,
            entityId: result.run.id,
            status: result.run.status,
            summary: `Run created from webhook trigger ${result.receipt.repeatableRunTriggerId}`,
            metadata: {
              receiptId: result.receipt.id,
              repeatableRunId: result.receipt.repeatableRunId
            }
          }));

          void startRunNow(app, {
            authContext: webhookAuthContext,
            runId: result.run.id,
            startedFrom: `webhook trigger ${result.receipt.repeatableRunTriggerId}`
          }).catch((error) => {
            request.log.error({
              err: error,
              runId: result.run?.id,
              receiptId: result.receipt.id,
              triggerId: result.receipt.repeatableRunTriggerId
            }, "failed to auto-start webhook-created run");
          });
        }

        return reply.code(202).send({
          receiptId: result.receipt.id,
          status: result.receipt.status,
          runId: result.run?.id ?? null,
          rejectionReason: result.receipt.rejectionReason
        });
      }, { route: "webhooks.ingest" });
    }
  });
};
