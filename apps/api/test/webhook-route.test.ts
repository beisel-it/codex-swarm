import { afterEach, describe, expect, it, vi } from "vitest";
import type { ControlPlaneService } from "../src/services/control-plane-service.js";

import { buildApp } from "../src/app.js";

const observability = {
  beginRequest: vi.fn(),
  clearActorContext: vi.fn(),
  getMetrics: vi.fn(),
  listEvents: vi.fn(),
  recordRecoverableDatabaseFallback: vi.fn(),
  recordRequestFailure: vi.fn(),
  recordTimelineEvent: vi.fn(),
  setActorContext: vi.fn(),
  withTrace: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("webhookRoutes", () => {
  it("accepts public webhook ingress without bearer auth and returns the created run linkage", async () => {
    const controlPlane = {
      ingestWebhook: vi.fn(async () => ({
        receipt: {
          id: "11111111-1111-4111-8111-111111111111",
          repeatableRunTriggerId: "22222222-2222-4222-8222-222222222222",
          repeatableRunId: "33333333-3333-4333-8333-333333333333",
          repositoryId: "44444444-4444-4444-8444-444444444444",
          workspaceId: "workspace-1",
          teamId: "team-1",
          sourceType: "webhook",
          status: "run_created",
          event: {
            sourceType: "webhook",
            eventId: "delivery-1",
            eventName: "pull_request",
            action: "opened",
            source: "webhook",
            payload: {},
            request: {
              method: "POST",
              path: "/webhooks/triggers/22222222-2222-4222-8222-222222222222",
              receivedAt: new Date("2026-03-30T10:00:00.000Z"),
            },
            metadata: {},
          },
          rejectionReason: null,
          createdRunId: "55555555-5555-4555-8555-555555555555",
          createdAt: new Date("2026-03-30T10:00:00.000Z"),
          updatedAt: new Date("2026-03-30T10:00:00.000Z"),
        },
        run: {
          id: "55555555-5555-4555-8555-555555555555",
          repositoryId: "44444444-4444-4444-8444-444444444444",
          workspaceId: "workspace-1",
          teamId: "team-1",
          goal: "Review the new PR",
          status: "pending",
          branchName: null,
          planArtifactPath: null,
          budgetTokens: null,
          budgetCostUsd: null,
          concurrencyCap: 1,
          policyProfile: "standard",
          metadata: {
            externalEventReceiptId: "11111111-1111-4111-8111-111111111111",
          },
          context: {
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
          completedAt: null,
          createdBy: "external-trigger",
          createdAt: new Date("2026-03-30T10:00:00.000Z"),
          updatedAt: new Date("2026-03-30T10:00:00.000Z"),
        },
      })),
    };
    const app = await buildApp({
      controlPlane: controlPlane as unknown as ControlPlaneService,
      observability: observability as never,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/triggers/22222222-2222-4222-8222-222222222222",
      payload: {
        action: "opened",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(controlPlane.ingestWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointPath: "/webhooks/triggers/22222222-2222-4222-8222-222222222222",
        method: "POST",
      }),
    );
    expect(response.json()).toEqual({
      receiptId: "11111111-1111-4111-8111-111111111111",
      status: "run_created",
      runId: "55555555-5555-4555-8555-555555555555",
      rejectionReason: null,
    });

    await app.close();
  });
});
