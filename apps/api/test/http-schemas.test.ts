import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { artifactCreateSchema, messageCreateSchema, validationCreateSchema } from "../src/http/schemas.js";

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
  it("defaults validation status to pending", () => {
    const validation = validationCreateSchema.parse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      name: "unit",
      command: "pnpm test"
    });

    expect(validation.status).toBe("pending");
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
