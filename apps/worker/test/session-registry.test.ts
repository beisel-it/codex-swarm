import { describe, expect, it } from "vitest";

import { SessionRegistry } from "../src/session-registry.js";

describe("SessionRegistry", () => {
  it("seeds and activates a worker session", () => {
    const registry = new SessionRegistry();
    registry.seed({
      sessionId: "session-001",
      runId: "run-001",
      agentId: "agent-001",
      worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-001",
    });

    const record = registry.activate("session-001", "thread-001");

    expect(record.state).toBe("active");
    expect(record.threadId).toBe("thread-001");
    expect(record.lastHeartbeatAt).toBeInstanceOf(Date);
    expect(registry.findByThreadId("thread-001")?.sessionId).toBe(
      "session-001",
    );
  });

  it("stops, fails, marks stale, and archives sessions explicitly", () => {
    const registry = new SessionRegistry();
    registry.seed({
      sessionId: "session-002",
      runId: "run-001",
      agentId: "agent-002",
      worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-002",
    });

    expect(registry.stop("session-002").state).toBe("stopped");
    expect(registry.fail("session-002").state).toBe("failed");
    expect(
      registry.markStale("session-002", "heartbeat_timeout").staleReason,
    ).toBe("heartbeat_timeout");
    expect(registry.archive("session-002").state).toBe("archived");
  });

  it("rejects conflicting thread bindings", () => {
    const registry = new SessionRegistry();
    registry.seed({
      sessionId: "session-003",
      runId: "run-001",
      agentId: "agent-003",
      worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-003",
    });

    registry.activate("session-003", "thread-003");

    expect(() => registry.activate("session-003", "thread-other")).toThrow(
      "session session-003 is already bound to thread thread-003",
    );
  });

  it("hydrates persisted sessions and updates heartbeats", () => {
    const registry = new SessionRegistry();
    const heartbeatAt = new Date("2026-03-28T12:00:00.000Z");

    registry.hydrate([
      {
        sessionId: "session-004",
        runId: "run-001",
        agentId: "agent-004",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-004",
        state: "active",
        threadId: "thread-004",
        staleReason: null,
        lastHeartbeatAt: heartbeatAt,
        createdAt: new Date("2026-03-28T11:00:00.000Z"),
        updatedAt: new Date("2026-03-28T11:30:00.000Z"),
      },
    ]);

    const updated = registry.heartbeat(
      "session-004",
      new Date("2026-03-28T12:05:00.000Z"),
    );

    expect(registry.get("session-004").threadId).toBe("thread-004");
    expect(updated.lastHeartbeatAt?.toISOString()).toBe(
      "2026-03-28T12:05:00.000Z",
    );
  });

  it("supports bulk session lifecycle updates without losing lookups", () => {
    const registry = new SessionRegistry();

    for (let index = 0; index < 200; index += 1) {
      const sessionId = `session-${index}`;
      registry.seed({
        sessionId,
        runId: "run-load",
        agentId: `agent-${index}`,
        worktreePath: `.swarm/worktrees/codex-swarm/run-load/agent-${index}`,
      });

      registry.activate(sessionId, `thread-${index}`);
    }

    for (let index = 0; index < 50; index += 1) {
      registry.markStale(`session-${index}`, "heartbeat_timeout");
    }

    for (let index = 50; index < 100; index += 1) {
      registry.fail(`session-${index}`);
      registry.archive(`session-${index}`);
    }

    for (let index = 100; index < 200; index += 1) {
      registry.heartbeat(
        `session-${index}`,
        new Date("2026-03-28T12:30:00.000Z"),
      );
    }

    expect(registry.list()).toHaveLength(200);
    expect(registry.findByThreadId("thread-120")?.sessionId).toBe(
      "session-120",
    );
    expect(
      registry.list().filter((record) => record.state === "stale"),
    ).toHaveLength(50);
    expect(
      registry.list().filter((record) => record.state === "archived"),
    ).toHaveLength(50);
    expect(
      registry
        .list()
        .filter((record) => record.state === "active")
        .every(
          (record) =>
            record.lastHeartbeatAt?.toISOString() ===
            "2026-03-28T12:30:00.000Z",
        ),
    ).toBe(true);
  });
});
