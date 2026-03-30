import { afterEach, describe, expect, it, vi } from "vitest";

import { externalEventReceipts, repeatableRunTriggers } from "../src/db/schema.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

function extractTargetId(condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) {
  const chunk = condition.queryChunks[3] as { value?: string };

  if (!chunk || typeof chunk.value !== "string") {
    throw new Error("unable to extract update target");
  }

  return chunk.value;
}

class FakeWebhookDb {
  readonly receiptStore: any[] = [];

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table !== externalEventReceipts) {
            throw new Error("unexpected insert table");
          }

          const record = {
            ...values
          };
          this.receiptStore.push(record);
          return [record];
        }
      })
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) => {
          const resolveRecord = () => {
            if (table !== externalEventReceipts) {
              throw new Error("unexpected update table");
            }

            const id = extractTargetId(condition);
            const record = this.receiptStore.find((candidate) => candidate.id === id);

            if (!record) {
              throw new Error(`unknown receipt ${id}`);
            }

            Object.assign(record, values);
            return [record];
          };

          return {
            returning: async () => resolveRecord(),
            then<TResult1 = any, TResult2 = never>(
              onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
            ) {
              return Promise.resolve(resolveRecord()).then(onfulfilled, onrejected);
            }
          };
        }
      })
    };
  }
}

class FakeTriggerDb {
  readonly triggerStore: any[] = [];

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table !== repeatableRunTriggers) {
            throw new Error("unexpected insert table");
          }

          const record = {
            ...values
          };
          this.triggerStore.push(record);
          return [record];
        }
      })
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) => ({
          returning: async () => {
            if (table !== repeatableRunTriggers) {
              throw new Error("unexpected update table");
            }

            const id = extractTargetId(condition);
            const record = this.triggerStore.find((candidate) => candidate.id === id);

            if (!record) {
              throw new Error(`unknown trigger ${id}`);
            }

            Object.assign(record, values);
            return [record];
          }
        })
      })
    };
  }
}

