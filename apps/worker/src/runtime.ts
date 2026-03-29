import { once } from "node:events";
import { lstat, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

import type { CodexMcpTransport } from "@codex-swarm/contracts";

import { SessionRegistry, type WorkerSessionRecord } from "./session-registry.js";

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
  transport?: CodexMcpTransport;
}

export interface CodexSessionStartInput {
  prompt: string;
  config: CodexServerConfig;
}

export interface CodexSessionReplyInput {
  threadId: string;
  prompt: string;
  config?: CodexServerConfig;
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

export interface CodexToolExecutionResult {
  threadId: string;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface CodexStreamableHttpToolRequest {
  transport: "streamable_http";
  endpoint: string;
  headers: Record<string, string>;
  message: {
    jsonrpc: "2.0";
    id: string;
    method: "codex/session/start" | "codex/session/reply";
    params: Record<string, unknown>;
  };
}

export interface StreamableHttpExecutorOptions {
  fetchImpl?: typeof fetch;
}

export interface LocalCodexCliExecutorOptions {
  spawnImpl?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions
  ) => ChildProcess;
  command?: string | string[];
  env?: NodeJS.ProcessEnv;
}

export interface PlanTaskDocument {
  title: string;
  role: string;
  description?: string;
  acceptanceCriteria?: string[];
}

export interface PlanDocumentInput {
  goal: string;
  summary?: string;
  tasks: PlanTaskDocument[];
}

export type CodexToolRequest =
  | ReturnType<typeof buildCodexSessionStartRequest>
  | ReturnType<typeof buildCodexSessionReplyRequest>;

export type CodexToolExecutor = (request: CodexToolRequest) => Promise<CodexToolExecutionResult>;

export interface CodexSessionRuntimeOptions {
  registry: SessionRegistry;
  supervisor?: CodexServerSupervisor;
  config?: CodexServerConfig;
  executeTool: CodexToolExecutor;
  now?: () => Date;
}

export interface CodexSessionExecutionResult {
  request: CodexToolRequest;
  response: CodexToolExecutionResult;
  session: WorkerSessionRecord;
  supervisor: CodexServerSupervisorState;
}

export interface PlanMaterializationInput {
  cwd: string;
  plan: PlanDocumentInput;
  relativePath?: string;
}

export interface RepositoryMaterializationInput {
  repository: {
    name: string;
    url: string;
    defaultBranch: string;
    localPath?: string | null;
  };
  destinationPath: string;
  branch?: string;
  cloneDepth?: number;
  spawnImpl?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions
  ) => ChildProcess;
}

