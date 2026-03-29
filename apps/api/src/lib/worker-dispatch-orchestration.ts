import type {
  Repository,
  RunDetail,
  Session,
  WorkerDispatchAssignment
} from "@codex-swarm/contracts";
import {
  cleanupWorktreePaths,
  CodexServerSupervisor,
  CodexSessionRuntime,
  type CodexToolExecutor,
  executeTaskValidationTemplate,
  materializeRepositoryWorkspace,
  SessionRegistry
} from "@codex-swarm/worker";

import { checkpointRunBudget } from "./run-budget-guard.js";

export interface WorkerDispatchOrchestrationRequest {
  <T>(method: string, path: string, payload?: Record<string, unknown>): Promise<T>;
}

export interface WorkerDispatchOrchestrationInput {
  request: WorkerDispatchOrchestrationRequest;
  nodeId: string;
  workspaceRoot: string;
  executeTool: CodexToolExecutor;
  supervisorCommand?: string[];
}

export interface WorkerDispatchOrchestrationResult {
  assignmentId: string;
  runId: string;
  sessionId: string;
  workspacePath: string;
  status: "completed" | "retrying" | "failed";
  output: string | null;
  error: string | null;
  supervisorStatus: "stopped" | "failed";
}

function buildTranscriptEntries(prompt: string, output: string) {
  return [
    {
      kind: "prompt",
      text: prompt,
      metadata: {}
    },
    {
      kind: "response",
      text: output,
      metadata: {}
    }
  ];
}

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function toSessionRecord(session: Session, worktreePath: string) {
  return {
    sessionId: session.id,
    runId: "unknown-run",
    agentId: session.agentId,
    worktreePath,
    threadId: session.threadId,
    state: session.state,
    staleReason: session.staleReason,
    lastHeartbeatAt: toDate((session as unknown as Record<string, unknown>).lastHeartbeatAt as Date | string | null | undefined),
    createdAt: toDate((session as unknown as Record<string, unknown>).createdAt as Date | string | null | undefined) ?? new Date(),
    updatedAt: toDate((session as unknown as Record<string, unknown>).updatedAt as Date | string | null | undefined) ?? new Date()
  };
}

async function failAssignment(
  request: WorkerDispatchOrchestrationRequest,
  assignment: WorkerDispatchAssignment,
  nodeId: string,
  reason: string
) {
  return request<WorkerDispatchAssignment>(
    "PATCH",
    `/api/v1/worker-dispatch-assignments/${assignment.id}`,
    {
      nodeId,
      status: "failed",
      reason
    }
  );
}

