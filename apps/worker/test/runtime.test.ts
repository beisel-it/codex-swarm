import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import type {
  Repository,
  RunDetail,
  WorkerDispatchAssignment,
  WorkerNodeRuntime
} from "@codex-swarm/contracts";

import {
  buildCodexServerCommand,
  buildPlanMarkdown,
  buildCodexSessionReplyRequest,
  buildCodexSessionStartRequest,
  buildSessionRecoveryPlan,
  cleanupWorktreePaths,
  CodexSessionRuntime,
  CodexServerSupervisor,
  createLocalCodexCliExecutor,
  createStreamableHttpToolExecutor,
  materializeRepositoryWorkspace,
  materializePlanArtifact,
  createWorktreePath
} from "../src/runtime.js";
import { claimAndProvisionDispatchWorkspace } from "../src/control-plane.js";
import { SessionRegistry } from "../src/session-registry.js";

function git(args: string[], cwd: string) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe"
  });
}

function createRuntime(workspaceRoot: string): WorkerNodeRuntime {
  return {
    nodeId: "node-a",
    nodeName: "node-a",
    state: "active",
    workspaceRoot,
    codexCommand: ["codex"],
    codexTransport: {
      kind: "stdio"
    },
    controlPlaneUrl: "http://127.0.0.1",
    artifactBaseUrl: "http://127.0.0.1/artifacts",
    postgresUrl: "postgres://worker:test@localhost:5432/codex",
    redisUrl: "redis://localhost:6379/0",
    queueKeyPrefix: "codex-swarm",
    capabilities: ["node"],
    credentialEnvNames: [],
    heartbeatIntervalSeconds: 30
  };
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

  it("builds a streamable HTTP codex transport descriptor", () => {
    expect(buildCodexServerCommand({
      cwd: "/tmp/run-001/backend-dev",
      profile: "default",
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      transport: {
        kind: "streamable_http",
        url: "https://codex-mcp.internal/mcp",
        headers: {
          authorization: "Bearer shared-token"
        },
        protocolVersion: "2025-11-25"
      }
    })).toEqual([
      "streamable_http",
      "https://codex-mcp.internal/mcp"
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

  it("builds a streamable HTTP start-session request payload", () => {
    expect(buildCodexSessionStartRequest({
      prompt: "Start the remote worker",
      config: {
        cwd: "/tmp/run-001/backend-dev",
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        transport: {
          kind: "streamable_http",
          url: "https://codex-mcp.internal/mcp",
          headers: {
            authorization: "Bearer shared-token"
          },
          protocolVersion: "2025-11-25"
        }
      }
    })).toEqual({
      transport: "streamable_http",
      endpoint: "https://codex-mcp.internal/mcp",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-11-25",
        authorization: "Bearer shared-token"
      },
      message: {
        jsonrpc: "2.0",
        id: "codex-session-start",
        method: "codex/session/start",
        params: {
          prompt: "Start the remote worker",
          cwd: "/tmp/run-001/backend-dev",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false
        }
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

  it("builds a streamable HTTP reply-session request payload", () => {
    expect(buildCodexSessionReplyRequest({
      threadId: "thread-001",
      prompt: "Continue the remote worker",
      config: {
        cwd: "/tmp/run-001/backend-dev",
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        transport: {
          kind: "streamable_http",
          url: "https://codex-mcp.internal/mcp",
          headers: {},
          protocolVersion: "2025-11-25"
        }
      }
    })).toEqual({
      transport: "streamable_http",
      endpoint: "https://codex-mcp.internal/mcp",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-11-25"
      },
      message: {
        jsonrpc: "2.0",
        id: "codex-session-reply",
        method: "codex/session/reply",
        params: {
          threadId: "thread-001",
          prompt: "Continue the remote worker"
        }
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

  it("claims dispatch work from the control plane and provisions isolated worktrees", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "codex-swarm-provision-source-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-swarm-provision-workspaces-"));

    try {
      git(["init", "--initial-branch=main"], repoRoot);
      git(["config", "user.name", "Codex Swarm"], repoRoot);
      git(["config", "user.email", "codex-swarm@example.com"], repoRoot);
      await writeFile(join(repoRoot, "README.md"), "hello from source\n", "utf8");
      git(["add", "README.md"], repoRoot);
      git(["commit", "-m", "initial"], repoRoot);

      const assignments: WorkerDispatchAssignment[] = [
        {
          id: "11111111-1111-4111-8111-111111111111",
          runId: "22222222-2222-4222-8222-222222222222",
          taskId: "33333333-3333-4333-8333-333333333333",
          agentId: "44444444-4444-4444-8444-444444444444",
          sessionId: undefined,
          repositoryId: "55555555-5555-4555-8555-555555555555",
          repositoryName: "codex-swarm",
          queue: "worker-dispatch",
          state: "claimed",
          stickyNodeId: null,
          preferredNodeId: null,
          claimedByNodeId: "node-a",
          requiredCapabilities: ["node"],
          worktreePath: join(workspaceRoot, "worker-a"),
          branchName: "main",
          prompt: "Implement task A",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          metadata: {},
          attempt: 0,
          maxAttempts: 3,
          leaseTtlSeconds: 300,
          createdAt: new Date("2026-03-29T00:00:00.000Z")
        },
        {
          id: "66666666-6666-4666-8666-666666666666",
          runId: "22222222-2222-4222-8222-222222222222",
          taskId: "77777777-7777-4777-8777-777777777777",
          agentId: "88888888-8888-4888-8888-888888888888",
          sessionId: undefined,
          repositoryId: "55555555-5555-4555-8555-555555555555",
          repositoryName: "codex-swarm",
          queue: "worker-dispatch",
          state: "claimed",
          stickyNodeId: null,
          preferredNodeId: null,
          claimedByNodeId: "node-a",
          requiredCapabilities: ["node"],
          worktreePath: join(workspaceRoot, "worker-b"),
          branchName: "main",
          prompt: "Implement task B",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          includePlanTool: false,
          metadata: {},
          attempt: 0,
          maxAttempts: 3,
          leaseTtlSeconds: 300,
          createdAt: new Date("2026-03-29T00:00:00.000Z")
        }
      ];

      const runDetail: RunDetail = {
        id: "22222222-2222-4222-8222-222222222222",
        repositoryId: "55555555-5555-4555-8555-555555555555",
        workspaceId: "default-workspace",
        teamId: "default-team",
        goal: "Provision isolated worker worktrees",
        status: "in_progress",
        branchName: "main",
        planArtifactPath: null,
        budgetTokens: null,
        budgetCostUsd: null,
        concurrencyCap: 2,
        policyProfile: "standard",
        publishedBranch: null,
        branchPublishedAt: null,
        branchPublishApprovalId: null,
        pullRequestUrl: null,
        pullRequestNumber: null,
        pullRequestStatus: null,
        pullRequestApprovalId: null,
        handoffStatus: "pending",
        metadata: {},
        createdBy: "tech-lead",
        createdAt: new Date("2026-03-29T00:00:00.000Z"),
        updatedAt: new Date("2026-03-29T00:00:00.000Z"),
        completedAt: null,
        tasks: [],
        agents: [],
        sessions: []
      };
      const repository: Repository = {
        id: "55555555-5555-4555-8555-555555555555",
        workspaceId: "default-workspace",
        teamId: "default-team",
        name: "codex-swarm",
        url: repoRoot,
        provider: "github",
        defaultBranch: "main",
        localPath: null,
        trustLevel: "trusted",
        approvalProfile: "standard",
        providerSync: {
          connectivityStatus: "validated",
          validatedAt: null,
          defaultBranch: "main",
          branches: ["main"],
          providerRepoUrl: repoRoot,
          lastError: null
        },
        createdAt: new Date("2026-03-29T00:00:00.000Z"),
        updatedAt: new Date("2026-03-29T00:00:00.000Z")
      };

      const server = createServer((request, response) => {
        if (request.method === "POST" && request.url === "/api/v1/worker-nodes/node-a/claim-dispatch") {
          const nextAssignment = assignments.shift() ?? null;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify(nextAssignment));
          return;
        }

        if (request.method === "GET" && request.url === `/api/v1/runs/${runDetail.id}`) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify(runDetail));
          return;
        }

        if (request.method === "GET" && request.url === "/api/v1/repositories") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify([repository]));
          return;
        }

        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not found" }));
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });

      try {
        const address = server.address();

        if (!address || typeof address === "string") {
          throw new Error("failed to resolve test server address");
        }

        const runtime = {
          ...createRuntime(workspaceRoot),
          controlPlaneUrl: `http://127.0.0.1:${address.port}`
        };

        const first = await claimAndProvisionDispatchWorkspace({
          runtime,
          controlPlane: {
            baseUrl: runtime.controlPlaneUrl
          }
        });
        const second = await claimAndProvisionDispatchWorkspace({
          runtime,
          controlPlane: {
            baseUrl: runtime.controlPlaneUrl
          }
        });

        expect(first?.workspace.mode).toBe("git_clone");
        expect(second?.workspace.mode).toBe("git_clone");
        expect(await readFile(join(first!.workspace.path, "README.md"), "utf8")).toBe("hello from source\n");
        expect(await readFile(join(second!.workspace.path, "README.md"), "utf8")).toBe("hello from source\n");
        expect(first?.bootstrap.environment.CODEX_SWARM_DISPATCH_ID).toBe(first?.assignment.id);
        expect(second?.bootstrap.environment.CODEX_SWARM_DISPATCH_ID).toBe(second?.assignment.id);

        await writeFile(join(first!.workspace.path, "README.md"), "worker one change\n", "utf8");

        expect(await readFile(join(first!.workspace.path, "README.md"), "utf8")).toBe("worker one change\n");
        expect(await readFile(join(second!.workspace.path, "README.md"), "utf8")).toBe("hello from source\n");
        expect(await readFile(join(repoRoot, "README.md"), "utf8")).toBe("hello from source\n");
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      }
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("deletes stale worktree directories while skipping placeholder paths", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-swarm-worktree-cleanup-"));
    const staleWorktree = join(workspaceRoot, "stale-worker");

    try {
      await mkdir(staleWorktree, { recursive: true });
      await writeFile(join(staleWorktree, "README.md"), "stale\n", "utf8");

      const results = await cleanupWorktreePaths([
        staleWorktree,
        "untracked/session-001"
      ]);

      expect(results).toEqual([
        {
          path: staleWorktree,
          deleted: true,
          reason: null
        },
        {
          path: "untracked/session-001",
          deleted: false,
          reason: "placeholder_path"
        }
      ]);

      await expect(readFile(join(staleWorktree, "README.md"), "utf8")).rejects.toThrow();
    } finally {
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

  it("treats streamable HTTP transport as a remote service instead of spawning a local process", async () => {
    const supervisor = new CodexServerSupervisor({
      config: {
        cwd: process.cwd(),
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        transport: {
          kind: "streamable_http",
          url: "https://codex-mcp.internal/mcp",
          headers: {},
          protocolVersion: "2025-11-25"
        }
      }
    });

    const started = await supervisor.start();
    expect(started.status).toBe("running");
    expect(started.pid).toBeNull();

    const stopped = await supervisor.stop();
    expect(stopped.status).toBe("stopped");
    expect(stopped.pid).toBeNull();
  });

  it("executes streamable HTTP transport requests against a shared MCP endpoint", async () => {
    const requests: Array<{
      headers: Record<string, string | string[] | undefined>;
      body: string;
    }> = [];
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        requests.push({
          headers: req.headers,
          body
        });
        res.writeHead(200, {
          "Content-Type": "application/json",
          "MCP-Session-Id": "mcp-session-001"
        });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          result: {
            threadId: "thread-remote-001",
            output: "remote-ok",
            metadata: {
              source: "shared-service"
            }
          }
        }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("expected an inet server address");
    }

    try {
      const executeTool = createStreamableHttpToolExecutor();
      const result = await executeTool(buildCodexSessionStartRequest({
        prompt: "Start remote worker",
        config: {
          cwd: "/tmp/run-001/backend-dev",
          profile: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
          transport: {
            kind: "streamable_http",
            url: `http://127.0.0.1:${address.port}/mcp`,
            headers: {
              authorization: "Bearer shared-token"
            },
            protocolVersion: "2025-11-25"
          }
        }
      }));

      expect(result).toEqual({
        threadId: "thread-remote-001",
        output: "remote-ok",
        metadata: {
          source: "shared-service",
          mcpSessionId: "mcp-session-001"
        }
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.headers["accept"]).toBe("application/json, text/event-stream");
      expect(requests[0]?.headers["mcp-protocol-version"]).toBe("2025-11-25");
      expect(requests[0]?.body).toContain("\"method\":\"codex/session/start\"");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it("executes local codex start requests through the CLI", async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string | undefined }> = [];
    const executeTool = createLocalCodexCliExecutor({
      command: process.execPath,
      spawnImpl: (command, args, options) => {
        calls.push({
          command,
          args: [...args],
          cwd: options.cwd?.toString()
        });

        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const child = {
          stdout,
          stderr
        } as any;

        queueMicrotask(() => {
          stdout.end([
            JSON.stringify({ type: "thread.started", thread_id: "thread-cli-001" }),
            JSON.stringify({ type: "item.completed", item: { id: "item-1", type: "agent_message", text: "cli-started" } }),
            JSON.stringify({ type: "turn.completed", usage: { output_tokens: 1 } })
          ].join("\n"));
          child.emit("exit", 0, null);
        });

        Object.setPrototypeOf(child, PassThrough.prototype);
        child.on = Function.prototype.bind.call((new PassThrough() as any).on, child);
        child.once = Function.prototype.bind.call((new PassThrough() as any).once, child);
        child.emit = Function.prototype.bind.call((new PassThrough() as any).emit, child);

        return child;
      }
    });

    const result = await executeTool(buildCodexSessionStartRequest({
      prompt: "Start the worker",
      config: {
        cwd: "/tmp/run-001/backend-dev",
        profile: "default",
        sandbox: "workspace-write",
        approvalPolicy: "on-request"
      }
    }));

    expect(result).toEqual({
      threadId: "thread-cli-001",
      output: "cli-started"
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe(process.execPath);
    expect(calls[0]?.args).toEqual([
      "exec",
      "--json",
      "--full-auto",
      "-C",
      "/tmp/run-001/backend-dev",
      "-s",
      "workspace-write",
      "Start the worker"
    ]);
    expect(calls[0]?.cwd).toBe("/tmp/run-001/backend-dev");
  });

  it("executes local codex reply requests through the CLI", async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string | undefined }> = [];
    const executeTool = createLocalCodexCliExecutor({
      command: process.execPath,
      spawnImpl: (command, args, options) => {
        calls.push({
          command,
          args: [...args],
          cwd: options.cwd?.toString()
        });

        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const child = {
          stdout,
          stderr
        } as any;

        queueMicrotask(() => {
          stdout.end([
            JSON.stringify({ type: "thread.started", thread_id: "thread-cli-001" }),
            JSON.stringify({ type: "item.completed", item: { id: "item-1", type: "agent_message", text: "cli-continued" } }),
            JSON.stringify({ type: "turn.completed", usage: { output_tokens: 1 } })
          ].join("\n"));
          child.emit("exit", 0, null);
        });

        Object.setPrototypeOf(child, PassThrough.prototype);
        child.on = Function.prototype.bind.call((new PassThrough() as any).on, child);
        child.once = Function.prototype.bind.call((new PassThrough() as any).once, child);
        child.emit = Function.prototype.bind.call((new PassThrough() as any).emit, child);

        return child;
      }
    });

    const result = await executeTool(buildCodexSessionReplyRequest({
      threadId: "thread-cli-001",
      prompt: "Continue the worker"
    }));

    expect(result).toEqual({
      threadId: "thread-cli-001",
      output: "cli-continued"
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([
      "exec",
      "resume",
      "--json",
      "--full-auto",
      "thread-cli-001",
      "Continue the worker"
    ]);
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
        if (!("tool" in request)) {
          throw new Error("expected stdio codex request");
        }

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
