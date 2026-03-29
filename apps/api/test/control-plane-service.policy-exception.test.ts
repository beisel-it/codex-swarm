import { describe, expect, it } from "vitest";

import { approvals, runs } from "../src/db/schema.js";
import { HttpError } from "../src/lib/http-error.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

function extractTargetId(condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) {
  const chunk = condition.queryChunks[3] as { value?: string };

  if (!chunk || typeof chunk.value !== "string") {
    throw new Error("unable to extract update target");
  }

  return chunk.value;
}

class FakePolicyExceptionDb {
  readonly runStore = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      repositoryId: "repo-1",
      workspaceId: "acme",
      teamId: "platform",
      goal: "exercise policy exception approval",
      status: "awaiting_approval",
      branchName: null,
      planArtifactPath: null,
      budgetTokens: 100,
      budgetCostUsd: 50,
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
      createdBy: "dev-user",
      createdAt: new Date("2026-03-28T12:00:00.000Z"),
      updatedAt: new Date("2026-03-28T12:00:00.000Z")
    }
  ];

  readonly approvalStore = [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workspaceId: "acme",
      teamId: "platform",
      taskId: null,
      kind: "policy_exception",
      status: "pending",
      requestedPayload: {
        summary: "Budget cap exceeded and needs policy exception review.",
        policyDecision: {
          policyKey: "run_budget",
          trigger: "budget_cap_exceeded",
          targetType: "run",
          targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          requestedAction: "continue_run",
          decision: "block_pending_approval",
          policyProfile: "standard",
          checkpointSource: "worker.dispatch",
          observed: {
            totalTokens: 120,
            totalCostUsd: 0.5
          },
          threshold: {
            budgetTokens: 100,
            budgetCostUsd: 0.25
          }
        },
        enforcement: {
          onApproval: "continue_run",
          onRejection: "remain_blocked"
        }
      },
      resolutionPayload: {},
      requestedBy: "system:budget-guard",
      delegateActorId: null,
      delegatedBy: null,
      delegatedAt: null,
      delegationReason: null,
      resolver: null,
      resolvedAt: null,
      createdAt: new Date("2026-03-28T12:01:00.000Z"),
      updatedAt: new Date("2026-03-28T12:01:00.000Z")
    }
  ];

  select() {
    return {
      from: (table: unknown) => ({
        where: async (condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) => {
          const id = extractTargetId(condition);

          if (table === runs) {
            return this.runStore.filter((candidate) => candidate.id === id);
          }

          if (table === approvals) {
            return this.approvalStore.filter((candidate) => candidate.id === id);
          }

          throw new Error("unexpected select table");
        }
      })
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
          if (table !== approvals) {
            throw new Error("unexpected update table");
          }

          const record = this.approvalStore[0];

          if (!record) {
            throw new Error("missing approval record");
          }

          Object.assign(record, values);
          return [record];
        }
      })
      })
    };
  }
}

describe("ControlPlaneService policy-exception approvals", () => {
  it("rejects policy-exception resolutions whose explicit outcome mismatches the status", async () => {
    const service = new ControlPlaneService(new FakePolicyExceptionDb() as never, {
      now: () => new Date("2026-03-28T12:05:00.000Z")
    });

    await expect(service.resolveApproval(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      {
        status: "approved",
        resolver: "reviewer-1",
        resolutionPayload: {
          outcome: "rejected_exception"
        }
      },
      {
        workspaceId: "acme",
        workspaceName: "Acme",
        teamId: "platform",
        teamName: "Platform"
      }
    )).rejects.toMatchObject({
      statusCode: 409
    } satisfies Partial<HttpError>);
  });
});
