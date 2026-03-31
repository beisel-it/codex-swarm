import { execFile } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  Artifact,
  Repository,
  RunDetail,
  Session,
  ValidationHistoryEntry,
  WorkerDispatchAssignment
} from "@codex-swarm/contracts";
import {
  buildVerifierTaskExecutionPrompt,
  buildWorkerTaskExecutionPrompt,
  type VerifierTaskOutcome,
  parseVerifierTaskOutcome,
  parseWorkerTaskOutcome,
  type WorkerTaskOutcome
} from "@codex-swarm/orchestration";
import {
  cleanupWorktreePaths,
  CodexServerSupervisor,
  CodexSessionRuntime,
  type CodexToolExecutor,
  executeTaskValidationTemplate,
  materializeRepositoryWorkspace,
  resolveWorkspaceProvisioningMode,
  SessionRegistry
} from "@codex-swarm/worker";

import { runLeaderResliceLoop } from "./leader-planning-loop.js";
import { checkpointRunBudget } from "./run-budget-guard.js";

const execFileAsync = promisify(execFile);

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

interface RunMessage {
  id: string;
  runId: string;
  senderAgentId?: string | null;
  recipientAgentId?: string | null;
  kind: "direct" | "broadcast" | "system";
  body: string;
  createdAt: string | Date;
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

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function resolveCodexExecutionProfile() {
  return getOptionalEnv("CODEX_SWARM_WORKER_PROFILE") ?? "default";
}

function resolveAssignmentExecutionProfile(_profile: string | null | undefined) {
  // Project-team profiles identify the intended swarm role, not a guaranteed
  // local Codex CLI profile on the worker host. Worker execution must use the
  // configured runtime profile instead of forwarding role names like
  // "leader" or "design-researcher" into `codex exec -p ...`.
  return resolveCodexExecutionProfile();
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

function resolveAssignmentTask(runDetail: RunDetail, assignment: WorkerDispatchAssignment) {
  return assignment.taskId
    ? runDetail.tasks.find((candidate) => candidate.id === assignment.taskId) ?? null
    : null;
}

function resolveAssignmentKind(assignment: WorkerDispatchAssignment) {
  return assignment.metadata?.assignmentKind === "verification" ? "verification" : "worker";
}

function buildInboundMessages(
  runDetail: RunDetail,
  assignment: WorkerDispatchAssignment,
  messages: RunMessage[]
) {
  const agentNames = new Map(runDetail.agents.map((agent) => [agent.id, agent.name] as const));

  return messages
    .filter((message) => message.senderAgentId !== assignment.agentId)
    .filter((message) => message.kind === "broadcast" || message.recipientAgentId === assignment.agentId)
    .map((message) => ({
      sender: message.senderAgentId ? (agentNames.get(message.senderAgentId) ?? message.senderAgentId) : "system",
      body: message.body
    }));
}

function buildVerifierMessages(
  runDetail: RunDetail,
  assignment: WorkerDispatchAssignment,
  messages: RunMessage[]
) {
  const workerAgentId = typeof assignment.metadata?.workerAgentId === "string"
    ? assignment.metadata.workerAgentId
    : null;
  const agentNames = new Map(runDetail.agents.map((agent) => [agent.id, agent.name] as const));

  return messages
    .filter((message) => message.kind === "broadcast"
      || message.senderAgentId === workerAgentId
      || message.recipientAgentId === workerAgentId
      || message.recipientAgentId === assignment.agentId)
    .map((message) => ({
      sender: message.senderAgentId ? (agentNames.get(message.senderAgentId) ?? message.senderAgentId) : "system",
      body: message.body
    }));
}

async function postRunMessage(
  request: WorkerDispatchOrchestrationRequest,
  input: {
    runId: string;
    senderAgentId?: string;
    recipientAgentId?: string;
    kind: "direct" | "broadcast" | "system";
    body: string;
  }
) {
  if (input.kind === "direct" && !input.recipientAgentId) {
    return null;
  }

  return request("POST", "/api/v1/messages", input);
}

async function publishWorkerOutcomeMessages(
  request: WorkerDispatchOrchestrationRequest,
  runDetail: RunDetail,
  assignment: WorkerDispatchAssignment,
  summary: string,
  outcome: {
    summary?: string;
    status: string;
    messages: Array<{ target: string; body: string }>;
    blockingIssues?: string[];
    artifacts?: unknown[];
  }
) {
  const leaderAgent = runDetail.agents.find((agent) => agent.role === "tech-lead" && agent.id !== assignment.agentId) ?? null;
  const postedTargets = new Set<string>();

  if (leaderAgent) {
    const leaderBody = `[${outcome.status}] ${summary}`;
    await postRunMessage(request, {
      runId: assignment.runId,
      senderAgentId: assignment.agentId,
      recipientAgentId: leaderAgent.id,
      kind: "direct",
      body: leaderBody
    });
    postedTargets.add(`agent:${leaderAgent.id}:${leaderBody}`);
  }

  for (const message of outcome.messages) {
    if (message.target === "leader" && leaderAgent) {
      const dedupeKey = `agent:${leaderAgent.id}:${message.body}`;

      if (!postedTargets.has(dedupeKey)) {
        await postRunMessage(request, {
          runId: assignment.runId,
          senderAgentId: assignment.agentId,
          recipientAgentId: leaderAgent.id,
          kind: "direct",
          body: message.body
        });
        postedTargets.add(dedupeKey);
      }

      continue;
    }

    if (message.target === "broadcast") {
      await postRunMessage(request, {
        runId: assignment.runId,
        senderAgentId: assignment.agentId,
        kind: "broadcast",
        body: message.body
      });
      continue;
    }

    if (message.target.startsWith("agent:")) {
      const recipientAgentId = message.target.slice("agent:".length);

      if (recipientAgentId && recipientAgentId !== assignment.agentId) {
        await postRunMessage(request, {
          runId: assignment.runId,
          senderAgentId: assignment.agentId,
          recipientAgentId,
          kind: "direct",
          body: message.body
        });
      }

      continue;
    }

    if (message.target.startsWith("role:")) {
      const role = message.target.slice("role:".length);
      const matchingAgents = runDetail.agents.filter((agent) => agent.role === role && agent.id !== assignment.agentId);

      for (const recipient of matchingAgents) {
        await postRunMessage(request, {
          runId: assignment.runId,
          senderAgentId: assignment.agentId,
          recipientAgentId: recipient.id,
          kind: "direct",
          body: message.body
        });
      }
    }
  }
}

async function runLeaderResliceLoopSafely(
  request: WorkerDispatchOrchestrationRequest,
  runDetail: RunDetail,
  assignment: WorkerDispatchAssignment,
  workerOutcome: WorkerTaskOutcome,
  executeTool: CodexToolExecutor,
  supervisorCommand?: string[]
) {
  try {
    await runLeaderResliceLoop({
      request,
      runId: assignment.runId,
      parentTaskId: assignment.taskId!,
      actorId: assignment.agentId,
      workerOutcome,
      executeTool,
      ...(supervisorCommand ? { supervisorCommand } : {})
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const leaderAgent = runDetail.agents.find((agent) => agent.role === "tech-lead" && agent.id !== assignment.agentId) ?? null
    const body = `Leader follow-up planning failed after ${assignment.metadata?.assignmentKind === "verification" ? "verification" : "worker"} outcome: ${detail}`

    await postRunMessage(request, {
      runId: assignment.runId,
      senderAgentId: assignment.agentId,
      ...(leaderAgent ? { recipientAgentId: leaderAgent.id, kind: "direct" as const } : { kind: "system" as const }),
      body
    })
  }
}

function toLeaderResliceOutcomeFromVerification(outcome: VerifierTaskOutcome): WorkerTaskOutcome | null {
  if (outcome.status === "passed") {
    return null;
  }

  if (outcome.status === "blocked") {
    const hasActionableBlocker = outcome.blockingIssues.length > 0 || outcome.messages.length > 0;

    if (!hasActionableBlocker) {
      return null;
    }

    return {
      summary: outcome.summary,
      status: "blocked",
      blockerKind: "actionable",
      messages: outcome.messages,
      blockingIssues: outcome.blockingIssues,
      ...(outcome.artifacts ? { artifacts: outcome.artifacts } : {})
    };
  }

  const hasReworkSignal = outcome.changeRequests.length > 0 || outcome.findings.length > 0;

  if (!hasReworkSignal) {
    return null;
  }

  return {
    summary: outcome.summary,
    status: "needs_slicing",
    messages: outcome.messages,
    blockingIssues: [
      ...outcome.changeRequests,
      ...outcome.findings
    ],
    ...(outcome.artifacts ? { artifacts: outcome.artifacts } : {})
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

async function detectWorkspaceBranch(cwd: string) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    const branch = stdout.trim();

    if (!branch || branch === "HEAD") {
      return null;
    }

    return branch;
  } catch {
    return null;
  }
}

async function synchronizeRunBranchContext(
  request: WorkerDispatchOrchestrationRequest,
  runDetail: RunDetail,
  workspacePath: string
) {
  const branchName = await detectWorkspaceBranch(workspacePath);

  if (!branchName || branchName === runDetail.branchName) {
    return branchName;
  }

  await request(
    "PATCH",
    `/api/v1/runs/${runDetail.id}`,
    {
      branchName
    }
  );

  return branchName;
}

async function recordWorkerOutcomeArtifacts(
  request: WorkerDispatchOrchestrationRequest,
  assignment: WorkerDispatchAssignment,
  workspacePath: string,
  outcome: {
    artifacts?: Array<{
      kind: string;
      path: string;
      contentType: string;
      contentBase64?: string;
      metadata?: Record<string, unknown>;
    }>;
  }
) {
  for (const artifact of outcome.artifacts ?? []) {
    const resolvedArtifactPath = isAbsolute(artifact.path)
      ? artifact.path
      : resolve(workspacePath, artifact.path);

    await request(
      "POST",
      "/api/v1/artifacts",
      {
        runId: assignment.runId,
        taskId: assignment.taskId,
        kind: artifact.kind,
        path: artifact.path,
        contentType: artifact.contentType,
        ...(artifact.contentBase64
          ? { contentBase64: artifact.contentBase64 }
          : {}),
        metadata: {
          source: "worker-outcome",
          assignmentId: assignment.id,
          workspacePath,
          resolvedArtifactPath,
          ...(artifact.metadata ?? {})
        }
      }
    );
  }
}

async function recordWorkerOutcomeHandoff(
  request: WorkerDispatchOrchestrationRequest,
  runDetail: RunDetail,
  repository: Repository,
  assignment: WorkerDispatchAssignment,
  outcome: ReturnType<typeof parseWorkerTaskOutcome>,
  branchName: string | null
) {
  const effectiveBranch = outcome.branchPublish?.branchName
    ?? outcome.pullRequestHandoff?.headBranch
    ?? branchName
    ?? runDetail.branchName
    ?? assignment.branchName
    ?? repository.defaultBranch;

  if (outcome.branchPublish) {
    await request(
      "POST",
      `/api/v1/runs/${assignment.runId}/publish-branch`,
      {
        branchName: effectiveBranch,
        publishedBy: assignment.agentId,
        ...(outcome.branchPublish.commitSha ? { commitSha: outcome.branchPublish.commitSha } : {}),
        ...(outcome.branchPublish.notes ? { notes: outcome.branchPublish.notes } : {})
      }
    );
  }

  if (outcome.pullRequestHandoff) {
    await request(
      "POST",
      `/api/v1/runs/${assignment.runId}/pull-request-handoff`,
      {
        title: outcome.pullRequestHandoff.title,
        body: outcome.pullRequestHandoff.body,
        createdBy: assignment.agentId,
        provider: repository.provider,
        ...(outcome.pullRequestHandoff.baseBranch ? { baseBranch: outcome.pullRequestHandoff.baseBranch } : {}),
        headBranch: outcome.pullRequestHandoff.headBranch ?? effectiveBranch,
        ...(outcome.pullRequestHandoff.url ? { url: outcome.pullRequestHandoff.url } : {}),
        ...(outcome.pullRequestHandoff.number ? { number: outcome.pullRequestHandoff.number } : {}),
        ...(outcome.pullRequestHandoff.status ? { status: outcome.pullRequestHandoff.status } : {})
      }
    );
  }
}

function buildVerifierArtifactContexts(taskArtifacts: Artifact[]) {
  return taskArtifacts.map((artifact) => ({
    kind: artifact.kind,
    path: artifact.path,
    contentType: artifact.contentType,
    summary: typeof artifact.metadata?.source === "string"
      ? `source=${artifact.metadata.source}`
      : null
  }));
}

function buildVerifierValidationContexts(taskValidations: ValidationHistoryEntry[]) {
  return taskValidations.map((validation) => ({
    name: validation.name,
    status: validation.status,
    command: validation.command,
    summary: validation.summary ?? null,
    artifactPath: validation.artifactPath ?? null
  }));
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

  const effectiveBranchName = runDetail.branchName ?? assignment.branchName ?? repository.defaultBranch;
  const workspaceProvisioningMode = resolveWorkspaceProvisioningMode();
  const workspace = await materializeRepositoryWorkspace({
    repository,
    destinationPath: assignment.worktreePath,
    branch: effectiveBranchName,
    reuseExisting: workspaceProvisioningMode === "shared"
  });
  const supervisor = new CodexServerSupervisor({
    config: {
      cwd: workspace.path,
      profile: resolveAssignmentExecutionProfile(assignment.profile),
      sandbox: assignment.sandbox,
      approvalPolicy: assignment.approvalPolicy,
      includePlanTool: assignment.includePlanTool
    },
    ...(input.supervisorCommand ? { command: input.supervisorCommand } : {})
  });

  try {
    const runMessages = await input.request<RunMessage[]>("GET", `/api/v1/messages?runId=${assignment.runId}`);
    const task = resolveAssignmentTask(runDetail, assignment);
    const assignmentKind = resolveAssignmentKind(assignment);
    const inboundMessages = buildInboundMessages(runDetail, assignment, runMessages);
    const effectivePrompt = task
      ? assignmentKind === "verification"
        ? buildVerifierTaskExecutionPrompt({
          repositoryName: repository.name,
          runGoal: runDetail.goal,
          runContext: runDetail.context,
          taskTitle: task.title,
          taskRole: task.role,
          taskDescription: [task.description, assignment.prompt].filter(Boolean).join("\n\nOperator brief:\n"),
          definitionOfDone: task.definitionOfDone,
          acceptanceCriteria: task.acceptanceCriteria,
          workerSummary: typeof assignment.metadata?.workerSummary === "string"
            ? assignment.metadata.workerSummary
            : "No worker summary was captured.",
          artifacts: buildVerifierArtifactContexts(
            (await input.request<Artifact[]>("GET", `/api/v1/artifacts?runId=${assignment.runId}`))
              .filter((artifact) => artifact.taskId === task.id)
          ),
          validations: buildVerifierValidationContexts(
            (await input.request<ValidationHistoryEntry[]>("GET", `/api/v1/validations?runId=${assignment.runId}`))
              .filter((validation) => validation.taskId === task.id)
          ),
          relevantMessages: buildVerifierMessages(runDetail, assignment, runMessages)
        })
        : buildWorkerTaskExecutionPrompt({
          repositoryName: repository.name,
          runGoal: runDetail.goal,
          runContext: runDetail.context,
          taskTitle: task.title,
          taskRole: task.role,
          taskDescription: [task.description, assignment.prompt].filter(Boolean).join("\n\nOperator brief:\n"),
          definitionOfDone: task.definitionOfDone,
          acceptanceCriteria: task.acceptanceCriteria,
          inboundMessages
        })
      : assignment.prompt;
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
      const continued = await runtime.continueSession(persistedSession.id, effectivePrompt);
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
          entries: buildTranscriptEntries(effectivePrompt, continued.response.output)
        }
      );
      responseOutput = continued.response.output;
      sessionId = persistedSession.id;
      const stopped = await runtime.stopSession(persistedSession.id);
      supervisorStatus = stopped.supervisor.status === "failed" ? "failed" : "stopped";
    } else {
      const runtimeSessionId = sessionId;
      registry.seed({
        sessionId: runtimeSessionId,
        runId: assignment.runId,
        agentId: assignment.agentId,
        worktreePath: workspace.path
      });

      const runtime = new CodexSessionRuntime({
        registry,
        supervisor,
        executeTool: input.executeTool
      });
      const started = await runtime.startSession(runtimeSessionId, effectivePrompt);
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
          entries: buildTranscriptEntries(effectivePrompt, started.response.output)
        }
      );
      responseOutput = started.response.output;
      const stopped = await runtime.stopSession(runtimeSessionId);
      supervisorStatus = stopped.supervisor.status === "failed" ? "failed" : "stopped";
    }