export interface MaterializedRepositoryWorkspace {
  path: string;
  mode: "git_clone" | "local_path_mount";
  branch: string | null;
  repositoryUrl: string;
  sourcePath: string | null;
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

export interface WorktreeCleanupResult {
  path: string;
  deleted: boolean;
  reason: string | null;
}

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getCodexTransport(config: CodexServerConfig): CodexMcpTransport {
  return config.transport ?? { kind: "stdio" };
}

async function ensureDestinationMissing(destinationPath: string) {
  try {
    await lstat(destinationPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  throw new Error(`repository destination already exists: ${destinationPath}`);
}

async function runCommand(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
  spawnImpl: (
    command: string,
    args: readonly string[],
    options: SpawnOptions
  ) => ChildProcess = spawn
) {
  const child = spawnImpl(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string | Buffer) => {
    stderr += String(chunk);
  });

  const [code, signal] = await once(child, "exit") as [number | null, NodeJS.Signals | null];

  if (code !== 0) {
    const renderedCommand = [command, ...args].join(" ");
    const suffix = stderr.trim().length > 0 ? `: ${stderr.trim()}` : "";
    throw new Error(`${renderedCommand} failed with code ${code ?? "null"}${signal ? ` signal ${signal}` : ""}${suffix}`);
  }
}

export function buildPlanMarkdown(input: PlanDocumentInput) {
  const lines = [
    "# Swarm Plan",
    "",
    "## Goal",
    input.goal
  ];

  if (input.summary) {
    lines.push("", "## Summary", input.summary);
  }

  lines.push("", "## Tasks");

  input.tasks.forEach((task, index) => {
    lines.push("", `${index + 1}. ${task.title}`, `   Role: ${task.role}`);

    if (task.description) {
      lines.push(`   Description: ${task.description}`);
    }

    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
      lines.push("   Acceptance Criteria:");

      for (const criterion of task.acceptanceCriteria) {
        lines.push(`   - ${criterion}`);
      }
    }
  });

  lines.push("");
  return lines.join("\n");
}

export async function materializePlanArtifact(input: PlanMaterializationInput) {
  const relativePath = input.relativePath ?? ".swarm/plan.md";
  const outputPath = join(input.cwd, relativePath);
  const markdown = buildPlanMarkdown(input.plan);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");

  return {
    path: outputPath,
    relativePath,
    markdown
  };
}

export async function materializeRepositoryWorkspace(input: RepositoryMaterializationInput): Promise<MaterializedRepositoryWorkspace> {
  await mkdir(dirname(input.destinationPath), { recursive: true });
  await ensureDestinationMissing(input.destinationPath);

  const sourcePath = input.repository.localPath ? resolve(input.repository.localPath) : null;

  if (sourcePath) {
    const sourceStats = await lstat(sourcePath);

    if (!sourceStats.isDirectory() && !sourceStats.isSymbolicLink()) {
      throw new Error(`repository local path must point to a directory-like target: ${sourcePath}`);
    }

    await symlink(sourcePath, input.destinationPath, "dir");

    const linkedPath = await readlink(input.destinationPath);

    if (resolve(dirname(input.destinationPath), linkedPath) !== sourcePath) {
      throw new Error(`repository local-path mount target mismatch for ${input.destinationPath}`);
    }

    return {
      path: input.destinationPath,
      mode: "local_path_mount",
      branch: null,
      repositoryUrl: input.repository.url,
      sourcePath
    };
  }

  const branch = input.branch ?? input.repository.defaultBranch;
  const cloneDepth = input.cloneDepth ?? 1;
  await runCommand(
    "git",
    [
      "clone",
      "--branch",
      branch,
      "--single-branch",
      "--depth",
      String(cloneDepth),
      input.repository.url,
      input.destinationPath
    ],
    {
      cwd: dirname(input.destinationPath)
    },
    input.spawnImpl
  );

  return {
    path: input.destinationPath,
    mode: "git_clone",
    branch,
    repositoryUrl: input.repository.url,
    sourcePath: null
  };
}

export async function cleanupWorktreePaths(paths: string[]): Promise<WorktreeCleanupResult[]> {
  const seen = new Set<string>();
  const results: WorktreeCleanupResult[] = [];

  for (const path of paths) {
    if (seen.has(path)) {
      continue;
    }

    seen.add(path);

    if (path.startsWith("untracked/")) {
      results.push({
        path,
        deleted: false,
        reason: "placeholder_path"
      });
      continue;
    }

    const resolvedPath = resolve(path);

    if (resolvedPath === "/") {
      results.push({
        path,
        deleted: false,
        reason: "unsafe_root_path"
      });
      continue;
    }

    try {
      await rm(path, { recursive: true, force: true });
      results.push({
        path,
        deleted: true,
        reason: null
      });
    } catch (error) {
      results.push({
        path,
        deleted: false,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
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
  const transport = getCodexTransport(config);

  if (transport.kind === "streamable_http") {
    return [
      "streamable_http",
      transport.url
    ];
  }

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

  getConfig() {
    return {
      ...this.options.config
    };
  }

  isRunning() {
    return this.state.status === "running";
  }

  async start() {
    if (this.process && this.state.status === "running") {
      return this.snapshot();
    }

    if (getCodexTransport(this.options.config).kind === "streamable_http") {
      this.process = null;
      this.state = {
        ...createIdleSupervisorState(buildCodexServerCommand(this.options.config)),
        status: "running",
        startedAt: new Date()
      };

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
    if (getCodexTransport(this.options.config).kind === "streamable_http") {
      this.state = {
        ...this.state,
        status: "stopped",
        stoppedAt: new Date(),
        signal,
        pid: null
      };

      return this.snapshot();
    }

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

export class CodexSessionRuntime {
  private readonly now: () => Date;
  private readonly supervisor: CodexServerSupervisor;

  constructor(private readonly options: CodexSessionRuntimeOptions) {
    this.now = options.now ?? (() => new Date());
    this.supervisor = options.supervisor ?? new CodexServerSupervisor({
      config: options.config ?? {
        cwd: process.cwd(),
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request"
      }
    });
  }

  async startSession(sessionId: string, prompt: string): Promise<CodexSessionExecutionResult> {
    const session = this.options.registry.get(sessionId);
    await this.supervisor.start();

    const request = buildCodexSessionStartRequest({
      prompt,
      config: this.supervisor.getConfig()
    });
    const response = await this.options.executeTool(request);
    const activated = this.options.registry.activate(session.sessionId, response.threadId);

    return {
      request,
      response,
      session: activated,
      supervisor: this.supervisor.snapshot()
    };
  }

  async continueSession(sessionId: string, prompt: string): Promise<CodexSessionExecutionResult> {
    const session = this.options.registry.get(sessionId);

    if (!session.threadId) {
      throw new Error(`session ${sessionId} has no persisted threadId`);
    }

    await this.supervisor.start();

    const request = buildCodexSessionReplyRequest({
      threadId: session.threadId,
      prompt,
      config: this.supervisor.getConfig()
    });
    const response = await this.options.executeTool(request);

    if (response.threadId !== session.threadId) {
      throw new Error(`session ${sessionId} reply returned mismatched threadId ${response.threadId}`);
    }

    const updated = this.options.registry.heartbeat(sessionId, this.now());

    return {
      request,
      response,
      session: updated,
      supervisor: this.supervisor.snapshot()
    };
  }

  async stopSession(sessionId: string) {
    const session = this.options.registry.get(sessionId);
    await this.supervisor.stop();

    return {
      session: this.options.registry.stop(session.sessionId),
      supervisor: this.supervisor.snapshot()
    };
  }
}

export function buildCodexSessionStartRequest(input: CodexSessionStartInput) {
  const transport = getCodexTransport(input.config);

  if (transport.kind === "streamable_http") {
    return {
      transport: "streamable_http",
      endpoint: transport.url,
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": transport.protocolVersion,
        ...transport.headers
      },
      message: {
        jsonrpc: "2.0",
        id: "codex-session-start",
        method: "codex/session/start",
        params: {
          prompt: input.prompt,
          cwd: input.config.cwd,
          profile: input.config.profile,
          sandbox: input.config.sandbox,
          approvalPolicy: input.config.approvalPolicy,
          includePlanTool: input.config.includePlanTool ?? false
        }
      }
    } as const;
  }

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
  const transport = input.config ? getCodexTransport(input.config) : null;

  if (transport?.kind === "streamable_http") {

    return {
      transport: "streamable_http",
      endpoint: transport.url,
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": transport.protocolVersion,
        ...transport.headers
      },
      message: {
        jsonrpc: "2.0",
        id: "codex-session-reply",
        method: "codex/session/reply",
        params: {
          threadId: input.threadId,
          prompt: input.prompt
        }
      }
    } as const;
  }

  return {
    tool: "codex-reply",
    input: {
      threadId: input.threadId,
      prompt: input.prompt,
      cwd: input.config?.cwd
    }
  } as const;
}

async function parseStreamableHttpBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    const body = await response.text();
    const events = body
      .split(/\r?\n\r?\n/)
      .map((chunk) => chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .join(""))
      .filter((chunk) => chunk.length > 0);

    if (events.length === 0) {
      throw new Error("streamable HTTP response did not include any data events");
    }

    return JSON.parse(events.at(-1) ?? "");
  }

  return response.json();
}

async function collectProcessResult(child: ChildProcess) {
  let stdout = "";
  let stderr = "";

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string | Buffer) => {
    stdout += String(chunk);
  });

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string | Buffer) => {
    stderr += String(chunk);
  });

