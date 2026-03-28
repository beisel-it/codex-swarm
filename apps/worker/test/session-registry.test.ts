import { describe, expect, it } from "vitest";

import { SessionRegistry } from "../src/session-registry.js";

describe("SessionRegistry", () => {
  it("seeds and activates a worker session", () => {
    const registry = new SessionRegistry();
    registry.seed({
      sessionId: "session-001",
      runId: "run-001",
      agentId: "agent-001",
      worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-001"
    });

    const record = registry.activate("session-001", "thread-001");

    expect(record.state).toBe("active");
    expect(record.threadId).toBe("thread-001");
    expect(registry.findByThreadId("thread-001")?.sessionId).toBe("session-001");
  });

  it("stops and fails sessions explicitly", () => {
    const registry = new SessionRegistry();
    registry.seed({
      sessionId: "session-002",
      runId: "run-001",
      agentId: "agent-002",
      worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-002"
    });

    expect(registry.stop("session-002").state).toBe("stopped");
    expect(registry.fail("session-002").state).toBe("failed");
  });

  it("rejects conflicting thread bindings", () => {
    const registry = new SessionRegistry();
    registry.seed({
      sessionId: "session-003",
      runId: "run-001",
      agentId: "agent-003",
      worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-003"
    });

    registry.activate("session-003", "thread-003");

    expect(() => registry.activate("session-003", "thread-other")).toThrow(
      "session session-003 is already bound to thread thread-003"
    );
  });
});