afterEach(() => {
  delete process.env.TEST_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

describe("ControlPlaneService webhook ingestion", () => {
  it("creates a run with normalized external input context and links the receipt", async () => {
    process.env.TEST_WEBHOOK_SECRET = "top-secret";
    const db = new FakeWebhookDb();
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-30T10:00:00.000Z")
    });
    const createRun = vi.fn(async (input) => ({
      id: "99999999-9999-4999-8999-999999999999",
      repositoryId: input.repositoryId,
      workspaceId: "workspace-1",
      teamId: "team-1",
      goal: input.goal,
      status: "pending",
      branchName: input.branchName ?? null,
      planArtifactPath: input.planArtifactPath ?? null,
      budgetTokens: input.budgetTokens ?? null,
      budgetCostUsd: input.budgetCostUsd ?? null,
      concurrencyCap: input.concurrencyCap,
      policyProfile: input.policyProfile ?? null,
      metadata: input.metadata,
      context: input.context,
      publishedBranch: null,
      branchPublishedAt: null,
      branchPublishApprovalId: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      pullRequestApprovalId: null,
      handoffStatus: "pending",
      completedAt: null,
      createdBy: "external-trigger",
      createdAt: new Date("2026-03-30T10:00:00.000Z"),
      updatedAt: new Date("2026-03-30T10:00:00.000Z")
    }));

    vi.spyOn(service as any, "resolveWebhookTriggerByPath").mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      repeatableRunId: "22222222-2222-4222-8222-222222222222",
      name: "PR opened",
      description: null,
      enabled: true,
      kind: "webhook",
      config: {
        endpointPath: "/webhooks/triggers/11111111-1111-4111-8111-111111111111",
        secretRef: "TEST_WEBHOOK_SECRET",
        signatureHeader: "x-webhook-secret",
        eventNameHeader: "x-event-name",
        deliveryIdHeader: "x-delivery-id",
        allowedMethods: ["POST"],
        maxPayloadBytes: 4096,
        filters: {
          eventNames: ["pull_request"],
          actions: ["opened"],
          branches: ["main"],
          metadata: {}
        },
        metadata: {
          source: "test"
        }
      },
      createdAt: new Date("2026-03-30T09:55:00.000Z"),
      updatedAt: new Date("2026-03-30T09:55:00.000Z")
    });
    vi.spyOn(service as any, "assertRepeatableRunDefinitionExists").mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      repositoryId: "33333333-3333-4333-8333-333333333333",
      workspaceId: "workspace-1",
      teamId: "team-1",
      name: "Issue review",
      description: null,
      status: "active",
      execution: {
        goal: "Review the new PR",
        branchName: null,
        planArtifactPath: null,
        budgetTokens: null,
        budgetCostUsd: null,
        concurrencyCap: 1,
        policyProfile: "standard",
        metadata: {
          preset: "pr-review"
        }
      },
      createdAt: new Date("2026-03-30T09:55:00.000Z"),
      updatedAt: new Date("2026-03-30T09:55:00.000Z")
    });
    vi.spyOn(service as any, "assertRepositoryExists").mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      workspaceId: "workspace-1",
      teamId: "team-1",
      trustLevel: "trusted",
      approvalProfile: "standard"
    });
    vi.spyOn(service, "createRun").mockImplementation(createRun as never);

    const result = await service.ingestWebhook({
      endpointPath: "/webhooks/triggers/11111111-1111-4111-8111-111111111111",
      method: "POST",
      headers: {
        "x-webhook-secret": "top-secret",
        "x-event-name": "pull_request",
        "x-delivery-id": "delivery-1"
      },
      query: {},
      body: {
        action: "opened",
        pull_request: {
          number: 42,
          base: {
            ref: "main"
          }
        }
      },
      contentType: "application/json",
      contentLengthBytes: 256,
      remoteAddress: "127.0.0.1",
      userAgent: "vitest"
    });

    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      repositoryId: "33333333-3333-4333-8333-333333333333",
      goal: "Review the new PR",
      context: expect.objectContaining({
        externalInput: expect.objectContaining({
          kind: "webhook",
          trigger: expect.objectContaining({
            id: "11111111-1111-4111-8111-111111111111"
          }),
          event: expect.objectContaining({
            eventId: "delivery-1",
            eventName: "pull_request",
            action: "opened",
            payload: expect.objectContaining({
              action: "opened"
            })
          })
        })
      })
    }), "external-trigger", expect.any(Object));
    expect(result.run?.context.externalInput?.metadata).toEqual(expect.objectContaining({
      receiptId: result.receipt.id
    }));
    expect(result.receipt.status).toBe("run_created");
    expect(result.receipt.createdRunId).toBe("99999999-9999-4999-8999-999999999999");
  });

  it("rejects requests that do not satisfy the configured trigger filters while keeping an audit receipt", async () => {
    const db = new FakeWebhookDb();
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-30T10:00:00.000Z")
    });

    vi.spyOn(service as any, "resolveWebhookTriggerByPath").mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      repeatableRunId: "22222222-2222-4222-8222-222222222222",
      name: "PR opened",
      description: null,
      enabled: true,
      kind: "webhook",
      config: {
        endpointPath: "/webhooks/triggers/11111111-1111-4111-8111-111111111111",
        secretRef: null,
        signatureHeader: null,
        eventNameHeader: "x-event-name",
        deliveryIdHeader: "x-delivery-id",
        allowedMethods: ["POST"],
        maxPayloadBytes: 4096,
        filters: {
          eventNames: ["pull_request"],
          actions: ["opened"],
          branches: [],
          metadata: {}
        },
        metadata: {}
      },
      createdAt: new Date("2026-03-30T09:55:00.000Z"),
      updatedAt: new Date("2026-03-30T09:55:00.000Z")
    });
    vi.spyOn(service as any, "assertRepeatableRunDefinitionExists").mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      repositoryId: "33333333-3333-4333-8333-333333333333",
      workspaceId: "workspace-1",
      teamId: "team-1",
      name: "Issue review",
      description: null,
      status: "active",
      execution: {
        goal: "Review the new PR",
        branchName: null,
        planArtifactPath: null,
        budgetTokens: null,
        budgetCostUsd: null,
        concurrencyCap: 1,
        policyProfile: "standard",
        metadata: {}
      },
      createdAt: new Date("2026-03-30T09:55:00.000Z"),
      updatedAt: new Date("2026-03-30T09:55:00.000Z")
    });
    vi.spyOn(service as any, "assertRepositoryExists").mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      workspaceId: "workspace-1",
      teamId: "team-1",
      trustLevel: "trusted",
      approvalProfile: "standard"
    });
    const createRun = vi.spyOn(service, "createRun");

    const result = await service.ingestWebhook({
      endpointPath: "/webhooks/triggers/11111111-1111-4111-8111-111111111111",
      method: "POST",
      headers: {
        "x-event-name": "pull_request",
        "x-delivery-id": "delivery-2"
      },
      query: {},
      body: {
        action: "edited"
      },
      contentType: "application/json",
      contentLengthBytes: 128
    });

    expect(createRun).not.toHaveBeenCalled();
    expect(result.run).toBeNull();
    expect(result.receipt.status).toBe("rejected");
    expect(result.receipt.rejectionReason).toContain("action");
    expect(db.receiptStore).toHaveLength(1);
  });
});

