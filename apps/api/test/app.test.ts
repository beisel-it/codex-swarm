import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ControlPlaneService } from "../src/services/control-plane-service.js";
import { buildApp } from "../src/app.js";
import { HttpError } from "../src/lib/http-error.js";

const ids = {
  repository: "11111111-1111-4111-8111-111111111111",
  run: "22222222-2222-4222-8222-222222222222",
  taskA: "33333333-3333-4333-8333-333333333333",
  taskB: "44444444-4444-4444-8444-444444444444",
  agent: "55555555-5555-4555-8555-555555555555",
  session: "66666666-6666-4666-8666-666666666666"
} as const;

const controlPlane = {
  listRepositories: vi.fn(),
  createRepository: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  createRun: vi.fn(),
  updateRunStatus: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  listAgents: vi.fn(),
  createAgent: vi.fn(),
  listMessages: vi.fn(),
  createMessage: vi.fn(),
  listApprovals: vi.fn(),
  getApproval: vi.fn(),
  createApproval: vi.fn(),
  resolveApproval: vi.fn(),
  listValidations: vi.fn(),
  createValidation: vi.fn(),
  listArtifacts: vi.fn(),
  createArtifact: vi.fn()
};

class FakeVerticalSliceControlPlane {
  private readonly repositories = [
    {
      id: ids.repository,
      name: "codex-swarm",
      url: "https://example.com/codex-swarm.git",
      defaultBranch: "main",
      localPath: null,
      createdAt: new Date("2026-03-28T00:00:00.000Z"),
      updatedAt: new Date("2026-03-28T00:00:00.000Z")
    }
  ];

  private readonly runs = new Map<string, any>();

  async listRepositories() {
    return this.repositories;
  }

  async createRepository() {
    throw new Error("not implemented");
  }

  async listRuns(repositoryId?: string) {
    const runs = [...this.runs.values()];
    return repositoryId ? runs.filter((run) => run.repositoryId === repositoryId) : runs;
  }

  async getRun(runId: string) {
    const run = this.runs.get(runId);

    if (!run) {
      throw new HttpError(404, `run ${runId} not found`);
    }

    return run;
  }

  async createRun(input: any, createdBy: string) {
    const run = {
      id: ids.run,
      repositoryId: input.repositoryId,
      goal: input.goal,
      status: "pending",
      branchName: input.branchName ?? null,
      planArtifactPath: input.planArtifactPath ?? null,
      metadata: input.metadata,
      createdBy,
      createdAt: new Date("2026-03-28T00:00:00.000Z"),
      updatedAt: new Date("2026-03-28T00:00:00.000Z"),
      tasks: [],
      agents: [],
      sessions: []
    };

    this.runs.set(run.id, run);
    return run;
  }

  async updateRunStatus(runId: string, input: any) {
    const run = await this.getRun(runId);
    run.status = input.status;
    run.planArtifactPath = input.planArtifactPath ?? run.planArtifactPath;
    return run;
  }

  async listTasks(runId?: string) {
    const tasks = [...this.runs.values()].flatMap((run) => run.tasks);
    return runId ? tasks.filter((task) => task.runId === runId) : tasks;
  }

