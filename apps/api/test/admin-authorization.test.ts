import { describe, expect, it, vi } from "vitest";

import type { ControlPlaneService } from "../src/services/control-plane-service.js";
import { buildApp } from "../src/app.js";
import { getConfig } from "../src/config.js";

describe("admin authorization", () => {
  it("rejects admin retention writes for non-admin roles with deterministic details", async () => {
    const controlPlane = {
      reconcileGovernanceRetention: vi.fn()
    };

    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: true
      }),
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/retention/reconcile",
      headers: {
        authorization: "Bearer codex-swarm-dev-token",
        "x-codex-role": "member",
        "x-codex-roles": "member"
      },
      payload: {
        dryRun: true
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "actor role is not permitted to perform admin.write",
      details: {
        action: "admin.write",
        roles: ["member"],
        workspaceId: "default-workspace",
        teamId: "codex-swarm"
      }
    });
    expect(controlPlane.reconcileGovernanceRetention).not.toHaveBeenCalled();

    await app.close();
  });
});
