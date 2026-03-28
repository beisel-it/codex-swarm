import { describe, expect, it } from "vitest";

import type { WorkerDispatchAssignment, WorkerNodeRuntime } from "@codex-swarm/contracts";

import {
  buildRedisDispatchQueueKeys,
  buildRemoteWorkerBootstrap,
  buildWorkerDrainStatus,
  canNodeAcceptDispatch,
  deserializeDispatchAssignment,
  evaluateWorkerRuntimeDependencies,
  RedisDispatchQueue,
  serializeDispatchAssignment
} from "../src/dispatch.js";

class InMemoryRedisDispatchClient {
  private readonly lists = new Map<string, string[]>();
  private readonly hashes = new Map<string, Map<string, string>>();

  async rPush(key: string, value: string): Promise<number> {
    const list = this.ensureList(key);
    list.push(value);
    return list.length;
  }

  async lPush(key: string, value: string): Promise<number> {
    const list = this.ensureList(key);
    list.unshift(value);
    return list.length;
  }

  async blPop(
    key: string,
    _timeoutSeconds: number
  ): Promise<{ key: string; element: string } | null> {
    const list = this.ensureList(key);
    const element = list.shift();

    return element ? { key, element } : null;
  }

  async hSet(key: string, field: string, value: string): Promise<number> {
    const hash = this.ensureHash(key);
    hash.set(field, value);
    return 1;
  }

  async hDel(key: string, field: string): Promise<number> {
    const hash = this.ensureHash(key);
    return hash.delete(field) ? 1 : 0;
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return this.ensureHash(key).get(field);
  }

  getList(key: string) {
    return [...this.ensureList(key)];
  }

  getHashValue(key: string, field: string) {
    return this.ensureHash(key).get(field);
  }

  private ensureList(key: string) {
    let list = this.lists.get(key);

    if (!list) {
      list = [];
      this.lists.set(key, list);
    }

    return list;
  }

  private ensureHash(key: string) {
    let hash = this.hashes.get(key);

    if (!hash) {
      hash = new Map<string, string>();
      this.hashes.set(key, hash);
    }

    return hash;
  }
}

function createAssignment(overrides: Partial<WorkerDispatchAssignment> = {}): WorkerDispatchAssignment {
  return {
    id: "550e8400-e29b-41d4-a716-446655440010",
    runId: "550e8400-e29b-41d4-a716-446655440001",
    taskId: "550e8400-e29b-41d4-a716-446655440002",
    agentId: "550e8400-e29b-41d4-a716-446655440003",
    repositoryId: "550e8400-e29b-41d4-a716-446655440004",
    repositoryName: "codex-swarm",
    queue: "worker-dispatch",
    state: "queued",
    stickyNodeId: null,
    preferredNodeId: null,
    requiredCapabilities: [],
    worktreePath: "/tmp/codex-swarm/run-001/agent-001",
    branchName: null,
    prompt: "Run the task",
    profile: "default",
    sandbox: "danger-full-access",
    approvalPolicy: "never",
    includePlanTool: false,
    metadata: {},
    attempt: 0,
    maxAttempts: 3,
    leaseTtlSeconds: 300,
    createdAt: new Date("2026-03-28T12:00:00.000Z"),
    ...overrides
  };
}

function createRuntime(overrides: Partial<WorkerNodeRuntime> = {}): WorkerNodeRuntime {
  return {
    nodeId: "node-a",
    nodeName: "node-a",
    state: "active",
    workspaceRoot: "/srv/codex-swarm",
    codexCommand: ["codex", "mcp-server"],
    controlPlaneUrl: "https://control-plane.internal",
    postgresUrl: "postgres://postgres:postgres@db.internal:5432/codex",
    redisUrl: "redis://cache.internal:6379/0",
    queueKeyPrefix: "codex-swarm",
    capabilities: ["default"],
    credentialEnvNames: ["OPENAI_API_KEY"],
    heartbeatIntervalSeconds: 30,
    ...overrides
  };
}