describe("ControlPlaneService repeatable run triggers", () => {
  it("generates a stable endpoint path on create", async () => {
    const db = new FakeTriggerDb();
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-30T10:00:00.000Z")
    });

    vi.spyOn(service as any, "assertRepeatableRunDefinitionExists").mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      repositoryId: "33333333-3333-4333-8333-333333333333",
      workspaceId: "workspace-1",
      teamId: "team-1",
      name: "Issue review",
      description: null,
      status: "active",
      execution: {
        goal: "Review the new PR",
        branchName: null,
        planArtifactPath: null,
        budgetTokens: null,
        budgetCostUsd: null,
        concurrencyCap: 1,
        policyProfile: "standard",
        metadata: {}
      },
      createdAt: new Date("2026-03-30T09:55:00.000Z"),
      updatedAt: new Date("2026-03-30T09:55:00.000Z")
    });
    vi.spyOn(crypto, "randomUUID").mockReturnValue("11111111-1111-4111-8111-111111111111");

    const trigger = await service.createRepeatableRunTrigger({
      repeatableRunId: "22222222-2222-4222-8222-222222222222",
      name: "PR opened webhook",
      description: null,
      enabled: true,
      kind: "webhook",
      config: {
        secretRef: null,
        signatureHeader: null,
        eventNameHeader: "x-github-event",
        deliveryIdHeader: "x-github-delivery",
        allowedMethods: ["POST"],
        maxPayloadBytes: 4096,
        filters: {
          eventNames: ["pull_request"],
          actions: ["opened"],
          branches: [],
          metadata: {}
        },
        metadata: {}
      }
    });

    expect(trigger.config.endpointPath).toBe("/webhooks/triggers/11111111-1111-4111-8111-111111111111");
    expect(db.triggerStore[0]?.config.endpointPath).toBe("/webhooks/triggers/11111111-1111-4111-8111-111111111111");
  });

  it("keeps the generated endpoint path stable on update", async () => {
    const db = new FakeTriggerDb();
    db.triggerStore.push({
      id: "11111111-1111-4111-8111-111111111111",
      repeatableRunId: "22222222-2222-4222-8222-222222222222",
      workspaceId: "workspace-1",
      teamId: "team-1",
      name: "PR opened webhook",
      description: null,
      enabled: true,
      kind: "webhook",
      config: {
        endpointPath: "/webhooks/triggers/11111111-1111-4111-8111-111111111111",
        secretRef: null,
        signatureHeader: null,
        eventNameHeader: "x-github-event",
        deliveryIdHeader: "x-github-delivery",
        allowedMethods: ["POST"],
        maxPayloadBytes: 1048576,
        filters: {
          eventNames: [],
          actions: [],
          branches: [],
          metadata: {}
        },
        metadata: {}
      },
      createdAt: new Date("2026-03-30T09:55:00.000Z"),
      updatedAt: new Date("2026-03-30T09:55:00.000Z")
    });

    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-30T10:00:00.000Z")
    });

    vi.spyOn(service as any, "assertRepeatableRunTriggerExists").mockResolvedValue(db.triggerStore[0]);
    vi.spyOn(service as any, "assertRepeatableRunDefinitionExists").mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      repositoryId: "33333333-3333-4333-8333-333333333333",
      workspaceId: "workspace-1",
      teamId: "team-1",
      name: "Issue review",
      description: null,
      status: "active",
      execution: {
        goal: "Review the new PR",
        branchName: null,
        planArtifactPath: null,
        budgetTokens: null,
        budgetCostUsd: null,
        concurrencyCap: 1,
        policyProfile: "standard",
        metadata: {}
      },
      createdAt: new Date("2026-03-30T09:55:00.000Z"),
      updatedAt: new Date("2026-03-30T09:55:00.000Z")
    });

    const trigger = await service.updateRepeatableRunTrigger("11111111-1111-4111-8111-111111111111", {
      name: "PR opened updated",
      config: {
        eventNameHeader: "x-event-name"
      }
    });

    expect(trigger.name).toBe("PR opened updated");
    expect(trigger.config.endpointPath).toBe("/webhooks/triggers/11111111-1111-4111-8111-111111111111");
    expect(trigger.config.eventNameHeader).toBe("x-event-name");
  });
});
