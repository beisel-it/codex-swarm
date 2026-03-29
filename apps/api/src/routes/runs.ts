import { mkdir } from "node:fs/promises";

import type { FastifyPluginAsync } from "fastify";
import { createLocalCodexCliExecutor, createWorktreePath } from "@codex-swarm/worker";
import type { ActorIdentity, AgentCreateInput, ArtifactCreateInput, RunBudgetCheckpointInput, RunStatusUpdateInput, TaskCreateInput } from "@codex-swarm/contracts";

import {
  idParamSchema,
  runBudgetCheckpointSchema,
  runBranchPublishSchema,
  runCreateSchema,
  runPullRequestHandoffSchema,
  runStatusUpdateSchema
} from "../http/schemas.js";
import { requireAuthorizedAction, resolveRunStatusAction } from "../lib/authorization.js";
import { controlPlaneEvents, timelineEvent } from "../lib/control-plane-events.js";
import { getRetentionPolicy } from "../lib/governance-config.js";
import { isRecoverableDatabaseError } from "../lib/database-fallback.js";
import { requireValue } from "../lib/require-value.js";
import { runLeaderPlanningLoop, type LeaderPlanningLoopRequest } from "../lib/leader-planning-loop.js";

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
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

function createLeaderPlanningRequest(app: Parameters<FastifyPluginAsync>[0], authContext: ActorIdentity): LeaderPlanningLoopRequest {
  return async <T>(method: string, path: string, payload?: Record<string, unknown>) => {
    if (method === "POST" && path === "/api/v1/agents") {
      return app.controlPlane.createAgent(payload as unknown as AgentCreateInput, authContext) as Promise<T>;
    }

    if (method === "GET" && path.startsWith("/api/v1/runs/")) {
      return app.controlPlane.getRun(path.split("/").at(-1) ?? "", authContext) as Promise<T>;
    }

    if (method === "POST" && path === "/api/v1/artifacts") {
      return app.controlPlane.createArtifact(payload as unknown as ArtifactCreateInput, authContext) as Promise<T>;
    }

    if (method === "PATCH" && path.startsWith("/api/v1/runs/") && path.endsWith("/status")) {
      const runId = path.split("/")[4] ?? "";
      return app.controlPlane.updateRunStatus(runId, payload as unknown as RunStatusUpdateInput, authContext) as Promise<T>;
    }

    if (method === "POST" && path === "/api/v1/tasks") {
      return app.controlPlane.createTask(payload as unknown as TaskCreateInput, authContext) as Promise<T>;
    }

    if (method === "POST" && path.includes("/budget-checkpoints")) {
      const runId = path.split("/")[4] ?? "";
      return app.controlPlane.recordRunBudgetCheckpoint(runId, payload as unknown as RunBudgetCheckpointInput, authContext) as Promise<T>;
    }

    throw new Error(`Unsupported leader planning request ${method} ${path}`);
  };
}

