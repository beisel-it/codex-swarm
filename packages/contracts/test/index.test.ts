import { describe, expect, it } from "vitest";

import {
  approvalCreateSchema,
  approvalResolveSchema,
  agentCreateSchema,
  cleanupJobRunSchema,
  governanceAdminReportSchema,
  identityEntrypointSchema,
  repositoryCreateSchema,
  remoteWorkerBootstrapSchema,
  retentionReconcileReportSchema,
  runBranchPublishSchema,
  runCreateSchema,
  runPullRequestHandoffSchema,
  secretAccessPlanSchema,
  workerDispatchAssignmentSchema,
  workerDispatchCompleteSchema,
  workerDispatchCreateSchema,
  workerDispatchListQuerySchema,
  workerDrainCommandSchema,
  workerNodeReconcileSchema,
  workerNodeDrainUpdateSchema,
  workerNodeHeartbeatSchema,
  workerNodeRuntimeSchema,
  workerNodeRegisterSchema,
  validationCreateSchema,
  taskCreateSchema
} from "../src/index.js";

describe("repositoryCreateSchema", () => {
  it("defaults the branch name to main", () => {
    const repository = repositoryCreateSchema.parse({
      name: "codex-swarm",
      url: "https://example.com/repo.git"
    });

    expect(repository.defaultBranch).toBe("main");
  });
});

describe("identityEntrypointSchema", () => {
  it("accepts workspace and team-scoped actor identity", () => {
    const identity = identityEntrypointSchema.parse({
      principal: "user-123",
      subject: "user-123",
      roles: ["member", "reviewer"],
      workspace: {
        id: "acme",
        name: "Acme"
      },
      team: {
        id: "platform",
        workspaceId: "acme",
        name: "Platform"
      }
    });

    expect(identity.email).toBeNull();
    expect(identity.actorType).toBe("user");
  });
});

describe("runCreateSchema", () => {
  it("defaults metadata to an empty object", () => {
    const run = runCreateSchema.parse({
      repositoryId: "550e8400-e29b-41d4-a716-446655440000",
      goal: "Ship alpha"
    });

    expect(run.metadata).toEqual({});
  });
});

describe("taskCreateSchema", () => {
  it("applies default priority and list fields", () => {
    const task = taskCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Write tests",
      description: "Add coverage for core services",
      role: "qa-engineer"
    });

    expect(task.priority).toBe(3);
    expect(task.dependencyIds).toEqual([]);
    expect(task.acceptanceCriteria).toEqual([]);
  });
});

describe("agentCreateSchema", () => {
  it("defaults agent status and session metadata", () => {
    const agent = agentCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      name: "qa-engineer",
      role: "qa-engineer",
      session: {
        threadId: "thread-1",
        cwd: "/tmp/codex-swarm",
        sandbox: "danger-full-access",
        approvalPolicy: "never"
      }
    });

    expect(agent.status).toBe("provisioning");
    expect(agent.session).toMatchObject({
      includePlanTool: false,
      placementConstraintLabels: [],
      metadata: {}
    });
  });
});

describe("workerNodeRegisterSchema", () => {
  it("defaults capability labels and active scheduling state", () => {
    const workerNode = workerNodeRegisterSchema.parse({
      name: "node-a"
    });

    expect(workerNode.capabilityLabels).toEqual([]);
    expect(workerNode.status).toBe("online");
    expect(workerNode.drainState).toBe("active");
  });
});

describe("workerNodeHeartbeatSchema", () => {
  it("defaults heartbeat status and labels", () => {
    const heartbeat = workerNodeHeartbeatSchema.parse({});

    expect(heartbeat.status).toBe("online");
    expect(heartbeat.capabilityLabels).toEqual([]);
  });
});

describe("workerNodeDrainUpdateSchema", () => {
  it("accepts explicit drain state transitions", () => {
    const drainUpdate = workerNodeDrainUpdateSchema.parse({
      drainState: "draining"
    });

    expect(drainUpdate.drainState).toBe("draining");
  });
});