  const [code, signal] = await once(child, "exit") as [number | null, NodeJS.Signals | null];

  return {
    code,
    signal,
    stdout,
    stderr
  };
}

function parseCodexExecJsonl(stdout: string) {
  let threadId: string | null = null;
  let output: string | null = null;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    let payload: unknown;

    try {
      payload = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!payload || typeof payload !== "object") {
      continue;
    }

    if ((payload as { type?: unknown }).type === "thread.started" && typeof (payload as { thread_id?: unknown }).thread_id === "string") {
      threadId = (payload as { thread_id: string }).thread_id;
      continue;
    }

    if (
      (payload as { type?: unknown }).type === "item.completed"
      && (payload as { item?: { type?: unknown; text?: unknown } }).item?.type === "agent_message"
      && typeof (payload as { item: { text: string } }).item.text === "string"
    ) {
      output = (payload as { item: { text: string } }).item.text;
    }
  }

  if (!threadId || !output) {
    throw new Error("codex exec output did not contain thread.started and final agent_message events");
  }

  return {
    threadId,
    output
  };
}

function normalizeCodexToolExecutionResult(payload: unknown, response: Response): CodexToolExecutionResult {
  const normalized = payload && typeof payload === "object" && "result" in payload
    ? (payload as { result: unknown }).result
    : payload;

  if (
    !normalized
    || typeof normalized !== "object"
    || typeof (normalized as { threadId?: unknown }).threadId !== "string"
    || typeof (normalized as { output?: unknown }).output !== "string"
  ) {
    throw new Error("streamable HTTP response did not contain a valid Codex tool result");
  }

  const sessionId = response.headers.get("MCP-Session-Id");

  return {
    threadId: (normalized as { threadId: string }).threadId,
    output: (normalized as { output: string }).output,
    metadata: {
      ...(((normalized as { metadata?: Record<string, unknown> }).metadata) ?? {}),
      ...(sessionId ? { mcpSessionId: sessionId } : {})
    }
  };
}

