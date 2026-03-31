import { readFile } from "node:fs/promises";

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { artifactCreateSchema } from "../http/schemas.js";
import { artifactDetailSchema, artifactDiffSummarySchema, type Artifact } from "@codex-swarm/contracts";
import { persistArtifactBlob, readArtifactBlob } from "../lib/artifact-store.js";
import { controlPlaneEvents, timelineEvent } from "../lib/control-plane-events.js";
import { HttpError } from "../lib/http-error.js";
import { requireValue } from "../lib/require-value.js";

const querySchema = z.object({
  runId: z.uuid()
});

const paramsSchema = z.object({
  id: z.uuid()
});

const ARTIFACT_ROUTE_BODY_LIMIT_BYTES = 256 * 1024 * 1024;
const MAX_ARTIFACT_DETAIL_BYTES = 128 * 1024;
const MAX_DIFF_PREVIEW_CHARS = 4_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isTextArtifact(artifact: Artifact) {
  return artifact.kind === "diff"
    || artifact.contentType.startsWith("text/")
    || artifact.contentType === "application/json"
    || artifact.contentType.endsWith("+json")
    || artifact.contentType.endsWith("/json")
    || artifact.contentType.endsWith("+xml");
}

function resolveArtifactSourcePath(input: z.infer<typeof artifactCreateSchema>) {
  if (input.contentBase64) {
    return null;
  }

  const metadata = asRecord(input.metadata);
  const resolvedArtifactPath = typeof metadata?.resolvedArtifactPath === "string"
    ? metadata.resolvedArtifactPath.trim()
    : "";

  if (resolvedArtifactPath.length > 0) {
    return resolvedArtifactPath;
  }

  return input.path;
}

async function readArtifactContent(input: z.infer<typeof artifactCreateSchema>) {
  if (input.contentBase64) {
    return Buffer.from(input.contentBase64, "base64");
  }

  const sourcePath = resolveArtifactSourcePath(input);

  try {
    return await readFile(sourcePath as string);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new HttpError(409, `artifact source file not found: ${sourcePath}`);
    }

    throw error;
  }
}

function buildDerivedDiffSummary(rawDiff: string, truncated: boolean) {
  const fileSummaries: Array<{
    path: string;
    changeType: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
    additions: number;
    deletions: number;
    summary: string | null;
    previousPath: string | null;
    providerUrl: null;
  }> = [];
  const lines = rawDiff.split(/\r?\n/);
  let currentFile: typeof fileSummaries[number] | null = null;

  const pushCurrentFile = () => {
    if (!currentFile) {
      return;
    }

    currentFile.summary = `${currentFile.additions} additions, ${currentFile.deletions} deletions`;
    fileSummaries.push(currentFile);
    currentFile = null;
  };

  for (const line of lines) {
    const diffMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);

    if (diffMatch?.[2]) {
      pushCurrentFile();
      currentFile = {
        path: diffMatch[2],
        changeType: "modified",
        additions: 0,
        deletions: 0,
        summary: null,
        previousPath: null,
        providerUrl: null
      };
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (line.startsWith("new file mode ")) {
      currentFile.changeType = "added";
      continue;
    }

    if (line.startsWith("deleted file mode ")) {
      currentFile.changeType = "deleted";
      continue;
    }

    if (line.startsWith("rename from ")) {
      currentFile.changeType = "renamed";
      currentFile.previousPath = line.slice("rename from ".length) || null;
      continue;
    }

    if (line.startsWith("rename to ")) {
      currentFile.path = line.slice("rename to ".length) || currentFile.path;
      continue;
    }

    if (line.startsWith("copy from ")) {
      currentFile.changeType = "copied";
      currentFile.previousPath = line.slice("copy from ".length) || null;
      continue;
    }

    if (line.startsWith("copy to ")) {
      currentFile.path = line.slice("copy to ".length) || currentFile.path;
      continue;
    }

    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      continue;
    }

    if (line.startsWith("+")) {
      currentFile.additions += 1;
      continue;
    }

    if (line.startsWith("-")) {
      currentFile.deletions += 1;
    }
  }

  pushCurrentFile();

  const insertions = fileSummaries.reduce((total, file) => total + file.additions, 0);
  const deletions = fileSummaries.reduce((total, file) => total + file.deletions, 0);
  const filesChanged = fileSummaries.length;

  return artifactDiffSummarySchema.parse({
    title: filesChanged === 0 ? "Stored diff artifact" : `${filesChanged} file${filesChanged === 1 ? "" : "s"} changed`,
    changeSummary: filesChanged === 0
      ? "Stored diff artifact without file-level summary metadata."
      : `${filesChanged} file${filesChanged === 1 ? "" : "s"} changed, ${insertions} insertions, ${deletions} deletions`,
    filesChanged,
    insertions,
    deletions,
    truncated,
    fileSummaries,
    diffPreview: rawDiff.slice(0, MAX_DIFF_PREVIEW_CHARS),
    rawDiff: truncated ? null : rawDiff
  });
}