describe("approvalCreateSchema", () => {
  it("defaults requested payload to an empty object", () => {
    const approval = approvalCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      kind: "plan",
      requestedBy: "tech-lead"
    });

    expect(approval.requestedPayload).toEqual({});
  });
});

describe("approvalResolveSchema", () => {
  it("defaults resolution payload to an empty object", () => {
    const resolution = approvalResolveSchema.parse({
      status: "rejected",
      resolver: "reviewer-1",
      feedback: "Validation report is incomplete"
    });

    expect(resolution.resolutionPayload).toEqual({});
  });
});

describe("validationCreateSchema", () => {
  it("defaults artifactIds to an empty array", () => {
    const validation = validationCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      name: "typecheck",
      command: "pnpm typecheck"
    });

    expect(validation.artifactIds).toEqual([]);
  });
});

describe("repositoryCreateSchema", () => {
  it("defaults trust level for onboarded repositories", () => {
    const repository = repositoryCreateSchema.parse({
      name: "codex-swarm",
      url: "https://github.com/example/codex-swarm",
      provider: "github"
    });

    expect(repository.trustLevel).toBe("trusted");
    expect(repository.approvalProfile).toBe("standard");
  });
});

describe("runCreateSchema", () => {
  it("defaults concurrency cap for new runs", () => {
    const run = runCreateSchema.parse({
      repositoryId: "550e8400-e29b-41d4-a716-446655440000",
      goal: "Ship M3"
    });

    expect(run.concurrencyCap).toBe(1);
  });
});

describe("runBranchPublishSchema", () => {
  it("defaults the remote for branch publish", () => {
    const publish = runBranchPublishSchema.parse({
      publishedBy: "tech-lead"
    });

    expect(publish.remoteName).toBe("origin");
  });
});

describe("runPullRequestHandoffSchema", () => {
  it("defaults handoff status to draft", () => {
    const handoff = runPullRequestHandoffSchema.parse({
      title: "Open PR",
      body: "Validation evidence attached",
      createdBy: "tech-lead"
    });

    expect(handoff.status).toBe("draft");
  });
});

describe("cleanupJobRunSchema", () => {
  it("defaults stale cleanup parameters", () => {
    const cleanup = cleanupJobRunSchema.parse({});

    expect(cleanup.staleAfterMinutes).toBe(15);
    expect(cleanup.existingWorktreePaths).toEqual([]);
  });
});

describe("workerDispatchAssignmentSchema", () => {
  it("defaults queue and retry controls for remote dispatch", () => {
    const assignment = workerDispatchAssignmentSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440010",
      runId: "550e8400-e29b-41d4-a716-446655440001",
      taskId: "550e8400-e29b-41d4-a716-446655440002",
      agentId: "550e8400-e29b-41d4-a716-446655440003",
      repositoryId: "550e8400-e29b-41d4-a716-446655440004",
      repositoryName: "codex-swarm",
      worktreePath: "/tmp/codex-swarm/run-001/agent-001",
      prompt: "Run the task",
      profile: "default",
      sandbox: "danger-full-access",
      approvalPolicy: "never",
      createdAt: new Date("2026-03-28T12:00:00.000Z")
    });

    expect(assignment).toMatchObject({
      queue: "worker-dispatch",
      state: "queued",
      stickyNodeId: null,
      preferredNodeId: null,
      claimedByNodeId: null,
      requiredCapabilities: [],
      branchName: null,
      includePlanTool: false,
      metadata: {},
      attempt: 0,
      maxAttempts: 3,
      leaseTtlSeconds: 300
    });
  });
});

