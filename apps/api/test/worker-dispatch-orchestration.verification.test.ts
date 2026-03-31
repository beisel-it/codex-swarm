import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  Repository,
  RunDetail,
  WorkerDispatchAssignment
} from "@codex-swarm/contracts";

import { runManagedWorkerDispatch } from "../src/lib/worker-dispatch-orchestration.js";

function createRepository(url: string): Repository {
  return {
    id: "repo-1",
    workspaceId: "workspace-1",
    teamId: "team-1",
    name: "codex-swarm",
    url,
    provider: "github",
    defaultBranch: "main",
    localPath: null,
    projectId: null,
    trustLevel: "trusted",
    approvalProfile: "standard",
    providerSync: {
      connectivityStatus: "validated",
      validatedAt: new Date("2026-03-31T09:00:00.000Z"),
      defaultBranch: "main",
      branches: ["main"],
      providerRepoUrl: url,
      lastError: null
    },
    createdAt: new Date("2026-03-31T09:00:00.000Z"),
    updatedAt: new Date("2026-03-31T09:00:00.000Z")
  };
}

function createRunDetail(): RunDetail {
  return {
    id: "run-1",
    repositoryId: "repo-1",
    workspaceId: "workspace-1",
    teamId: "team-1",
    projectId: null,
    projectTeamId: null,
    projectTeamName: null,
    goal: "Prove verifier evidence propagation",
    status: "in_progress",
    branchName: "main",
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
    handoff: {
      mode: "manual",
      provider: null,
      baseBranch: null,
      autoPublishBranch: false,
      autoCreatePullRequest: false,
      titleTemplate: null,
      bodyTemplate: null
    },
    handoffExecution: {
      state: "idle",
      failureReason: null,
      attemptedAt: null,
      completedAt: null
    },
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
      values: {}
    },
    completedAt: null,
    createdBy: "leader",
    createdAt: new Date("2026-03-31T09:00:00.000Z"),
    updatedAt: new Date("2026-03-31T09:00:00.000Z"),
    tasks: [
      {
        id: "task-1",
        runId: "run-1",
        parentTaskId: null,
        title: "Verify review gating",
        description: "Inspect the worker result against the stored task contract.",
        role: "backend-developer",
        status: "awaiting_review",
        priority: 1,
        ownerAgentId: "verifier-agent-1",
        verificationStatus: "requested",
        verifierAgentId: "verifier-agent-1",
        latestVerificationSummary: "Verification requested after worker completion: Worker says the slice is ready.",
        latestVerificationFindings: [],
        latestVerificationChangeRequests: [],
        latestVerificationEvidence: [],
        dependencyIds: [],
        definitionOfDone: ["worker completion only advances into verification"],
        acceptanceCriteria: ["review gating remains explicit"],
        validationTemplates: [
          {
            name: "typecheck",
            command: "pnpm typecheck",
            summary: "Run typecheck before verification",
            artifactPath: "artifacts/validations/typecheck.json"
          }
        ],
        createdAt: new Date("2026-03-31T09:00:00.000Z"),
        updatedAt: new Date("2026-03-31T09:00:00.000Z")
      }
    ],
    agents: [
      {
        id: "worker-agent-1",
        runId: "run-1",
        projectTeamMemberId: null,
        name: "Worker",
        role: "backend-developer",
        profile: "backend-developer",
        status: "stopped",
        worktreePath: null,
        branchName: "main",
        currentTaskId: null,
        lastHeartbeatAt: null,
        observability: {
          mode: "unavailable",
          currentSessionId: null,
          currentSessionState: null,
          visibleTranscriptSessionId: null,
          visibleTranscriptSessionState: null,
          visibleTranscriptUpdatedAt: null,
          lineageSource: "not_started"
        },
        createdAt: new Date("2026-03-31T09:00:00.000Z"),
        updatedAt: new Date("2026-03-31T09:00:00.000Z")
      },
      {
        id: "verifier-agent-1",
        runId: "run-1",
        projectTeamMemberId: null,
        name: "Verifier",
        role: "reviewer",
        profile: "reviewer",
        status: "busy",
        worktreePath: null,
        branchName: "main",
        currentTaskId: "task-1",
        lastHeartbeatAt: null,
        observability: {
          mode: "unavailable",
          currentSessionId: null,
          currentSessionState: null,
          visibleTranscriptSessionId: null,
          visibleTranscriptSessionState: null,
          visibleTranscriptUpdatedAt: null,
          lineageSource: "not_started"
        },
        createdAt: new Date("2026-03-31T09:00:00.000Z"),
        updatedAt: new Date("2026-03-31T09:00:00.000Z")
      }
    ],
    sessions: [
      {
        id: "session-verifier-1",
        agentId: "verifier-agent-1",
        threadId: "thread-verifier-1",
        cwd: "/tmp/codex-swarm/run-1/shared",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        includePlanTool: false,
        workerNodeId: "node-1",
        stickyNodeId: "node-1",
        placementConstraintLabels: ["workspace-write"],
        lastHeartbeatAt: null,
        state: "active",
        staleReason: null,
        metadata: {},
        createdAt: new Date("2026-03-31T09:00:00.000Z"),
        updatedAt: new Date("2026-03-31T09:00:00.000Z")
      }
    ],
    taskDag: {
      nodes: [
        {
          taskId: "task-1",
          title: "Verify review gating",
          role: "backend-developer",
          status: "awaiting_review",
          parentTaskId: null,
          dependencyIds: [],
          dependentTaskIds: [],
          blockedByTaskIds: [],
          isRoot: true,
          isBlocked: false
        }
      ],
      edges: [],
      rootTaskIds: ["task-1"],
      blockedTaskIds: [],
      unblockPaths: []
    }
  };
}

