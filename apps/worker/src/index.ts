import {
  buildCodexServerCommand,
  buildPlanMarkdown,
  CodexSessionRuntime,
  CodexServerSupervisor,
  buildCodexSessionReplyRequest,
  buildCodexSessionStartRequest,
  buildSessionRecoveryPlan,
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
import { SessionRegistry } from "./session-registry.js";

export {
  buildCodexServerCommand,
  buildPlanMarkdown,
  CodexSessionRuntime,
  CodexServerSupervisor,
  buildCodexSessionReplyRequest,
  buildCodexSessionStartRequest,
  buildRedisDispatchQueueKeys,
  buildRemoteWorkerBootstrap,
  buildSessionRecoveryPlan,
  buildWorkerDrainStatus,
  canNodeAcceptDispatch,
  createDispatchLease,
  createWorktreePath,
  deserializeDispatchAssignment,
  deserializeDispatchLease,
  evaluateWorkerRuntimeDependencies,
  materializePlanArtifact,
  RedisDispatchQueue,
  SessionRegistry,
  serializeDispatchAssignment,
  serializeDispatchLease
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
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
