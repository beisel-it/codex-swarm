import { describe, expect, it } from "vitest";

import {
  approvalCreateSchema,
  approvalResolveSchema,
  agentCreateSchema,
  cleanupJobRunSchema,
  repositoryCreateSchema,
  runBranchPublishSchema,
  runCreateSchema,
  runPullRequestHandoffSchema,
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
      metadata: {}
    });
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
