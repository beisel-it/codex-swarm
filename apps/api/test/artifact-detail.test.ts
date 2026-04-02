import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getConfig } from "../src/config.js";
import type { ControlPlaneService } from "../src/services/control-plane-service.js";

const headers = {
  authorization: "Bearer codex-swarm-dev-token"
};

describe("artifact detail routes", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("returns reviewer-facing diff detail for stored diff artifacts", async () => {
    const storageRoot = join(tmpdir(), `codex-swarm-artifacts-${Date.now()}`);
    const artifactId = "550e8400-e29b-41d4-a716-446655440001";
    const storageKey = join(artifactId.slice(0, 2), artifactId, "content.bin");
    const artifactPath = join(storageRoot, storageKey);
    cleanupPaths.push(storageRoot);

    await mkdir(join(storageRoot, artifactId.slice(0, 2), artifactId), { recursive: true });
    await writeFile(artifactPath, [
      "diff --git a/apps/api/src/routes/artifacts.ts b/apps/api/src/routes/artifacts.ts",
      "--- a/apps/api/src/routes/artifacts.ts",
      "+++ b/apps/api/src/routes/artifacts.ts",
      "@@ -1,2 +1,4 @@",
      "+import { artifactDetailSchema } from \"@codex-swarm/contracts\";",
      "-import { artifactCreateSchema } from \"../http/schemas.js\";",
      "+import { artifactCreateSchema } from \"../http/schemas.js\";"
    ].join("\n"));

    const controlPlane = {
      getArtifact: vi.fn().mockResolvedValue({
        id: artifactId,
        runId: "550e8400-e29b-41d4-a716-446655440010",
        taskId: null,
        kind: "diff",
        path: ".swarm/reviews/run-001/diff.patch",
        contentType: "text/x-diff",
        url: null,
        sizeBytes: 180,
        sha256: "abc123",
        metadata: {
          storageKey,
          diffSummary: {
            title: "Route diff",
            changeSummary: "1 file changed, reviewer context ready",
            filesChanged: 1,
            insertions: 2,
            deletions: 1,
            fileSummaries: [
              {
                path: "apps/api/src/routes/artifacts.ts",
                changeType: "modified",
                additions: 2,
                deletions: 1
              }
            ]
          }
        },
        createdAt: new Date("2026-03-29T00:00:00.000Z")
      })
    } satisfies Pick<ControlPlaneService, "getArtifact">;

    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: true,
        ARTIFACT_STORAGE_ROOT: storageRoot
      }),
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/artifacts/${artifactId}`,
        headers
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        contentState: "available",
        bodyText: expect.stringContaining("diff --git"),
        diffSummary: {
          title: "Route diff",
          changeSummary: "1 file changed, reviewer context ready",
          filesChanged: 1,
          insertions: 2,
          deletions: 1,
          fileSummaries: [
            expect.objectContaining({
              path: "apps/api/src/routes/artifacts.ts",
              changeType: "modified"
            })
          ],
          rawDiff: expect.stringContaining("diff --git")
        }
      });
    } finally {
      await app.close();
    }
  });

  it("returns a deterministic missing-body state when no persisted blob exists", async () => {
    const controlPlane = {
      getArtifact: vi.fn().mockResolvedValue({
        id: "550e8400-e29b-41d4-a716-446655440002",
        runId: "550e8400-e29b-41d4-a716-446655440010",
        taskId: null,
        kind: "report",
        path: ".swarm/reports/run-001/summary.json",
        contentType: "application/json",
        url: null,
        sizeBytes: null,
        sha256: null,
        metadata: {},
        createdAt: new Date("2026-03-29T00:00:00.000Z")
      })
    } satisfies Pick<ControlPlaneService, "getArtifact">;

    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: true
      }),
      controlPlane: controlPlane as unknown as ControlPlaneService
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/artifacts/550e8400-e29b-41d4-a716-446655440002",
        headers
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expect.objectContaining({
        contentState: "missing",
        bodyText: null,
        diffSummary: null
      }));
    } finally {
      await app.close();
    }
  });
});
