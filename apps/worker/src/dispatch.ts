import type {
  RemoteWorkerBootstrap,
  WorkerDispatchAssignment,
  WorkerDrainCommand,
  WorkerDrainStatus,
  WorkerNodeRuntime,
  WorkerRuntimeDependencyCheck,
} from "@codex-swarm/contracts";

export interface RedisDispatchQueueKeys {
  pending: string;
  inflight: string;
  leases: string;
  nodeState: string;
}

export interface RedisDispatchLease {
  assignment: WorkerDispatchAssignment;
  nodeId: string;
  claimedAt: string;
}

export interface RedisDispatchClient {
  rPush(key: string, value: string): Promise<number>;
  lPush(key: string, value: string): Promise<number>;
  blPop(
    key: string,
    timeoutSeconds: number,
  ): Promise<{ key: string; element: string } | null>;
  hSet(key: string, field: string, value: string): Promise<number>;
  hDel(key: string, field: string): Promise<number>;
  hGet(key: string, field: string): Promise<string | undefined | null>;
}

export interface ClaimDispatchInput {
  nodeId: string;
  timeoutSeconds?: number;
}

export interface RequeueDispatchInput {
  assignment: WorkerDispatchAssignment;
  reason: string;
}

export interface BuildRemoteWorkerBootstrapInput {
  runtime: WorkerNodeRuntime;
  dispatch: WorkerDispatchAssignment;
}

const drainAcceptingStates = new Set(["active"]);
const heartbeatStates = new Set(["active", "draining"]);

export function buildRedisDispatchQueueKeys(
  prefix: string,
  queue = "worker-dispatch",
): RedisDispatchQueueKeys {
  const namespace = `${prefix}:${queue}`;

  return {
    pending: `${namespace}:pending`,
    inflight: `${namespace}:inflight`,
    leases: `${namespace}:leases`,
    nodeState: `${namespace}:node-state`,
  };
}

export function serializeDispatchAssignment(
  assignment: WorkerDispatchAssignment,
) {
  return JSON.stringify({
    ...assignment,
    createdAt: assignment.createdAt.toISOString(),
  });
}

export function deserializeDispatchAssignment(
  payload: string,
): WorkerDispatchAssignment {
  const parsed = JSON.parse(payload) as Omit<
    WorkerDispatchAssignment,
    "createdAt"
  > & { createdAt: string };

  return {
    ...parsed,
    createdAt: new Date(parsed.createdAt),
  };
}

export function createDispatchLease(
  assignment: WorkerDispatchAssignment,
  nodeId: string,
  now = new Date(),
): RedisDispatchLease {
  return {
    assignment,
    nodeId,
    claimedAt: now.toISOString(),
  };
}

export function serializeDispatchLease(lease: RedisDispatchLease) {
  return JSON.stringify({
    ...lease,
    assignment: {
      ...lease.assignment,
      createdAt: lease.assignment.createdAt.toISOString(),
    },
  });
}

export function deserializeDispatchLease(payload: string): RedisDispatchLease {
  const parsed = JSON.parse(payload) as Omit<
    RedisDispatchLease,
    "assignment"
  > & {
    assignment: Omit<WorkerDispatchAssignment, "createdAt"> & {
      createdAt: string;
    };
  };

  return {
    ...parsed,
    assignment: {
      ...parsed.assignment,
      createdAt: new Date(parsed.assignment.createdAt),
    },
  };
}

export function canNodeAcceptDispatch(state: WorkerNodeRuntime["state"]) {
  return drainAcceptingStates.has(state);
}

export function buildWorkerDrainStatus(
  command: WorkerDrainCommand,
  previousState: WorkerNodeRuntime["state"],
): WorkerDrainStatus {
  const targetState = command.targetState;

  return {
    nodeId: command.nodeId,
    previousState,
    targetState,
    shouldAcceptAssignments: drainAcceptingStates.has(targetState),
    shouldKeepHeartbeats: heartbeatStates.has(targetState),
    requiresRedisPause: targetState !== "active",
    reason: command.reason,
  };
}

export function evaluateWorkerRuntimeDependencies(
  runtime: WorkerNodeRuntime,
): WorkerRuntimeDependencyCheck[] {
  const requiresSharedArtifactStore = runtime.capabilities.includes("remote");

  const checks: WorkerRuntimeDependencyCheck[] = [
    {
      name: "control_plane",
      status: runtime.controlPlaneUrl.startsWith("http") ? "ready" : "missing",
      detail: runtime.controlPlaneUrl.startsWith("http")
        ? `control plane reachable via ${runtime.controlPlaneUrl}`
        : "controlPlaneUrl must be an http(s) URL",
    },
    {
      name: "postgres",
      status: runtime.postgresUrl.length > 0 ? "ready" : "missing",
      detail:
        runtime.postgresUrl.length > 0
          ? "postgres connection string configured"
          : "postgresUrl is missing",
    },
    {
      name: "redis",
      status: runtime.redisUrl.length > 0 ? "ready" : "missing",
      detail:
        runtime.redisUrl.length > 0
          ? "redis connection string configured"
          : "redisUrl is missing",
    },
    {
      name: "artifact_store",
      status: runtime.artifactBaseUrl
        ? "ready"
        : requiresSharedArtifactStore
          ? "missing"
          : "degraded",
      detail: runtime.artifactBaseUrl
        ? `artifact store configured at ${runtime.artifactBaseUrl}`
        : requiresSharedArtifactStore
          ? "artifactBaseUrl is required for remote workers because artifacts must remain accessible across nodes"
          : "artifactBaseUrl not configured; single-host workers can fall back to local artifact access",
    },
    {
      name: "codex_cli",
      status:
        runtime.codexTransport.kind === "streamable_http"
          ? "ready"
          : runtime.codexCommand.length > 0
            ? "ready"
            : "missing",
      detail:
        runtime.codexTransport.kind === "streamable_http"
          ? `streamable HTTP transport via ${runtime.codexTransport.url}`
          : runtime.codexCommand.length > 0
            ? `codex command: ${runtime.codexCommand.join(" ")}`
            : "codexCommand is missing",
    },
    {
      name: "workspace_root",
      status: runtime.workspaceRoot.length > 0 ? "ready" : "missing",
      detail:
        runtime.workspaceRoot.length > 0
          ? `workspace root: ${runtime.workspaceRoot}`
          : "workspaceRoot is missing",
    },
  ];

  return checks;
}