    let completionPayload: Record<string, unknown> | null = null;

    if (responseOutput && assignment.taskId) {
      if (assignmentKind === "verification") {
        const outcome = parseVerifierTaskOutcome(responseOutput);
        const leaderOutcome = toLeaderResliceOutcomeFromVerification(outcome);

        await recordWorkerOutcomeArtifacts(
          input.request,
          assignment,
          workspace.path,
          outcome
        );

        await publishWorkerOutcomeMessages(
          input.request,
          runDetail,
          assignment,
          outcome.summary,
          {
            summary: outcome.summary,
            status: outcome.status === "passed" ? "completed" : "blocked",
            messages: outcome.messages,
            blockingIssues: outcome.blockingIssues,
            ...(outcome.artifacts ? { artifacts: outcome.artifacts } : {})
          }
        );

        completionPayload = {
          outcome: {
            kind: "verification",
            summary: outcome.summary,
            outcomeStatus: outcome.status,
            findings: outcome.findings,
            changeRequests: outcome.changeRequests,
            evidence: [
              ...outcome.findings.map((finding) => `finding:${finding}`),
              ...outcome.changeRequests.map((request) => `change_request:${request}`),
              ...(outcome.artifacts ?? []).map((artifact) => `artifact:${artifact.path}`)
            ]
          }
        };

        if (leaderOutcome) {
          await runLeaderResliceLoopSafely(
            input.request,
            runDetail,
            assignment,
            leaderOutcome,
            input.executeTool,
            input.supervisorCommand
          );
        }
      } else {
        const outcome = parseWorkerTaskOutcome(responseOutput);
        const synchronizedBranchName = await synchronizeRunBranchContext(input.request, runDetail, workspace.path);

        await recordWorkerOutcomeArtifacts(
          input.request,
          assignment,
          workspace.path,
          outcome
        );

        await recordWorkerOutcomeHandoff(
          input.request,
          runDetail,
          repository,
          assignment,
          outcome,
          synchronizedBranchName
        );

        await publishWorkerOutcomeMessages(
          input.request,
          runDetail,
          assignment,
          outcome.summary,
          outcome
        );

        if (outcome.status === "needs_slicing" || (outcome.status === "blocked" && outcome.blockerKind === "actionable")) {
          await runLeaderResliceLoopSafely(
            input.request,
            runDetail,
            assignment,
            outcome,
            input.executeTool,
            input.supervisorCommand
          );
        }

        completionPayload = {
          outcome: {
            kind: "worker",
            summary: outcome.summary,
            outcomeStatus: outcome.status,
            blockingIssues: outcome.blockingIssues
          }
        };
      }
    }

    if (assignment.taskId && assignmentKind !== "verification") {
      const task = resolveAssignmentTask(runDetail, assignment);

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
        status: "completed",
        ...(completionPayload ?? {})
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
    if (workspaceProvisioningMode === "isolated") {
      await cleanupWorktreePaths([workspace.path]);
    }
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