  async createTask(input: any) {
    const run = await this.getRun(input.runId);
    const task = {
      id: run.tasks.length === 0 ? ids.taskA : ids.taskB,
      runId: input.runId,
      parentTaskId: input.parentTaskId ?? null,
      title: input.title,
      description: input.description,
      role: input.role,
      status: input.dependencyIds.length > 0 ? "blocked" : "pending",
      priority: input.priority,
      ownerAgentId: input.ownerAgentId ?? null,
      dependencyIds: input.dependencyIds,
      acceptanceCriteria: input.acceptanceCriteria,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    run.tasks.push(task);
    return task;
  }

  async updateTaskStatus(taskId: string, input: any) {
    const run = [...this.runs.values()].find((candidate) => candidate.tasks.some((task: any) => task.id === taskId));

    if (!run) {
      throw new HttpError(404, `task ${taskId} not found`);
    }

    const task = run.tasks.find((candidate: any) => candidate.id === taskId);
    task.status = input.status;
    task.ownerAgentId = input.ownerAgentId ?? task.ownerAgentId;

    if (input.status === "completed") {
      for (const candidate of run.tasks) {
        if (candidate.status !== "blocked") {
          continue;
        }

        const ready = candidate.dependencyIds.every((dependencyId: string) =>
          run.tasks.find((dependencyTask: any) => dependencyTask.id === dependencyId)?.status === "completed");

        if (ready) {
          candidate.status = "pending";
        }
      }
    }

    return task;
  }

  async listAgents(runId?: string) {
    const agents = [...this.runs.values()].flatMap((run) => run.agents);
    return runId ? agents.filter((agent) => agent.runId === runId) : agents;
  }

  async createAgent(input: any) {
    const run = await this.getRun(input.runId);
    const agent = {
      id: ids.agent,
      runId: input.runId,
      name: input.name,
      role: input.role,
      status: input.status,
      worktreePath: input.worktreePath ?? null,
      branchName: input.branchName ?? null,
      currentTaskId: input.currentTaskId ?? null,
      lastHeartbeatAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    run.agents.push(agent);

    if (input.session) {
      run.sessions.push({
        id: ids.session,
        agentId: ids.agent,
        threadId: input.session.threadId,
        cwd: input.session.cwd,
        sandbox: input.session.sandbox,
        approvalPolicy: input.session.approvalPolicy,
        includePlanTool: input.session.includePlanTool,
        metadata: input.session.metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    return agent;
  }

  async listMessages() {
    return [];
  }

  async createMessage() {
    throw new Error("not implemented");
  }

  async listApprovals(runId?: string) {
    const approvals = [
      {
        id: "77777777-7777-4777-8777-777777777777",
        runId: ids.run,
        taskId: ids.taskA,
        kind: "plan",
        status: "pending",
        requestedPayload: {
          summary: "Review the execution plan"
        },
        resolutionPayload: {},
        requestedBy: "tech-lead",
        resolver: null,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        runId: "99999999-9999-4999-8999-999999999999",
        taskId: null,
        kind: "merge",
        status: "approved",
        requestedPayload: {
          summary: "Approve merge handoff"
        },
        resolutionPayload: {
          feedback: "ok"
        },
        requestedBy: "tech-lead",
        resolver: "reviewer",
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    return runId ? approvals.filter((approval) => approval.runId === runId) : approvals;
  }

  async getApproval(approvalId: string) {
    const approval = (await this.listApprovals()).find((candidate) => candidate.id === approvalId);

    if (!approval) {
      throw new HttpError(404, `approval ${approvalId} not found`);
    }

    return approval;
  }

  async createApproval(input: any) {
    return {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      runId: input.runId,
      taskId: input.taskId ?? null,
      kind: input.kind,
      status: "pending",
      requestedPayload: input.requestedPayload,
      resolutionPayload: {},
      requestedBy: input.requestedBy,
      resolver: null,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async resolveApproval(approvalId: string, input: any) {
    const approval = await this.getApproval(approvalId);

    return {
      ...approval,
      status: input.status,
      resolver: input.resolver,
      resolutionPayload: {
        ...input.resolutionPayload,
        feedback: input.feedback ?? null
      },
      resolvedAt: new Date(),
      updatedAt: new Date()
    };
  }

  async listValidations() {
    return [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        runId: ids.run,
        taskId: ids.taskA,
        name: "typecheck",
        status: "passed",
        command: "pnpm typecheck",
        summary: "Typecheck passed",
        artifactPath: "artifacts/validations/typecheck.json",
        artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
        artifacts: [
          {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            runId: ids.run,
            taskId: ids.taskA,
            kind: "report",
            path: "artifacts/validations/typecheck.json",
            contentType: "application/json",
            metadata: {
              suite: "typecheck"
            },
            createdAt: new Date()
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  }

  async createValidation(input: any) {
    return {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      runId: input.runId,
      taskId: input.taskId ?? null,
      name: input.name,
      status: input.status,
      command: input.command,
      summary: input.summary ?? null,
      artifactPath: input.artifactPath ?? null,
      artifactIds: input.artifactIds ?? [],
      artifacts: (input.artifactIds ?? []).map((artifactId: string) => ({
        id: artifactId,
        runId: input.runId,
        taskId: input.taskId ?? null,
        kind: "report",
        path: input.artifactPath ?? "artifacts/validations/report.json",
        contentType: "application/json",
        metadata: {},
        createdAt: new Date()
      })),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async listArtifacts() {
    return [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        runId: ids.run,
        taskId: ids.taskA,
        kind: "report",
        path: "artifacts/validations/typecheck.json",
        contentType: "application/json",
        metadata: {
          suite: "typecheck"
        },
        createdAt: new Date()
      }
    ];
  }

  async createArtifact(input: any) {
    return {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      runId: input.runId,
      taskId: input.taskId ?? null,
      kind: input.kind,
      path: input.path,
      contentType: input.contentType,
      metadata: input.metadata ?? {},
      createdAt: new Date()
    };
  }
}

describe("buildApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
  });

  it("serves health checks without authentication", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok"
    });

    await app.close();
  });

  it("rejects protected routes without the configured bearer token", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/runs"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "missing or invalid bearer token",
      details: null
    });

    await app.close();
  });

  it("routes authenticated requests to the control plane", async () => {
    controlPlane.listRuns.mockResolvedValueOnce([
      {
        id: "run-1",
        goal: "Ship alpha"
      }
    ]);

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/runs",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: "run-1",
        goal: "Ship alpha"
      }
    ]);
    expect(controlPlane.listRuns).toHaveBeenCalledWith(undefined);

    await app.close();
  });

  it("returns empty repository and run lists during local database bootstrap failures", async () => {
    const bootstrapError = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED"
    });

    controlPlane.listRepositories.mockRejectedValueOnce(bootstrapError);
    controlPlane.listRuns.mockRejectedValueOnce(bootstrapError);

    const app = await buildApp({
      config: {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "127.0.0.1",
        DATABASE_URL: "postgres://unused/dev",
        DEV_AUTH_TOKEN: "test-token",
        OPENAI_TRACING_DISABLED: true
      },
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const headers = {
      authorization: "Bearer test-token"
    };

    const repositoryResponse = await app.inject({
      method: "GET",
      url: "/api/v1/repositories",
      headers
    });

    const runResponse = await app.inject({
      method: "GET",
      url: "/api/v1/runs",
      headers
    });

    expect(repositoryResponse.statusCode).toBe(200);
    expect(repositoryResponse.headers["x-codex-swarm-degraded"]).toBe("database-unavailable");
    expect(repositoryResponse.json()).toEqual([]);

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json()).toEqual([]);

    await app.close();
  });

  it("lists approvals and forwards the optional runId filter", async () => {
    controlPlane.listApprovals.mockResolvedValueOnce([
      {
        id: "77777777-7777-4777-8777-777777777777",
        runId: ids.run,
        kind: "plan",
        status: "pending",
        requestedPayload: {},
        resolutionPayload: {},
        requestedBy: "tech-lead",
        resolver: null,
        resolvedAt: null
      }
    ]);

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/approvals?runId=${ids.run}`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: "77777777-7777-4777-8777-777777777777",
        runId: ids.run,
        kind: "plan",
        status: "pending",
        requestedPayload: {},
        resolutionPayload: {},
        requestedBy: "tech-lead",
        resolver: null,
        resolvedAt: null
      }
    ]);
    expect(controlPlane.listApprovals).toHaveBeenCalledWith(ids.run);

    await app.close();
  });

  it("exposes an empty event timeline when no live observability backend is injected", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/events",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);

    await app.close();
  });

  it("exposes a zeroed metrics snapshot when no live observability backend is injected", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/metrics",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      queueDepth: {
        runsPending: 0,
        tasksPending: 0,
        tasksBlocked: 0,
        approvalsPending: 0,
        busyAgents: 0
      },
      retries: {
        recoverableDatabaseFallbacks: 0,
        taskUnblocks: 0
      },
      failures: {
        runsFailed: 0,
        tasksFailed: 0,
        agentsFailed: 0,
        validationsFailed: 0,
        requestFailures: 0
      },
      eventsRecorded: 0
    });

    await app.close();
  });

  it("gets an approval by id", async () => {
    controlPlane.getApproval.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      runId: ids.run,
      taskId: ids.taskA,
      kind: "plan",
      status: "pending",
      requestedPayload: {
        summary: "Review the execution plan"
      },
      resolutionPayload: {},
      requestedBy: "tech-lead",
      resolver: null,
      resolvedAt: null
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/approvals/77777777-7777-4777-8777-777777777777",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "77777777-7777-4777-8777-777777777777",
      kind: "plan",
      status: "pending"
    });

    await app.close();
  });

  it("resolves approvals with structured reject feedback", async () => {
    controlPlane.resolveApproval.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      runId: ids.run,
      taskId: ids.taskA,
      kind: "plan",
      status: "rejected",
      requestedPayload: {
        summary: "Review the execution plan"
      },
      resolutionPayload: {
        feedback: "Please attach validation evidence"
      },
      requestedBy: "tech-lead",
      resolver: "reviewer-1",
      resolvedAt: "2026-03-28T12:00:00.000Z"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/approvals/77777777-7777-4777-8777-777777777777",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        status: "rejected",
        resolver: "reviewer-1",
        feedback: "Please attach validation evidence"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "rejected",
      resolver: "reviewer-1",
      resolutionPayload: {
        feedback: "Please attach validation evidence"
      }
    });
    expect(controlPlane.resolveApproval).toHaveBeenCalledWith(
      "77777777-7777-4777-8777-777777777777",
      {
        status: "rejected",
        resolver: "reviewer-1",
        feedback: "Please attach validation evidence",
        resolutionPayload: {}
      }
    );

    await app.close();
  });

  it("lists validation history entries with artifact-backed reports", async () => {
    controlPlane.listValidations.mockResolvedValueOnce([
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        runId: ids.run,
        taskId: ids.taskA,
        name: "typecheck",
        status: "passed",
        command: "pnpm typecheck",
        summary: "Typecheck passed",
        artifactPath: "artifacts/validations/typecheck.json",
        artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
        artifacts: [
          {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            runId: ids.run,
            taskId: ids.taskA,
            kind: "report",
            path: "artifacts/validations/typecheck.json",
            contentType: "application/json",
            metadata: {
              suite: "typecheck"
            },
            createdAt: "2026-03-28T12:00:00.000Z"
          }
        ],
        createdAt: "2026-03-28T12:00:00.000Z",
        updatedAt: "2026-03-28T12:05:00.000Z"
      }
    ]);

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/validations?runId=${ids.run}&taskId=${ids.taskA}`,
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
        artifacts: [
          expect.objectContaining({
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            kind: "report"
          })
        ]
      })
    ]);
    expect(controlPlane.listValidations).toHaveBeenCalledWith({
      runId: ids.run,
      taskId: ids.taskA
    });

    await app.close();
  });

  it("records validations with explicit artifact references", async () => {
    controlPlane.createValidation.mockResolvedValueOnce({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      runId: ids.run,
      taskId: ids.taskA,
      name: "typecheck",
      status: "passed",
      command: "pnpm typecheck",
      summary: "Typecheck passed",
      artifactPath: "artifacts/validations/typecheck.json",
      artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      artifacts: [
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          runId: ids.run,
          taskId: ids.taskA,
          kind: "report",
          path: "artifacts/validations/typecheck.json",
          contentType: "application/json",
          metadata: {},
          createdAt: "2026-03-28T12:00:00.000Z"
        }
      ],
      createdAt: "2026-03-28T12:00:00.000Z",
      updatedAt: "2026-03-28T12:05:00.000Z"
    });

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/validations",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        runId: ids.run,
        taskId: ids.taskA,
        name: "typecheck",
        status: "passed",
        command: "pnpm typecheck",
        summary: "Typecheck passed",
        artifactPath: "artifacts/validations/typecheck.json",
        artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      artifacts: [
        expect.objectContaining({
          kind: "report"
        })
      ]
    });
    expect(controlPlane.createValidation).toHaveBeenCalledWith({
      runId: ids.run,
      taskId: ids.taskA,
      name: "typecheck",
      status: "passed",
      command: "pnpm typecheck",
      summary: "Typecheck passed",
      artifactPath: "artifacts/validations/typecheck.json",
      artifactIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]
    });

    await app.close();
  });

  it("returns validation errors for invalid request bodies", async () => {
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/messages",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      },
      payload: {
        runId: "550e8400-e29b-41d4-a716-446655440000",
        kind: "direct",
        body: "Need review"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "validation_error"
    });

    await app.close();
  });

  it("maps control plane HttpError responses to their status code", async () => {
    controlPlane.getRun.mockRejectedValueOnce(new HttpError(404, "run run-404 not found"));

    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/runs/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer codex-swarm-dev-token"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "run run-404 not found",
      details: null
    });

    await app.close();
  });

  it("supports the run-task-agent-session vertical slice", async () => {
    const app = await buildApp({
      config: {
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "127.0.0.1",
        DATABASE_URL: "postgres://unused/test",
        DEV_AUTH_TOKEN: "test-token",
        OPENAI_TRACING_DISABLED: true
      },
      controlPlane: new FakeVerticalSliceControlPlane() as unknown as ControlPlaneService
    });

    const headers = {
      authorization: "Bearer test-token"
    };

    const createRunResponse = await app.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers,
      payload: {
        repositoryId: ids.repository,
        goal: "Implement the control plane vertical slice",
        metadata: {
          milestone: "M1"
        }
      }
    });

    expect(createRunResponse.statusCode).toBe(201);

    const createTaskAResponse = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers,
      payload: {
        runId: ids.run,
        title: "Persist task graph",
        description: "Store first task",
        role: "backend-developer",
        priority: 2,
        dependencyIds: [],
        acceptanceCriteria: ["task is saved"]
      }
    });

    expect(createTaskAResponse.statusCode).toBe(201);
    expect(createTaskAResponse.json().status).toBe("pending");

    const createTaskBResponse = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers,
      payload: {
        runId: ids.run,
        title: "Unblock dependent task",
        description: "Store second task",
        role: "backend-developer",
        priority: 3,
        dependencyIds: [ids.taskA],
        acceptanceCriteria: ["task unblocks when dependency completes"]
      }
    });

    expect(createTaskBResponse.statusCode).toBe(201);
    expect(createTaskBResponse.json().status).toBe("blocked");

    const completeTaskResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/tasks/${ids.taskA}/status`,
      headers,
      payload: {
        status: "completed"
      }
    });

    expect(completeTaskResponse.statusCode).toBe(200);

    const createAgentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers,
      payload: {
        runId: ids.run,
        name: "worker-1",
        role: "backend-developer",
        status: "idle",
        currentTaskId: ids.taskB,
        session: {
          threadId: "thread-123",
          cwd: "/tmp/codex-swarm/run-1/worker-1",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: true,
          metadata: {
            source: "app-test"
          }
        }
      }
    });

    expect(createAgentResponse.statusCode).toBe(201);

    const getRunResponse = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${ids.run}`,
      headers
    });

    expect(getRunResponse.statusCode).toBe(200);
    expect(getRunResponse.json()).toMatchObject({
      id: ids.run,
      tasks: [
        { id: ids.taskA, status: "completed" },
        { id: ids.taskB, status: "pending" }
      ],
      agents: [
        { id: ids.agent, currentTaskId: ids.taskB }
      ],
      sessions: [
        { id: ids.session, threadId: "thread-123", agentId: ids.agent }
      ]
    });

    await app.close();
  });

  it("supports approval cards from persisted approval rows", async () => {
    const app = await buildApp({
      config: {
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "127.0.0.1",
        DATABASE_URL: "postgres://unused/test",
        DEV_AUTH_TOKEN: "test-token",
        OPENAI_TRACING_DISABLED: true
      },
      controlPlane: new FakeVerticalSliceControlPlane() as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/approvals?runId=${ids.run}`,
      headers: {
        authorization: "Bearer test-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        runId: ids.run,
        kind: "plan",
        status: "pending",
        requestedPayload: expect.any(Object),
        resolutionPayload: expect.any(Object)
      })
    ]);

    await app.close();
  });
});
