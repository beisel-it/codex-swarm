import { rm } from "node:fs/promises";

import type { ActorIdentity } from "@codex-swarm/contracts";
import {
  createLocalCodexCliExecutor,
  createWorktreePath,
  materializeRepositoryWorkspace,
  resolveWorkspaceProvisioningMode
} from "@codex-swarm/worker";
import type { FastifyInstance } from "fastify";

import { controlPlaneEvents, timelineEvent } from "./control-plane-events.js";
import { runLeaderPlanningLoop, type LeaderPlanningLoopRequest } from "./leader-planning-loop.js";

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function resolveCodexExecutionProfile(envName: string) {
  return getOptionalEnv(envName) ?? "default";
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

function createLeaderPlanningRequest(app: FastifyInstance, authContext: ActorIdentity): LeaderPlanningLoopRequest {
  return async <T>(method: string, path: string, payload?: Record<string, unknown>) => {
    if (method === "POST" && path === "/api/v1/agents") {
      return app.controlPlane.createAgent(payload as never, authContext) as Promise<T>;
    }

    if (method === "GET" && path.startsWith("/api/v1/runs/")) {
      return app.controlPlane.getRun(path.split("/").at(-1) ?? "", authContext) as Promise<T>;
    }

    if (method === "GET" && path.startsWith("/api/v1/project-teams/")) {
      return app.controlPlane.getProjectTeam(path.split("/").at(-1) ?? "", authContext) as Promise<T>;
    }

    if (method === "POST" && path === "/api/v1/artifacts") {
      return app.controlPlane.createArtifact(payload as never, authContext) as Promise<T>;
    }

    if (method === "PATCH" && path.startsWith("/api/v1/runs/") && path.endsWith("/status")) {
      const runId = path.split("/")[4] ?? "";
      return app.controlPlane.updateRunStatus(runId, payload as never, authContext) as Promise<T>;
    }

    if (method === "POST" && path === "/api/v1/tasks") {
      return app.controlPlane.createTask(payload as never, authContext) as Promise<T>;
    }

    if (method === "POST" && path.startsWith("/api/v1/sessions/") && path.endsWith("/transcript")) {
      const sessionId = path.split("/")[4] ?? "";
      const entries = ((payload as { entries?: unknown[] } | undefined)?.entries) ?? [];
      return app.controlPlane.appendSessionTranscript(sessionId, entries as never, authContext) as Promise<T>;
    }

    if (method === "POST" && path.includes("/budget-checkpoints")) {
      const runId = path.split("/")[4] ?? "";
      return app.controlPlane.recordRunBudgetCheckpoint(runId, payload as never, authContext) as Promise<T>;
    }

    throw new Error(`Unsupported leader planning request ${method} ${path}`);
  };
}

export async function startRunNow(
  app: FastifyInstance,
  input: {
    authContext: ActorIdentity;
    runId: string;
    startedFrom: string;
  }
) {
  const run = await app.controlPlane.getRun(input.runId, input.authContext);
  const projectTeam = run.projectTeamId
    ? await app.controlPlane.getProjectTeam(run.projectTeamId, input.authContext)
    : null;
  const leaderMember = projectTeam?.members.find((member) => member.role === "tech-lead")
    ?? projectTeam?.members.find((member) => member.profile === "leader")
    ?? null;

  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    throw new Error(`run ${input.runId} cannot be started from status ${run.status}`);
  }

  if (run.tasks.length === 0) {
    const repositories = await app.controlPlane.listRepositories(input.authContext);
    const repository = repositories.find((candidate) => candidate.id === run.repositoryId);

    if (!repository) {
      throw new Error(`repository ${run.repositoryId} not found for run ${input.runId}`);
    }

    const workspaceRoot = getOptionalEnv("CODEX_SWARM_WORKSPACE_ROOT") ?? ".swarm/worktrees";
    const workspaceProvisioningMode = resolveWorkspaceProvisioningMode();
    const leaderWorkspace = createWorktreePath({
      rootDir: workspaceRoot,
      repositorySlug: repository.name,
      runId: run.id,
      agentId: "leader",
      mode: workspaceProvisioningMode
    });
    await rm(leaderWorkspace, {
      recursive: true,
      force: true
    });
    await materializeRepositoryWorkspace({
      repository,
      destinationPath: leaderWorkspace,
      branch: run.branchName ?? repository.defaultBranch,
      reuseExisting: workspaceProvisioningMode === "shared"
    });

    await runLeaderPlanningLoop({
      request: createLeaderPlanningRequest(app, input.authContext),
      runId: run.id,
      workspaceRoot: leaderWorkspace,
      actorId: input.authContext.principal,
      runtimeConfig: {
        cwd: leaderWorkspace,
        profile: resolveCodexExecutionProfile("CODEX_SWARM_LEADER_PROFILE"),
        sandbox: getOptionalEnv("CODEX_SWARM_LEADER_SANDBOX") ?? "workspace-write",
        approvalPolicy: getOptionalEnv("CODEX_SWARM_LEADER_APPROVAL_POLICY") ?? "on-request",
        includePlanTool: true,
        ...(getOptionalEnv("CODEX_SWARM_NODE_ID") ? { workerNodeId: getOptionalEnv("CODEX_SWARM_NODE_ID")! } : {}),
        placementConstraintLabels: ["workspace-write"]
      },
      agentName: leaderMember?.name ?? "leader",
      agentRole: leaderMember?.role ?? "tech-lead",
      executeTool: createLocalCodexCliExecutor({
        command: parseCodexCommand(getOptionalEnv("CODEX_SWARM_CODEX_COMMAND"))
      })
    });
  }

  const refreshedRun = await app.controlPlane.getRun(input.runId, input.authContext);

  if (refreshedRun.status !== "awaiting_approval") {
    await app.controlPlane.updateRunStatus(input.runId, {
      status: "in_progress",
      planArtifactPath: refreshedRun.planArtifactPath ?? undefined
    }, input.authContext);
  }

  await app.controlPlane.enqueueRunnableWorkerDispatches(input.runId, input.authContext);
  await app.controlPlane.reconcileRunExecutionState(input.runId, input.authContext);

  const startedRun = await app.controlPlane.getRun(input.runId, input.authContext);

  await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runStatusUpdated, {
    runId: startedRun.id,
    entityId: startedRun.id,
    status: startedRun.status,
    summary: `Run ${startedRun.id} started from ${input.startedFrom}`
  }));

  return startedRun;
}
