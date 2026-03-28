import { describe, expect, it } from "vitest";

import { agents, sessions } from "../src/db/schema.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

type CleanupRow = {
  sessionId: string;
  runId: string;
  agentId: string;
  worktreePath: string | null;
  state: "pending" | "active" | "stopped" | "failed" | "stale" | "archived";
  threadId: string | null;
  lastHeartbeatAt: Date | null;
};

function extractTargetId(condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) {
  const chunk = condition.queryChunks[3] as { value?: string };

  if (!chunk || typeof chunk.value !== "string") {
    throw new Error("unable to extract update target");
  }

  return chunk.value;
}

class FakeCleanupDb {
  readonly sessionStore = new Map<string, {
    id: string;
    agentId: string;
    state: string;
    staleReason: string | null;
    updatedAt: Date;
  }>();

  readonly agentStore = new Map<string, {
    id: string;
    runId: string;
    status: string;
    updatedAt: Date;
  }>();

  constructor(private readonly rows: CleanupRow[]) {
    for (const row of rows) {
      this.sessionStore.set(row.sessionId, {
        id: row.sessionId,
        agentId: row.agentId,
        state: row.state,
        staleReason: null,
        updatedAt: new Date("2026-03-28T11:00:00.000Z")
      });
      this.agentStore.set(row.agentId, {
        id: row.agentId,
        runId: row.runId,
        status: row.state === "failed" ? "failed" : "busy",
        updatedAt: new Date("2026-03-28T11:00:00.000Z")
      });
    }
  }

  select() {
    return {
      from: () => ({
        innerJoin: () => ({
          where: async () => this.rows,
          orderBy: async () => this.rows
        })
      })
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: async (condition: { queryChunks: Array<{ value?: string[] } | { value?: string }> }) => {
          const id = extractTargetId(condition);

          if (table === sessions) {
            const record = this.sessionStore.get(id);

            if (!record) {
              throw new Error(`unknown session ${id}`);
            }

            Object.assign(record, values);
            return [record];
          }

          if (table === agents) {
            const record = this.agentStore.get(id);

            if (!record) {
              throw new Error(`unknown agent ${id}`);
            }

            Object.assign(record, values);
            return [record];
          }

          throw new Error("unexpected table update");
        }
      })
    };
  }
}

describe("ControlPlaneService.runCleanupJob", () => {
  it("applies resume, retry, stale, and archive transitions to sessions and agents", async () => {
    const now = new Date("2026-03-28T12:30:00.000Z");
    const db = new FakeCleanupDb([
      {
        sessionId: "11111111-1111-4111-8111-111111111111",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        agentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-resume",
        state: "active",
        threadId: "thread-resume",
        lastHeartbeatAt: new Date("2026-03-28T12:25:00.000Z")
      },
      {
        sessionId: "22222222-2222-4222-8222-222222222222",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        agentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-retry",
        state: "pending",
        threadId: null,
        lastHeartbeatAt: null
      },
      {
        sessionId: "33333333-3333-4333-8333-333333333333",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        agentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-stale",
        state: "active",
        threadId: "thread-stale",
        lastHeartbeatAt: new Date("2026-03-28T11:45:00.000Z")
      },
      {
        sessionId: "44444444-4444-4444-8444-444444444444",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        agentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-archive",
        state: "failed",
        threadId: "thread-archive",
        lastHeartbeatAt: new Date("2026-03-28T12:20:00.000Z")
      }
    ]);

    const service = new ControlPlaneService(
      db as never,
      { now: () => now }
    );

    const report = await service.runCleanupJob({
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      staleAfterMinutes: 15,
      existingWorktreePaths: [
        ".swarm/worktrees/codex-swarm/run-001/agent-resume",
        ".swarm/worktrees/codex-swarm/run-001/agent-retry",
        ".swarm/worktrees/codex-swarm/run-001/agent-stale",
        ".swarm/worktrees/codex-swarm/run-001/agent-archive"
      ]
    });

    expect(report).toMatchObject({
      scannedSessions: 4,
      resumed: 1,
      retried: 1,
      markedStale: 1,
      archived: 1
    });
    expect(report.items).toEqual([
      expect.objectContaining({
        sessionId: "11111111-1111-4111-8111-111111111111",
        action: "resume",
        reason: "resume_session"
      }),
      expect.objectContaining({
        sessionId: "22222222-2222-4222-8222-222222222222",
        action: "retry",
        reason: "retry_pending_session"
      }),
      expect.objectContaining({
        sessionId: "33333333-3333-4333-8333-333333333333",
        action: "mark_stale",
        reason: "heartbeat_timeout"
      }),
      expect.objectContaining({
        sessionId: "44444444-4444-4444-8444-444444444444",
        action: "archive",
        reason: "terminal_state"
      })
    ]);

    expect(db.sessionStore.get("11111111-1111-4111-8111-111111111111")).toMatchObject({
      state: "active",
      staleReason: null,
      updatedAt: now
    });
    expect(db.sessionStore.get("22222222-2222-4222-8222-222222222222")).toMatchObject({
      state: "pending",
      staleReason: "retry_pending_session",
      updatedAt: now
    });
    expect(db.sessionStore.get("33333333-3333-4333-8333-333333333333")).toMatchObject({
      state: "stale",
      staleReason: "heartbeat_timeout",
      updatedAt: now
    });
    expect(db.sessionStore.get("44444444-4444-4444-8444-444444444444")).toMatchObject({
      state: "archived",
      staleReason: null,
      updatedAt: now
    });

    expect(db.agentStore.get("cccccccc-cccc-4ccc-8ccc-cccccccccccc")).toMatchObject({
      status: "idle",
      updatedAt: now
    });
    expect(db.agentStore.get("dddddddd-dddd-4ddd-8ddd-dddddddddddd")).toMatchObject({
      status: "failed",
      updatedAt: now
    });
    expect(db.agentStore.get("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")).toMatchObject({
      status: "stopped",
      updatedAt: now
    });
  });
});
