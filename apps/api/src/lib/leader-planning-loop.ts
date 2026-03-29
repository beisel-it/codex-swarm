import type { RunDetail, Task } from "@codex-swarm/contracts";
import {
  buildLeaderPlanningPrompt,
  buildLeaderReslicePrompt,
  orderLeaderPlanTasks,
  parseLeaderPlanOutput,
  type WorkerTaskOutcome
} from "@codex-swarm/orchestration";
import {
  CodexServerSupervisor,
  CodexSessionRuntime,
  SessionRegistry,
  type CodexToolExecutor,
  materializePlanArtifact
} from "@codex-swarm/worker";

import { checkpointRunBudget } from "./run-budget-guard.js";

export interface LeaderPlanningLoopRequest {
  <T>(method: string, path: string, payload?: Record<string, unknown>): Promise<T>;
}

export interface LeaderPlanningLoopInput {
  request: LeaderPlanningLoopRequest;
  runId: string;
  workspaceRoot: string;
  actorId: string;
  runtimeConfig: {
    cwd: string;
    profile: string;
    sandbox: string;
    approvalPolicy: string;
    includePlanTool?: boolean;
    workerNodeId?: string;
    placementConstraintLabels?: string[];
  };
  executeTool: CodexToolExecutor;
  supervisorCommand?: string[];
  startPrompt?: string;
  planningPrompt?: string;
  agentName?: string;
  agentRole?: string;
}

export interface LeaderPlanningLoopResult {
  agentId: string;
  sessionId: string;
  threadId: string;
  planArtifactPath: string;
  tasks: Task[];
  startOutput: string;
  planningOutput: string;
  continuedAt: string | null;
}

export interface LeaderResliceLoopInput {
  request: LeaderPlanningLoopRequest;
  runId: string;
  parentTaskId: string;
  actorId: string;
  workerOutcome: WorkerTaskOutcome;
  executeTool: CodexToolExecutor;
  supervisorCommand?: string[];
}

