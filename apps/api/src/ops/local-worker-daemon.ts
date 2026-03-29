import os from "node:os";
import { mkdir } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import type {
  WorkerNode,
  WorkerNodeRuntime,
  WorkerRuntimeDependencyCheck
} from "@codex-swarm/contracts";
import {
  createLocalCodexCliExecutor,
  createStreamableHttpToolExecutor,
  evaluateWorkerRuntimeDependencies
} from "@codex-swarm/worker";

import {
  runManagedWorkerDispatch,
  type WorkerDispatchOrchestrationRequest,
  type WorkerDispatchOrchestrationResult
} from "../lib/worker-dispatch-orchestration.js";

type WorkerNodeStatus = "online" | "degraded" | "offline";
type WorkerNodeDrainState = "active" | "draining" | "drained";

interface WorkerDaemonState {
  latestChecks: WorkerRuntimeDependencyCheck[];
  latestStatus: WorkerNodeStatus;
  stopping: boolean;
  lastError: string | null;
  lastResult: WorkerDispatchOrchestrationResult | null;
  metrics: WorkerMetrics;
  cpuSnapshot: CpuSnapshot;
}

interface WorkerMetrics {
  cpuPercent: number;
  memoryPercent: number;
  queueDepth: number;
  sessionCount: number;
  activeClaims: number;
}

interface CpuSnapshot {
  idle: number;
  total: number;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function parseListEnv(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseBooleanEnv(value: string | null, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseIntegerEnv(name: string, fallback: number, minimum: number) {
  const raw = getOptionalEnv(name);

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }

  return parsed;
}

function parseCodexCommand(value: string | null) {
  if (!value) {
    return ["codex"];
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string" || entry.length === 0)) {
      throw new Error("CODEX_SWARM_CODEX_COMMAND JSON form must be a non-empty string array");
    }

    return parsed;
  }

  return value.split(/\s+/).filter((entry) => entry.length > 0);
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, value));
}

function readCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();

  return cpus.reduce<CpuSnapshot>((accumulator, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, current) => sum + current, 0);

    return {
      idle: accumulator.idle + cpu.times.idle,
      total: accumulator.total + total
    };
  }, {
    idle: 0,
    total: 0
  });
}

function estimateCpuPercent(previousSnapshot: CpuSnapshot) {
  const nextSnapshot = readCpuSnapshot();
  const idleDelta = nextSnapshot.idle - previousSnapshot.idle;
  const totalDelta = nextSnapshot.total - previousSnapshot.total;
  const loadAverage = os.loadavg()[0] ?? 0;
  const cpuCount = Math.max(1, os.cpus().length);
  const fallbackPercent = clampPercentage((loadAverage / cpuCount) * 100);
  const cpuPercent = totalDelta > 0
    ? clampPercentage(((totalDelta - idleDelta) / totalDelta) * 100)
    : fallbackPercent;

  return {
    cpuPercent: roundMetric(cpuPercent),
    snapshot: nextSnapshot
  };
}

async function listWorkerDispatchAssignments(
  baseUrl: string,
  authToken: string,
  query: string
) {
  return requestJson<Array<{ id: string }>>(
    baseUrl,
    authToken,
    "GET",
    `/api/v1/worker-dispatch-assignments${query}`
  );
}

async function countSessionsForNode(
  baseUrl: string,
  authToken: string,
  nodeId: string
) {
  const runs = await requestJson<Array<{ id: string }>>(baseUrl, authToken, "GET", "/api/v1/runs");
  const details = await Promise.all(
    runs.map((run) =>
      requestJson<{ sessions: Array<{ workerNodeId: string | null; stickyNodeId: string | null; state: string }> }>(
        baseUrl,
        authToken,
        "GET",
        `/api/v1/runs/${run.id}`
      ).catch(() => ({ sessions: [] }))
    )
  );

  return details.flatMap((detail) => detail.sessions).filter((session) =>
    (session.workerNodeId === nodeId || session.stickyNodeId === nodeId)
    && session.state !== "archived"
  ).length;
}