describe("workerDispatchCreateSchema", () => {
  it("defaults dispatch creation controls", () => {
    const assignment = workerDispatchCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440001",
      taskId: "550e8400-e29b-41d4-a716-446655440002",
      agentId: "550e8400-e29b-41d4-a716-446655440003",
      repositoryId: "550e8400-e29b-41d4-a716-446655440004",
      repositoryName: "codex-swarm",
      worktreePath: "/tmp/codex-swarm/run-001/agent-001",
      prompt: "Run the task",
      profile: "default",
      sandbox: "danger-full-access",
      approvalPolicy: "never"
    });

    expect(assignment.queue).toBe("worker-dispatch");
    expect(assignment.stickyNodeId).toBeNull();
    expect(assignment.requiredCapabilities).toEqual([]);
    expect(assignment.maxAttempts).toBe(3);
  });
});

describe("workerDispatchListQuerySchema", () => {
  it("accepts optional dispatch filters", () => {
    const query = workerDispatchListQuerySchema.parse({
      state: "claimed"
    });

    expect(query.state).toBe("claimed");
  });
});

describe("workerDispatchCompleteSchema", () => {
  it("accepts completion and failure transitions", () => {
    const completion = workerDispatchCompleteSchema.parse({
      nodeId: "550e8400-e29b-41d4-a716-446655440011",
      status: "failed",
      reason: "node lost"
    });

    expect(completion.status).toBe("failed");
  });
});

describe("workerNodeReconcileSchema", () => {
  it("defaults reconciliation to marking nodes offline", () => {
    const reconciliation = workerNodeReconcileSchema.parse({
      reason: "node heartbeat expired"
    });

    expect(reconciliation.markOffline).toBe(true);
  });
});

describe("workerNodeRuntimeSchema", () => {
  it("defaults queue prefix and heartbeat interval", () => {
    const runtime = workerNodeRuntimeSchema.parse({
      nodeId: "node-a",
      nodeName: "node-a",
      state: "active",
      workspaceRoot: "/srv/codex-swarm",
      codexCommand: ["codex", "mcp-server"],
      controlPlaneUrl: "https://control-plane.internal",
      postgresUrl: "postgres://postgres:postgres@db.internal:5432/codex",
      redisUrl: "redis://cache.internal:6379/0"
    });

    expect(runtime.queueKeyPrefix).toBe("codex-swarm");
    expect(runtime.capabilities).toEqual([]);
    expect(runtime.credentialEnvNames).toEqual([]);
    expect(runtime.heartbeatIntervalSeconds).toBe(30);
  });
});

describe("remoteWorkerBootstrapSchema", () => {
  it("accepts bootstrap envelopes for remote worker startup", () => {
    const bootstrap = remoteWorkerBootstrapSchema.parse({
      runtime: {
        nodeId: "node-a",
        nodeName: "node-a",
        state: "active",
        workspaceRoot: "/srv/codex-swarm",
        codexCommand: ["codex", "mcp-server"],
        controlPlaneUrl: "https://control-plane.internal",
        postgresUrl: "postgres://postgres:postgres@db.internal:5432/codex",
        redisUrl: "redis://cache.internal:6379/0"
      },
      dispatch: {
        id: "550e8400-e29b-41d4-a716-446655440010",
        runId: "550e8400-e29b-41d4-a716-446655440001",
        taskId: "550e8400-e29b-41d4-a716-446655440002",
        agentId: "550e8400-e29b-41d4-a716-446655440003",
        repositoryId: "550e8400-e29b-41d4-a716-446655440004",
        repositoryName: "codex-swarm",
        worktreePath: "/tmp/codex-swarm/run-001/agent-001",
        prompt: "Run the task",
        profile: "default",
        sandbox: "danger-full-access",
        approvalPolicy: "never",
        createdAt: new Date("2026-03-28T12:00:00.000Z")
      },
      environment: {
        CODEX_SWARM_NODE_ID: "node-a"
      },
      checks: [{
        name: "redis",
        status: "ready",
        detail: "redis connection string configured"
      }]
    });

    expect(bootstrap.environment.CODEX_SWARM_NODE_ID).toBe("node-a");
    expect(bootstrap.dispatch.queue).toBe("worker-dispatch");
  });
});

