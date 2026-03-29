import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "../src/config.js";
import { buildArtifactDownloadUrl, persistArtifactBlob, readArtifactBlob } from "../src/lib/artifact-store.js";

describe("artifact-store", () => {
  let storageRoot: string | null = null;

  afterEach(async () => {
    if (storageRoot) {
      await rm(storageRoot, { recursive: true, force: true });
      storageRoot = null;
    }
  });

  it("persists artifact blobs and reads them back from durable storage", async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "codex-swarm-artifacts-"));

    const config = {
      ARTIFACT_STORAGE_ROOT: storageRoot,
      ARTIFACT_BASE_URL: "https://swarm.example.com"
    } as Pick<AppConfig, "ARTIFACT_STORAGE_ROOT" | "ARTIFACT_BASE_URL"> as AppConfig;
    const artifactId = "550e8400-e29b-41d4-a716-446655440000";
    const content = Buffer.from("artifact payload");

    const stored = await persistArtifactBlob(config, artifactId, content);
    const loaded = await readArtifactBlob(config, stored.storageKey);

    expect(stored).toMatchObject({
      storageKey: "55/550e8400-e29b-41d4-a716-446655440000/content.bin",
      url: "https://swarm.example.com/api/v1/artifacts/550e8400-e29b-41d4-a716-446655440000/content",
      sizeBytes: content.byteLength
    });
    expect(loaded.content.equals(content)).toBe(true);
    expect(loaded.sizeBytes).toBe(content.byteLength);
    expect(buildArtifactDownloadUrl(config, artifactId)).toBe(stored.url);
  });
});