export async function runManagedWorkerDispatch(
  input: WorkerDispatchOrchestrationInput
): Promise<WorkerDispatchOrchestrationResult | null> {
  const assignment = await input.request<WorkerDispatchAssignment | null>(
    "POST",
    `/api/v1/worker-nodes/${input.nodeId}/claim-dispatch`
  );

  if (!assignment) {
    return null;
  }

  const runDetail = await input.request<RunDetail>("GET", `/api/v1/runs/${assignment.runId}`);
  const repositories = await input.request<Repository[]>("GET", "/api/v1/repositories");
  const repository = repositories.find((candidate) => candidate.id === assignment.repositoryId);

  if (!repository) {
    const updated = await failAssignment(input.request, assignment, input.nodeId, "repository_not_found");

    return {
      assignmentId: assignment.id,
      runId: assignment.runId,
      sessionId: assignment.sessionId ?? "missing-session",
      workspacePath: assignment.worktreePath,
      status: updated.state as WorkerDispatchOrchestrationResult["status"],
      output: null,
      error: "repository_not_found",
      supervisorStatus: "failed"
    };
  }

  const workspace = await materializeRepositoryWorkspace({
    repository,
    destinationPath: assignment.worktreePath,
    branch: assignment.branchName ?? repository.defaultBranch
  });
  const supervisor = new CodexServerSupervisor({
    config: {
      cwd: workspace.path,
      profile: assignment.profile,
      sandbox: assignment.sandbox,
      approvalPolicy: assignment.approvalPolicy,
      includePlanTool: assignment.includePlanTool
    },
    ...(input.supervisorCommand ? { command: input.supervisorCommand } : {})
  });

  try {
    const existingSession = assignment.sessionId
      ? runDetail.sessions.find((candidate) => candidate.id === assignment.sessionId)
      : undefined;
    const registry = new SessionRegistry();
    let persistedSession = existingSession;
    let responseOutput: string | null = null;
    let sessionId = assignment.sessionId ?? crypto.randomUUID();
    let supervisorStatus: WorkerDispatchOrchestrationResult["supervisorStatus"] = "stopped";

    if (persistedSession?.threadId) {
      registry.hydrate([
        {
          ...toSessionRecord(persistedSession, workspace.path),
          runId: assignment.runId
        }
      ]);

      const runtime = new CodexSessionRuntime({
        registry,
        supervisor,
        executeTool: input.executeTool
      });
      const continued = await runtime.continueSession(persistedSession.id, assignment.prompt);
      await checkpointRunBudget(
        input.request,
        assignment.runId,
        "worker.dispatch",
        continued.response
      );
      await input.request(
        "POST",
        `/api/v1/sessions/${persistedSession.id}/transcript`,
        {
          entries: buildTranscriptEntries(assignment.prompt, continued.response.output)
        }
      );
      responseOutput = continued.response.output;
      sessionId = persistedSession.id;
      const stopped = await runtime.stopSession(persistedSession.id);
      supervisorStatus = stopped.supervisor.status === "failed" ? "failed" : "stopped";
    } else {
      registry.seed({
        sessionId,
        runId: assignment.runId,
        agentId: assignment.agentId,
        worktreePath: workspace.path
      });

      const runtime = new CodexSessionRuntime({
        registry,
        supervisor,
        executeTool: input.executeTool
      });
      const started = await runtime.startSession(sessionId, assignment.prompt);
      await checkpointRunBudget(
        input.request,
        assignment.runId,
        "worker.dispatch",
        started.response
      );
      const createdSession = await input.request<Session>(
        "POST",
        `/api/v1/agents/${assignment.agentId}/session`,
        {
          threadId: started.response.threadId,
          cwd: workspace.path,
          sandbox: assignment.sandbox,
          approvalPolicy: assignment.approvalPolicy,
          includePlanTool: assignment.includePlanTool,
          workerNodeId: input.nodeId,
          placementConstraintLabels: assignment.requiredCapabilities,
          metadata: {
            source: "worker-dispatch-bootstrap",
            assignmentId: assignment.id
          }
        }
      );
      await input.request(
        "POST",
        `/api/v1/worker-dispatch-assignments/${assignment.id}/session`,
        {
          sessionId: createdSession.id
        }
      );
      persistedSession = createdSession;
      sessionId = createdSession.id;
      await input.request(
        "POST",
        `/api/v1/sessions/${createdSession.id}/transcript`,
        {
          entries: buildTranscriptEntries(assignment.prompt, started.response.output)
        }
      );
      responseOutput = started.response.output;
      const stopped = await runtime.stopSession(sessionId);
      supervisorStatus = stopped.supervisor.status === "failed" ? "failed" : "stopped";
    }

    if (assignment.taskId) {
      const task = runDetail.tasks.find((candidate) => candidate.id === assignment.taskId);

      if (task) {
        for (const template of task.validationTemplates) {
          await executeTaskValidationTemplate({
            request: input.request,
            runId: assignment.runId,
            taskId: task.id,
            templateName: template.name,
            cwd: workspace.path,
            runDetail
          });
        }
      }
    }

    const updated = await input.request<WorkerDispatchAssignment>(
      "PATCH",
      `/api/v1/worker-dispatch-assignments/${assignment.id}`,
      {
        nodeId: input.nodeId,
        status: "completed"
      }
    );

    return {
      assignmentId: assignment.id,
      runId: assignment.runId,
      sessionId,
      workspacePath: workspace.path,
      status: updated.state as WorkerDispatchOrchestrationResult["status"],
      output: responseOutput,
      error: null,
      supervisorStatus
    };
  } catch (error) {
    await cleanupWorktreePaths([workspace.path]);
    const reason = error instanceof Error ? error.message : String(error);
    const updated = await failAssignment(input.request, assignment, input.nodeId, reason);

    return {
      assignmentId: assignment.id,
      runId: assignment.runId,
      sessionId: assignment.sessionId ?? "ephemeral-session",
      workspacePath: workspace.path,
      status: updated.state as WorkerDispatchOrchestrationResult["status"],
      output: null,
      error: reason,
      supervisorStatus: "failed"
    };
  }
}