export interface LeaderResliceLoopResult {
  agentId: string;
  sessionId: string;
  threadId: string;
  tasks: Task[];
  planningOutput: string;
  continuedAt: string | null;
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

export async function runLeaderPlanningLoop(input: LeaderPlanningLoopInput): Promise<LeaderPlanningLoopResult> {
  const registry = new SessionRegistry();
  registry.seed({
    sessionId: `bootstrap-${input.runId}`,
    runId: input.runId,
    agentId: `bootstrap-agent-${input.runId}`,
    worktreePath: input.workspaceRoot
  });

  const supervisor = new CodexServerSupervisor({
    config: input.runtimeConfig,
    ...(input.supervisorCommand ? { command: input.supervisorCommand } : {})
  });
  const runtime = new CodexSessionRuntime({
    registry,
    supervisor,
    executeTool: input.executeTool
  });

  try {
    const startPrompt = input.startPrompt
      ?? `Start the leader orchestration session for run ${input.runId}.`;
    const started = await runtime.startSession(`bootstrap-${input.runId}`, startPrompt);
    const startBudgetState = await checkpointRunBudget(
      input.request,
      input.runId,
      "leader.start",
      started.response
    );

    if (!startBudgetState.continueAllowed) {
      throw new Error("run budget requires policy exception approval");
    }

    const agent = await input.request<{
      id: string;
    }>("POST", "/api/v1/agents", {
      runId: input.runId,
      name: input.agentName ?? "leader",
      role: input.agentRole ?? "tech-lead",
      status: "idle",
      session: {
        threadId: started.session.threadId,
        cwd: input.workspaceRoot,
        sandbox: input.runtimeConfig.sandbox,
        approvalPolicy: input.runtimeConfig.approvalPolicy,
        includePlanTool: input.runtimeConfig.includePlanTool ?? false,
        workerNodeId: input.runtimeConfig.workerNodeId,
        placementConstraintLabels: input.runtimeConfig.placementConstraintLabels ?? [],
        metadata: {
          source: "leader-planning-loop",
          actorId: input.actorId
        }
      }
    });

    const runDetail = await input.request<RunDetail>("GET", `/api/v1/runs/${input.runId}`);
    const persistedSession = runDetail.sessions.find((session) => session.agentId === agent.id);

    if (!persistedSession) {
      throw new Error(`persisted leader session for agent ${agent.id} was not found`);
    }

    await input.request(
      "POST",
      `/api/v1/sessions/${persistedSession.id}/transcript`,
      {
        entries: buildTranscriptEntries(startPrompt, started.response.output)
      }
    );

    const persistedRegistry = new SessionRegistry();
    persistedRegistry.hydrate([
      {
        sessionId: persistedSession.id,
        runId: input.runId,
        agentId: agent.id,
        worktreePath: persistedSession.cwd,
        state: persistedSession.state,
        threadId: persistedSession.threadId,
        staleReason: persistedSession.staleReason,
        lastHeartbeatAt: null,
        createdAt: toDate((persistedSession as unknown as Record<string, unknown>).createdAt as Date | string | null | undefined) ?? new Date(),
        updatedAt: toDate((persistedSession as unknown as Record<string, unknown>).updatedAt as Date | string | null | undefined) ?? new Date()
      }
    ]);

    const continueRuntime = new CodexSessionRuntime({
      registry: persistedRegistry,
      supervisor,
      executeTool: input.executeTool
    });
    const continued = await continueRuntime.continueSession(
      persistedSession.id,
      input.planningPrompt ?? buildLeaderPlanningPrompt(runDetail.goal)
    );
    const planningPrompt = input.planningPrompt ?? buildLeaderPlanningPrompt(runDetail.goal);
    const planningBudgetState = await checkpointRunBudget(
      input.request,
      input.runId,
      "leader.plan",
      continued.response
    );

    if (!planningBudgetState.continueAllowed) {
      throw new Error("run budget requires policy exception approval");
    }

    await input.request(
      "POST",
      `/api/v1/sessions/${persistedSession.id}/transcript`,
      {
        entries: buildTranscriptEntries(planningPrompt, continued.response.output)
      }
    );

    const plan = parseLeaderPlanOutput(continued.response.output);
    const orderedTasks = orderLeaderPlanTasks(plan);

    const planArtifact = await materializePlanArtifact({
      cwd: input.workspaceRoot,
      plan: {
        goal: runDetail.goal,
        ...(plan.summary ? { summary: plan.summary } : {}),
        tasks: orderedTasks.map((task) => ({
          title: task.title,
          role: task.role,
          description: task.description,
          acceptanceCriteria: task.acceptanceCriteria
        }))
      }
    });

    await input.request("POST", "/api/v1/artifacts", {
      runId: input.runId,
      kind: "plan",
      path: planArtifact.path,
      contentType: "text/markdown",
      metadata: {
        relativePath: planArtifact.relativePath,
        source: "leader-planning-loop"
      }
    });

    await input.request("PATCH", `/api/v1/runs/${input.runId}/status`, {
      status: "planning",
      planArtifactPath: planArtifact.path
    });

    const createdTaskIds = new Map<string, string>();
    const createdTasks: Task[] = [];

    for (const task of orderedTasks) {
      const createdTask = await input.request<Task>("POST", "/api/v1/tasks", {
        runId: input.runId,
        title: task.title,
        description: task.description,
        role: task.role,
        priority: createdTasks.length + 1,
        dependencyIds: task.dependencyKeys.map((key: string) => {
          const dependencyId = createdTaskIds.get(key);

          if (!dependencyId) {
            throw new Error(`task dependency ${key} has not been created yet`);
          }

          return dependencyId;
        }),
        acceptanceCriteria: task.acceptanceCriteria
      });

      createdTaskIds.set(task.key, createdTask.id);
      createdTasks.push(createdTask);
    }

    return {
      agentId: agent.id,
      sessionId: persistedSession.id,
      threadId: persistedSession.threadId,
      planArtifactPath: planArtifact.path,
      tasks: createdTasks,
      startOutput: started.response.output,
      planningOutput: continued.response.output,
      continuedAt: continued.session.lastHeartbeatAt?.toISOString() ?? null
    };
  } finally {
    await runtime.stopSession(`bootstrap-${input.runId}`).catch(() => undefined);
  }
}

export async function runLeaderResliceLoop(input: LeaderResliceLoopInput): Promise<LeaderResliceLoopResult | null> {
  if (input.workerOutcome.status !== "needs_slicing" && input.workerOutcome.status !== "blocked") {
    return null;
  }

  const runDetail = await input.request<RunDetail>("GET", `/api/v1/runs/${input.runId}`);
  const parentTask = runDetail.tasks.find((task) => task.id === input.parentTaskId);
  const leaderAgent = runDetail.agents.find((agent) => agent.role === "tech-lead");

  if (!parentTask || !leaderAgent) {
    return null;
  }

  const persistedSession = runDetail.sessions.find((session) => session.agentId === leaderAgent.id);

  if (!persistedSession) {
    return null;
  }

  const registry = new SessionRegistry();
  registry.hydrate([
    {
      sessionId: persistedSession.id,
      runId: input.runId,
      agentId: leaderAgent.id,
      worktreePath: persistedSession.cwd,
      state: persistedSession.state,
      threadId: persistedSession.threadId,
      staleReason: persistedSession.staleReason,
      lastHeartbeatAt: null,
      createdAt: toDate((persistedSession as unknown as Record<string, unknown>).createdAt as Date | string | null | undefined) ?? new Date(),
      updatedAt: toDate((persistedSession as unknown as Record<string, unknown>).updatedAt as Date | string | null | undefined) ?? new Date()
    }
  ]);

  const runtime = new CodexSessionRuntime({
    registry,
    supervisor: new CodexServerSupervisor({
      config: {
        cwd: persistedSession.cwd,
        profile: "default",
        sandbox: persistedSession.sandbox,
        approvalPolicy: persistedSession.approvalPolicy,
        includePlanTool: persistedSession.includePlanTool
      },
      ...(input.supervisorCommand ? { command: input.supervisorCommand } : {})
    }),
    executeTool: input.executeTool
  });

  try {
    const planningPrompt = buildLeaderReslicePrompt({
      goal: runDetail.goal,
      taskTitle: parentTask.title,
      taskRole: parentTask.role,
      taskDescription: parentTask.description,
      workerSummary: input.workerOutcome.summary,
      blockingIssues: input.workerOutcome.blockingIssues,
      messages: input.workerOutcome.messages
    });
    const continued = await runtime.continueSession(persistedSession.id, planningPrompt);
    const planningBudgetState = await checkpointRunBudget(
      input.request,
      input.runId,
      "leader.reslice",
      continued.response
    );

    if (!planningBudgetState.continueAllowed) {
      throw new Error("run budget requires policy exception approval");
    }

    await input.request(
      "POST",
      `/api/v1/sessions/${persistedSession.id}/transcript`,
      {
        entries: buildTranscriptEntries(planningPrompt, continued.response.output)
      }
    );

    const plan = parseLeaderPlanOutput(continued.response.output);
    const orderedTasks = orderLeaderPlanTasks(plan);
    const createdTaskIds = new Map<string, string>();
    const createdTasks: Task[] = [];

    for (const task of orderedTasks) {
      const createdTask = await input.request<Task>("POST", "/api/v1/tasks", {
        runId: input.runId,
        parentTaskId: parentTask.id,
        title: task.title,
        description: task.description,
        role: task.role,
        priority: Math.min(parentTask.priority + 1, 5),
        dependencyIds: task.dependencyKeys.map((key) => {
          const dependencyId = createdTaskIds.get(key);

          if (!dependencyId) {
            throw new Error(`task dependency ${key} has not been created yet`);
          }

          return dependencyId;
        }),
        acceptanceCriteria: task.acceptanceCriteria
      });

      createdTaskIds.set(task.key, createdTask.id);
      createdTasks.push(createdTask);
    }

    return {
      agentId: leaderAgent.id,
      sessionId: persistedSession.id,
      threadId: persistedSession.threadId,
      tasks: createdTasks,
      planningOutput: continued.response.output,
      continuedAt: continued.session.lastHeartbeatAt?.toISOString() ?? null
    };
  } finally {
    await runtime.stopSession(persistedSession.id).catch(() => undefined);
  }
}
