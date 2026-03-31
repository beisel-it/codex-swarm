import { describe, expect, it, vi } from "vitest";

import { ControlPlaneService } from "../src/services/control-plane-service.js";

class FakeAutoHandoffDb {
  constructor(private readonly taskRows: Array<Record<string, unknown>>) {}

  select() {
    return {
      from: () => ({
        where: () => ({
          orderBy: async () => this.taskRows,
        }),
      }),
    };
  }
}

function createTaskRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    runId: "run-1",
    title: "Prepare provider handoff",
    status: "completed",
    createdAt: new Date("2026-03-30T10:00:00.000Z"),
    ...overrides,
  };
}

function createRunDetail(): {
  publishedBranch: string | null;
  branchPublishApprovalId: string | null;
  handoffStatus: string;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  pullRequestStatus: string | null;
  pullRequestApprovalId: string | null;
  handoffExecution: {
    state: string;
    failureReason: string | null;
    attemptedAt: Date | null;
    completedAt: Date | null;
  };
} & Record<string, unknown> {
  return {
    id: "run-1",
    repositoryId: "repo-1",
    workspaceId: "workspace-1",
    teamId: "team-1",
    goal: "Ship automatic provider handoff",
    status: "completed",
    branchName: "runs/auto-handoff",
    planArtifactPath: null,
    budgetTokens: null,
    budgetCostUsd: null,
    concurrencyCap: 1,
    policyProfile: "standard",
    metadata: {},
    context: {
      kind: "ad_hoc",
      projectId: null,
      projectSlug: null,
      projectName: null,
      projectDescription: null,
      jobId: null,
      jobName: null,
      externalInput: null,
      values: {},
    },
    publishedBranch: null,
    branchPublishedAt: null,
    branchPublishApprovalId: null,
    pullRequestUrl: null,
    pullRequestNumber: null,
    pullRequestStatus: null,
    pullRequestApprovalId: null,
    handoffStatus: "pending",
    handoff: {
      mode: "auto",
      provider: "github",
      baseBranch: "main",
      autoPublishBranch: true,
      autoCreatePullRequest: true,
      titleTemplate: "Provider handoff: {run_goal}",
      bodyTemplate:
        "## Summary\n{run_goal}\n\n## Completed Tasks\n{completed_tasks}\n\n## Validation\n{validation_summary}",
    },
    handoffExecution: {
      state: "idle",
      failureReason: null,
      attemptedAt: null,
      completedAt: null,
    },
    completedAt: new Date("2026-03-30T10:10:00.000Z"),
    createdBy: "tech-lead",
    createdAt: new Date("2026-03-30T10:00:00.000Z"),
    updatedAt: new Date("2026-03-30T10:10:00.000Z"),
  };
}