async function collectWorkerMetrics(
  baseUrl: string,
  authToken: string,
  nodeId: string,
  previousSnapshot: CpuSnapshot
) {
  const [{ cpuPercent, snapshot }, queuedAssignments, retryingAssignments, claimedAssignments, sessionCount] = await Promise.all([
    Promise.resolve(estimateCpuPercent(previousSnapshot)),
    listWorkerDispatchAssignments(baseUrl, authToken, "?state=queued"),
    listWorkerDispatchAssignments(baseUrl, authToken, "?state=retrying"),
    listWorkerDispatchAssignments(
      baseUrl,
      authToken,
      `?nodeId=${encodeURIComponent(nodeId)}&state=claimed`
    ),
    countSessionsForNode(baseUrl, authToken, nodeId)
  ]);
  const memoryPercent = clampPercentage(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
  const activeClaims = claimedAssignments.length;

  return {
    metrics: {
      cpuPercent,
      memoryPercent: roundMetric(memoryPercent),
      queueDepth: queuedAssignments.length + retryingAssignments.length,
      sessionCount,
      activeClaims
    },
    cpuSnapshot: snapshot
  };
}

function buildRuntime(): WorkerNodeRuntime {
  const controlPlaneUrl = getOptionalEnv("CODEX_SWARM_CONTROL_PLANE_URL")
    ?? getOptionalEnv("CODEX_SWARM_API_BASE_URL");

  if (!controlPlaneUrl) {
    throw new Error("Missing CODEX_SWARM_CONTROL_PLANE_URL or CODEX_SWARM_API_BASE_URL");
  }

  const transportKind = getOptionalEnv("CODEX_SWARM_MCP_TRANSPORT") ?? "stdio";

  return {
    nodeId: requireEnv("CODEX_SWARM_NODE_ID"),
    nodeName: requireEnv("CODEX_SWARM_NODE_NAME"),
    state: "active",
    workspaceRoot: requireEnv("CODEX_SWARM_WORKSPACE_ROOT"),
    codexCommand: parseCodexCommand(getOptionalEnv("CODEX_SWARM_CODEX_COMMAND")),
    codexTransport: transportKind === "streamable_http"
      ? {
          kind: "streamable_http",
          url: requireEnv("CODEX_SWARM_MCP_SERVER_URL"),
          headers: {},
          protocolVersion: getOptionalEnv("CODEX_SWARM_MCP_PROTOCOL_VERSION") ?? "2025-11-25"
        }
      : {
          kind: "stdio"
        },
    controlPlaneUrl,
    ...(getOptionalEnv("CODEX_SWARM_ARTIFACT_BASE_URL")
      ? { artifactBaseUrl: requireEnv("CODEX_SWARM_ARTIFACT_BASE_URL") }
      : {}),
    postgresUrl: requireEnv("CODEX_SWARM_DATABASE_URL"),
    redisUrl: requireEnv("CODEX_SWARM_REDIS_URL"),
    queueKeyPrefix: getOptionalEnv("CODEX_SWARM_QUEUE_PREFIX") ?? "codex-swarm",
    capabilities: parseListEnv(getOptionalEnv("CODEX_SWARM_CAPABILITIES")),
    credentialEnvNames: parseListEnv(getOptionalEnv("CODEX_SWARM_CREDENTIAL_ENV_NAMES")),
    heartbeatIntervalSeconds: parseIntegerEnv("CODEX_SWARM_HEARTBEAT_INTERVAL_SECONDS", 30, 5)
  };
}

function buildHeaders(authToken: string) {
  return {
    Authorization: `Bearer ${authToken}`,
    Accept: "application/json"
  };
}

async function requestJson<T>(
  baseUrl: string,
  authToken: string,
  method: string,
  path: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...buildHeaders(authToken),
      ...(payload ? { "Content-Type": "application/json" } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });

  const raw = await response.text();
  const data = raw.length > 0 ? JSON.parse(raw) as T : null;

  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}${raw.length > 0 ? `: ${raw}` : ""}`);
  }

  return data as T;
}

async function listWorkerNodes(baseUrl: string, authToken: string) {
  return requestJson<WorkerNode[]>(baseUrl, authToken, "GET", "/api/v1/worker-nodes");
}

async function ensureWorkerNode(
  baseUrl: string,
  authToken: string,
  runtime: WorkerNodeRuntime,
  metadata: Record<string, unknown>
) {
  const nodes = await listWorkerNodes(baseUrl, authToken);
  const existing = nodes.find((node) => node.id === runtime.nodeId);

  if (existing) {
    return existing;
  }

  return requestJson<WorkerNode>(baseUrl, authToken, "POST", "/api/v1/worker-nodes", {
    id: runtime.nodeId,
    name: runtime.nodeName,
    endpoint: getOptionalEnv("CODEX_SWARM_WORKER_ENDPOINT") ?? undefined,
    capabilityLabels: runtime.capabilities,
    status: "online",
    drainState: "active",
    metadata
  });
}

async function updateDrainState(
  baseUrl: string,
  authToken: string,
  nodeId: string,
  drainState: WorkerNodeDrainState,
  reason?: string
) {
  return requestJson<WorkerNode>(
    baseUrl,
    authToken,
    "PATCH",
    `/api/v1/worker-nodes/${nodeId}/drain`,
    {
      drainState,
      ...(reason ? { reason } : {})
    }
  );
}

async function reconcileWorkerNode(
  baseUrl: string,
  authToken: string,
  nodeId: string,
  reason: string
) {
  return requestJson(
    baseUrl,
    authToken,
    "POST",
    `/api/v1/worker-nodes/${nodeId}/reconcile`,
    {
      reason,
      markOffline: false
    }
  );
}

function deriveWorkerStatus(checks: WorkerRuntimeDependencyCheck[], lastError: string | null): WorkerNodeStatus {
  if (checks.some((check) => check.status === "missing")) {
    return "degraded";
  }

  return "online";
}

function buildWorkerMetadata(runtime: WorkerNodeRuntime, state: WorkerDaemonState) {
  return {
    hostKind: "tailnet-local",
    executionMode: "managed_dispatch",
    workspaceRoot: runtime.workspaceRoot,
    transport: runtime.codexTransport.kind,
    codexCommand: runtime.codexTransport.kind === "stdio" ? runtime.codexCommand : [],
    checks: state.latestChecks,
    cpuPercent: state.metrics.cpuPercent,
    memoryPercent: state.metrics.memoryPercent,
    queueDepth: state.metrics.queueDepth,
    sessionCount: state.metrics.sessionCount,
    activeClaims: state.metrics.activeClaims,
    cpuUtilization: state.metrics.cpuPercent,
    memoryUtilization: state.metrics.memoryPercent,
    utilization: {
      cpu: state.metrics.cpuPercent,
      memory: state.metrics.memoryPercent
    },
    lastError: state.lastError,
    lastResult: state.lastResult
      ? {
          assignmentId: state.lastResult.assignmentId,
          runId: state.lastResult.runId,
          sessionId: state.lastResult.sessionId,
          status: state.lastResult.status,
          error: state.lastResult.error
        }
      : null
  };
}

async function heartbeatWorkerNode(
  baseUrl: string,
  authToken: string,
  runtime: WorkerNodeRuntime,
  state: WorkerDaemonState,
  statusOverride?: WorkerNodeStatus
) {
  state.latestChecks = evaluateWorkerRuntimeDependencies(runtime);
  try {
    const nextMetrics = await collectWorkerMetrics(baseUrl, authToken, runtime.nodeId, state.cpuSnapshot);
    state.metrics = nextMetrics.metrics;
    state.cpuSnapshot = nextMetrics.cpuSnapshot;
  } catch (error) {
    console.warn(`worker metrics collection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  state.latestStatus = statusOverride ?? deriveWorkerStatus(state.latestChecks, state.lastError);

  return requestJson<WorkerNode>(
    baseUrl,
    authToken,
    "PATCH",
    `/api/v1/worker-nodes/${runtime.nodeId}/heartbeat`,
    {
      status: state.latestStatus,
      capabilityLabels: runtime.capabilities,
      metadata: buildWorkerMetadata(runtime, state)
    }
  );
}

