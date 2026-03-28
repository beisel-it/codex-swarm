export interface WorktreePathInput {
  rootDir: string;
  repositorySlug: string;
  runId: string;
  agentId: string;
  taskId?: string;
}

export interface CodexServerConfig {
  cwd: string;
  profile: string;
  sandbox: string;
  approvalPolicy: string;
  includePlanTool?: boolean;
}

export interface CodexSessionStartInput {
  prompt: string;
  config: CodexServerConfig;
}

export interface CodexSessionReplyInput {
  threadId: string;
  prompt: string;
}

export interface WorkerSessionRecoveryCandidate {
  sessionId: string;
  runId: string;
  agentId: string;
  worktreePath: string;
  state: "pending" | "active" | "stopped" | "failed" | "stale" | "archived";
  threadId: string | null;
  lastHeartbeatAt: Date | null;
}

export interface WorkerRecoverySnapshot {
  now?: Date;
  staleAfterMs?: number;
  existingWorktreePaths: string[];
}

export interface WorkerSessionRecoveryAction {
  sessionId: string;
  action: "resume" | "retry" | "mark_stale" | "archive";
  reason: "resume_session" | "retry_pending_session" | "missing_thread" | "missing_worktree" | "heartbeat_timeout" | "terminal_state";
}

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createWorktreePath(input: WorktreePathInput) {
  const segments = [
    input.rootDir,
    sanitizePathSegment(input.repositorySlug),
    sanitizePathSegment(input.runId),
    sanitizePathSegment(input.agentId)
  ];

  if (input.taskId) {
    segments.push(sanitizePathSegment(input.taskId));
  }

  return segments.join("/");
}

export function buildCodexServerCommand(config: CodexServerConfig) {
  const command = [
    "codex",
    "mcp-server",
    "--cwd",
    config.cwd,
    "--profile",
    config.profile,
    "--sandbox",
    config.sandbox,
    "--approval-policy",
    config.approvalPolicy
  ];

  if (config.includePlanTool) {
    command.push("--include-plan-tool");
  }

  return command;
}

export function buildCodexSessionStartRequest(input: CodexSessionStartInput) {
  return {
    tool: "codex",
    input: {
      prompt: input.prompt,
      cwd: input.config.cwd,
      profile: input.config.profile,
      sandbox: input.config.sandbox,
      approvalPolicy: input.config.approvalPolicy,
      includePlanTool: input.config.includePlanTool ?? false
    }
  } as const;
}

export function buildCodexSessionReplyRequest(input: CodexSessionReplyInput) {
  return {
    tool: "codex-reply",
    input: {
      threadId: input.threadId,
      prompt: input.prompt
    }
  } as const;
}

export function buildSessionRecoveryPlan(
  sessions: WorkerSessionRecoveryCandidate[],
  snapshot: WorkerRecoverySnapshot
) {
  const now = snapshot.now ?? new Date();
  const staleAfterMs = snapshot.staleAfterMs ?? 15 * 60 * 1000;
  const existingWorktrees = new Set(snapshot.existingWorktreePaths);

  return sessions.map((session): WorkerSessionRecoveryAction => {
    if (session.state === "stopped" || session.state === "failed" || session.state === "archived") {
      return {
        sessionId: session.sessionId,
        action: "archive",
        reason: "terminal_state"
      };
    }

    if (!existingWorktrees.has(session.worktreePath)) {
      return {
        sessionId: session.sessionId,
        action: "mark_stale",
        reason: "missing_worktree"
      };
    }

    if (!session.threadId) {
      return {
        sessionId: session.sessionId,
        action: session.state === "pending" ? "retry" : "mark_stale",
        reason: session.state === "pending" ? "retry_pending_session" : "missing_thread"
      };
    }

    if (session.lastHeartbeatAt && now.getTime() - session.lastHeartbeatAt.getTime() > staleAfterMs) {
      return {
        sessionId: session.sessionId,
        action: "mark_stale",
        reason: "heartbeat_timeout"
      };
    }

    return {
      sessionId: session.sessionId,
      action: "resume",
      reason: "resume_session"
    };
  });
}
