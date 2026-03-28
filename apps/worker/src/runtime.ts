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