export function buildRemoteWorkerBootstrap(
  input: BuildRemoteWorkerBootstrapInput,
): RemoteWorkerBootstrap {
  return {
    runtime: input.runtime,
    dispatch: input.dispatch,
    environment: {
      CODEX_SWARM_NODE_ID: input.runtime.nodeId,
      CODEX_SWARM_NODE_NAME: input.runtime.nodeName,
      CODEX_SWARM_CONTROL_PLANE_URL: input.runtime.controlPlaneUrl,
      CODEX_SWARM_POSTGRES_URL: input.runtime.postgresUrl,
      CODEX_SWARM_REDIS_URL: input.runtime.redisUrl,
      CODEX_SWARM_MCP_TRANSPORT: input.runtime.codexTransport.kind,
      CODEX_SWARM_QUEUE_PREFIX: input.runtime.queueKeyPrefix,
      CODEX_SWARM_WORKSPACE_ROOT: input.runtime.workspaceRoot,
      CODEX_SWARM_DISPATCH_ID: input.dispatch.id,
      CODEX_SWARM_RUN_ID: input.dispatch.runId,
      CODEX_SWARM_TASK_ID: input.dispatch.taskId,
      CODEX_SWARM_AGENT_ID: input.dispatch.agentId,
      ...(input.runtime.codexTransport.kind === "streamable_http"
        ? {
            CODEX_SWARM_MCP_SERVER_URL: input.runtime.codexTransport.url,
            CODEX_SWARM_MCP_PROTOCOL_VERSION:
              input.runtime.codexTransport.protocolVersion,
          }
        : {}),
    },
    checks: evaluateWorkerRuntimeDependencies(input.runtime),
  };
}

export class RedisDispatchQueue {
  private readonly keys: RedisDispatchQueueKeys;

  constructor(
    private readonly client: RedisDispatchClient,
    prefix: string,
    queue = "worker-dispatch",
  ) {
    this.keys = buildRedisDispatchQueueKeys(prefix, queue);
  }

  getQueueKeys() {
    return this.keys;
  }

  async enqueue(assignment: WorkerDispatchAssignment) {
    return this.client.rPush(
      this.keys.pending,
      serializeDispatchAssignment(assignment),
    );
  }

  async claim(
    input: ClaimDispatchInput,
  ): Promise<WorkerDispatchAssignment | null> {
    const nodeState = await this.client.hGet(this.keys.nodeState, input.nodeId);

    if (
      nodeState &&
      !canNodeAcceptDispatch(nodeState as WorkerNodeRuntime["state"])
    ) {
      return null;
    }

    const result = await this.client.blPop(
      this.keys.pending,
      input.timeoutSeconds ?? 1,
    );

    if (!result) {
      return null;
    }

    const assignment = deserializeDispatchAssignment(result.element);
    const lease = createDispatchLease(assignment, input.nodeId);

    await this.client.hSet(
      this.keys.inflight,
      assignment.id,
      serializeDispatchAssignment(assignment),
    );
    await this.client.hSet(
      this.keys.leases,
      assignment.id,
      serializeDispatchLease(lease),
    );

    return assignment;
  }

  async acknowledge(assignmentId: string) {
    await this.client.hDel(this.keys.inflight, assignmentId);
    await this.client.hDel(this.keys.leases, assignmentId);
  }

  async requeue(input: RequeueDispatchInput) {
    const nextAssignment: WorkerDispatchAssignment = {
      ...input.assignment,
      state: "retrying",
      attempt: input.assignment.attempt + 1,
      metadata: {
        ...input.assignment.metadata,
        requeueReason: input.reason,
      },
    };

    await this.acknowledge(input.assignment.id);
    await this.client.lPush(
      this.keys.pending,
      serializeDispatchAssignment(nextAssignment),
    );
    return nextAssignment;
  }

  async setNodeState(nodeId: string, state: WorkerNodeRuntime["state"]) {
    await this.client.hSet(this.keys.nodeState, nodeId, state);
  }

  async getNodeState(nodeId: string) {
    const value = await this.client.hGet(this.keys.nodeState, nodeId);
    return value as WorkerNodeRuntime["state"] | null;
  }
}
