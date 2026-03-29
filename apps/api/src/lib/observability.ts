import { AsyncLocalStorage } from "node:async_hooks";

import {
  controlPlaneEventSchema,
  type ActorIdentity,
  type ControlPlaneEvent,
  type ControlPlaneEventEntityType,
  type ControlPlaneEventType,
  type ControlPlaneMetrics
} from "@codex-swarm/contracts";
import { asc, desc, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { agents, approvals, artifacts, controlPlaneEvents, repositories, runs, tasks, validations, workerNodes } from "../db/schema.js";
import type { Clock } from "./clock.js";

type RequestTraceContext = {
  traceId: string;
  requestId: string;
  method: string;
  url: string;
  actor: ActorIdentity | null;
};

type TimelineEventInput = {
  runId?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  eventType: ControlPlaneEventType;
  entityType: ControlPlaneEventEntityType;
  entityId: string;
  status: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

type OpenAiTracingModule = {
  setTracingDisabled: (disabled: boolean) => void;
  setTracingExportApiKey: (apiKey: string) => void;
  withTrace: <T>(
    name: string,
    fn: () => Promise<T>,
    options?: { metadata?: Record<string, unknown> }
  ) => Promise<T>;
};

let tracingModulePromise: Promise<OpenAiTracingModule | null> | undefined;

function normalizeLegacyGovernanceRole(role: unknown) {
  return role === "platform-admin" ? "workspace_admin" : role;
}

function normalizeLegacyEventActor<T>(value: T): T {
  if (!value || typeof value !== "object") {
    return value;
  }

  const event = value as Record<string, unknown>;
  const actor = event.actor;

  if (!actor || typeof actor !== "object") {
    return value;
  }

  const actorRecord = actor as Record<string, unknown>;
  const roles = Array.isArray(actorRecord.roles)
    ? actorRecord.roles.map((role) => normalizeLegacyGovernanceRole(role))
    : actorRecord.roles;

  return {
    ...event,
    actor: {
      ...actorRecord,
      role: normalizeLegacyGovernanceRole(actorRecord.role),
      roles
    }
  } as T;
}

function createTraceId() {
  return `trace_${crypto.randomUUID().replaceAll("-", "")}`;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function summarizeDurations(values: number[]) {
  return {
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: values.length === 0 ? 0 : Math.max(...values)
  };
}

function ageInMinutes(now: Date, then: Date) {
  return Math.max(0, (now.getTime() - then.getTime()) / (60 * 1000));
}

async function loadTracingModule() {
  if (!tracingModulePromise) {
    tracingModulePromise = import("@openai/agents")
      .then((module) => module as OpenAiTracingModule)
      .catch(() => null);
  }

  return tracingModulePromise;
}

export class ObservabilityService {
  private readonly traceContext = new AsyncLocalStorage<RequestTraceContext>();
  private recoverableDatabaseFallbacks = 0;
  private requestFailures = 0;
  private readonly tracingModulePromise: Promise<OpenAiTracingModule | null>;

  constructor(
    private readonly db: AppDb,
    private readonly clock: Clock,
    private readonly config: AppConfig
  ) {
    this.tracingModulePromise = loadTracingModule();
    void this.configureTracing(config);
  }

  beginRequest(request: FastifyRequest, reply: FastifyReply) {
    const traceIdHeader = request.headers["x-codex-trace-id"];
    const traceId = typeof traceIdHeader === "string" && traceIdHeader.length > 0
      ? traceIdHeader
      : createTraceId();

    this.traceContext.enterWith({
      traceId,
      requestId: request.id,
      method: request.method,
      url: request.url,
      actor: null
    });

    reply.header("x-codex-trace-id", traceId);
  }

  clearActorContext() {
    const current = this.traceContext.getStore();

    if (!current) {
      return;
    }

    this.traceContext.enterWith({
      ...current,
      actor: null
    });
  }

  setActorContext(actor: ActorIdentity) {
    const current = this.traceContext.getStore();

    if (!current) {
      return;
    }

    this.traceContext.enterWith({
      ...current,
      actor
    });
  }

  async withTrace<T>(name: string, fn: () => Promise<T>, metadata: Record<string, unknown> = {}) {
    const context = this.traceContext.getStore();
    const tracing = await this.tracingModulePromise;

    if (!tracing) {
      return fn();
    }

    return tracing.withTrace(name, async () => fn(), {
      metadata: {
        traceId: context?.traceId ?? createTraceId(),
        requestId: context?.requestId ?? null,
        method: context?.method ?? null,
        url: context?.url ?? null,
        ...metadata
      }
    });
  }

  private async configureTracing(config: AppConfig) {
    const tracing = await this.tracingModulePromise;

    if (!tracing) {
      return;
    }

    if (config.OPENAI_TRACING_EXPORT_API_KEY) {
      tracing.setTracingExportApiKey(config.OPENAI_TRACING_EXPORT_API_KEY);
    }

    if (config.OPENAI_TRACING_DISABLED) {
      tracing.setTracingDisabled(true);
    }
  }

  getTraceId() {
    return this.traceContext.getStore()?.traceId ?? createTraceId();
  }

  recordRecoverableDatabaseFallback(operation: string, error: unknown) {
    this.recoverableDatabaseFallbacks += 1;
    console.warn(`[observability] recoverable database fallback in ${operation}`, error);
  }

  recordRequestFailure(error: unknown) {
    this.requestFailures += 1;
    console.error("[observability] request failure", error);
  }

  async recordTimelineEvent(input: TimelineEventInput) {
    try {
      const [event] = await this.db.insert(controlPlaneEvents).values({
        id: crypto.randomUUID(),
        runId: input.runId ?? null,
        taskId: input.taskId ?? null,
        agentId: input.agentId ?? null,
        traceId: this.getTraceId(),
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        status: input.status,
        summary: input.summary,
        actor: this.traceContext.getStore()?.actor ?? null,
        metadata: input.metadata ?? {},
        createdAt: this.clock.now()
      }).returning();

      if (!event) {
        return null;
      }

      return controlPlaneEventSchema.parse(normalizeLegacyEventActor(event));
    } catch (error) {
      console.error("[observability] timeline event persistence failed", error);
      return null;
    }
  }

  async listEvents(runId?: string, limit = 100) {
    const items = runId
      ? await this.db.select().from(controlPlaneEvents)
        .where(eq(controlPlaneEvents.runId, runId))
        .orderBy(desc(controlPlaneEvents.createdAt))
        .limit(limit)
      : await this.db.select().from(controlPlaneEvents)
        .orderBy(desc(controlPlaneEvents.createdAt))
        .limit(limit);

    return [...items].reverse();
  }

  async getMetrics(): Promise<ControlPlaneMetrics> {
    const now = this.clock.now();
    const [runRows, taskRows, agentRows, approvalRows, validationRows, eventRows, repositoryRows, artifactRows, workerNodeRows] = await Promise.all([
      this.db.select({
        status: runs.status,
        createdAt: runs.createdAt,
        completedAt: runs.completedAt,
        budgetCostUsd: runs.budgetCostUsd
      }).from(runs).orderBy(asc(runs.createdAt)),
      this.db.select({ status: tasks.status }).from(tasks).orderBy(asc(tasks.createdAt)),
      this.db.select({ status: agents.status }).from(agents).orderBy(asc(agents.createdAt)),
      this.db.select({
        status: approvals.status,
        createdAt: approvals.createdAt,
        resolvedAt: approvals.resolvedAt
      }).from(approvals).orderBy(asc(approvals.createdAt)),
      this.db.select({
        status: validations.status,
        createdAt: validations.createdAt,
        updatedAt: validations.updatedAt
      }).from(validations).orderBy(asc(validations.createdAt)),
      this.db.select({ eventType: controlPlaneEvents.eventType }).from(controlPlaneEvents)
        .orderBy(asc(controlPlaneEvents.createdAt)),
      this.db.select({ id: repositories.id }).from(repositories),
      this.db.select({ id: artifacts.id }).from(artifacts),
      this.db.select({ status: workerNodes.status, drainState: workerNodes.drainState }).from(workerNodes)
    ]);
    const pendingApprovalAges = approvalRows
      .filter((row) => row.status === "pending")
      .map((row) => ageInMinutes(now, row.createdAt));
    const activeRunAges = runRows
      .filter((row) => row.status === "pending" || row.status === "planning" || row.status === "in_progress")
      .map((row) => ageInMinutes(now, row.createdAt));
    const runDurations = runRows
      .filter((row) => row.completedAt !== null)
      .map((row) => Math.max(0, row.completedAt!.getTime() - row.createdAt.getTime()));
    const approvalDurations = approvalRows
      .filter((row) => row.resolvedAt !== null)
      .map((row) => Math.max(0, row.resolvedAt!.getTime() - row.createdAt.getTime()));
    const validationDurations = validationRows
      .filter((row) => row.status !== "pending")
      .map((row) => Math.max(0, row.updatedAt.getTime() - row.createdAt.getTime()));
    const budgetedCostsUsd = runRows
      .map((row) => row.budgetCostUsd)
      .filter((value): value is number => value !== null)
      .map((value) => value / 100);
    const queueDepth = {
      runsPending: runRows.filter((row) => row.status === "pending" || row.status === "planning").length,
      tasksPending: taskRows.filter((row) => row.status === "pending").length,
      tasksBlocked: taskRows.filter((row) => row.status === "blocked").length,
      approvalsPending: approvalRows.filter((row) => row.status === "pending").length,
      busyAgents: agentRows.filter((row) => row.status === "busy").length
    };
    const oldestPendingApprovalAgeMinutes = pendingApprovalAges.length === 0 ? null : Math.max(...pendingApprovalAges);
    const oldestActiveRunAgeMinutes = activeRunAges.length === 0 ? null : Math.max(...activeRunAges);
    const pendingApprovalsWithinTarget =
      oldestPendingApprovalAgeMinutes === null || oldestPendingApprovalAgeMinutes <= this.config.SLO_PENDING_APPROVAL_MAX_MINUTES;
    const activeRunsWithinTarget =
      oldestActiveRunAgeMinutes === null || oldestActiveRunAgeMinutes <= this.config.SLO_ACTIVE_RUN_MAX_MINUTES;
    const queueDepthWithinTarget = queueDepth.tasksPending <= this.config.SLO_TASK_QUEUE_MAX;

    return {
      queueDepth,
      retries: {
        recoverableDatabaseFallbacks: this.recoverableDatabaseFallbacks,
        taskUnblocks: eventRows.filter((row) => row.eventType === "task.unblocked").length
      },
      failures: {
        runsFailed: runRows.filter((row) => row.status === "failed").length,
        tasksFailed: taskRows.filter((row) => row.status === "failed").length,
        agentsFailed: agentRows.filter((row) => row.status === "failed").length,
        validationsFailed: validationRows.filter((row) => row.status === "failed").length,
        requestFailures: this.requestFailures
      },
      usage: {
        repositories: repositoryRows.length,
        runsTotal: runRows.length,
        runsActive: activeRunAges.length,
        runsCompleted: runDurations.length,
        tasksTotal: taskRows.length,
        approvalsTotal: approvalRows.length,
        validationsTotal: validationRows.length,
        artifactsTotal: artifactRows.length,
        workerNodesOnline: workerNodeRows.filter((row) => row.status === "online").length,
        workerNodesDraining: workerNodeRows.filter((row) => row.drainState !== "active").length
      },
      cost: {
        runsWithBudget: budgetedCostsUsd.length,
        totalBudgetedRunCostUsd: budgetedCostsUsd.reduce((sum, value) => sum + value, 0),
        averageBudgetedRunCostUsd: budgetedCostsUsd.length === 0
          ? 0
          : budgetedCostsUsd.reduce((sum, value) => sum + value, 0) / budgetedCostsUsd.length,
        maxBudgetedRunCostUsd: budgetedCostsUsd.length === 0 ? 0 : Math.max(...budgetedCostsUsd)
      },
      performance: {
        completedRunsMeasured: runDurations.length,
        approvalsMeasured: approvalDurations.length,
        validationsMeasured: validationDurations.length,
        runDurationMs: summarizeDurations(runDurations),
        approvalResolutionMs: summarizeDurations(approvalDurations),
        validationTurnaroundMs: summarizeDurations(validationDurations)
      },
      slo: {
        objectives: {
          pendingApprovalMaxMinutes: this.config.SLO_PENDING_APPROVAL_MAX_MINUTES,
          activeRunMaxMinutes: this.config.SLO_ACTIVE_RUN_MAX_MINUTES,
          taskQueueMax: this.config.SLO_TASK_QUEUE_MAX,
          supportResponseHours: this.config.SLO_SUPPORT_RESPONSE_HOURS
        },
        support: {
          hoursUtc: this.config.SUPPORT_HOURS_UTC,
          escalation: this.config.SUPPORT_ESCALATION
        },
        status: {
          pendingApprovalsWithinTarget,
          activeRunsWithinTarget,
          queueDepthWithinTarget,
          withinEnvelope: pendingApprovalsWithinTarget && activeRunsWithinTarget && queueDepthWithinTarget
        },
        measurements: {
          oldestPendingApprovalAgeMinutes,
          oldestActiveRunAgeMinutes,
          pendingApprovals: queueDepth.approvalsPending,
          activeRuns: activeRunAges.length,
          tasksPending: queueDepth.tasksPending
        }
      },
      eventsRecorded: eventRows.length,
      recordedAt: now
    };
  }
}
