import { describe, expect, it } from "vitest";

import { repeatableRunExecutionSchema, runCreateSchema } from "../src/index.js";

describe("run handoff schemas", () => {
  it("defaults manual handoff for new runs", () => {
    const run = runCreateSchema.parse({
      repositoryId: "550e8400-e29b-41d4-a716-446655440000",
      goal: "Ship M10",
    });

    expect(run.handoff).toEqual({
      mode: "manual",
      provider: null,
      baseBranch: null,
      autoPublishBranch: false,
      autoCreatePullRequest: false,
      titleTemplate: null,
      bodyTemplate: null,
    });
  });

  it("defaults manual handoff for repeatable run execution", () => {
    const execution = repeatableRunExecutionSchema.parse({
      goal: "Review incoming PRs",
      concurrencyCap: 1,
    });

    expect(execution.handoff.mode).toBe("manual");
    expect(execution.handoff.autoCreatePullRequest).toBe(false);
  });

  it("rejects unsupported handoff template tokens", () => {
    expect(() =>
      runCreateSchema.parse({
        repositoryId: "550e8400-e29b-41d4-a716-446655440000",
        goal: "Ship M10",
        handoff: {
          mode: "auto",
          provider: "github",
          autoPublishBranch: true,
          autoCreatePullRequest: true,
          titleTemplate: "Provider handoff: {unknown_token}",
        },
      }),
    ).toThrow(/unsupported handoff template token unknown_token/);
  });
});
