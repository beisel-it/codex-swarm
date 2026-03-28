import Fastify from "fastify";
import { ZodError } from "zod";

import { getConfig } from "./config.js";
import { HttpError } from "./lib/http-error.js";
import { authPlugin } from "./plugins/auth.js";
import { dependenciesPlugin } from "./plugins/dependencies.js";
import { agentRoutes } from "./routes/agents.js";
import { adminRoutes } from "./routes/admin.js";
import { approvalRoutes } from "./routes/approvals.js";
import { artifactRoutes } from "./routes/artifacts.js";
import { cleanupJobRoutes } from "./routes/cleanup-jobs.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { identityRoutes } from "./routes/identity.js";
import { ObservabilityService } from "./lib/observability.js";
import { messageRoutes } from "./routes/messages.js";
import { metricsRoutes } from "./routes/metrics.js";
import { repositoryRoutes } from "./routes/repositories.js";
import { runRoutes } from "./routes/runs.js";
import { taskRoutes } from "./routes/tasks.js";
import { validationRoutes } from "./routes/validations.js";
import { workerDispatchAssignmentRoutes } from "./routes/worker-dispatch-assignments.js";
import { workerNodeRoutes } from "./routes/worker-nodes.js";
import type { ControlPlaneService } from "./services/control-plane-service.js";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown_error";
}

interface BuildAppOptions {
  config?: Partial<ReturnType<typeof getConfig>>;
  controlPlane?: ControlPlaneService;
  observability?: ObservabilityService;
}

function createNoopObservability(config: ReturnType<typeof getConfig>): Pick<
  ObservabilityService,
  "beginRequest" | "clearActorContext" | "getMetrics" | "listEvents" | "recordRecoverableDatabaseFallback" | "recordRequestFailure" | "recordTimelineEvent" | "setActorContext" | "withTrace"
> {
  return Object.assign(Object.create(ObservabilityService.prototype) as ObservabilityService, {
    beginRequest: () => undefined,
    clearActorContext: () => undefined,
    getMetrics: async () => ({
      queueDepth: {
        runsPending: 0,
        tasksPending: 0,
        tasksBlocked: 0,
        approvalsPending: 0,
        busyAgents: 0
      },
      retries: {
        recoverableDatabaseFallbacks: 0,
        taskUnblocks: 0
      },
      failures: {
        runsFailed: 0,
        tasksFailed: 0,
        agentsFailed: 0,
        validationsFailed: 0,
        requestFailures: 0
      },
      usage: {
        repositories: 0,
        runsTotal: 0,
        runsActive: 0,
        runsCompleted: 0,
        tasksTotal: 0,
        approvalsTotal: 0,
        validationsTotal: 0,
        artifactsTotal: 0,
        workerNodesOnline: 0,
        workerNodesDraining: 0
      },
      cost: {
        runsWithBudget: 0,
        totalBudgetedRunCostUsd: 0,
        averageBudgetedRunCostUsd: 0,
        maxBudgetedRunCostUsd: 0
      },
      performance: {
        completedRunsMeasured: 0,
        approvalsMeasured: 0,
        validationsMeasured: 0,
        runDurationMs: {
          p50: 0,
          p95: 0,
          max: 0
        },
        approvalResolutionMs: {
          p50: 0,
          p95: 0,
          max: 0
        },
        validationTurnaroundMs: {
          p50: 0,
          p95: 0,
          max: 0
        }
      },
      slo: {
        objectives: {
          pendingApprovalMaxMinutes: config.SLO_PENDING_APPROVAL_MAX_MINUTES,
          activeRunMaxMinutes: config.SLO_ACTIVE_RUN_MAX_MINUTES,
          taskQueueMax: config.SLO_TASK_QUEUE_MAX,
          supportResponseHours: config.SLO_SUPPORT_RESPONSE_HOURS
        },
        support: {
          hoursUtc: config.SUPPORT_HOURS_UTC,
          escalation: config.SUPPORT_ESCALATION
        },
        status: {
          pendingApprovalsWithinTarget: true,
          activeRunsWithinTarget: true,
          queueDepthWithinTarget: true,
          withinEnvelope: true
        },
        measurements: {
          oldestPendingApprovalAgeMinutes: null,
          oldestActiveRunAgeMinutes: null,
          pendingApprovals: 0,
          activeRuns: 0,
          tasksPending: 0
        }
      },
      eventsRecorded: 0,
      recordedAt: new Date()
    }),
    listEvents: async () => [],
    recordRecoverableDatabaseFallback: () => undefined,
    recordRequestFailure: () => undefined,
    recordTimelineEvent: async () => null,
    setActorContext: () => undefined,
    withTrace: async <T>(_name: string, fn: () => Promise<T>) => fn()
  });
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = getConfig(options.config);
  const app = Fastify({
    logger: false
  });

  app.decorate("config", config);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({
        error: error.message,
        details: error.details ?? null
      });

      return;
    }

    if (error instanceof ZodError || (typeof error === "object" && error !== null && "issues" in error)) {
      reply.status(400).send({
        error: "validation_error",
        details: "issues" in error ? error.issues : []
      });

      return;
    }

    if (typeof (error as { statusCode?: number }).statusCode === "number") {
      reply.status((error as { statusCode: number }).statusCode).send({
        error: getErrorMessage(error)
      });

      return;
    }

    reply.status(500).send({
      error: "internal_server_error"
    });
  });

  if (options.controlPlane) {
    app.decorate("observability", (options.observability ?? createNoopObservability(config)) as ObservabilityService);
    app.decorate("controlPlane", options.controlPlane);
  } else {
    await app.register(dependenciesPlugin);
  }

  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(adminRoutes, { prefix: "/api/v1" });
  await app.register(identityRoutes, { prefix: "/api/v1" });
  await app.register(repositoryRoutes, { prefix: "/api/v1" });
  await app.register(runRoutes, { prefix: "/api/v1" });
  await app.register(taskRoutes, { prefix: "/api/v1" });
  await app.register(agentRoutes, { prefix: "/api/v1" });
  await app.register(workerNodeRoutes, { prefix: "/api/v1" });
  await app.register(workerDispatchAssignmentRoutes, { prefix: "/api/v1" });
  await app.register(messageRoutes, { prefix: "/api/v1" });
  await app.register(approvalRoutes, { prefix: "/api/v1" });
  await app.register(validationRoutes, { prefix: "/api/v1" });
  await app.register(artifactRoutes, { prefix: "/api/v1" });
  await app.register(cleanupJobRoutes, { prefix: "/api/v1" });
  await app.register(eventRoutes, { prefix: "/api/v1" });
  await app.register(metricsRoutes, { prefix: "/api/v1" });

  return app;
}
