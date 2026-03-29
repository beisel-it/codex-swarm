import {
  buildCodexServerCommand,
  buildPlanMarkdown,
  CodexSessionRuntime,
  CodexServerSupervisor,
  createStreamableHttpToolExecutor,
  buildCodexSessionReplyRequest,
  buildCodexSessionStartRequest,
  cleanupWorktreePaths,
  buildSessionRecoveryPlan,
  materializeRepositoryWorkspace,
  materializePlanArtifact,
  createWorktreePath
} from "./runtime.js";
import {
  buildRedisDispatchQueueKeys,
  buildRemoteWorkerBootstrap,
  buildWorkerDrainStatus,
  canNodeAcceptDispatch,
  createDispatchLease,
  deserializeDispatchAssignment,
  deserializeDispatchLease,
  evaluateWorkerRuntimeDependencies,
  RedisDispatchQueue,
  serializeDispatchAssignment,
  serializeDispatchLease
} from "./dispatch.js";
import { claimAndProvisionDispatchWorkspace } from "./control-plane.js";
import { SessionRegistry } from "./session-registry.js";
import {
  executeTaskValidationTemplate,
  executeValidationCommand
} from "./validation-runner.js";

export {
  buildCodexServerCommand,
  buildPlanMarkdown,
  CodexSessionRuntime,
  CodexServerSupervisor,
  createStreamableHttpToolExecutor,
  buildCodexSessionReplyRequest,
  buildCodexSessionStartRequest,
  buildRedisDispatchQueueKeys,
  buildRemoteWorkerBootstrap,
  buildSessionRecoveryPlan,
  buildWorkerDrainStatus,
  canNodeAcceptDispatch,
  cleanupWorktreePaths,
  createDispatchLease,
  createWorktreePath,
  deserializeDispatchAssignment,
  deserializeDispatchLease,
  evaluateWorkerRuntimeDependencies,
  materializeRepositoryWorkspace,
  materializePlanArtifact,
  RedisDispatchQueue,
  SessionRegistry,
  serializeDispatchAssignment,
  serializeDispatchLease,
  claimAndProvisionDispatchWorkspace,
  executeTaskValidationTemplate,
  executeValidationCommand
};

export type {
  CodexServerConfig,
  CodexToolExecutor
} from "./runtime.js";

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const controlPlaneUrl = process.env.CODEX_SWARM_CONTROL_PLANE_URL;
  const nodeId = process.env.CODEX_SWARM_NODE_ID;
  const nodeName = process.env.CODEX_SWARM_NODE_NAME ?? nodeId ?? "worker-001";
  const workspaceRoot = process.env.CODEX_SWARM_WORKSPACE_ROOT;
  const redisUrl = process.env.CODEX_SWARM_REDIS_URL;
  const postgresUrl = process.env.CODEX_SWARM_POSTGRES_URL;

  if (controlPlaneUrl && nodeId && workspaceRoot && redisUrl && postgresUrl) {
    const runtime = {
      nodeId,
      nodeName,
      state: "active" as const,
      workspaceRoot,
      codexCommand: process.env.CODEX_SWARM_CODEX_COMMAND
        ? process.env.CODEX_SWARM_CODEX_COMMAND.split(" ")
        : ["codex"],
      codexTransport: process.env.CODEX_SWARM_MCP_TRANSPORT === "streamable_http"
        ? {
            kind: "streamable_http" as const,
            url: process.env.CODEX_SWARM_MCP_SERVER_URL ?? "",
            headers: {},
            protocolVersion: process.env.CODEX_SWARM_MCP_PROTOCOL_VERSION ?? "2025-11-25"
          }
        : {
            kind: "stdio" as const
          },
      controlPlaneUrl,
      artifactBaseUrl: process.env.CODEX_SWARM_ARTIFACT_BASE_URL,
      postgresUrl,
      redisUrl,
      queueKeyPrefix: process.env.CODEX_SWARM_QUEUE_PREFIX ?? "codex-swarm",
      capabilities: process.env.CODEX_SWARM_CAPABILITIES
        ? process.env.CODEX_SWARM_CAPABILITIES.split(",").filter(Boolean)
        : [],
      credentialEnvNames: [],
      heartbeatIntervalSeconds: Number(process.env.CODEX_SWARM_HEARTBEAT_INTERVAL_SECONDS ?? "30")
    };

    const authToken = process.env.CODEX_SWARM_AUTH_TOKEN ?? process.env.DEV_AUTH_TOKEN;
    const controlPlane = authToken
      ? {
          baseUrl: controlPlaneUrl,
          authToken
        }
      : {
          baseUrl: controlPlaneUrl
        };

    const provisioned = await claimAndProvisionDispatchWorkspace({
      runtime,
      controlPlane
    });

    console.log(JSON.stringify(provisioned, null, 2));
  } else {
    const worktreePath = createWorktreePath({
      rootDir: ".swarm/worktrees",
      repositorySlug: "codex-swarm",
      runId: "run-001",
      agentId: "worker-001"
    });

    const registry = new SessionRegistry();
    const record = registry.seed({
      sessionId: "session-001",
      runId: "run-001",
      agentId: "worker-001",
      worktreePath
    });

    registry.activate(record.sessionId, "thread-001");

    console.log(JSON.stringify({
      worktreePath,
      serverCommand: buildCodexServerCommand({
        cwd: worktreePath,
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        includePlanTool: true
      }),
      startRequest: buildCodexSessionStartRequest({
        prompt: "Create the worker session",
        config: {
          cwd: worktreePath,
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: true
        }
      }),
      replyRequest: buildCodexSessionReplyRequest({
        threadId: "thread-001",
        prompt: "Continue the worker session"
      }),
      session: registry.get("session-001")
    }, null, 2));
  }
}
