import { describe, expect, it } from "vitest";

import {
  buildCodexServerCommand,
  buildCodexSessionReplyRequest,
  buildCodexSessionStartRequest,
  buildSessionRecoveryPlan,
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

  it("builds a restart recovery plan for persisted sessions", () => {
    expect(buildSessionRecoveryPlan([
      {
        sessionId: "session-active",
        runId: "run-001",
        agentId: "agent-001",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-001",
        state: "active",
        threadId: "thread-001",
        lastHeartbeatAt: new Date("2026-03-28T12:10:00.000Z")
      },
      {
        sessionId: "session-pending",
        runId: "run-001",
        agentId: "agent-002",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-002",
        state: "pending",
        threadId: null,
        lastHeartbeatAt: null
      },
      {
        sessionId: "session-stale",
        runId: "run-001",
        agentId: "agent-003",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-003",
        state: "active",
        threadId: "thread-003",
        lastHeartbeatAt: new Date("2026-03-28T11:30:00.000Z")
      },
      {
        sessionId: "session-missing-worktree",
        runId: "run-001",
        agentId: "agent-004",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-004",
        state: "active",
        threadId: "thread-004",
        lastHeartbeatAt: new Date("2026-03-28T12:10:00.000Z")
      },
      {
        sessionId: "session-failed",
        runId: "run-001",
        agentId: "agent-005",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-005",
        state: "failed",
        threadId: "thread-005",
        lastHeartbeatAt: new Date("2026-03-28T12:10:00.000Z")
      }
    ], {
      now: new Date("2026-03-28T12:15:00.000Z"),
      staleAfterMs: 10 * 60 * 1000,
      existingWorktreePaths: [
        ".swarm/worktrees/codex-swarm/run-001/agent-001",
        ".swarm/worktrees/codex-swarm/run-001/agent-002",
        ".swarm/worktrees/codex-swarm/run-001/agent-003",
        ".swarm/worktrees/codex-swarm/run-001/agent-005"
      ]
    })).toEqual([
      {
        sessionId: "session-active",
        action: "resume",
        reason: "resume_session"
      },
      {
        sessionId: "session-pending",
        action: "retry",
        reason: "retry_pending_session"
      },
      {
        sessionId: "session-stale",
        action: "mark_stale",
        reason: "heartbeat_timeout"
      },
      {
        sessionId: "session-missing-worktree",
        action: "mark_stale",
        reason: "missing_worktree"
      },
      {
        sessionId: "session-failed",
        action: "archive",
        reason: "terminal_state"
      }
    ]);
  });
});