function createVerificationAssignment(worktreePath: string): WorkerDispatchAssignment {
  return {
    id: "dispatch-verifier-1",
    runId: "run-1",
    taskId: "task-1",
    agentId: "verifier-agent-1",
    sessionId: "session-verifier-1",
    repositoryId: "repo-1",
    repositoryName: "codex-swarm",
    queue: "worker-dispatch",
    state: "claimed",
    stickyNodeId: "node-1",
    preferredNodeId: "node-1",
    claimedByNodeId: "node-1",
    requiredCapabilities: ["workspace-write"],
    worktreePath,
    branchName: "main",
    prompt: "Check the stored validations and artifacts before deciding.",
    profile: "reviewer",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    includePlanTool: false,
    metadata: {
      assignmentKind: "verification",
      workerAssignmentId: "dispatch-worker-1",
      workerAgentId: "worker-agent-1",
      workerSummary: "Worker says the slice is ready.",
      workerOutcomeStatus: "completed"
    },
    attempt: 0,
    maxAttempts: 3,
    leaseTtlSeconds: 300,
    createdAt: new Date("2026-03-31T09:00:00.000Z")
  };
}

describe("runManagedWorkerDispatch verification prompts", () => {
  it("injects validation evidence, artifacts, and relevant messages into the verifier prompt", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-verifier-repo-"));
    const worktreeRoot = await mkdtemp(join(tmpdir(), "codex-swarm-verifier-worktree-"));

    try {
      await writeFile(join(repoRoot, "README.md"), "verification prompt fixture\n", "utf8");
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Swarm"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex-swarm@example.com"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["add", "README.md"], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoRoot, stdio: "pipe" });

      const repository = createRepository(repoRoot);
      const runDetail = createRunDetail();
      const assignment = createVerificationAssignment(join(worktreeRoot, "shared"));
      let seenPrompt = "";
      let transcriptPrompt = "";

      const request = async <T>(method: string, path: string, payload?: Record<string, unknown>) => {
        if (method === "POST" && path === "/api/v1/worker-nodes/node-1/claim-dispatch") {
          return assignment as T;
        }

        if (method === "GET" && path === "/api/v1/runs/run-1") {
          return runDetail as T;
        }

        if (method === "GET" && path === "/api/v1/repositories") {
          return [repository] as T;
        }

        if (method === "GET" && path === "/api/v1/messages?runId=run-1") {
          return [
            {
              id: "message-worker-1",
              runId: "run-1",
              senderAgentId: "worker-agent-1",
              recipientAgentId: "verifier-agent-1",
              kind: "direct",
              body: "Validation output is attached to the task.",
              createdAt: new Date("2026-03-31T09:01:00.000Z")
            }
          ] as T;
        }

        if (method === "GET" && path === "/api/v1/artifacts?runId=run-1") {
          return [
            {
              id: "artifact-1",
              runId: "run-1",
              taskId: "task-1",
              kind: "report",
              path: "artifacts/validations/typecheck.json",
              contentType: "application/json",
              url: "https://swarm.example.com/api/v1/artifacts/artifact-1/content",
              sizeBytes: 128,
              sha256: "sha256",
              metadata: {},
              createdAt: new Date("2026-03-31T09:01:00.000Z")
            }
          ] as T;
        }

        if (method === "GET" && path === "/api/v1/validations?runId=run-1") {
          return [
            {
              id: "validation-1",
              runId: "run-1",
              taskId: "task-1",
              name: "typecheck",
              status: "passed",
              command: "pnpm typecheck",
              summary: "Typecheck passed before verification.",
              artifactPath: "artifacts/validations/typecheck.json",
              artifactIds: ["artifact-1"],
              artifacts: [],
              createdAt: new Date("2026-03-31T09:01:00.000Z"),
              updatedAt: new Date("2026-03-31T09:01:00.000Z")
            }
          ] as T;
        }

        if (method === "POST" && path === "/api/v1/runs/run-1/budget-checkpoints") {
          return {
            decision: "within_budget",
            exceeded: [],
            updatedAt: new Date("2026-03-31T09:02:00.000Z").toISOString(),
            approvalId: null,
            continueAllowed: true
          } as T;
        }

        if (method === "POST" && path === "/api/v1/sessions/session-verifier-1/transcript") {
          const entries = (payload?.entries as Array<{ kind: string; text: string }>) ?? [];
          transcriptPrompt = entries.find((entry) => entry.kind === "prompt")?.text ?? "";
          return { ok: true } as T;
        }

        if (method === "PATCH" && path === "/api/v1/worker-dispatch-assignments/dispatch-verifier-1") {
          return {
            ...assignment,
            state: "completed",
            metadata: payload?.outcome ?? assignment.metadata
          } as T;
        }

        throw new Error(`unexpected request: ${method} ${path}`);
      };

      const result = await runManagedWorkerDispatch({
        request,
        nodeId: "node-1",
        workspaceRoot: worktreeRoot,
        supervisorCommand: [
          process.execPath,
          "--input-type=module",
          "-e",
          "setInterval(() => {}, 1000);"
        ],
        executeTool: async (toolRequest: any) => {
          seenPrompt = toolRequest.input?.prompt ?? toolRequest.message?.params?.prompt ?? "";

          return {
            threadId: "thread-verifier-1",
            output: JSON.stringify({
              summary: "Definition of done is satisfied.",
              status: "passed",
              findings: [],
              changeRequests: [],
              messages: [],
              blockingIssues: []
            })
          };
        }
      });

      expect(result).toMatchObject({
        assignmentId: "dispatch-verifier-1",
        status: "completed"
      });
      expect(seenPrompt).toContain("Worker summary: Worker says the slice is ready.");
      expect(seenPrompt).toContain("typecheck: passed");
      expect(seenPrompt).toContain("Typecheck passed before verification.");
      expect(seenPrompt).toContain("artifacts/validations/typecheck.json");
      expect(seenPrompt).toContain("Validation output is attached to the task.");
      expect(transcriptPrompt).toContain("typecheck: passed");
      expect(transcriptPrompt).toContain("Definition of done:");
    } finally {
      await rm(worktreeRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
