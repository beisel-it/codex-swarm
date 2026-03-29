import { describe, expect, it } from "vitest";

import {
  actorIdentitySchema,
  approvalCreateSchema,
  approvalResolveSchema,
  agentCreateSchema,
  agentObservabilitySchema,
  artifactDetailSchema,
  artifactCreateSchema,
  artifactDiffSummarySchema,
  cleanupJobRunSchema,
  controlPlaneMetricsSchema,
  governanceAdminReportSchema,
  identityEntrypointSchema,
  repositoryCreateSchema,
  remoteWorkerBootstrapSchema,
  retentionReconcileReportSchema,
  runBranchPublishSchema,
  runCreateSchema,
  runDetailSchema,
  runPullRequestHandoffSchema,
  sessionTranscriptAppendSchema,
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
  it("leaves branch discovery open by default", () => {
    const repository = repositoryCreateSchema.parse({
      name: "codex-swarm",
      url: "https://example.com/repo.git"
    });

    expect(repository.defaultBranch).toBeUndefined();
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

describe("actorIdentitySchema", () => {
  it("accepts normalized governance roles", () => {
    const actor = actorIdentitySchema.parse({
      principal: "alice",
      actorId: "oidc|alice",
      role: "workspace_admin",
      roles: ["workspace_admin", "reviewer"]
    });

    expect(actor.roles).toEqual(["workspace_admin", "reviewer"]);
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

describe("runDetailSchema", () => {
  it("accepts graph-oriented task DAG metadata alongside tasks", () => {
    const now = new Date("2026-03-29T10:00:00.000Z");
    const runDetail = runDetailSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      repositoryId: "550e8400-e29b-41d4-a716-446655440001",
      workspaceId: "workspace-1",
      teamId: "team-1",
      goal: "Render the task DAG",
      status: "in_progress",
      branchName: null,
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
      createdBy: "leader",
      createdAt: now,
      updatedAt: now,
      tasks: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          runId: "550e8400-e29b-41d4-a716-446655440000",
          parentTaskId: null,
          title: "Root task",
          description: "Start here",
          role: "backend-developer",
          status: "completed",
          priority: 3,
          ownerAgentId: null,
          dependencyIds: [],
          acceptanceCriteria: [],
          validationTemplates: [],
          createdAt: now,
          updatedAt: now
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440011",
          runId: "550e8400-e29b-41d4-a716-446655440000",
          parentTaskId: null,
          title: "Blocked task",
          description: "Waits on work",
          role: "frontend-developer",
          status: "blocked",
          priority: 3,
          ownerAgentId: null,
          dependencyIds: ["550e8400-e29b-41d4-a716-446655440010"],
          acceptanceCriteria: [],
          validationTemplates: [],
          createdAt: now,
          updatedAt: now
        }
      ],
      agents: [
        {
          id: "550e8400-e29b-41d4-a716-446655440012",
          runId: "550e8400-e29b-41d4-a716-446655440000",
          name: "frontend-agent",
          role: "frontend-developer",
          status: "busy",
          branchName: null,
          worktreePath: null,
          currentTaskId: "550e8400-e29b-41d4-a716-446655440011",
          lastHeartbeatAt: now,
          observability: {
            mode: "session",
            currentSessionId: "550e8400-e29b-41d4-a716-446655440030",
            currentSessionState: "pending",
            visibleTranscriptSessionId: "550e8400-e29b-41d4-a716-446655440031",
            visibleTranscriptSessionState: "stopped",
            visibleTranscriptUpdatedAt: now,
            lineageSource: "session_rollover"
          },
          createdAt: now,
          updatedAt: now
        }
      ],
      sessions: [
        {
          id: "550e8400-e29b-41d4-a716-446655440031",
          agentId: "550e8400-e29b-41d4-a716-446655440012",
          threadId: "thread-previous",
          cwd: "/tmp/run/agent",
          sandbox: "workspace-write",
          approvalPolicy: "never",
          includePlanTool: false,
          workerNodeId: null,
          stickyNodeId: null,
          placementConstraintLabels: [],
          lastHeartbeatAt: now,
          state: "stopped",
          staleReason: null,
          metadata: {},
          createdAt: now,
          updatedAt: now
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440030",
          agentId: "550e8400-e29b-41d4-a716-446655440012",
          threadId: "thread-current",
          cwd: "/tmp/run/agent",
          sandbox: "workspace-write",
          approvalPolicy: "never",
          includePlanTool: false,
          workerNodeId: null,
          stickyNodeId: null,
          placementConstraintLabels: [],
          lastHeartbeatAt: now,
          state: "pending",
          staleReason: null,
          metadata: {},
          createdAt: now,
          updatedAt: now
        }
      ],
      taskDag: {
        nodes: [
          {
            taskId: "550e8400-e29b-41d4-a716-446655440010",
            title: "Root task",
            role: "backend-developer",
            status: "completed",
            parentTaskId: null,
            dependencyIds: [],
            dependentTaskIds: ["550e8400-e29b-41d4-a716-446655440011"],
            blockedByTaskIds: [],
            isRoot: true,
            isBlocked: false
          },
          {
            taskId: "550e8400-e29b-41d4-a716-446655440011",
            title: "Blocked task",
            role: "frontend-developer",
            status: "blocked",
            parentTaskId: null,
            dependencyIds: ["550e8400-e29b-41d4-a716-446655440010"],
            dependentTaskIds: [],
            blockedByTaskIds: ["550e8400-e29b-41d4-a716-446655440010"],
            isRoot: false,
            isBlocked: true
          }
        ],
        edges: [
          {
            id: "550e8400-e29b-41d4-a716-446655440010->550e8400-e29b-41d4-a716-446655440011",
            sourceTaskId: "550e8400-e29b-41d4-a716-446655440010",
            targetTaskId: "550e8400-e29b-41d4-a716-446655440011",
            kind: "dependency",
            isSatisfied: true,
            isBlocking: false
          }
        ],
        rootTaskIds: ["550e8400-e29b-41d4-a716-446655440010"],
        blockedTaskIds: ["550e8400-e29b-41d4-a716-446655440011"],
        unblockPaths: [
          {
            taskId: "550e8400-e29b-41d4-a716-446655440011",
            blockingTaskIds: ["550e8400-e29b-41d4-a716-446655440010"],
            pathTaskIds: [
              "550e8400-e29b-41d4-a716-446655440010",
              "550e8400-e29b-41d4-a716-446655440011"
            ],
            pathEdgeIds: ["550e8400-e29b-41d4-a716-446655440010->550e8400-e29b-41d4-a716-446655440011"]
          }
        ]
      }
    });

    expect(runDetail.taskDag.rootTaskIds).toEqual(["550e8400-e29b-41d4-a716-446655440010"]);
    expect(runDetail.taskDag.blockedTaskIds).toEqual(["550e8400-e29b-41d4-a716-446655440011"]);
    expect(runDetail.agents[0]?.observability.lineageSource).toBe("session_rollover");
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

describe("agentObservabilitySchema", () => {
  it("defaults to unavailable when no session or transcript lineage is exposed", () => {
    const observability = agentObservabilitySchema.parse({});

    expect(observability).toEqual({
      mode: "unavailable",
      currentSessionId: null,
      currentSessionState: null,
      visibleTranscriptSessionId: null,
      visibleTranscriptSessionState: null,
      visibleTranscriptUpdatedAt: null,
      lineageSource: "not_started"
    });
  });

  it("accepts direct current-session linkage while retaining the latest visible transcript", () => {
    const observability = agentObservabilitySchema.parse({
      mode: "session",
      currentSessionId: "550e8400-e29b-41d4-a716-446655440020",
      currentSessionState: "pending",
      visibleTranscriptSessionId: "550e8400-e29b-41d4-a716-446655440021",
      visibleTranscriptSessionState: "stopped",
      visibleTranscriptUpdatedAt: new Date("2026-03-29T10:05:00.000Z"),
      lineageSource: "session_rollover"
    });

    expect(observability.currentSessionId).toBe("550e8400-e29b-41d4-a716-446655440020");
    expect(observability.visibleTranscriptSessionId).toBe("550e8400-e29b-41d4-a716-446655440021");
    expect(observability.lineageSource).toBe("session_rollover");
  });

  it("requires a visible transcript when operating in transcript fallback mode", () => {
    expect(() => agentObservabilitySchema.parse({
      mode: "transcript_visibility",
      lineageSource: "task_state_transition"
    })).toThrow(/visibleTranscriptSessionId/);
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

  it("accepts delegated approval targeting metadata", () => {
    const approval = approvalCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      kind: "plan",
      requestedBy: "tech-lead",
      delegation: {
        delegateActorId: "reviewer-2",
        reason: "coverage for on-call reviewer"
      }
    });

    expect(approval.delegation).toEqual({
      delegateActorId: "reviewer-2",
      reason: "coverage for on-call reviewer"
    });
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

describe("artifactCreateSchema", () => {
  it("accepts optional inline content for durable storage", () => {
    const artifact = artifactCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      kind: "report",
      path: "artifacts/report.json",
      contentType: "application/json",
      contentBase64: "eyJvayI6dHJ1ZX0="
    });

    expect(artifact.contentBase64).toBe("eyJvayI6dHJ1ZX0=");
  });
});

describe("sessionTranscriptAppendSchema", () => {
  it("accepts append payloads with default metadata", () => {
    const transcript = sessionTranscriptAppendSchema.parse({
      entries: [
        {
          kind: "prompt",
          text: "Create the landing page."
        }
      ]
    });

    expect(transcript.entries[0]?.metadata).toEqual({});
  });
});

describe("artifactDiffSummarySchema", () => {
  it("accepts structured reviewer-facing diff summary data", () => {
    const diffSummary = artifactDiffSummarySchema.parse({
      filesChanged: 2,
      insertions: 10,
      deletions: 3,
      fileSummaries: [
        {
          path: "apps/api/src/routes/artifacts.ts",
          changeType: "modified",
          additions: 7,
          deletions: 1
        },
        {
          path: "frontend/src/App.tsx",
          changeType: "added",
          additions: 3,
          deletions: 2
        }
      ],
      diffPreview: "@@ -1,2 +1,2 @@"
    });

    expect(diffSummary.filesChanged).toBe(2);
    expect(diffSummary.fileSummaries).toHaveLength(2);
  });
});

describe("artifactDetailSchema", () => {
  it("accepts text detail and diff summary payloads", () => {
    const detail = artifactDetailSchema.parse({
      artifact: {
        id: "550e8400-e29b-41d4-a716-446655440010",
        runId: "550e8400-e29b-41d4-a716-446655440000",
        taskId: null,
        kind: "diff",
        path: ".swarm/reviews/run-001/diff.patch",
        contentType: "text/x-diff",
        url: null,
        sizeBytes: 120,
        sha256: "abc123",
        metadata: {},
        createdAt: new Date("2026-03-29T00:00:00.000Z")
      },
      contentState: "available",
      bodyText: "diff --git a/file b/file",
      diffSummary: {
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
        fileSummaries: [
          {
            path: "file",
            changeType: "modified",
            additions: 1,
            deletions: 0
          }
        ]
      }
    });

    expect(detail.diffSummary?.filesChanged).toBe(1);
    expect(detail.contentState).toBe("available");
  });
});

describe("repositoryCreateSchema", () => {
  it("defaults trust level while leaving policy selection open for inheritance", () => {
    const repository = repositoryCreateSchema.parse({
      name: "codex-swarm",
      url: "https://github.com/example/codex-swarm",
      provider: "github"
    });

    expect(repository.trustLevel).toBe("trusted");
    expect(repository.approvalProfile).toBeUndefined();
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

describe("controlPlaneMetricsSchema", () => {
  it("accepts the extended M6 operator envelope", () => {
    const metrics = controlPlaneMetricsSchema.parse({
      queueDepth: {
        runsPending: 1,
        tasksPending: 2,
        tasksBlocked: 0,
        approvalsPending: 1,
        busyAgents: 3
      },
      retries: {
        recoverableDatabaseFallbacks: 0,
        taskUnblocks: 4
      },
      failures: {
        runsFailed: 0,
        tasksFailed: 0,
        agentsFailed: 0,
        validationsFailed: 0,
        requestFailures: 1
      },
      usage: {
        repositories: 2,
        runsTotal: 10,
        runsActive: 3,
        runsCompleted: 7,
        tasksTotal: 20,
        approvalsTotal: 5,
        validationsTotal: 6,
        artifactsTotal: 4,
        workerNodesOnline: 2,
        workerNodesDraining: 1
      },
      cost: {
        runsWithBudget: 5,
        totalBudgetedRunCostUsd: 45.5,
        averageBudgetedRunCostUsd: 9.1,
        maxBudgetedRunCostUsd: 18
      },
      performance: {
        completedRunsMeasured: 7,
        approvalsMeasured: 4,
        validationsMeasured: 6,
        runDurationMs: {
          p50: 1000,
          p95: 5000,
          max: 6000
        },
        approvalResolutionMs: {
          p50: 500,
          p95: 1500,
          max: 2000
        },
        validationTurnaroundMs: {
          p50: 750,
          p95: 1750,
          max: 2500
        }
      },
      slo: {
        objectives: {
          pendingApprovalMaxMinutes: 60,
          activeRunMaxMinutes: 240,
          taskQueueMax: 100,
          supportResponseHours: 8
        },
        support: {
          hoursUtc: "Mon-Fri 08:00-18:00 UTC",
          escalation: ["page platform admin"]
        },
        status: {
          pendingApprovalsWithinTarget: true,
          activeRunsWithinTarget: true,
          queueDepthWithinTarget: true,
          withinEnvelope: true
        },
        measurements: {
          oldestPendingApprovalAgeMinutes: 12,
          oldestActiveRunAgeMinutes: 45,
          pendingApprovals: 1,
          activeRuns: 3,
          tasksPending: 2
        }
      },
      eventsRecorded: 11,
      recordedAt: new Date("2026-03-28T12:15:00.000Z")
    });

    expect(metrics.slo.status.withinEnvelope).toBe(true);
    expect(metrics.cost.totalBudgetedRunCostUsd).toBe(45.5);
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
    expect(runtime.codexTransport).toEqual({
      kind: "stdio"
    });
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
        codexTransport: {
          kind: "streamable_http",
          url: "https://codex-mcp.internal/mcp",
          headers: {
            authorization: "Bearer shared-token"
          },
          protocolVersion: "2025-11-25"
        },
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
    expect(bootstrap.runtime.codexTransport.kind).toBe("streamable_http");
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
