import { once } from "node:events";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

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

export interface CodexServerSupervisorState {
  status: "idle" | "starting" | "running" | "stopped" | "failed";
  command: string[];
  pid: number | null;
  startedAt: Date | null;
  stoppedAt: Date | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  failureReason: string | null;
}

export interface CodexServerSupervisorOptions {
  config: CodexServerConfig;
  command?: string[];
  env?: NodeJS.ProcessEnv;
  spawnImpl?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions
  ) => ChildProcess;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
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

function createIdleSupervisorState(command: string[]): CodexServerSupervisorState {
  return {
    status: "idle",
    command,
    pid: null,
    startedAt: null,
    stoppedAt: null,
    exitCode: null,
    signal: null,
    failureReason: null
  };
}

export class CodexServerSupervisor {
  private readonly options: CodexServerSupervisorOptions;

  private readonly spawnImpl: (
    command: string,
    args: readonly string[],
    options: SpawnOptions
  ) => ChildProcess;

  private process: ChildProcess | null = null;

  private state: CodexServerSupervisorState;

  constructor(options: CodexServerSupervisorOptions) {
    this.options = options;
    this.spawnImpl = options.spawnImpl ?? spawn;
    this.state = createIdleSupervisorState(options.command ?? buildCodexServerCommand(options.config));
  }

  snapshot() {
    return {
      ...this.state,
      command: [...this.state.command]
    };
  }

  isRunning() {
    return this.state.status === "running";
  }

  async start() {
    if (this.process && this.state.status === "running") {
      return this.snapshot();
    }

    const command = this.options.command ?? buildCodexServerCommand(this.options.config);
    const [executable, ...args] = command;

    if (!executable) {
      throw new Error("codex server command must include an executable");
    }

    this.state = {
      ...createIdleSupervisorState(command),
      status: "starting"
    };

    const child = this.spawnImpl(executable, args, {
      cwd: this.options.config.cwd,
      env: {
        ...process.env,
        ...this.options.env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.process = child;

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string | Buffer) => {
      this.options.onStdout?.(String(chunk));
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string | Buffer) => {
      this.options.onStderr?.(String(chunk));
    });

    child.once("spawn", () => {
      this.state = {
        ...this.state,
        status: "running",
        pid: child.pid ?? null,
        startedAt: new Date()
      };
    });

    child.once("error", (error) => {
      this.process = null;
      this.state = {
        ...this.state,
        status: "failed",
        pid: child.pid ?? null,
        stoppedAt: new Date(),
        failureReason: error.message
      };
    });

    child.once("exit", (code, signal) => {
      const failureReason = code && code !== 0
        ? `codex_mcp_server_exit_${code}`
        : null;

      this.process = null;
      this.state = {
        ...this.state,
        status: failureReason ? "failed" : "stopped",
        pid: child.pid ?? this.state.pid,
        stoppedAt: new Date(),
        exitCode: code,
        signal,
        failureReason
      };
    });

    try {
      await Promise.race([
        once(child, "spawn"),
        once(child, "error").then(([error]) => {
          throw error;
        })
      ]);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(String(error));
    }

    return this.snapshot();
  }

  async stop(signal: NodeJS.Signals = "SIGTERM") {
    const child = this.process;

    if (!child || child.exitCode !== null || this.state.status === "stopped" || this.state.status === "failed") {
      return this.snapshot();
    }

    child.kill(signal);
    await once(child, "exit");
    return this.snapshot();
  }

  async waitForExit() {
    const child = this.process;

    if (!child || child.exitCode !== null || this.state.status === "stopped" || this.state.status === "failed") {
      return this.snapshot();
    }

    await once(child, "exit");
    return this.snapshot();
  }
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