describe("dispatch helpers", () => {
  it("builds stable Redis queue keys", () => {
    expect(buildRedisDispatchQueueKeys("codex-swarm")).toEqual({
      pending: "codex-swarm:worker-dispatch:pending",
      inflight: "codex-swarm:worker-dispatch:inflight",
      leases: "codex-swarm:worker-dispatch:leases",
      nodeState: "codex-swarm:worker-dispatch:node-state"
    });
  });

  it("round-trips dispatch assignments through serialization", () => {
    const assignment = createAssignment();

    expect(deserializeDispatchAssignment(serializeDispatchAssignment(assignment))).toEqual(assignment);
  });

  it("evaluates runtime dependencies and emits bootstrap environment", () => {
    const runtime = createRuntime();
    const dispatch = createAssignment();
    const bootstrap = buildRemoteWorkerBootstrap({ runtime, dispatch });

    expect(bootstrap.environment).toMatchObject({
      CODEX_SWARM_NODE_ID: "node-a",
      CODEX_SWARM_CONTROL_PLANE_URL: "https://control-plane.internal",
      CODEX_SWARM_REDIS_URL: "redis://cache.internal:6379/0",
      CODEX_SWARM_DISPATCH_ID: dispatch.id,
      CODEX_SWARM_AGENT_ID: dispatch.agentId
    });
    expect(bootstrap.checks).toContainEqual({
      name: "artifact_store",
      status: "degraded",
      detail: "artifactBaseUrl not configured; worker can run but artifact uploads remain local-only"
    });
    expect(evaluateWorkerRuntimeDependencies(runtime).map((check) => check.name)).toEqual([
      "control_plane",
      "postgres",
      "redis",
      "artifact_store",
      "codex_cli",
      "workspace_root"
    ]);
  });

  it("derives drain behavior from the target node state", () => {
    expect(canNodeAcceptDispatch("active")).toBe(true);
    expect(canNodeAcceptDispatch("draining")).toBe(false);

    expect(buildWorkerDrainStatus({
      nodeId: "node-a",
      targetState: "draining",
      reason: "maintenance window",
      allowActiveAssignments: true
    }, "active")).toEqual({
      nodeId: "node-a",
      previousState: "active",
      targetState: "draining",
      shouldAcceptAssignments: false,
      shouldKeepHeartbeats: true,
      requiresRedisPause: true,
      reason: "maintenance window"
    });
  });
});

describe("RedisDispatchQueue", () => {
  it("claims work for active nodes and records inflight leases", async () => {
    const client = new InMemoryRedisDispatchClient();
    const queue = new RedisDispatchQueue(client, "codex-swarm");
    const assignment = createAssignment();
    const keys = queue.getQueueKeys();

    await queue.enqueue(assignment);

    const claimed = await queue.claim({
      nodeId: "node-a",
      timeoutSeconds: 0
    });

    expect(claimed).toEqual(assignment);
    expect(client.getHashValue(keys.inflight, assignment.id)).toBe(serializeDispatchAssignment(assignment));
    expect(client.getHashValue(keys.leases, assignment.id)).toContain("\"nodeId\":\"node-a\"");
  });

  it("does not claim work while the node is draining", async () => {
    const client = new InMemoryRedisDispatchClient();
    const queue = new RedisDispatchQueue(client, "codex-swarm");
    const assignment = createAssignment();

    await queue.enqueue(assignment);
    await queue.setNodeState("node-a", "draining");

    await expect(queue.claim({ nodeId: "node-a", timeoutSeconds: 0 })).resolves.toBeNull();
  });

  it("requeues assignments with retry metadata and clears inflight state", async () => {
    const client = new InMemoryRedisDispatchClient();
    const queue = new RedisDispatchQueue(client, "codex-swarm");
    const assignment = createAssignment();
    const keys = queue.getQueueKeys();

    await queue.enqueue(assignment);
    await queue.claim({ nodeId: "node-a", timeoutSeconds: 0 });

    const retried = await queue.requeue({
      assignment,
      reason: "worker lost heartbeat"
    });

    expect(retried).toMatchObject({
      state: "retrying",
      attempt: 1,
      metadata: {
        requeueReason: "worker lost heartbeat"
      }
    });
    expect(client.getHashValue(keys.inflight, assignment.id)).toBeUndefined();
    expect(client.getHashValue(keys.leases, assignment.id)).toBeUndefined();
    expect(client.getList(keys.pending)).toHaveLength(1);
    expect(
      deserializeDispatchAssignment(client.getList(keys.pending)[0] ?? "")
    ).toMatchObject({
      state: "retrying",
      attempt: 1
    });
  });
});
