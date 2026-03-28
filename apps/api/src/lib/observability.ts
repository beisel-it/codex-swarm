import { AsyncLocalStorage } from "node:async_hooks";

import type { ControlPlaneEvent, ControlPlaneMetrics } from "@codex-swarm/contracts";
import { asc, desc, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { agents, approvals, controlPlaneEvents, runs, tasks, validations } from "../db/schema.js";
import type { Clock } from "./clock.js";

type RequestTraceContext = {
  traceId: string;
  requestId: string;
  method: string;
  url: string;
};

type TimelineEventInput = {
  runId?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  eventType: string;
  entityType: string;
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

function createTraceId() {
  return `trace_${crypto.randomUUID().replaceAll("-", "")}`;
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
    config: AppConfig
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
      url: request.url
    });

    reply.header("x-codex-trace-id", traceId);
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
        metadata: input.metadata ?? {},
        createdAt: this.clock.now()
      }).returning();

      if (!event) {
        return null;
      }

      return event satisfies ControlPlaneEvent;
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
    const [runRows, taskRows, agentRows, approvalRows, validationRows, eventRows] = await Promise.all([
      this.db.select({ status: runs.status }).from(runs).orderBy(asc(runs.createdAt)),
      this.db.select({ status: tasks.status }).from(tasks).orderBy(asc(tasks.createdAt)),
      this.db.select({ status: agents.status }).from(agents).orderBy(asc(agents.createdAt)),
      this.db.select({ status: approvals.status }).from(approvals).orderBy(asc(approvals.createdAt)),
      this.db.select({ status: validations.status }).from(validations).orderBy(asc(validations.createdAt)),
      this.db.select({ eventType: controlPlaneEvents.eventType }).from(controlPlaneEvents)
    ]);

    return {
      queueDepth: {
        runsPending: runRows.filter((row) => row.status === "pending" || row.status === "planning").length,
        tasksPending: taskRows.filter((row) => row.status === "pending").length,
        tasksBlocked: taskRows.filter((row) => row.status === "blocked").length,
        approvalsPending: approvalRows.filter((row) => row.status === "pending").length,
        busyAgents: agentRows.filter((row) => row.status === "busy").length
      },
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
      eventsRecorded: eventRows.length,
      recordedAt: this.clock.now()
    };
  }
}