function createRequest(baseUrl: string, authToken: string): WorkerDispatchOrchestrationRequest {
  return <T>(method: string, path: string, payload?: Record<string, unknown>) =>
    requestJson<T>(baseUrl, authToken, method, path, payload);
}

async function main() {
  const runtime = buildRuntime();
  const authToken = getOptionalEnv("CODEX_SWARM_API_TOKEN")
    ?? getOptionalEnv("CODEX_SWARM_AUTH_TOKEN")
    ?? getOptionalEnv("CODEX_SWARM_DEV_AUTH_TOKEN")
    ?? getOptionalEnv("DEV_AUTH_TOKEN");

  if (!authToken) {
    throw new Error("Missing CODEX_SWARM_API_TOKEN / CODEX_SWARM_AUTH_TOKEN / CODEX_SWARM_DEV_AUTH_TOKEN / DEV_AUTH_TOKEN");
  }

  const pollIntervalMs = parseIntegerEnv("CODEX_SWARM_WORKER_POLL_INTERVAL_MS", 2000, 250);
  const reconcileOnStart = parseBooleanEnv(getOptionalEnv("CODEX_SWARM_RECONCILE_ON_START"), true);
  const state: WorkerDaemonState = {
    latestChecks: evaluateWorkerRuntimeDependencies(runtime),
    latestStatus: "online",
    stopping: false,
    lastError: null,
    lastResult: null,
    metrics: {
      cpuPercent: 0,
      memoryPercent: roundMetric(clampPercentage(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)),
      queueDepth: 0,
      sessionCount: 0,
      activeClaims: 0
    },
    cpuSnapshot: readCpuSnapshot()
  };

  const missingChecks = state.latestChecks.filter((check) => check.status === "missing");

  if (missingChecks.length > 0) {
    throw new Error(`Worker runtime dependencies missing: ${missingChecks.map((check) => `${check.name} (${check.detail})`).join(", ")}`);
  }

  await mkdir(runtime.workspaceRoot, { recursive: true });

  const executeTool = runtime.codexTransport.kind === "streamable_http"
    ? createStreamableHttpToolExecutor()
    : createLocalCodexCliExecutor({
        command: runtime.codexCommand
      });
  const request = createRequest(runtime.controlPlaneUrl, authToken);
  const heartbeatAbortController = new AbortController();

  await ensureWorkerNode(runtime.controlPlaneUrl, authToken, runtime, buildWorkerMetadata(runtime, state));
  await updateDrainState(runtime.controlPlaneUrl, authToken, runtime.nodeId, "active");
  await heartbeatWorkerNode(runtime.controlPlaneUrl, authToken, runtime, state);

  if (reconcileOnStart) {
    await reconcileWorkerNode(runtime.controlPlaneUrl, authToken, runtime.nodeId, "service_startup").catch((error) => {
      console.warn(`worker reconcile failed on startup: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  const stop = async (signal: string) => {
    if (state.stopping) {
      return;
    }

    state.stopping = true;
    heartbeatAbortController.abort();
    console.log(`worker daemon received ${signal}; draining after current assignment`);
    await updateDrainState(runtime.controlPlaneUrl, authToken, runtime.nodeId, "draining", `${signal.toLowerCase()}_received`).catch(() => undefined);
  };

  process.on("SIGINT", () => {
    void stop("SIGINT");
  });
  process.on("SIGTERM", () => {
    void stop("SIGTERM");
  });

  const heartbeatLoop = (async () => {
    while (!state.stopping) {
      try {
        await heartbeatWorkerNode(runtime.controlPlaneUrl, authToken, runtime, state);
      } catch (error) {
        console.warn(`worker heartbeat failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        await sleep(runtime.heartbeatIntervalSeconds * 1000, undefined, {
          signal: heartbeatAbortController.signal
        });
      } catch {
        break;
      }
    }
  })();

  try {
    while (!state.stopping) {
      try {
        const result = await runManagedWorkerDispatch({
          request,
          nodeId: runtime.nodeId,
          workspaceRoot: runtime.workspaceRoot,
          executeTool
        });

        if (!result) {
          state.lastError = null;
          state.lastResult = null;
          await sleep(pollIntervalMs);
          continue;
        }

        state.lastResult = result;
        state.lastError = result.error;
        console.log(JSON.stringify({
          assignmentId: result.assignmentId,
          runId: result.runId,
          sessionId: result.sessionId,
          status: result.status,
          error: result.error
        }));
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
        console.error(`worker dispatch loop error: ${state.lastError}`);
        await sleep(pollIntervalMs);
      }
    }
  } finally {
    await heartbeatWorkerNode(runtime.controlPlaneUrl, authToken, runtime, state, "offline").catch(() => undefined);
    await updateDrainState(runtime.controlPlaneUrl, authToken, runtime.nodeId, "drained", "service_stopped").catch(() => undefined);
    await heartbeatLoop.catch(() => undefined);
  }
}

await main();