export const runRoutes: FastifyPluginAsync = async (app) => {
  app.get("/runs", async (request) => {
    const repositoryId = typeof request.query === "object" && request.query && "repositoryId" in request.query
      ? String(request.query.repositoryId)
      : undefined;

    try {
        return await app.controlPlane.listRuns(repositoryId, request.authContext);
    } catch (error) {
      if (app.config.NODE_ENV !== "production" && isRecoverableDatabaseError(error)) {
        app.observability.recordRecoverableDatabaseFallback("runs.list", error);
        return [];
      }

      throw error;
    }
  });

  app.get("/runs/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return app.controlPlane.getRun(id, request.authContext);
  });

  app.get("/runs/:id/audit-export", async (request) => {
    return app.observability.withTrace("api.runs.audit-export", async () => {
      const { id } = idParamSchema.parse(request.params);
      const auditExport = requireValue(
        await app.controlPlane.exportRunAudit(id, request.authContext, getRetentionPolicy(app.config), request.authContext),
        "control plane returned no audit export"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runAuditExported, {
        runId: id,
        entityId: id,
        status: auditExport.run.status,
        summary: `Audit export generated for run ${id}`
      }));

      return auditExport;
    }, { route: "runs.audit-export" });
  });

  app.post("/runs", async (request, reply) => {
    return app.observability.withTrace("api.runs.create", async () => {
      requireAuthorizedAction(request.authContext, "run.create");
      const input = runCreateSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.createRun(input, request.authContext.principal, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runCreated, {
        runId: run.id,
        entityId: run.id,
        status: run.status,
        summary: `Run created for repository ${run.repositoryId}`
      }));

      return reply.code(201).send(run);
    }, { route: "runs.create" });
  });

  app.post("/runs/:id/start", async (request) => {
    return app.observability.withTrace("api.runs.start", async () => {
      const { id } = idParamSchema.parse(request.params);
      requireAuthorizedAction(request.authContext, "run.create");
      const run = await app.controlPlane.getRun(id, request.authContext);

      if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
        throw new Error(`run ${id} cannot be started from status ${run.status}`);
      }

      if (run.tasks.length === 0) {
        const repositories = await app.controlPlane.listRepositories(request.authContext);
        const repository = repositories.find((candidate) => candidate.id === run.repositoryId);

        if (!repository) {
          throw new Error(`repository ${run.repositoryId} not found for run ${id}`);
        }

        const workspaceRoot = getOptionalEnv("CODEX_SWARM_WORKSPACE_ROOT") ?? ".swarm/worktrees";
        const leaderWorkspace = createWorktreePath({
          rootDir: workspaceRoot,
          repositorySlug: repository.name,
          runId: run.id,
          agentId: "leader"
        });
        await mkdir(leaderWorkspace, { recursive: true });

        await runLeaderPlanningLoop({
          request: createLeaderPlanningRequest(app, request.authContext),
          runId: run.id,
          workspaceRoot: leaderWorkspace,
          actorId: request.authContext.principal,
          runtimeConfig: {
            cwd: leaderWorkspace,
            profile: getOptionalEnv("CODEX_SWARM_LEADER_PROFILE") ?? "default",
            sandbox: getOptionalEnv("CODEX_SWARM_LEADER_SANDBOX") ?? "workspace-write",
            approvalPolicy: getOptionalEnv("CODEX_SWARM_LEADER_APPROVAL_POLICY") ?? "on-request",
            includePlanTool: true,
            ...(getOptionalEnv("CODEX_SWARM_NODE_ID") ? { workerNodeId: getOptionalEnv("CODEX_SWARM_NODE_ID")! } : {}),
            placementConstraintLabels: ["workspace-write"]
          },
          executeTool: createLocalCodexCliExecutor({
            command: parseCodexCommand(getOptionalEnv("CODEX_SWARM_CODEX_COMMAND"))
          })
        });
      }

      const refreshedRun = await app.controlPlane.getRun(id, request.authContext);

      if (refreshedRun.status !== "awaiting_approval") {
        await app.controlPlane.updateRunStatus(id, {
          status: "in_progress",
          planArtifactPath: refreshedRun.planArtifactPath ?? undefined
        }, request.authContext);
      }

      await app.controlPlane.enqueueRunnableWorkerDispatches(id, request.authContext);
      await app.controlPlane.reconcileRunExecutionState(id, request.authContext);

      const startedRun = await app.controlPlane.getRun(id, request.authContext);

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runStatusUpdated, {
        runId: startedRun.id,
        entityId: startedRun.id,
        status: startedRun.status,
        summary: `Run ${startedRun.id} started from the web control surface`
      }));

      return startedRun;
    }, { route: "runs.start" });
  });

  app.patch("/runs/:id/status", async (request) => {
    return app.observability.withTrace("api.runs.update-status", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runStatusUpdateSchema.parse(request.body);
      requireAuthorizedAction(request.authContext, resolveRunStatusAction(input.status));
      const run = requireValue(
        await app.controlPlane.updateRunStatus(id, input, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent(timelineEvent(
        input.status === "completed" ? controlPlaneEvents.runCompleted : controlPlaneEvents.runStatusUpdated,
        {
        runId: run.id,
        entityId: run.id,
        status: run.status,
        summary: `Run status updated to ${run.status}`
      }));

      return run;
    }, { route: "runs.update-status" });
  });

  app.post("/runs/:id/budget-checkpoints", async (request) => {
    return app.observability.withTrace("api.runs.budget-checkpoints", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runBudgetCheckpointSchema.parse(request.body);
      const budgetState = requireValue(
        await app.controlPlane.recordRunBudgetCheckpoint(id, input, request.authContext),
        "control plane returned no run budget state"
      );

      if (budgetState.decision === "awaiting_policy_exception") {
        await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runStatusUpdated, {
          runId: id,
          entityId: id,
          status: "awaiting_approval",
          summary: `Run paused for budget policy exception review after ${input.source}`
        }));
      }

      return budgetState;
    }, { route: "runs.budget-checkpoints" });
  });

  app.post("/runs/:id/publish-branch", async (request) => {
    return app.observability.withTrace("api.runs.publish-branch", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runBranchPublishSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.publishRunBranch(id, input, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runBranchPublished, {
        runId: run.id,
        entityId: run.id,
        status: run.handoffStatus,
        summary: `Branch ${run.publishedBranch ?? run.branchName ?? "unknown"} published`
      }));

      return run;
    }, { route: "runs.publish-branch" });
  });

  app.post("/runs/:id/pull-request-handoff", async (request) => {
    return app.observability.withTrace("api.runs.pull-request-handoff", async () => {
      const { id } = idParamSchema.parse(request.params);
      const input = runPullRequestHandoffSchema.parse(request.body);
      const run = requireValue(
        await app.controlPlane.createRunPullRequestHandoff(id, input, request.authContext),
        "control plane returned no run"
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.runPullRequestHandoffCreated, {
        runId: run.id,
        entityId: run.id,
        status: run.handoffStatus,
        summary: run.pullRequestUrl
          ? `Pull request handoff created at ${run.pullRequestUrl}`
          : "Manual pull request handoff prepared"
      }));

      return run;
    }, { route: "runs.pull-request-handoff" });
  });
};
