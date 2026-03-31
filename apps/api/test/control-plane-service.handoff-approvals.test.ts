import { describe, expect, it } from "vitest";

import { artifacts, runs } from "../src/db/schema.js";
import { HttpError } from "../src/lib/http-error.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

class FakeHandoffApprovalDb {
  runRecord: {
    id: string;
    repositoryId: string;
    workspaceId: string;
    teamId: string;
    goal: string;
    status: string;
    branchName: string | null;
    planArtifactPath: string | null;
    budgetTokens: number | null;
    budgetCostUsd: number | null;
    concurrencyCap: number;
    policyProfile: string | null;
    publishedBranch: string | null;
    branchPublishedAt: Date | null;
    branchPublishApprovalId: string | null;
    pullRequestUrl: string | null;
    pullRequestNumber: number | null;
    pullRequestStatus: string | null;
    pullRequestApprovalId: string | null;
    handoffStatus: string;
    completedAt: Date | null;
    metadata: Record<string, unknown>;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  } = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    repositoryId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspaceId: "acme",
    teamId: "platform",
    goal: "Ship handoff approval enforcement",
    status: "in_progress",
    branchName: "runs/m7-handoff",
    planArtifactPath: null,
    budgetTokens: null,
    budgetCostUsd: null,
    concurrencyCap: 1,
    policyProfile: "standard",
    publishedBranch: null,
    branchPublishedAt: null,
    branchPublishApprovalId: null,
    pullRequestUrl: null,
    pullRequestNumber: null,
    pullRequestStatus: null,
    pullRequestApprovalId: null,
    handoffStatus: "pending",
    completedAt: null,
    metadata: {},
    createdBy: "tech-lead",
    createdAt: new Date("2026-03-28T12:00:00.000Z"),
    updatedAt: new Date("2026-03-28T12:00:00.000Z"),
  };

  artifactValues: Array<Record<string, unknown>> = [];

  update(table: unknown) {
    return {
      set: (values: Partial<typeof this.runRecord>) => ({
        where: () => ({
          returning: async () => {
            if (table !== runs) {
              throw new Error("unexpected update table");
            }

            this.runRecord = {
              ...this.runRecord,
              ...values,
            };

            return [this.runRecord];
          },
        }),
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: async (values: Record<string, unknown>) => {
        if (table !== artifacts) {
          throw new Error("unexpected insert table");
        }

        this.artifactValues.push(values);
        return [];
      },
    };
  }

  async transaction<T>(
    callback: (tx: {
      update: FakeHandoffApprovalDb["update"];
      insert: FakeHandoffApprovalDb["insert"];
    }) => Promise<T>,
  ) {
    return callback({
      update: this.update.bind(this),
      insert: this.insert.bind(this),
    });
  }
}

describe("ControlPlaneService handoff approval enforcement", () => {
  it("requires explicit patch approval linkage before branch publish when patch approvals exist", async () => {
    const db = new FakeHandoffApprovalDb();
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-28T12:05:00.000Z"),
    });

    (service as any).assertRunExists = async () => db.runRecord;
    (service as any).assertRepositoryExists = async () => ({
      id: db.runRecord.repositoryId,
      workspaceId: db.runRecord.workspaceId,
      teamId: db.runRecord.teamId,
      projectId: null,
    });
    (service as any).listApprovals = async () => [
      {
        id: "11111111-1111-4111-8111-111111111111",
        runId: db.runRecord.id,
        workspaceId: db.runRecord.workspaceId,
        teamId: db.runRecord.teamId,
        taskId: null,
        kind: "patch",
        status: "approved",
        requestedPayload: {},
        resolutionPayload: {},
        requestedBy: "tech-lead",
        delegation: null,
        resolver: "reviewer",
        resolvedAt: new Date("2026-03-28T12:01:00.000Z"),
        createdAt: new Date("2026-03-28T12:00:00.000Z"),
        updatedAt: new Date("2026-03-28T12:01:00.000Z"),
      },
    ];

    await expect(
      service.publishRunBranch(db.runRecord.id, {
        branchName: "runs/m7-handoff",
        publishedBy: "tech-lead",
        remoteName: "origin",
      }),
    ).rejects.toBeInstanceOf(HttpError);

    await expect(
      service.publishRunBranch(db.runRecord.id, {
        branchName: "runs/m7-handoff",
        approvalId: "11111111-1111-4111-8111-111111111111",
        publishedBy: "tech-lead",
        remoteName: "origin",
      }),
    ).resolves.toMatchObject({
      publishedBranch: "runs/m7-handoff",
      branchPublishApprovalId: "11111111-1111-4111-8111-111111111111",
      handoffStatus: "branch_published",
    });
  });

  it("records approved merge linkage on pull-request handoff", async () => {
    const db = new FakeHandoffApprovalDb();
    db.runRecord.publishedBranch = "runs/m7-handoff";
    db.runRecord.handoffStatus = "branch_published";

    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-28T12:10:00.000Z"),
    });

    (service as any).assertRunExists = async () => db.runRecord;
    (service as any).assertRepositoryExists = async () => ({
      id: db.runRecord.repositoryId,
      workspaceId: db.runRecord.workspaceId,
      teamId: db.runRecord.teamId,
      projectId: null,
      name: "codex-swarm",
      defaultBranch: "main",
      provider: "github",
      url: "https://github.com/example/codex-swarm",
    });
    (service as any).listApprovals = async () => [
      {
        id: "22222222-2222-4222-8222-222222222222",
        runId: db.runRecord.id,
        workspaceId: db.runRecord.workspaceId,
        teamId: db.runRecord.teamId,
        taskId: null,
        kind: "merge",
        status: "approved",
        requestedPayload: {},
        resolutionPayload: {},
        requestedBy: "tech-lead",
        delegation: null,
        resolver: "reviewer",
        resolvedAt: new Date("2026-03-28T12:09:00.000Z"),
        createdAt: new Date("2026-03-28T12:08:00.000Z"),
        updatedAt: new Date("2026-03-28T12:09:00.000Z"),
      },
    ];

    const run = await service.createRunPullRequestHandoff(db.runRecord.id, {
      title: "Handoff",
      body: "Ready for merge",
      createdBy: "tech-lead",
      approvalId: "22222222-2222-4222-8222-222222222222",
      provider: "github",
      url: "https://github.com/example/codex-swarm/pull/42",
      number: 42,
      status: "open",
    });

    expect(run).toMatchObject({
      pullRequestApprovalId: "22222222-2222-4222-8222-222222222222",
      handoffStatus: "pr_open",
    });
    expect(db.artifactValues.at(-1)).toMatchObject({
      runId: db.runRecord.id,
      kind: "pr_link",
    });
  });
});