function buildDiffSummary(artifact: Artifact, bodyText: string | null, truncated: boolean) {
  const metadata = asRecord(artifact.metadata);
  const candidate = metadata ? asRecord(metadata.diffSummary) : null;

  if (candidate) {
    const parsed = artifactDiffSummarySchema.safeParse({
      ...candidate,
      ...(candidate.diffPreview ? {} : bodyText ? { diffPreview: bodyText.slice(0, MAX_DIFF_PREVIEW_CHARS) } : {}),
      ...(candidate.rawDiff ? {} : bodyText && !truncated ? { rawDiff: bodyText } : {}),
      ...(candidate.truncated === undefined ? { truncated } : {})
    });

    if (parsed.success) {
      return parsed.data;
    }
  }

  return bodyText ? buildDerivedDiffSummary(bodyText, truncated) : null;
}

async function buildArtifactDetail(config: Parameters<typeof readArtifactBlob>[0], artifact: Artifact) {
  const metadata = asRecord(artifact.metadata);
  const storageKey = typeof metadata?.storageKey === "string" ? metadata.storageKey : null;

  if (!storageKey) {
    return artifactDetailSchema.parse({
      artifact,
      contentState: "missing",
      bodyText: null,
      diffSummary: artifact.kind === "diff" ? buildDiffSummary(artifact, null, false) : null
    });
  }

  if (!isTextArtifact(artifact)) {
    return artifactDetailSchema.parse({
      artifact,
      contentState: "binary",
      bodyText: null,
      diffSummary: artifact.kind === "diff" ? buildDiffSummary(artifact, null, false) : null
    });
  }

  try {
    const { content, sizeBytes } = await readArtifactBlob(config, storageKey);
    const truncated = sizeBytes > MAX_ARTIFACT_DETAIL_BYTES;
    const bodyText = content.subarray(0, MAX_ARTIFACT_DETAIL_BYTES).toString("utf8");

    return artifactDetailSchema.parse({
      artifact,
      contentState: truncated ? "truncated" : "available",
      bodyText,
      diffSummary: artifact.kind === "diff" ? buildDiffSummary(artifact, bodyText, truncated) : null
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return artifactDetailSchema.parse({
        artifact,
        contentState: "missing",
        bodyText: null,
        diffSummary: artifact.kind === "diff" ? buildDiffSummary(artifact, null, false) : null
      });
    }

    throw error;
  }
}

export const artifactRoutes: FastifyPluginAsync = async (app) => {
  app.get("/artifacts", async (request) => {
    const { runId } = querySchema.parse(request.query);
    return app.controlPlane.listArtifacts(runId, request.authContext);
  });

  app.get("/artifacts/:id", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const artifact = await app.controlPlane.getArtifact(id, request.authContext);
    return buildArtifactDetail(app.config, artifact);
  });

  app.get("/artifacts/:id/content", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const artifact = await app.controlPlane.getArtifact(id, request.authContext);
    const storageKey = typeof artifact.metadata.storageKey === "string" ? artifact.metadata.storageKey : null;

    if (!storageKey) {
      throw new HttpError(409, `artifact ${id} does not have persisted blob storage`);
    }

    const { content, sizeBytes } = await readArtifactBlob(app.config, storageKey);

    return reply
      .header("content-type", artifact.contentType)
      .header("content-length", sizeBytes)
      .send(content);
  });

  app.post("/artifacts", { bodyLimit: ARTIFACT_ROUTE_BODY_LIMIT_BYTES }, async (request, reply) => {
    return app.observability.withTrace("api.artifacts.create", async () => {
      const input = artifactCreateSchema.parse(request.body);
      const content = await readArtifactContent(input);
      const artifact = requireValue(
        await app.controlPlane.createArtifact({
          ...input,
          metadata: {
            ...input.metadata
          }
        }, request.authContext),
        "control plane returned no artifact"
      );
      const storedArtifact = await app.controlPlane.attachArtifactStorage(
        artifact.id,
        await persistArtifactBlob(app.config, artifact.id, content)
      );

      await app.observability.recordTimelineEvent(timelineEvent(controlPlaneEvents.artifactCreated, {
        runId: storedArtifact.runId,
        taskId: storedArtifact.taskId,
        entityId: storedArtifact.id,
        status: storedArtifact.kind,
        summary: `Artifact ${storedArtifact.kind} published`
      }));

      return reply.code(201).send(storedArtifact);
    }, { route: "artifacts.create" });
  });
};
