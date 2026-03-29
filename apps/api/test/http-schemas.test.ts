import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  artifactCreateSchema,
  messageCreateSchema,
  sessionTranscriptAppendSchema,
  validationCreateSchema
} from "../src/http/schemas.js";

describe("messageCreateSchema", () => {
  it("requires a recipient for direct messages", () => {
    expect(() =>
      messageCreateSchema.parse({
        runId: "550e8400-e29b-41d4-a716-446655440000",
        kind: "direct",
        body: "Please pick this up"
      })
    ).toThrowError(ZodError);
  });

  it("allows broadcast messages without a recipient", () => {
    const message = messageCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      kind: "broadcast",
      body: "Daily summary"
    });

    expect(message.kind).toBe("broadcast");
    expect(message.recipientAgentId).toBeUndefined();
  });
});

describe("validationCreateSchema", () => {
  it("defaults validation status and artifactIds", () => {
    const validation = validationCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      name: "unit",
      command: "pnpm test"
    });

    expect(validation.status).toBe("pending");
    expect(validation.artifactIds).toEqual([]);
  });
});

describe("artifactCreateSchema", () => {
  it("defaults metadata to an empty object", () => {
    const artifact = artifactCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      kind: "log",
      path: "artifacts/test.log",
      contentType: "text/plain"
    });

    expect(artifact.metadata).toEqual({});
  });
});

describe("sessionTranscriptAppendSchema", () => {
  it("defaults transcript entry metadata to an empty object", () => {
    const transcript = sessionTranscriptAppendSchema.parse({
      entries: [
        {
          kind: "response",
          text: "Done."
        }
      ]
    });

    expect(transcript.entries[0]?.metadata).toEqual({});
  });
});
