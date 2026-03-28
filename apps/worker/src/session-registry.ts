export type WorkerSessionState = "pending" | "active" | "stopped" | "failed";

export interface WorkerSessionRecord {
  sessionId: string;
  runId: string;
  agentId: string;
  worktreePath: string;
  state: WorkerSessionState;
  threadId: string | null;
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
    const now = new Date();
    const record: WorkerSessionRecord = {
      sessionId: input.sessionId,
      runId: input.runId,
      agentId: input.agentId,
      worktreePath: input.worktreePath,
      state: "pending",
      threadId: null,
      createdAt: now,
      updatedAt: now
    };

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
    record.updatedAt = new Date();
    return record;
  }

  stop(sessionId: string) {
    const record = this.get(sessionId);
    record.state = "stopped";
    record.updatedAt = new Date();
    return record;
  }

  fail(sessionId: string) {
    const record = this.get(sessionId);
    record.state = "failed";
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
