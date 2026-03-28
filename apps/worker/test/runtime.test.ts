import { describe, expect, it } from "vitest";

import {
  buildCodexServerCommand,
  buildCodexSessionReplyRequest,
  buildCodexSessionStartRequest,
  createWorktreePath
} from "../src/runtime.js";

describe("worker runtime helpers", () => {
  it("creates deterministic sanitized worktree paths", () => {
    expect(createWorktreePath({
      rootDir: ".swarm/worktrees",
      repositorySlug: "Codex Swarm",
      runId: "Run 001",
      agentId: "Backend Dev",
      taskId: "Task / A"
    })).toBe(".swarm/worktrees/codex-swarm/run-001/backend-dev/task-a");
  });

  it("builds the codex mcp-server command", () => {
    expect(buildCodexServerCommand({
      cwd: "/tmp/run-001/backend-dev",
      profile: "default",
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      includePlanTool: true
    })).toEqual([
      "codex",
      "mcp-server",
      "--cwd",
      "/tmp/run-001/backend-dev",
      "--profile",
      "default",
      "--sandbox",
      "workspace-write",
      "--approval-policy",
      "on-request",
      "--include-plan-tool"
    ]);
  });

  it("builds a start-session request payload", () => {
    expect(buildCodexSessionStartRequest({
      prompt: "Start the worker",
      config: {
        cwd: "/tmp/run-001/backend-dev",
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request"
      }
    })).toEqual({
      tool: "codex",
      input: {
        prompt: "Start the worker",
        cwd: "/tmp/run-001/backend-dev",
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        includePlanTool: false
      }
    });
  });

  it("builds a reply-session request payload", () => {
    expect(buildCodexSessionReplyRequest({
      threadId: "thread-001",
      prompt: "Continue the worker"
    })).toEqual({
      tool: "codex-reply",
      input: {
        threadId: "thread-001",
        prompt: "Continue the worker"
      }
    });
  });
});
