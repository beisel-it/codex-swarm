import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  buildCodexServerCommand,
  buildPlanMarkdown,
  buildCodexSessionReplyRequest,
  buildCodexSessionStartRequest,
  buildSessionRecoveryPlan,
  CodexSessionRuntime,
  CodexServerSupervisor,
  materializeRepositoryWorkspace,
  materializePlanArtifact,
  createWorktreePath
} from "../src/runtime.js";
import { SessionRegistry } from "../src/session-registry.js";

function git(args: string[], cwd: string) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe"
  });
}

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

  it("renders and writes a durable .swarm/plan.md artifact", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "codex-swarm-plan-"));

    try {
      const artifact = await materializePlanArtifact({
        cwd,
        plan: {
          goal: "Ship the first hello-world slice",
          summary: "Create a minimal plan artifact for review",
          tasks: [
            {
              title: "Define the control-plane API",
              role: "backend-developer",
              description: "Document and expose the first run endpoints",
              acceptanceCriteria: ["run creation is routable", "contracts are typed"]
            },
            {
              title: "Render the board shell",
              role: "frontend-developer"
            }
          ]
        }
      });

      expect(artifact.relativePath).toBe(".swarm/plan.md");
      expect(artifact.path).toBe(join(cwd, ".swarm/plan.md"));
      expect(artifact.markdown).toContain("# Swarm Plan");
      expect(artifact.markdown).toContain("1. Define the control-plane API");

      const persisted = await readFile(artifact.path, "utf8");
      expect(persisted).toBe(artifact.markdown);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("materializes a worker repository by cloning the configured branch", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-repo-source-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-swarm-repo-clone-"));
    const clonePath = join(workspaceRoot, "worker-001");

    try {
      git(["init", "--initial-branch=main"], repoRoot);
      git(["config", "user.name", "Codex Swarm"], repoRoot);
      git(["config", "user.email", "codex-swarm@example.com"], repoRoot);
      await writeFile(join(repoRoot, "README.md"), "hello from clone\n", "utf8");
      git(["add", "README.md"], repoRoot);
      git(["commit", "-m", "initial"], repoRoot);

      const workspace = await materializeRepositoryWorkspace({
        repository: {
          name: "codex-swarm",
          url: repoRoot,
          defaultBranch: "main",
          localPath: null
        },
        destinationPath: clonePath
      });

      expect(workspace).toMatchObject({
        path: clonePath,
        mode: "git_clone",
        branch: "main",
        sourcePath: null
      });
      expect(await readFile(join(clonePath, "README.md"), "utf8")).toBe("hello from clone\n");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("materializes a worker repository by mounting a trusted local path", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "codex-swarm-repo-mount-source-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-swarm-repo-mount-"));
    const mountPath = join(workspaceRoot, "worker-001");

    try {
      await writeFile(join(sourceRoot, "README.md"), "hello from mount\n", "utf8");

      const workspace = await materializeRepositoryWorkspace({
        repository: {
          name: "codex-swarm",
          url: "file:///tmp/codex-swarm",
          defaultBranch: "main",
          localPath: sourceRoot
        },
        destinationPath: mountPath
      });

      expect(workspace).toMatchObject({
        path: mountPath,
        mode: "local_path_mount",
        branch: null,
        sourcePath: sourceRoot
      });
      expect(await readFile(join(mountPath, "README.md"), "utf8")).toBe("hello from mount\n");
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("starts and stops a supervised codex server process", async () => {
    const stdout: string[] = [];
    let resolveReady: (() => void) | null = null;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const supervisor = new CodexServerSupervisor({
      config: {
        cwd: process.cwd(),
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request"
      },
      command: [
        process.execPath,
        "--input-type=module",
        "-e",
        "console.log('codex-mcp-server-ready'); setInterval(() => {}, 1000);"
      ],
      onStdout: (chunk) => {
        stdout.push(chunk);

        if (chunk.includes("codex-mcp-server-ready")) {
          resolveReady?.();
        }
      }
    });

    const started = await supervisor.start();
    expect(started.status).toBe("running");
    expect(started.pid).toBeTypeOf("number");
    expect(supervisor.isRunning()).toBe(true);

    await ready;
    const stopped = await supervisor.stop();
    expect(stopped.status).toBe("stopped");
    expect(stopped.signal).toBe("SIGTERM");
    expect(stdout.join("")).toContain("codex-mcp-server-ready");
  });

  it("marks the supervisor failed when the codex server exits non-zero", async () => {
    const supervisor = new CodexServerSupervisor({
      config: {
        cwd: process.cwd(),
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request"
      },
      command: [
        process.execPath,
        "--input-type=module",
        "-e",
        "process.exit(7);"
      ]
    });

    await supervisor.start();
    const stopped = await supervisor.waitForExit();

    expect(stopped.status).toBe("failed");
    expect(stopped.exitCode).toBe(7);
    expect(stopped.failureReason).toBe("codex_mcp_server_exit_7");
  });

  it("executes codex start and reply flows with persisted thread reuse", async () => {
    const registry = new SessionRegistry();
    registry.seed({
      sessionId: "session-001",
      runId: "run-001",
      agentId: "agent-001",
      worktreePath: createWorktreePath({
        rootDir: ".swarm/worktrees",
        repositorySlug: "codex-swarm",
        runId: "run-001",
        agentId: "agent-001"
      })
    });

    const requests: Array<{ tool: string; threadId?: string }> = [];
    const supervisor = new CodexServerSupervisor({
      config: {
        cwd: process.cwd(),
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        includePlanTool: true
      },
      command: [
        process.execPath,
        "--input-type=module",
        "-e",
        "setInterval(() => {}, 1000);"
      ]
    });
    const runtime = new CodexSessionRuntime({
      registry,
      supervisor,
      executeTool: async (request) => {
        requests.push(request.tool === "codex-reply"
          ? {
              tool: request.tool,
              threadId: request.input.threadId
            }
          : {
              tool: request.tool
            });

        return {
          threadId: "thread-001",
          output: request.tool === "codex" ? "started" : "continued"
        };
      },
      now: () => new Date("2026-03-29T00:00:00.000Z")
    });

    const started = await runtime.startSession("session-001", "Start the worker");
    expect(started.request.tool).toBe("codex");
    expect(started.session.threadId).toBe("thread-001");
    expect(started.supervisor.status).toBe("running");

    const continued = await runtime.continueSession("session-001", "Continue the worker");
    expect(continued.request.tool).toBe("codex-reply");
    expect(continued.session.threadId).toBe("thread-001");
    expect(continued.session.lastHeartbeatAt?.toISOString()).toBe("2026-03-29T00:00:00.000Z");

    const stopped = await runtime.stopSession("session-001");
    expect(stopped.session.state).toBe("stopped");
    expect(stopped.supervisor.status).toBe("stopped");

    expect(requests).toEqual([
      {
        tool: "codex"
      },
      {
        tool: "codex-reply",
        threadId: "thread-001"
      }
    ]);
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

  it("marks active sessions without thread ids as stale instead of retrying them", () => {
    expect(buildSessionRecoveryPlan([
      {
        sessionId: "session-active-missing-thread",
        runId: "run-001",
        agentId: "agent-006",
        worktreePath: ".swarm/worktrees/codex-swarm/run-001/agent-006",
        state: "active",
        threadId: null,
        lastHeartbeatAt: null
      }
    ], {
      existingWorktreePaths: [
        ".swarm/worktrees/codex-swarm/run-001/agent-006"
      ]
    })).toEqual([
      {
        sessionId: "session-active-missing-thread",
        action: "mark_stale",
        reason: "missing_thread"
      }
    ]);
  });

  it("produces stable action counts for large recovery batches", () => {
    const sessions = Array.from({ length: 240 }, (_, index) => {
      const worktreePath = `.swarm/worktrees/codex-swarm/run-001/agent-${index}`;

      if (index < 60) {
        return {
          sessionId: `resume-${index}`,
          runId: "run-001",
          agentId: `agent-${index}`,
          worktreePath,
          state: "active" as const,
          threadId: `thread-${index}`,
          lastHeartbeatAt: new Date("2026-03-28T12:14:00.000Z")
        };
      }

      if (index < 120) {
        return {
          sessionId: `retry-${index}`,
          runId: "run-001",
          agentId: `agent-${index}`,
          worktreePath,
          state: "pending" as const,
          threadId: null,
          lastHeartbeatAt: null
        };
      }

      if (index < 180) {
        return {
          sessionId: `stale-${index}`,
          runId: "run-001",
          agentId: `agent-${index}`,
          worktreePath,
          state: "active" as const,
          threadId: `thread-${index}`,
          lastHeartbeatAt: new Date("2026-03-28T11:00:00.000Z")
        };
      }

      return {
        sessionId: `archive-${index}`,
        runId: "run-001",
        agentId: `agent-${index}`,
        worktreePath,
        state: "failed" as const,
        threadId: `thread-${index}`,
        lastHeartbeatAt: new Date("2026-03-28T12:14:00.000Z")
      };
    });

    const plan = buildSessionRecoveryPlan(sessions, {
      now: new Date("2026-03-28T12:15:00.000Z"),
      staleAfterMs: 10 * 60 * 1000,
      existingWorktreePaths: sessions.map((session) => session.worktreePath)
    });

    expect(plan).toHaveLength(240);
    expect(plan.filter((item) => item.action === "resume")).toHaveLength(60);
    expect(plan.filter((item) => item.action === "retry")).toHaveLength(60);
    expect(plan.filter((item) => item.action === "mark_stale")).toHaveLength(60);
    expect(plan.filter((item) => item.action === "archive")).toHaveLength(60);
  });
});
