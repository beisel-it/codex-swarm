export type WorkerSessionState = "pending" | "active" | "stopped" | "failed" | "stale" | "archived";

export interface WorkerSessionRecord {
  sessionId: string;
  runId: string;
  agentId: string;
  worktreePath: string;
  state: WorkerSessionState;
  threadId: string | null;
  staleReason: string | null;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionSeedInput {
  sessionId: string;
  runId: string;
  agentId: string;
  worktreePath: string;
}

export class SessionRegistry {
  private readonly sessions = new Map<string, WorkerSessionRecord>();

  seed(input: SessionSeedInput) {
    const record: WorkerSessionRecord = {
      sessionId: input.sessionId,
      runId: input.runId,
      agentId: input.agentId,
      worktreePath: input.worktreePath,
      state: "pending",
      threadId: null,
      staleReason: null,
      lastHeartbeatAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.sessions.set(record.sessionId, record);
    return record;
  }

  hydrate(records: WorkerSessionRecord[]) {
    for (const record of records) {
      this.sessions.set(record.sessionId, {
        ...record
      });
    }

    return this.list();
  }

  upsert(record: WorkerSessionRecord) {
    this.sessions.set(record.sessionId, record);
    return record;
  }

  activate(sessionId: string, threadId: string) {
    const record = this.get(sessionId);

    if (record.threadId && record.threadId !== threadId) {
      throw new Error(`session ${sessionId} is already bound to thread ${record.threadId}`);
    }

    record.threadId = threadId;
    record.state = "active";
    record.staleReason = null;
    record.lastHeartbeatAt = new Date();
    record.updatedAt = new Date();
    return record;
  }

  heartbeat(sessionId: string, at = new Date()) {
    const record = this.get(sessionId);
    record.lastHeartbeatAt = at;
    record.updatedAt = at;
    return record;
  }

  stop(sessionId: string) {
    const record = this.get(sessionId);
    record.state = "stopped";
    record.staleReason = null;
    record.updatedAt = new Date();
    return record;
  }

  fail(sessionId: string) {
    const record = this.get(sessionId);
    record.state = "failed";
    record.staleReason = null;
    record.updatedAt = new Date();
    return record;
  }

  markStale(sessionId: string, reason: string) {
    const record = this.get(sessionId);
    record.state = "stale";
    record.staleReason = reason;
    record.updatedAt = new Date();
    return record;
  }

  archive(sessionId: string) {
    const record = this.get(sessionId);
    record.state = "archived";
    record.staleReason = null;
    record.updatedAt = new Date();
    return record;
  }

  get(sessionId: string) {
    const record = this.sessions.get(sessionId);

    if (!record) {
      throw new Error(`unknown session ${sessionId}`);
    }

    return record;
  }

  findByThreadId(threadId: string) {
    return [...this.sessions.values()].find((record) => record.threadId === threadId) ?? null;
  }

  list() {
    return [...this.sessions.values()];
  }
}
