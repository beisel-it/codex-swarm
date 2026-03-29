import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import type {
  Agent,
  Message,
  Repository,
  Run,
  RunDetail,
  Session,
  Task,
  WorkerDispatchAssignment,
  WorkerNode
} from "@codex-swarm/contracts";
import {
  CodexServerSupervisor,
  CodexSessionRuntime,
  createLocalCodexCliExecutor
} from "../../apps/worker/src/runtime.js";
import { SessionRegistry } from "../../apps/worker/src/session-registry.js";

const execFileAsync = promisify(execFile);

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }

  return value;
}

function parseCodexCommand(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    return ["codex"];
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const parsed = JSON.parse(trimmed) as unknown;

    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string" || entry.length === 0)) {
      throw new Error("CODEX_SWARM_CODEX_COMMAND must be a non-empty string array when using JSON form");
    }

    return parsed;
  }

  return trimmed.split(/\s+/).filter(Boolean);
}

async function api<T>(baseUrl: string, authToken: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json"
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${method} ${path} failed: ${response.status} ${detail}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(command: string, args: string[], cwd?: string) {
  return execFileAsync(command, args, {
    cwd,
    env: process.env,
    maxBuffer: 1024 * 1024 * 20
  });
}

async function ensureGithubRepository(repoSlug: string) {
  try {
    const { stdout } = await runCommand("gh", [
      "repo",
      "view",
      repoSlug,
      "--json",
      "nameWithOwner,url,defaultBranchRef"
    ]);
    const parsed = JSON.parse(stdout) as {
      url: string;
      defaultBranchRef?: { name?: string | null } | null;
    };

    return {
      url: parsed.url,
      defaultBranch: parsed.defaultBranchRef?.name || "main"
    };
  } catch {
    await runCommand("gh", [
      "repo",
      "create",
      repoSlug,
      "--private",
      "--disable-issues",
      "--disable-wiki",
      "--description",
      "Codex Swarm automated handoff proof repository",
      "--confirm"
    ]);

    const { stdout } = await runCommand("gh", [
      "repo",
      "view",
      repoSlug,
      "--json",
      "nameWithOwner,url,defaultBranchRef"
    ]);
    const parsed = JSON.parse(stdout) as {
      url: string;
      defaultBranchRef?: { name?: string | null } | null;
    };

    return {
      url: parsed.url,
      defaultBranch: parsed.defaultBranchRef?.name || "main"
    };
  }
}

async function bootstrapLeaderSession(input: {
  runId: string;
  workspacePath: string;
}) {
  const registry = new SessionRegistry();
  const sessionId = crypto.randomUUID();
  registry.seed({
    sessionId,
    runId: input.runId,
    agentId: "leader-bootstrap",
    worktreePath: input.workspacePath
  });

  const runtime = new CodexSessionRuntime({
    registry,
    supervisor: new CodexServerSupervisor({
      config: {
        cwd: input.workspacePath,
        profile: process.env.CODEX_SWARM_LEADER_PROFILE?.trim() || "default",
        sandbox: process.env.CODEX_SWARM_LEADER_SANDBOX?.trim() || "danger-full-access",
        approvalPolicy: process.env.CODEX_SWARM_LEADER_APPROVAL_POLICY?.trim() || "never",
        includePlanTool: true
      },
      command: parseCodexCommand(process.env.CODEX_SWARM_CODEX_COMMAND)
    }),
    executeTool: createLocalCodexCliExecutor({
      command: parseCodexCommand(process.env.CODEX_SWARM_CODEX_COMMAND)
    })
  });

  const started = await runtime.startSession(
    sessionId,
    [
      "You are the persisted leader agent for a Codex Swarm run.",
      `Run id: ${input.runId}`,
      "Keep concise context so that later follow-up prompts can ask you to slice worker requests into concrete JSON tasks.",
      "Respond with a short acknowledgement."
    ].join("\n")
  );

  await runtime.stopSession(sessionId).catch(() => undefined);

  return started.response.threadId;
}

async function main() {
  const baseUrl = requireEnv("CODEX_SWARM_API_BASE_URL");
  const authToken = process.env.CODEX_SWARM_API_TOKEN?.trim()
    || process.env.CODEX_SWARM_DEV_AUTH_TOKEN?.trim()
    || process.env.DEV_AUTH_TOKEN?.trim()
    || "";

  if (!authToken) {
    throw new Error("Missing API auth token");
  }

  const proofRoot = await mkdtemp(join(tmpdir(), "codex-swarm-agent-coordination-proof-"));
  const repoRoot = join(proofRoot, "repo");
  const leaderWorkspace = process.cwd();
  await mkdir(repoRoot, { recursive: true });
  const handoffRepo = await ensureGithubRepository(process.env.CODEX_SWARM_HANDOFF_REPO?.trim() || "beisel-it/codex-swarm-e2e-handoff");
  const remoteUrl = handoffRepo.url.endsWith(".git") ? handoffRepo.url : `${handoffRepo.url}.git`;

  await writeFile(join(repoRoot, "README.md"), "# Hosted coordination proof\n", "utf8");
  await writeFile(join(repoRoot, "docs", ".gitkeep"), "", "utf8").catch(async () => {
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(join(repoRoot, "docs", ".gitkeep"), "", "utf8");
  });
  await writeFile(join(repoRoot, "stories", ".gitkeep"), "", "utf8").catch(async () => {
    await mkdir(join(repoRoot, "stories"), { recursive: true });
    await writeFile(join(repoRoot, "stories", ".gitkeep"), "", "utf8");
  });
  await writeFile(join(repoRoot, "notes", ".gitkeep"), "", "utf8").catch(async () => {
    await mkdir(join(repoRoot, "notes"), { recursive: true });
    await writeFile(join(repoRoot, "notes", ".gitkeep"), "", "utf8");
  });
  await writeFile(join(repoRoot, "ops", ".gitkeep"), "", "utf8").catch(async () => {
    await mkdir(join(repoRoot, "ops"), { recursive: true });
    await writeFile(join(repoRoot, "ops", ".gitkeep"), "", "utf8");
  });

  await runCommand("git", ["-C", repoRoot, "init", "--initial-branch=main"]);
  await runCommand("git", ["-C", repoRoot, "config", "user.name", "Codex Swarm"]);
  await runCommand("git", ["-C", repoRoot, "config", "user.email", "codex-swarm@example.com"]);
  await runCommand("git", ["-C", repoRoot, "remote", "remove", "origin"]).catch(() => undefined);
  await runCommand("git", ["-C", repoRoot, "remote", "add", "origin", remoteUrl]);
  await runCommand("git", ["-C", repoRoot, "add", "."]);
  await runCommand("git", ["-C", repoRoot, "commit", "-m", "Initial proof baseline"]);
  await runCommand("git", ["-C", repoRoot, "push", "-u", "origin", handoffRepo.defaultBranch, "--force"]);

  const repository = await api<Repository>(baseUrl, authToken, "POST", "/api/v1/repositories", {
    name: "agent-coordination-proof",
    provider: "github",
    url: remoteUrl,
    localPath: repoRoot,
    defaultBranch: handoffRepo.defaultBranch,
    metadata: {
      source: "agent-coordination-proof"
    }
  });

  const run = await api<Run>(baseUrl, authToken, "POST", "/api/v1/runs", {
    repositoryId: repository.id,
    goal: "Prove hosted bidirectional messaging, leader reslicing, automatic backlog pickup, and parallel worker execution.",
    concurrencyCap: 6,
    metadata: {
      source: "agent-coordination-proof"
    }
  });

  const leaderThreadId = await bootstrapLeaderSession({
    runId: run.id,
    workspacePath: leaderWorkspace
  });

  const leaderAgent = await api<Agent>(baseUrl, authToken, "POST", "/api/v1/agents", {
    runId: run.id,
    name: "tech-lead",
    role: "tech-lead",
    status: "idle",
    branchName: "main",
    session: {
      threadId: leaderThreadId,
      cwd: leaderWorkspace,
      sandbox: "danger-full-access",
      approvalPolicy: "never",
      includePlanTool: true,
      workerNodeId: "00000000-0000-4000-8000-000000000001",
      placementConstraintLabels: ["workspace-write"],
      metadata: {
        source: "agent-coordination-proof"
      }
    }
  });

  const oversizedTask = await api<Task>(baseUrl, authToken, "POST", "/api/v1/tasks", {
    runId: run.id,
    title: "Story alpha bundle",
    description: [
      "This task intentionally combines two separate story slices and must be escalated for additional slicing.",
      "Do not create files directly for this task.",
      "Respond with JSON only and set status to needs_slicing.",
      "Ask the leader to create exactly two follow-on tasks:",
      "- Story alpha hero: create stories/story-alpha-hero.txt containing exactly 'Story Alpha Hero delivered.'",
      "- Story alpha CTA: create stories/story-alpha-cta.txt containing exactly 'Story Alpha CTA delivered.'",
      "Also send a direct coordination message to role:technical-writer with the exact body 'Use the approved Story Alpha hero line in the changelog note.'",
      "Include a blocking issue explaining that the current task spans multiple deliverables and should be split before execution."
    ].join("\n"),
    role: "frontend-developer",
    priority: 1,
    dependencyIds: [],
    acceptanceCriteria: [
      "Escalate the task for finer slicing instead of completing it directly."
    ]
  });

  const writerTask = await api<Task>(baseUrl, authToken, "POST", "/api/v1/tasks", {
    runId: run.id,
    title: "Changelog note",
    description: [
      "Create notes/changelog.txt containing exactly 'Changelog references the approved Story Alpha hero line.'",
      "If you receive inbound agent coordination, keep the file content exact and reflect the coordination in your summary."
    ].join("\n"),
    role: "technical-writer",
    priority: 2,
    dependencyIds: [oversizedTask.id],
    acceptanceCriteria: [
      "Create notes/changelog.txt",
      "Ensure the file contains exactly: Changelog references the approved Story Alpha hero line."
    ],
    validationTemplates: [
      {
        name: "writer-note",
        command: "grep -Fqx 'Changelog references the approved Story Alpha hero line.' notes/changelog.txt",
        summary: "Validate changelog note content",
        artifactPath: "artifacts/validations/changelog-note.json"
      }
    ]
  });

  await api<Agent>(baseUrl, authToken, "POST", "/api/v1/agents", {
    runId: run.id,
    name: "technical-writer-changelog-note",
    role: "technical-writer",
    status: "idle",
    branchName: "main",
    currentTaskId: writerTask.id
  });

  await api<Task>(baseUrl, authToken, "POST", "/api/v1/tasks", {
    runId: run.id,
    title: "Ops deployment note",
    description: "Create ops/deployment.txt containing exactly 'Tailnet-only API and frontend; data services stay local-only.'",
    role: "infrastructure-engineer",
    priority: 1,
    dependencyIds: [],
    acceptanceCriteria: [
      "Create ops/deployment.txt",
      "Ensure the file contains exactly: Tailnet-only API and frontend; data services stay local-only."
    ],
    validationTemplates: [
      {
        name: "ops-note",
        command: "grep -Fqx 'Tailnet-only API and frontend; data services stay local-only.' ops/deployment.txt",
        summary: "Validate ops note content",
        artifactPath: "artifacts/validations/ops-deployment.json"
      }
    ]
  });

  await api<Task>(baseUrl, authToken, "POST", "/api/v1/tasks", {
    runId: run.id,
    title: "API summary note",
    description: "Create docs/api-summary.txt containing exactly 'API summary confirmed for hosted coordination proof.'",
    role: "backend-developer",
    priority: 1,
    dependencyIds: [],
    acceptanceCriteria: [
      "Create docs/api-summary.txt",
      "Ensure the file contains exactly: API summary confirmed for hosted coordination proof."
    ],
    validationTemplates: [
      {
        name: "api-summary",
        command: "grep -Fqx 'API summary confirmed for hosted coordination proof.' docs/api-summary.txt",
        summary: "Validate API summary content",
        artifactPath: "artifacts/validations/api-summary.json"
      }
    ]
  });

  await api<Run>(baseUrl, authToken, "POST", `/api/v1/runs/${run.id}/start`, {});

  const deadline = Date.now() + 12 * 60 * 1000;
  const claimedNodeSnapshots = new Set<string>();
  let maxSimultaneousClaims = 0;

  while (Date.now() < deadline) {
    const runDetail = await api<RunDetail>(baseUrl, authToken, "GET", `/api/v1/runs/${run.id}`);
    const assignments = await api<WorkerDispatchAssignment[]>(baseUrl, authToken, "GET", `/api/v1/worker-dispatch-assignments?runId=${run.id}`);
    const claimedNow = assignments.filter((assignment) => assignment.state === "claimed");
    maxSimultaneousClaims = Math.max(maxSimultaneousClaims, claimedNow.length);

    for (const assignment of assignments) {
      if (assignment.claimedByNodeId) {
        claimedNodeSnapshots.add(assignment.claimedByNodeId);
      }
    }

    process.stdout.write(
      `run=${runDetail.status} tasks=${runDetail.tasks.length} completed=${runDetail.tasks.filter((task) => task.status === "completed").length}` +
      ` claimed=${claimedNow.length} nodes=${claimedNodeSnapshots.size}\n`
    );

    if (runDetail.status === "completed") {
      const messages = await api<Message[]>(baseUrl, authToken, "GET", `/api/v1/messages?runId=${run.id}`);
      const completedAssignments = assignments.filter((assignment) => assignment.state === "completed");
      const detail = await api<RunDetail>(baseUrl, authToken, "GET", `/api/v1/runs/${run.id}`);
      const childTasks = detail.tasks.filter((task) => task.parentTaskId === oversizedTask.id);
      const writerAgent = detail.agents.find((agent) => agent.currentTaskId === writerTask.id);
      const writerSession = writerAgent
        ? detail.sessions.find((session) => session.agentId === writerAgent.id)
        : null;
      const writerTranscript = writerSession
        ? await api<Array<{ kind: string; text: string }>>(baseUrl, authToken, "GET", `/api/v1/sessions/${writerSession.id}/transcript`)
        : [];
      const oversizedAgent = detail.agents.find((agent) => agent.currentTaskId === oversizedTask.id);
      const oversizedSession = oversizedAgent
        ? detail.sessions.find((session) => session.agentId === oversizedAgent.id)
        : null;
      const oversizedTranscript = oversizedSession
        ? await api<Array<{ kind: string; text: string }>>(baseUrl, authToken, "GET", `/api/v1/sessions/${oversizedSession.id}/transcript`)
        : [];

      const hasLeaderToWorker = messages.some((message) => message.kind === "direct" && message.senderAgentId === leaderAgent.id);
      const hasWorkerToLeader = messages.some((message) => message.kind === "direct" && message.recipientAgentId === leaderAgent.id && message.senderAgentId !== leaderAgent.id);
      const hasWorkerToWriter = writerAgent
        ? messages.some((message) => message.kind === "direct" && message.recipientAgentId === writerAgent.id && message.senderAgentId !== leaderAgent.id)
        : false;
      const writerSawPeerMessage = writerTranscript.some((entry) => entry.kind === "prompt" && entry.text.includes("Use the approved Story Alpha hero line in the changelog note."));
      const oversizedRequestedSlicing = oversizedTranscript.some((entry) => entry.kind === "response" && entry.text.includes("\"status\":\"needs_slicing\""))
        || oversizedTranscript.some((entry) => entry.kind === "response" && entry.text.includes("\"status\": \"needs_slicing\""));

      if (!hasLeaderToWorker) {
        throw new Error("Proof failed: no leader=>worker direct message was persisted");
      }

      if (!hasWorkerToLeader) {
        throw new Error("Proof failed: no worker=>leader direct message was persisted");
      }

      if (!hasWorkerToWriter) {
        throw new Error("Proof failed: no worker=>worker direct message was persisted");
      }

      if (!writerSawPeerMessage) {
        throw new Error("Proof failed: writer transcript did not contain inbound peer coordination");
      }

      if (!oversizedRequestedSlicing) {
        throw new Error("Proof failed: oversized worker transcript did not record needs_slicing output");
      }

      if (childTasks.length < 2) {
        throw new Error(`Proof failed: expected at least 2 child tasks from leader reslice, saw ${childTasks.length}`);
      }

      if (claimedNodeSnapshots.size < 2) {
        throw new Error(`Proof failed: expected work across multiple nodes, saw ${claimedNodeSnapshots.size}`);
      }

      if (maxSimultaneousClaims < 2) {
        throw new Error(`Proof failed: expected at least 2 simultaneous claims, saw ${maxSimultaneousClaims}`);
      }

      if (completedAssignments.length < 4) {
        throw new Error(`Proof failed: expected at least 4 completed assignments, saw ${completedAssignments.length}`);
      }

      const alphaHeroAgent = detail.agents.find((agent) => detail.tasks.some((task) => task.id === agent.currentTaskId && task.title.toLowerCase().includes("hero")));
      const alphaCtaAgent = detail.agents.find((agent) => detail.tasks.some((task) => task.id === agent.currentTaskId && task.title.toLowerCase().includes("cta")));

      const apiAgent = detail.agents.find((agent) => detail.tasks.some((task) => task.id === agent.currentTaskId && task.title.toLowerCase().includes("api summary")));
      const opsAgent = detail.agents.find((agent) => detail.tasks.some((task) => task.id === agent.currentTaskId && task.title.toLowerCase().includes("ops deployment")));
      const artifactSources = [
        writerAgent?.worktreePath ? { source: join(writerAgent.worktreePath, "notes", "changelog.txt"), destination: join(repoRoot, "notes", "changelog.txt") } : null,
        alphaHeroAgent?.worktreePath ? { source: join(alphaHeroAgent.worktreePath, "stories", "story-alpha-hero.txt"), destination: join(repoRoot, "stories", "story-alpha-hero.txt") } : null,
        alphaCtaAgent?.worktreePath ? { source: join(alphaCtaAgent.worktreePath, "stories", "story-alpha-cta.txt"), destination: join(repoRoot, "stories", "story-alpha-cta.txt") } : null,
        apiAgent?.worktreePath ? { source: join(apiAgent.worktreePath, "docs", "api-summary.txt"), destination: join(repoRoot, "docs", "api-summary.txt") } : null,
        opsAgent?.worktreePath ? { source: join(opsAgent.worktreePath, "ops", "deployment.txt"), destination: join(repoRoot, "ops", "deployment.txt") } : null
      ].filter((value): value is { source: string; destination: string } => Boolean(value));

      for (const file of artifactSources) {
        await readFile(file.source, "utf8");
        await mkdir(dirname(file.destination), { recursive: true });
        await copyFile(file.source, file.destination);
      }

      const branchName = `proof/${run.id}`;

      await runCommand("git", ["-C", repoRoot, "fetch", "origin", handoffRepo.defaultBranch]);
      await runCommand("git", ["-C", repoRoot, "checkout", handoffRepo.defaultBranch]);
      await runCommand("git", ["-C", repoRoot, "reset", "--hard", `origin/${handoffRepo.defaultBranch}`]);
      await runCommand("git", ["-C", repoRoot, "checkout", "-B", branchName]);
      await runCommand("git", ["-C", repoRoot, "add", "."]);
      await runCommand("git", ["-C", repoRoot, "commit", "-m", `Codex Swarm proof for ${run.id}`]);
      await runCommand("git", ["-C", repoRoot, "push", "-u", "origin", branchName, "--force"]);

      const { stdout: prUrl } = await runCommand("gh", [
        "pr",
        "create",
        "--repo",
        handoffRepo.url.replace("https://github.com/", ""),
        "--base",
        handoffRepo.defaultBranch,
        "--head",
        branchName,
        "--title",
        `Codex Swarm proof ${run.id}`,
        "--body",
        `Automated publish-plus-handoff proof for run ${run.id}.`,
        "--draft"
      ], repoRoot);
      const pullRequestUrl = prUrl.trim();
      const prNumber = Number(pullRequestUrl.split("/").at(-1));

      await api<RunDetail>(baseUrl, authToken, "POST", `/api/v1/runs/${run.id}/publish-branch`, {
        branchName,
        publishedBy: "codex-swarm-proof",
        remoteName: "origin",
        notes: "Automated hosted publish proof"
      });

      await api<RunDetail>(baseUrl, authToken, "POST", `/api/v1/runs/${run.id}/pull-request-handoff`, {
        title: `Codex Swarm proof ${run.id}`,
        body: `Automated publish-plus-handoff proof for run ${run.id}.`,
        createdBy: "codex-swarm-proof",
        provider: "github",
        baseBranch: handoffRepo.defaultBranch,
        headBranch: branchName,
        url: pullRequestUrl,
        number: prNumber,
        status: "draft"
      });

      const handoffRun = await api<RunDetail>(baseUrl, authToken, "GET", `/api/v1/runs/${run.id}`);
      if (handoffRun.handoffStatus !== "pr_open") {
        throw new Error(`Proof failed: expected handoffStatus pr_open, saw ${handoffRun.handoffStatus}`);
      }
      if (!handoffRun.pullRequestUrl) {
        throw new Error("Proof failed: run did not persist a pull request URL");
      }

      const workerNodes = await api<WorkerNode[]>(baseUrl, authToken, "GET", "/api/v1/worker-nodes");

      console.log(JSON.stringify({
        proofRoot,
        repositoryId: repository.id,
        runId: run.id,
        leaderAgentId: leaderAgent.id,
        childTaskCount: childTasks.length,
        completedAssignments: completedAssignments.length,
        maxSimultaneousClaims,
        workerNodes: workerNodes.map((node) => ({
          id: node.id,
          name: node.name,
          status: node.status,
          activeClaims: (node.metadata as Record<string, unknown>).activeClaims ?? null,
          queueDepth: (node.metadata as Record<string, unknown>).queueDepth ?? null
        })),
        messageCounts: {
          total: messages.length,
          leaderToWorker: hasLeaderToWorker,
          workerToLeader: hasWorkerToLeader,
          workerToWorker: hasWorkerToWriter
        },
        handoff: {
          branchName,
          pullRequestUrl,
          handoffStatus: handoffRun.handoffStatus
        }
      }, null, 2));

      return;
    }

    if (runDetail.status === "failed" || runDetail.status === "cancelled") {
      throw new Error(`Run entered terminal failure state: ${runDetail.status}`);
    }

    await sleep(4000);
  }

  throw new Error("Timed out waiting for hosted coordination proof run to complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
