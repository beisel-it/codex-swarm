import { describe, expect, it } from "vitest";
import type { ActorIdentity } from "@codex-swarm/contracts";

import {
  approvals,
  artifacts,
  controlPlaneEvents,
  repositories,
  runs,
} from "../src/db/schema.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

function extractTargetId(condition: {
  queryChunks: Array<{ value?: string[] } | { value?: string }>;
}) {
  const chunk = condition.queryChunks[3] as { value?: string };

  if (!chunk || typeof chunk.value !== "string") {
    throw new Error("unable to extract update target");
  }

  return chunk.value;
}

class FakeWhereResult<T> implements PromiseLike<T[]> {
  constructor(private readonly rows: T[]) {}

  orderBy = async () => this.rows;

  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.rows).then(onfulfilled, onrejected);
  }
}

class FakeGovernanceDb {
  constructor(
    readonly repositoryStore: Array<any>,
    readonly runStore: Array<any>,
    readonly approvalStore: Array<any>,
    readonly artifactStore: Array<any>,
    readonly eventStore: Array<any>,
  ) {}

  select() {
    return {
      from: (table: unknown) => ({
        where: (_condition: unknown) =>
          new FakeWhereResult(this.rowsFor(table)),
        orderBy: async () => this.rowsFor(table),
      }),
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: async (condition: {
          queryChunks: Array<{ value?: string[] } | { value?: string }>;
        }) => {
          const id = extractTargetId(condition);
          const store = this.storeFor(table);
          const record = store.find((candidate) => candidate.id === id);

          if (!record) {
            throw new Error(`unknown record ${id}`);
          }

          Object.assign(record, values);
          return [record];
        },
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          const store = this.storeForInsert(table);
          const record = {
            ...values,
          };
          store.push(record);
          return [record];
        },
      }),
    };
  }

  private rowsFor(table: unknown) {
    if (table === repositories) {
      return this.repositoryStore;
    }

    if (table === runs) {
      return this.runStore;
    }

    if (table === artifacts) {
      return this.artifactStore;
    }

    if (table === controlPlaneEvents) {
      return this.eventStore;
    }

    return this.approvalStore;
  }

  private storeFor(table: unknown) {
    if (table === runs) {
      return this.runStore;
    }

    if (table === artifacts) {
      return this.artifactStore;
    }

    if (table === controlPlaneEvents) {
      return this.eventStore;
    }

    throw new Error("unexpected update table");
  }

  private storeForInsert(table: unknown) {
    if (table === approvals) {
      return this.approvalStore;
    }

    throw new Error("unexpected insert table");
  }
}

class FakeRunInsertDb {
  readonly insertedRuns: any[] = [];

  insert(table: unknown) {
    if (table !== runs) {
      throw new Error("unexpected insert table");
    }

    return {
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          const record = {
            ...values,
          };

          this.insertedRuns.push(record);
          return [record];
        },
      }),
    };
  }
}

const access = {
  workspaceId: "workspace-001",
  workspaceName: "Workspace 001",
  teamId: "team-001",
  teamName: "Team 001",
} as const;

const actor: ActorIdentity = {
  principal: "qa-admin",
  actorId: "qa-admin",
  actorType: "user",
  email: "qa-admin@example.com",
  role: "workspace_admin",
  roles: ["workspace_admin"],
  workspaceId: access.workspaceId,
  workspaceName: access.workspaceName,
  teamId: access.teamId,
  teamName: access.teamName,
  policyProfile: "standard",
};

