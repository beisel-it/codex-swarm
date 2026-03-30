import { describe, expect, it } from "vitest";
import type { Artifact, RunDetail, Validation } from "@codex-swarm/contracts";

import {
  executeTaskValidationTemplate,
  executeValidationCommand,
  type WorkerControlPlaneRequest
} from "../src/validation-runner.js";

const runDetail: RunDetail = {
  id: "22222222-2222-4222-8222-222222222222",
  repositoryId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "default-workspace",
  teamId: "codex-swarm",
  goal: "Validate the worker runner",
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
  metadata: {},
  completedAt: null,
  createdBy: "tech-lead",
  createdAt: new Date("2026-03-29T00:00:00.000Z"),
  updatedAt: new Date("2026-03-29T00:00:00.000Z"),
  tasks: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      runId: "22222222-2222-4222-8222-222222222222",
      parentTaskId: null,
      title: "Run validation",
      description: "Execute the template command",
      role: "backend-dev",
      status: "in_progress",
      priority: 1,
      ownerAgentId: null,
      dependencyIds: [],
      acceptanceCriteria: [],
      validationTemplates: [
        {
          name: "unit",
          command: `${JSON.stringify(process.execPath)} --input-type=module -e "console.log('validation ok')"`,
          summary: "Unit validation completed",
          artifactPath: "artifacts/validations/unit.json"
        }
      ],
      createdAt: new Date("2026-03-29T00:00:00.000Z"),
      updatedAt: new Date("2026-03-29T00:00:00.000Z")
    }
  ],
  agents: [],
  sessions: [],
  taskDag: {
    nodes: [
      {
        taskId: "33333333-3333-4333-8333-333333333333",
        title: "Run validation",
        role: "backend-dev",
        status: "in_progress",
        parentTaskId: null,
        dependencyIds: [],
        dependentTaskIds: [],
        blockedByTaskIds: [],
        isRoot: true,
        isBlocked: false
      }
    ],
    edges: [],
    rootTaskIds: ["33333333-3333-4333-8333-333333333333"],
    blockedTaskIds: [],
    unblockPaths: []
  }
};

describe("validation runner", () => {
  it("executes shell commands and captures stdout and stderr", async () => {
    const result = await executeValidationCommand(
      `${JSON.stringify(process.execPath)} --input-type=module -e "console.log('out'); console.error('err'); process.exit(0)"`,
      {
        cwd: process.cwd()
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("out");
    expect(result.stderr).toContain("err");
  });

  it("publishes an artifact-backed validation result through the control plane", async () => {
    const capturedArtifacts: Artifact[] = [];
    const capturedValidations: Validation[] = [];

    const request: WorkerControlPlaneRequest = async <T>(
      method: string,
      path: string,
      payload?: Record<string, unknown>
    ) => {
      if (method === "POST" && path === "/api/v1/artifacts" && payload) {
        const artifact: Artifact = {
          id: "44444444-4444-4444-8444-444444444444",
          runId: payload.runId as string,
          taskId: payload.taskId as string,
          kind: payload.kind as Artifact["kind"],
          path: payload.path as string,
          contentType: payload.contentType as string,
          url: "https://swarm.example.com/api/v1/artifacts/44444444-4444-4444-8444-444444444444/content",
          sizeBytes: 128,
          sha256: "sha",
          metadata: payload.metadata as Record<string, unknown>,
          createdAt: new Date("2026-03-29T00:00:05.000Z")
        };

        capturedArtifacts.push(artifact);
        return artifact as T;
      }

      if (method === "POST" && path === "/api/v1/validations" && payload) {
        const validation: Validation = {
          id: "55555555-5555-4555-8555-555555555555",
          runId: payload.runId as string,
          taskId: payload.taskId as string,
          name: "unit",
          status: payload.status as Validation["status"],
          command: runDetail.tasks[0]!.validationTemplates[0]!.command,
          summary: payload.summary as string,
          artifactPath: payload.artifactPath as string,
          artifactIds: payload.artifactIds as string[],
          createdAt: new Date("2026-03-29T00:00:06.000Z"),
          updatedAt: new Date("2026-03-29T00:00:06.000Z")
        };

        capturedValidations.push(validation);
        return validation as T;
      }

      throw new Error(`unexpected request: ${method} ${path}`);
    };

    const executed = await executeTaskValidationTemplate({
      request,
      runId: runDetail.id,
      taskId: runDetail.tasks[0]!.id,
      templateName: "unit",
      cwd: process.cwd(),
      runDetail
    });

    expect(executed.validation.status).toBe("passed");
    expect(executed.validation.artifactIds).toEqual([capturedArtifacts[0]!.id]);
    expect(executed.artifact.path).toBe("artifacts/validations/unit.json");
    expect(executed.report.stdout).toContain("validation ok");
    expect(capturedArtifacts).toHaveLength(1);
    expect(capturedValidations).toHaveLength(1);
  });
});
