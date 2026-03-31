import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { AppConfig } from "../config.js";

export type PersistedArtifactBlob = {
  storageKey: string;
  url: string;
  sizeBytes: number;
  sha256: string;
};

export function getArtifactStorageRoot(config: AppConfig) {
  return resolve(config.ARTIFACT_STORAGE_ROOT);
}

export function buildArtifactDownloadUrl(
  config: AppConfig,
  artifactId: string,
) {
  const baseUrl = config.ARTIFACT_BASE_URL.replace(/\/$/, "");
  return `${baseUrl}/api/v1/artifacts/${artifactId}/content`;
}

export async function persistArtifactBlob(
  config: AppConfig,
  artifactId: string,
  content: Buffer,
): Promise<PersistedArtifactBlob> {
  const sha256 = createHash("sha256").update(content).digest("hex");
  const storageKey = join(artifactId.slice(0, 2), artifactId, "content.bin");
  const outputPath = join(getArtifactStorageRoot(config), storageKey);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);

  return {
    storageKey,
    url: buildArtifactDownloadUrl(config, artifactId),
    sizeBytes: content.byteLength,
    sha256,
  };
}

export async function readArtifactBlob(config: AppConfig, storageKey: string) {
  const artifactPath = join(getArtifactStorageRoot(config), storageKey);
  const [content, details] = await Promise.all([
    readFile(artifactPath),
    stat(artifactPath),
  ]);

  return {
    content,
    sizeBytes: details.size,
  };
}