describe("ControlPlaneService governance state", () => {
  it("summarizes approval provenance, retention posture, and sensitive repositories from governed backend rows", async () => {
    const now = new Date("2026-03-28T12:00:00.000Z");
    const db = new FakeGovernanceDb(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          name: "standard-repo",
          url: "https://example.com/standard.git",
          provider: "github",
          defaultBranch: "main",
          localPath: null,
          trustLevel: "trusted",
          approvalProfile: "standard",
          createdAt: new Date("2026-03-01T12:00:00.000Z"),
          updatedAt: new Date("2026-03-01T12:00:00.000Z"),
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          name: "sensitive-repo",
          url: "https://example.com/sensitive.git",
          provider: "github",
          defaultBranch: "main",
          localPath: null,
          trustLevel: "restricted",
          approvalProfile: "restricted",
          createdAt: new Date("2026-03-02T12:00:00.000Z"),
          updatedAt: new Date("2026-03-02T12:00:00.000Z"),
        },
      ],
      [
        {
          id: "33333333-3333-4333-8333-333333333333",
          repositoryId: "11111111-1111-4111-8111-111111111111",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          goal: "Standard repo run",
          status: "completed",
          branchName: null,
          planArtifactPath: null,
          budgetTokens: null,
          budgetCostUsd: null,
          concurrencyCap: 1,
          policyProfile: "standard",
          publishedBranch: null,
          branchPublishedAt: null,
          pullRequestUrl: null,
          pullRequestNumber: null,
          pullRequestStatus: null,
          handoffStatus: "pending",
          completedAt: new Date("2026-03-20T12:00:00.000Z"),
          metadata: {},
          createdBy: "qa-admin",
          createdAt: new Date("2026-03-20T10:00:00.000Z"),
          updatedAt: new Date("2026-03-20T12:00:00.000Z"),
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          repositoryId: "22222222-2222-4222-8222-222222222222",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          goal: "Sensitive repo run",
          status: "awaiting_approval",
          branchName: null,
          planArtifactPath: null,
          budgetTokens: null,
          budgetCostUsd: null,
          concurrencyCap: 1,
          policyProfile: "restricted",
          publishedBranch: null,
          branchPublishedAt: null,
          pullRequestUrl: null,
          pullRequestNumber: null,
          pullRequestStatus: null,
          handoffStatus: "pending",
          completedAt: null,
          metadata: {},
          createdBy: "qa-admin",
          createdAt: new Date("2026-03-27T10:00:00.000Z"),
          updatedAt: new Date("2026-03-27T11:00:00.000Z"),
        },
      ],
      [
        {
          id: "55555555-5555-4555-8555-555555555555",
          runId: "44444444-4444-4444-8444-444444444444",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          taskId: null,
          kind: "deploy",
          status: "approved",
          requestedPayload: {
            scope: "sensitive promotion",
          },
          resolutionPayload: {
            feedback: "approved under change window",
          },
          requestedBy: "backend-dev",
          delegateActorId: "security-admin",
          delegatedBy: "tech-lead",
          delegatedAt: new Date("2026-03-28T08:45:00.000Z"),
          delegationReason: "after-hours deployment coverage",
          resolver: "security-admin",
          resolvedAt: new Date("2026-03-28T09:30:00.000Z"),
          createdAt: new Date("2026-03-28T09:00:00.000Z"),
          updatedAt: new Date("2026-03-28T09:30:00.000Z"),
        },
      ],
      [
        {
          id: "66666666-6666-4666-8666-666666666666",
          runId: "44444444-4444-4444-8444-444444444444",
          taskId: null,
          kind: "report",
          path: "artifacts/audit.txt",
          contentType: "text/plain",
          metadata: {},
          createdAt: new Date("2026-03-25T12:00:00.000Z"),
        },
      ],
      [
        {
          id: "77777777-7777-4777-8777-777777777777",
          runId: "44444444-4444-4444-8444-444444444444",
          taskId: null,
          agentId: null,
          traceId: "trace-created",
          eventType: "approval.created",
          entityType: "approval",
          entityId: "55555555-5555-4555-8555-555555555555",
          status: "pending",
          summary: "Approval requested",
          actor: {
            ...actor,
            actorId: "backend-dev",
            principal: "backend-dev",
            role: "member",
            roles: ["member"],
          },
          metadata: {},
          createdAt: new Date("2026-03-28T09:00:00.000Z"),
        },
        {
          id: "88888888-8888-4888-8888-888888888888",
          runId: "44444444-4444-4444-8444-444444444444",
          taskId: null,
          agentId: null,
          traceId: "trace-resolved",
          eventType: "approval.resolved",
          entityType: "approval",
          entityId: "55555555-5555-4555-8555-555555555555",
          status: "approved",
          summary: "Approval resolved",
          actor: {
            ...actor,
            actorId: "security-admin",
            principal: "security-admin",
            role: "reviewer",
            roles: ["reviewer"],
            policyProfile: "restricted",
          },
          metadata: {},
          createdAt: new Date("2026-03-28T09:30:00.000Z"),
        },
        {
          id: "99999999-9999-4999-8999-999999999999",
          runId: "33333333-3333-4333-8333-333333333333",
          taskId: null,
          agentId: null,
          traceId: "trace-old",
          eventType: "run.created",
          entityType: "run",
          entityId: "33333333-3333-4333-8333-333333333333",
          status: "completed",
          summary: "Old run event",
          actor: actor,
          metadata: {},
          createdAt: new Date("2026-02-01T09:00:00.000Z"),
        },
      ],
    );

    const service = new ControlPlaneService(db as never, { now: () => now });

    const report = await service.getGovernanceAdminReport({
      requestedBy: actor,
      retentionPolicy: {
        runsDays: 30,
        artifactsDays: 10,
        eventsDays: 20,
      },
      secrets: {
        sourceMode: "external_manager",
        provider: "vault",
        remoteCredentialEnvNames: ["OPENAI_API_KEY"],
        allowedRepositoryTrustLevels: ["trusted"],
        sensitivePolicyProfiles: ["restricted"],
        credentialDistribution: ["broker secrets through vault"],
        policyDrivenAccess: true,
      },
      access,
    });

    expect(report.requestedBy.actorId).toBe("qa-admin");
    expect(report.approvals).toMatchObject({
      total: 1,
      approved: 1,
      pending: 0,
      rejected: 0,
    });
    expect(report.approvals.history).toEqual([
      expect.objectContaining({
        approvalId: "55555555-5555-4555-8555-555555555555",
        repositoryId: "22222222-2222-4222-8222-222222222222",
        repositoryName: "sensitive-repo",
        requestedBy: "backend-dev",
        requestedByActor: expect.objectContaining({
          actorId: "backend-dev",
        }),
        delegation: {
          delegateActorId: "security-admin",
          delegatedBy: "tech-lead",
          delegatedAt: new Date("2026-03-28T08:45:00.000Z"),
          reason: "after-hours deployment coverage",
        },
        resolver: "security-admin",
        resolverActor: expect.objectContaining({
          actorId: "security-admin",
        }),
        resolvedByDelegate: true,
        policyProfile: "restricted",
      }),
    ]);
    expect(report.retention).toMatchObject({
      runs: { total: 2, expired: 0, retained: 2 },
      artifacts: { total: 1, expired: 0, retained: 1 },
      events: { total: 3, expired: 1, retained: 2 },
    });
    expect(report.policies.repositoryProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profile: "standard", repositoryCount: 1 }),
        expect.objectContaining({ profile: "restricted", repositoryCount: 1 }),
      ]),
    );
    expect(report.policies.sensitiveRepositories).toEqual([
      {
        repositoryId: "22222222-2222-4222-8222-222222222222",
        repositoryName: "sensitive-repo",
        trustLevel: "restricted",
        approvalProfile: "restricted",
      },
    ]);
    expect(report.secrets).toMatchObject({
      sourceMode: "external_manager",
      provider: "vault",
      policyDrivenAccess: true,
    });
  });

  it("persists delegated approval provenance on create", async () => {
    const now = new Date("2026-03-28T12:30:00.000Z");
    const db = new FakeGovernanceDb(
      [],
      [
        {
          id: "33333333-3333-4333-8333-333333333333",
          repositoryId: "11111111-1111-4111-8111-111111111111",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          goal: "Delegated approval",
          status: "awaiting_approval",
          branchName: null,
          planArtifactPath: null,
          budgetTokens: null,
          budgetCostUsd: null,
          concurrencyCap: 1,
          policyProfile: "restricted",
          publishedBranch: null,
          branchPublishedAt: null,
          pullRequestUrl: null,
          pullRequestNumber: null,
          pullRequestStatus: null,
          handoffStatus: "pending",
          completedAt: null,
          metadata: {},
          createdBy: "backend-dev",
          createdAt: now,
          updatedAt: now,
        },
      ],
      [],
      [],
      [],
    );
    const service = new ControlPlaneService(db as never, { now: () => now });

    const approval = await service.createApproval(
      {
        runId: "33333333-3333-4333-8333-333333333333",
        kind: "plan",
        requestedBy: "backend-dev",
        requestedPayload: {
          summary: "Need reviewer coverage",
        },
        delegation: {
          delegateActorId: "reviewer-2",
          reason: "primary reviewer is offline",
        },
      },
      access,
    );

    expect(approval.delegation).toEqual({
      delegateActorId: "reviewer-2",
      delegatedBy: "backend-dev",
      delegatedAt: now,
      reason: "primary reviewer is offline",
    });
    expect(db.approvalStore).toEqual([
      expect.objectContaining({
        runId: "33333333-3333-4333-8333-333333333333",
        requestedBy: "backend-dev",
        delegateActorId: "reviewer-2",
        delegatedBy: "backend-dev",
        delegatedAt: now,
        delegationReason: "primary reviewer is offline",
      }),
    ]);
  });

  it("exports audit provenance from persisted approval and event history", async () => {
    const now = new Date("2026-03-28T13:00:00.000Z");
    const db = new FakeGovernanceDb(
      [],
      [
        {
          id: "33333333-3333-4333-8333-333333333333",
          repositoryId: "11111111-1111-4111-8111-111111111111",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          goal: "Audit export",
          status: "awaiting_approval",
          branchName: null,
          planArtifactPath: null,
          budgetTokens: null,
          budgetCostUsd: null,
          concurrencyCap: 1,
          policyProfile: "restricted",
          publishedBranch: null,
          branchPublishedAt: null,
          pullRequestUrl: null,
          pullRequestNumber: null,
          pullRequestStatus: null,
          handoffStatus: "pending",
          completedAt: null,
          metadata: {},
          createdBy: "backend-dev",
          createdAt: new Date("2026-03-28T08:00:00.000Z"),
          updatedAt: new Date("2026-03-28T09:30:00.000Z"),
        },
      ],
      [],
      [],
      [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          runId: "33333333-3333-4333-8333-333333333333",
          taskId: null,
          agentId: null,
          traceId: "trace-created",
          eventType: "approval.created",
          entityType: "approval",
          entityId: "55555555-5555-4555-8555-555555555555",
          status: "pending",
          summary: "Approval requested",
          actor: {
            ...actor,
            actorId: "backend-dev",
            principal: "backend-dev",
            role: "member",
            roles: ["member"],
          },
          metadata: {},
          createdAt: new Date("2026-03-28T09:00:00.000Z"),
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          runId: "33333333-3333-4333-8333-333333333333",
          taskId: null,
          agentId: null,
          traceId: "trace-resolved",
          eventType: "approval.resolved",
          entityType: "approval",
          entityId: "55555555-5555-4555-8555-555555555555",
          status: "approved",
          summary: "Approval resolved",
          actor: {
            ...actor,
            actorId: "security-admin",
            principal: "security-admin",
            role: "reviewer",
            roles: ["reviewer"],
            policyProfile: "restricted",
          },
          metadata: {},
          createdAt: new Date("2026-03-28T09:30:00.000Z"),
        },
      ],
    );
    const service = new ControlPlaneService(db as never, { now: () => now });

    (service as any).getRun = async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      repositoryId: "11111111-1111-4111-8111-111111111111",
      goal: "Audit export",
      status: "awaiting_approval",
      branchName: null,
      planArtifactPath: null,
      budgetTokens: null,
      budgetCostUsd: null,
      concurrencyCap: 1,
      policyProfile: "restricted",
      publishedBranch: null,
      branchPublishedAt: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      handoffStatus: "pending",
      completedAt: null,
      metadata: {},
      createdBy: "backend-dev",
      createdAt: new Date("2026-03-28T08:00:00.000Z"),
      updatedAt: new Date("2026-03-28T09:30:00.000Z"),
      tasks: [],
      agents: [],
      sessions: [
        {
          id: "session-1",
          agentId: "agent-1",
          threadId: "thread-1",
          cwd: "/tmp/run",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          workerNodeId: "node-1",
          stickyNodeId: "node-1",
          placementConstraintLabels: [],
          state: "active",
          staleReason: null,
          metadata: {},
          createdAt: new Date("2026-03-28T08:00:00.000Z"),
          updatedAt: new Date("2026-03-28T08:00:00.000Z"),
        },
      ],
    });
    (service as any).assertRunExists = async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      repositoryId: "11111111-1111-4111-8111-111111111111",
      workspaceId: access.workspaceId,
      teamId: access.teamId,
      goal: "Audit export",
      status: "awaiting_approval",
      branchName: null,
      planArtifactPath: null,
      budgetTokens: null,
      budgetCostUsd: null,
      concurrencyCap: 1,
      policyProfile: "restricted",
      publishedBranch: null,
      branchPublishedAt: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      handoffStatus: "pending",
      completedAt: null,
      metadata: {},
      createdBy: "backend-dev",
      createdAt: new Date("2026-03-28T08:00:00.000Z"),
      updatedAt: new Date("2026-03-28T09:30:00.000Z"),
    });
    (service as any).listApprovals = async () => [
      {
        id: "55555555-5555-4555-8555-555555555555",
        runId: "33333333-3333-4333-8333-333333333333",
        taskId: null,
        kind: "deploy",
        status: "approved",
        requestedPayload: {
          scope: "production",
        },
        resolutionPayload: {
          feedback: "approved",
        },
        requestedBy: "backend-dev",
        delegation: {
          delegateActorId: "security-admin",
          delegatedBy: "tech-lead",
          delegatedAt: new Date("2026-03-28T08:45:00.000Z"),
          reason: "after-hours deployment coverage",
        },
        resolver: "security-admin",
        resolvedAt: new Date("2026-03-28T09:30:00.000Z"),
        createdAt: new Date("2026-03-28T09:00:00.000Z"),
        updatedAt: new Date("2026-03-28T09:30:00.000Z"),
      },
    ];
    (service as any).listValidations = async () => [];
    (service as any).listArtifacts = async () => [
      {
        id: "artifact-1",
        runId: "33333333-3333-4333-8333-333333333333",
        taskId: null,
        kind: "report",
        path: "artifacts/audit.md",
        contentType: "text/markdown",
        metadata: {},
        createdAt: new Date("2026-03-28T10:00:00.000Z"),
      },
    ];
    (service as any).listWorkerNodes = async () => [
      {
        id: "node-1",
        name: "node-1",
        endpoint: null,
        capabilityLabels: [],
        status: "online",
        drainState: "active",
        lastHeartbeatAt: now,
        metadata: {},
        eligibleForScheduling: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "node-2",
        name: "node-2",
        endpoint: null,
        capabilityLabels: [],
        status: "online",
        drainState: "active",
        lastHeartbeatAt: now,
        metadata: {},
        eligibleForScheduling: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    (service as any).assertRepositoryExists = async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      workspaceId: access.workspaceId,
      teamId: access.teamId,
      name: "sensitive-repo",
      url: "https://example.com/sensitive.git",
      provider: "github",
      defaultBranch: "main",
      localPath: null,
      trustLevel: "trusted",
      approvalProfile: "restricted",
      createdAt: now,
      updatedAt: now,
    });

    const auditExport = await service.exportRunAudit(
      "33333333-3333-4333-8333-333333333333",
      actor,
      {
        runsDays: 30,
        artifactsDays: 30,
        eventsDays: 30,
      },
      access,
    );

    expect(auditExport.workerNodes).toEqual([
      expect.objectContaining({
        id: "node-1",
      }),
    ]);
    expect(auditExport.provenance.exportedBy.actorId).toBe("qa-admin");
    expect(auditExport.provenance.approvals).toEqual([
      expect.objectContaining({
        approvalId: "55555555-5555-4555-8555-555555555555",
        requestedByActor: expect.objectContaining({
          actorId: "backend-dev",
        }),
        delegation: {
          delegateActorId: "security-admin",
          delegatedBy: "tech-lead",
          delegatedAt: new Date("2026-03-28T08:45:00.000Z"),
          reason: "after-hours deployment coverage",
        },
        resolverActor: expect.objectContaining({
          actorId: "security-admin",
        }),
        resolvedByDelegate: true,
        policyProfile: "restricted",
      }),
    ]);
    expect(auditExport.retention.policy.runsDays).toBe(30);
    expect(auditExport.events).toHaveLength(2);
  });

  it("applies retention metadata to governed persisted rows", async () => {
    const now = new Date("2026-03-28T14:00:00.000Z");
    const db = new FakeGovernanceDb(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          name: "standard-repo",
          url: "https://example.com/standard.git",
          provider: "github",
          defaultBranch: "main",
          localPath: null,
          trustLevel: "trusted",
          approvalProfile: "standard",
          createdAt: now,
          updatedAt: now,
        },
      ],
      [
        {
          id: "33333333-3333-4333-8333-333333333333",
          repositoryId: "11111111-1111-4111-8111-111111111111",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          goal: "Retention target",
          status: "completed",
          branchName: null,
          planArtifactPath: null,
          budgetTokens: null,
          budgetCostUsd: null,
          concurrencyCap: 1,
          policyProfile: "standard",
          publishedBranch: null,
          branchPublishedAt: null,
          pullRequestUrl: null,
          pullRequestNumber: null,
          pullRequestStatus: null,
          handoffStatus: "pending",
          completedAt: new Date("2026-03-20T14:00:00.000Z"),
          metadata: {},
          createdBy: "qa-admin",
          createdAt: new Date("2026-03-20T10:00:00.000Z"),
          updatedAt: new Date("2026-03-20T14:00:00.000Z"),
        },
      ],
      [],
      [
        {
          id: "66666666-6666-4666-8666-666666666666",
          runId: "33333333-3333-4333-8333-333333333333",
          taskId: null,
          kind: "report",
          path: "artifacts/audit.txt",
          contentType: "text/plain",
          metadata: {},
          createdAt: new Date("2026-03-22T14:00:00.000Z"),
        },
      ],
      [
        {
          id: "77777777-7777-4777-8777-777777777777",
          runId: "33333333-3333-4333-8333-333333333333",
          taskId: null,
          agentId: null,
          traceId: "trace-retention",
          eventType: "run.completed",
          entityType: "run",
          entityId: "33333333-3333-4333-8333-333333333333",
          status: "completed",
          summary: "Run completed",
          actor: actor,
          metadata: {},
          createdAt: new Date("2026-03-21T14:00:00.000Z"),
        },
      ],
    );

    const service = new ControlPlaneService(db as never, { now: () => now });

    const report = await service.reconcileGovernanceRetention({
      requestedBy: actor,
      retentionPolicy: {
        runsDays: 10,
        artifactsDays: 5,
        eventsDays: 3,
      },
      dryRun: false,
      access,
    });

    expect(report).toMatchObject({
      dryRun: false,
      runsUpdated: 1,
      artifactsUpdated: 1,
      eventsUpdated: 1,
    });
    expect(db.runStore[0].metadata).toMatchObject({
      retention: {
        expiresAt: "2026-03-30T14:00:00.000Z",
        lastAppliedAt: "2026-03-28T14:00:00.000Z",
        appliedBy: "qa-admin",
      },
    });
    expect(db.artifactStore[0].metadata).toMatchObject({
      retention: {
        expiresAt: "2026-03-27T14:00:00.000Z",
        lastAppliedAt: "2026-03-28T14:00:00.000Z",
        appliedBy: "qa-admin",
      },
    });
    expect(db.eventStore[0].metadata).toMatchObject({
      retention: {
        expiresAt: "2026-03-24T14:00:00.000Z",
        lastAppliedAt: "2026-03-28T14:00:00.000Z",
        appliedBy: "qa-admin",
      },
    });
  });

  it("inherits repository policy defaults and differentiates standard versus sensitive secret access paths", async () => {
    const now = new Date("2026-03-28T15:00:00.000Z");
    const db = new FakeRunInsertDb();
    const service = new ControlPlaneService(db as never, { now: () => now });
    const repositoriesById = new Map([
      [
        "11111111-1111-4111-8111-111111111111",
        {
          id: "11111111-1111-4111-8111-111111111111",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          name: "standard-repo",
          url: "https://example.com/standard.git",
          provider: "github",
          defaultBranch: "main",
          localPath: null,
          trustLevel: "trusted",
          approvalProfile: "standard",
          createdAt: now,
          updatedAt: now,
        },
      ],
      [
        "22222222-2222-4222-8222-222222222222",
        {
          id: "22222222-2222-4222-8222-222222222222",
          workspaceId: access.workspaceId,
          teamId: access.teamId,
          name: "sensitive-repo",
          url: "https://example.com/sensitive.git",
          provider: "github",
          defaultBranch: "main",
          localPath: null,
          trustLevel: "trusted",
          approvalProfile: "restricted",
          createdAt: now,
          updatedAt: now,
        },
      ],
    ]);

    (service as any).assertRepositoryExists = async (repositoryId: string) => {
      const repository = repositoriesById.get(repositoryId);

      if (!repository) {
        throw new Error(`unknown repository ${repositoryId}`);
      }

      return repository;
    };

    const standardRun = await service.createRun(
      {
        repositoryId: "11111111-1111-4111-8111-111111111111",
        goal: "Standard defaults",
        concurrencyCap: 1,
        metadata: {},
      },
      actor.principal,
      access,
    );

    const sensitiveRun = await service.createRun(
      {
        repositoryId: "22222222-2222-4222-8222-222222222222",
        goal: "Sensitive defaults",
        concurrencyCap: 1,
        metadata: {},
      },
      actor.principal,
      access,
    );

    const standardAccessPlan = await service.getRepositorySecretAccessPlan({
      repositoryId: "11111111-1111-4111-8111-111111111111",
      secrets: {
        sourceMode: "external_manager",
        provider: "vault",
        remoteCredentialEnvNames: ["OPENAI_API_KEY"],
        allowedRepositoryTrustLevels: ["trusted"],
        sensitivePolicyProfiles: ["restricted"],
        credentialDistribution: ["broker secrets through vault"],
        policyDrivenAccess: true,
      },
      access,
    });

    const sensitiveAccessPlan = await service.getRepositorySecretAccessPlan({
      repositoryId: "22222222-2222-4222-8222-222222222222",
      secrets: {
        sourceMode: "external_manager",
        provider: "vault",
        remoteCredentialEnvNames: ["OPENAI_API_KEY"],
        allowedRepositoryTrustLevels: ["trusted"],
        sensitivePolicyProfiles: ["restricted"],
        credentialDistribution: ["broker secrets through vault"],
        policyDrivenAccess: true,
      },
      access,
    });

    expect(standardRun.policyProfile).toBe("standard");
    expect(sensitiveRun.policyProfile).toBe("restricted");
    expect(db.insertedRuns).toEqual([
      expect.objectContaining({
        repositoryId: "11111111-1111-4111-8111-111111111111",
        policyProfile: "standard",
      }),
      expect.objectContaining({
        repositoryId: "22222222-2222-4222-8222-222222222222",
        policyProfile: "restricted",
      }),
    ]);
    expect(standardAccessPlan).toMatchObject({
      repositoryName: "standard-repo",
      access: "allowed",
      policyProfile: "standard",
    });
    expect(sensitiveAccessPlan).toMatchObject({
      repositoryName: "sensitive-repo",
      access: "brokered",
      policyProfile: "restricted",
    });
  });
});