describe("workerDrainCommandSchema", () => {
  it("defaults drain commands to allowing active assignments during transition", () => {
    const command = workerDrainCommandSchema.parse({
      nodeId: "node-a",
      targetState: "draining",
      reason: "maintenance"
    });

    expect(command.allowActiveAssignments).toBe(true);
  });
});

describe("governance admin schemas", () => {
  it("accepts actor-provenance governance reports", () => {
    const report = governanceAdminReportSchema.parse({
      generatedAt: new Date("2026-03-28T12:00:00.000Z"),
      requestedBy: {
        principal: "alice",
        actorId: "user-1",
        actorType: "user",
        role: "platform-admin",
        teamId: "team-a",
        policyProfile: "standard"
      },
      retention: {
        policy: { runsDays: 30, artifactsDays: 30, eventsDays: 30 },
        runs: { total: 3, expired: 1, retained: 2 },
        artifacts: { total: 4, expired: 1, retained: 3 },
        events: { total: 5, expired: 2, retained: 3 }
      },
      approvals: {
        total: 1,
        pending: 0,
        approved: 1,
        rejected: 0,
        history: [{
          approvalId: "550e8400-e29b-41d4-a716-446655440010",
          runId: "550e8400-e29b-41d4-a716-446655440001",
          taskId: null,
          repositoryId: "550e8400-e29b-41d4-a716-446655440004",
          repositoryName: "codex-swarm",
          kind: "plan",
          status: "approved",
          requestedAt: new Date("2026-03-28T10:00:00.000Z"),
          resolvedAt: new Date("2026-03-28T11:00:00.000Z"),
          requestedBy: "alice",
          requestedByActor: {
            principal: "alice",
            actorId: "user-1",
            actorType: "user",
            role: "platform-admin",
            teamId: "team-a",
            policyProfile: "standard"
          },
          resolver: "bob",
          resolverActor: null,
          policyProfile: "standard",
          requestedPayload: {},
          resolutionPayload: {}
        }]
      },
      policies: {
        repositoryProfiles: [{ profile: "standard", repositoryCount: 1, runCount: 2 }],
        sensitiveRepositories: []
      },
      secrets: {
        sourceMode: "external_manager",
        provider: "vault",
        remoteCredentialEnvNames: ["OPENAI_API_KEY"],
        allowedRepositoryTrustLevels: ["trusted"],
        sensitivePolicyProfiles: ["sensitive"],
        credentialDistribution: ["api brokers credentials"],
        policyDrivenAccess: true
      }
    });

    expect(report.approvals.history[0]?.requestedByActor?.actorId).toBe("user-1");
    expect(report.secrets.provider).toBe("vault");
  });

  it("accepts retention reconcile and secret access plan payloads", () => {
    const reconcile = retentionReconcileReportSchema.parse({
      dryRun: false,
      appliedAt: new Date("2026-03-28T12:00:00.000Z"),
      requestedBy: {
        principal: "alice",
        actorId: "user-1",
        actorType: "user",
        role: "platform-admin",
        teamId: "team-a",
        policyProfile: "standard"
      },
      runsUpdated: 2,
      artifactsUpdated: 3,
      eventsUpdated: 4
    });
    const plan = secretAccessPlanSchema.parse({
      repositoryId: "550e8400-e29b-41d4-a716-446655440004",
      repositoryName: "codex-swarm",
      trustLevel: "trusted",
      policyProfile: "sensitive",
      access: "brokered",
      sourceMode: "external_manager",
      provider: "vault",
      credentialEnvNames: ["OPENAI_API_KEY"],
      distributionBoundary: ["workers get task-scoped env"],
      reason: "policy profile sensitive requires brokered secret delivery for governed repos"
    });

    expect(reconcile.eventsUpdated).toBe(4);
    expect(plan.access).toBe("brokered");
  });
});