describe("ControlPlaneService auto handoff", () => {
  it("publishes the branch and opens a GitHub PR when auto handoff is enabled", async () => {
    const db = new FakeAutoHandoffDb([
      createTaskRow(),
      createTaskRow({
        id: crypto.randomUUID(),
        title: "Collect validation evidence",
      }),
    ]);
    const publishBranch = vi.fn(async () => undefined);
    const createGitHubPullRequest = vi.fn(async () => ({
      url: "https://github.com/example/codex-swarm/pull/42",
      number: 42,
      status: "open" as const,
    }));
    const service = new ControlPlaneService(
      db as never,
      {
        now: () => new Date("2026-03-30T10:15:00.000Z"),
      },
      {
        providerHandoff: {
          publishBranch,
          createGitHubPullRequest,
        },
      },
    );
    const runRecord = {
      id: "run-1",
      repositoryId: "repo-1",
    };
    const repository = {
      id: "repo-1",
      workspaceId: "workspace-1",
      teamId: "team-1",
      projectId: null,
      name: "codex-swarm",
      url: "https://github.com/example/codex-swarm",
      provider: "github",
      defaultBranch: "main",
      localPath: "/tmp/codex-swarm-auto-handoff",
      trustLevel: "trusted",
      approvalProfile: "standard",
      providerSync: null,
      createdAt: new Date("2026-03-30T09:00:00.000Z"),
      updatedAt: new Date("2026-03-30T09:00:00.000Z"),
    };
    const runDetail = createRunDetail();
    const executionTransitions: Array<Record<string, unknown>> = [];
    const eventTypes: string[] = [];
    const publishRunBranch = vi.fn(
      async (_runId: string, input: Record<string, unknown>) => {
        runDetail.publishedBranch = input.branchName as string;
        runDetail.branchPublishApprovalId = input.approvalId as string;
        runDetail.handoffStatus = "branch_published";
        return runDetail;
      },
    );
    const createRunPullRequestHandoff = vi.fn(
      async (_runId: string, input: Record<string, unknown>) => {
        runDetail.pullRequestUrl = input.url as string;
        runDetail.pullRequestNumber = input.number as number;
        runDetail.pullRequestStatus = input.status as string;
        runDetail.pullRequestApprovalId = input.approvalId as string;
        runDetail.handoffStatus = "pr_open";
        return runDetail;
      },
    );

    (service as any).assertRunExists = async () => runRecord;
    (service as any).assertRepositoryExists = async () => repository;
    (service as any).mapRun = () => runDetail;
    (service as any).updateRunHandoffExecutionState = async (
      _runId: string,
      execution: Record<string, unknown>,
    ) => {
      executionTransitions.push(execution);
      runDetail.handoffExecution = {
        ...runDetail.handoffExecution,
        ...execution,
      };
    };
    (service as any).recordControlPlaneEvent = async (event: {
      eventType: string;
    }) => {
      eventTypes.push(event.eventType);
    };
    (service as any).resolveRunWorkspacePath = async () =>
      "/tmp/codex-swarm-auto-handoff";
    (service as any).pickApprovedHandoffApprovalId = async (
      _runId: string,
      kind: string,
    ) => (kind === "patch" ? "patch-approval" : "merge-approval");
    (service as any).listValidations = async () => [
      {
        id: "validation-1",
        runId: "run-1",
        status: "passed",
        summary: "Smoke checks passed",
        createdAt: new Date("2026-03-30T10:12:00.000Z"),
        updatedAt: new Date("2026-03-30T10:12:00.000Z"),
      },
    ];
    (service as any).publishRunBranch = publishRunBranch;
    (service as any).createRunPullRequestHandoff = createRunPullRequestHandoff;
    (service as any).getRun = async () => runDetail;

    const result = await service.maybeExecuteAutoHandoff("run-1");

    expect(publishBranch).toHaveBeenCalledWith({
      workspacePath: "/tmp/codex-swarm-auto-handoff",
      branchName: "runs/auto-handoff",
      remoteName: "origin",
    });
    expect(publishRunBranch).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        branchName: "runs/auto-handoff",
        publishedBy: "system:auto-handoff",
        approvalId: "patch-approval",
      }),
      undefined,
    );
    expect(createGitHubPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: "/tmp/codex-swarm-auto-handoff",
        baseBranch: "main",
        headBranch: "runs/auto-handoff",
        title: "Provider handoff: Ship automatic provider handoff",
      }),
    );
    const prCalls = createGitHubPullRequest.mock.calls as unknown as Array<
      [
        {
          body: string;
        },
      ]
    >;
    const prInput = prCalls[0]?.[0];
    expect(prInput?.body ?? "").toContain(
      "Prepare provider handoff, Collect validation evidence",
    );
    expect(prInput?.body ?? "").toContain("1 passed, 0 failed");
    expect(createRunPullRequestHandoff).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        createdBy: "system:auto-handoff",
        approvalId: "merge-approval",
        provider: "github",
        url: "https://github.com/example/codex-swarm/pull/42",
        number: 42,
        status: "open",
      }),
      undefined,
    );
    expect(executionTransitions).toEqual([
      expect.objectContaining({
        state: "in_progress",
        failureReason: null,
      }),
      expect.objectContaining({
        state: "completed",
        failureReason: null,
      }),
    ]);
    expect(eventTypes).toEqual([
      "run.auto_handoff_started",
      "run.auto_handoff_completed",
    ]);
    expect(result.handoffExecution.state).toBe("completed");
    expect(result.handoffStatus).toBe("pr_open");
    expect(result.pullRequestUrl).toBe(
      "https://github.com/example/codex-swarm/pull/42",
    );
  });

  it("marks handoff execution as failed when provider automation errors", async () => {
    const db = new FakeAutoHandoffDb([createTaskRow()]);
    const publishBranch = vi.fn(async () => {
      throw new Error("git push failed");
    });
    const createGitHubPullRequest = vi.fn(async () => ({
      url: "https://github.com/example/codex-swarm/pull/42",
      number: 42,
      status: "open" as const,
    }));
    const service = new ControlPlaneService(
      db as never,
      {
        now: () => new Date("2026-03-30T10:15:00.000Z"),
      },
      {
        providerHandoff: {
          publishBranch,
          createGitHubPullRequest,
        },
      },
    );
    const runDetail = createRunDetail();
    const executionTransitions: Array<Record<string, unknown>> = [];
    const eventTypes: string[] = [];

    (service as any).assertRunExists = async () => ({
      id: "run-1",
      repositoryId: "repo-1",
    });
    (service as any).assertRepositoryExists = async () => ({
      id: "repo-1",
      workspaceId: "workspace-1",
      teamId: "team-1",
      projectId: null,
      defaultBranch: "main",
      localPath: "/tmp/codex-swarm-auto-handoff",
    });
    (service as any).mapRun = () => runDetail;
    (service as any).updateRunHandoffExecutionState = async (
      _runId: string,
      execution: Record<string, unknown>,
    ) => {
      executionTransitions.push(execution);
      runDetail.handoffExecution = {
        ...runDetail.handoffExecution,
        ...execution,
      };
    };
    (service as any).recordControlPlaneEvent = async (event: {
      eventType: string;
    }) => {
      eventTypes.push(event.eventType);
    };
    (service as any).resolveRunWorkspacePath = async () =>
      "/tmp/codex-swarm-auto-handoff";
    (service as any).pickApprovedHandoffApprovalId = async () => null;
    (service as any).listValidations = async () => [];
    (service as any).publishRunBranch = vi.fn();
    (service as any).createRunPullRequestHandoff = vi.fn();
    (service as any).getRun = async () => runDetail;

    const result = await service.maybeExecuteAutoHandoff("run-1");

    expect(publishBranch).toHaveBeenCalledOnce();
    expect(createGitHubPullRequest).not.toHaveBeenCalled();
    expect((service as any).publishRunBranch).not.toHaveBeenCalled();
    expect((service as any).createRunPullRequestHandoff).not.toHaveBeenCalled();
    expect(executionTransitions).toEqual([
      expect.objectContaining({
        state: "in_progress",
        failureReason: null,
      }),
      expect.objectContaining({
        state: "failed",
        failureReason: "git push failed",
      }),
    ]);
    expect(eventTypes).toEqual([
      "run.auto_handoff_started",
      "run.auto_handoff_failed",
    ]);
    expect(result.status).toBe("completed");
    expect(result.handoffExecution.state).toBe("failed");
    expect(result.handoffExecution.failureReason).toBe("git push failed");
    expect(result.handoffStatus).toBe("pending");
  });
});