export function createStreamableHttpToolExecutor(options: StreamableHttpExecutorOptions = {}): CodexToolExecutor {
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (request) => {
    if (!("transport" in request) || request.transport !== "streamable_http") {
      throw new Error("streamable HTTP executor requires a streamable_http request");
    }

    const response = await fetchImpl(request.endpoint, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.message)
    });

    if (!response.ok) {
      throw new Error(`streamable HTTP Codex request failed with status ${response.status}`);
    }

    return normalizeCodexToolExecutionResult(await parseStreamableHttpBody(response), response);
  };
}

export function createLocalCodexCliExecutor(options: LocalCodexCliExecutorOptions = {}): CodexToolExecutor {
  const spawnImpl = options.spawnImpl ?? spawn;
  const configuredCommand = options.command ?? "codex";
  const command = Array.isArray(configuredCommand)
    ? configuredCommand
    : [configuredCommand];
  const [executable, ...baseArgs] = command;

  if (!executable) {
    throw new Error("local Codex CLI executor requires a command executable");
  }

  return async (request) => {
    if (!("tool" in request)) {
      throw new Error("local Codex CLI executor requires a stdio codex request");
    }

    const tool = request.tool;
    let args: string[] = [];
    let cwd = process.cwd();

    if (tool === "codex-reply") {
      const input = request.input;

      if (!input) {
        throw new Error("codex-reply request requires input");
      }

      args = [
        ...baseArgs,
        "exec",
        "resume",
        "--json",
        "--full-auto",
        input.threadId,
        input.prompt
      ];
      cwd = input.cwd ?? cwd;
    } else {
      const input = request.input;

      if (!input) {
        throw new Error("codex request requires input");
      }

      args = [
        ...baseArgs,
        "exec",
        "--json",
        "--full-auto",
        "-C",
        input.cwd,
        ...(input.profile && input.profile !== "default" ? ["-p", input.profile] : []),
        "-s",
        input.sandbox,
        input.prompt
      ];
      cwd = input.cwd;
    }

    const child = spawnImpl(executable, args, {
      cwd,
      env: {
        ...process.env,
        ...options.env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const result = await collectProcessResult(child);

    if (result.code !== 0) {
      const rendered = [executable, ...args].join(" ");
      const suffix = result.stderr.trim().length > 0 ? `: ${result.stderr.trim()}` : "";
      throw new Error(`${rendered} failed with code ${result.code ?? "null"}${result.signal ? ` signal ${result.signal}` : ""}${suffix}`);
    }

    return parseCodexExecJsonl(result.stdout);
  };
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
