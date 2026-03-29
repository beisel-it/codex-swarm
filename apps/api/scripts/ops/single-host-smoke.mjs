import { mkdtemp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runLeaderPlanningLoop } from "../../src/lib/leader-planning-loop.ts";

const baseUrl = process.env.SMOKE_BASE_URL;
const authToken = process.env.SMOKE_AUTH_TOKEN ?? process.env.DEV_AUTH_TOKEN ?? "codex-swarm-dev-token";
const repositoryName = process.env.SMOKE_REPOSITORY_NAME ?? "codex-swarm-smoke";
const repositoryUrl = process.env.SMOKE_REPOSITORY_URL ?? "https://example.com/codex-swarm-smoke.git";
const defaultBranch = process.env.SMOKE_DEFAULT_BRANCH ?? "main";
const runGoal = process.env.SMOKE_RUN_GOAL ?? "Execute the single-host smoke flow";
const leaderThreadId = process.env.SMOKE_LEADER_THREAD_ID ?? `thread-leader-${Date.now()}`;
const workerThreadId = process.env.SMOKE_WORKER_THREAD_ID ?? `thread-worker-${Date.now()}`;

if (!baseUrl) {
  console.error("SMOKE_BASE_URL is required");
  process.exit(1);
}

function buildHeaders() {
  return {
    authorization: `Bearer ${authToken}`,
    "content-type": "application/json"
  };
}

async function request(method, path, payload) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: buildHeaders(),
    body: payload ? JSON.stringify(payload) : undefined
  });

  const raw = await response.text();
  const data = raw.length > 0 ? JSON.parse(raw) : null;

  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function buildFixturePlan(goal) {
  return JSON.stringify({
    summary: `Leader session planned the smoke workflow for: ${goal}`,
    tasks: [
      {
        key: "leader-plan",
        title: "Draft the leader plan",
        role: "tech-lead",
        description: "Write and persist the plan artifact",
        acceptanceCriteria: [
          ".swarm/plan.md exists",
          "run.planArtifactPath is populated"
        ],
        dependencyKeys: []
      },
      {
        key: "worker-task",
        title: "Execute the delegated task",
        role: "backend-developer",
        description: "Pick up the next delegated backend action",
        acceptanceCriteria: [
          "worker receives a direct message from the leader",
          "worker session is registered"
        ],
        dependencyKeys: ["leader-plan"]
      }
    ]
  });
}

const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-swarm-smoke-"));
await mkdir(join(workspaceRoot, ".swarm"), { recursive: true });

const repository = await request("POST", "/api/v1/repositories", {
  name: repositoryName,
  url: repositoryUrl,
  defaultBranch,
  trustLevel: "trusted"
});

const run = await request("POST", "/api/v1/runs", {
  repositoryId: repository.id,
  goal: runGoal,
  concurrencyCap: 2,
  metadata: {
    source: "single-host-smoke"
  }
});

const leaderFlow = await runLeaderPlanningLoop({
  request,
  runId: run.id,
  workspaceRoot,
  actorId: "tech-lead",
  runtimeConfig: {
    cwd: workspaceRoot,
    profile: "default",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    includePlanTool: true
  },
  supervisorCommand: [
    process.execPath,
    "--input-type=module",
    "-e",
    "setInterval(() => {}, 1000);"
  ],
  executeTool: async (toolRequest) => ({
    threadId: leaderThreadId,
    output: toolRequest.tool === "codex"
      ? "leader-started"
      : buildFixturePlan(runGoal)
  })
});

const leaderTask = leaderFlow.tasks.find((task) => task.role === "tech-lead");
const workerTask = leaderFlow.tasks.find((task) => task.role === "backend-developer");

if (!leaderTask || !workerTask) {
  throw new Error("leader planning loop did not produce both leader and worker tasks");
}

await request("PATCH", `/api/v1/tasks/${leaderTask.id}/status`, {
  status: "completed",
  ownerAgentId: leaderFlow.agentId
});

const workerAgent = await request("POST", "/api/v1/agents", {
  runId: run.id,
  name: "worker-1",
  role: "backend-developer",
  status: "idle",
  currentTaskId: workerTask.id,
  session: {
    threadId: workerThreadId,
    cwd: workspaceRoot,
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    includePlanTool: false,
    metadata: {
      source: "single-host-smoke"
    }
  }
});

await request("POST", "/api/v1/messages", {
  runId: run.id,
  senderAgentId: leaderFlow.agentId,
  recipientAgentId: workerAgent.id,
  kind: "direct",
  body: `Implement task ${workerTask.id} using the persisted plan at ${leaderFlow.planArtifactPath}`
});

const runDetail = await request("GET", `/api/v1/runs/${run.id}`);
const messages = await request("GET", `/api/v1/messages?runId=${run.id}`);

const verification = {
  runId: run.id,
  repositoryId: repository.id,
  planArtifactPath: runDetail.planArtifactPath,
  leaderTaskStatus: runDetail.tasks.find((task) => task.id === leaderTask.id)?.status ?? null,
  workerTaskStatus: runDetail.tasks.find((task) => task.id === workerTask.id)?.status ?? null,
  agentCount: runDetail.agents.length,
  sessionThreadIds: runDetail.sessions.map((session) => session.threadId),
  leaderSessionId: leaderFlow.sessionId,
  directMessages: messages.length
};

const ok = verification.planArtifactPath === leaderFlow.planArtifactPath
  && verification.leaderTaskStatus === "completed"
  && verification.workerTaskStatus === "pending"
  && verification.agentCount >= 2
  && verification.sessionThreadIds.includes(leaderThreadId)
  && verification.sessionThreadIds.includes(workerThreadId)
  && verification.directMessages >= 1;

if (!ok) {
  console.error(JSON.stringify({
    ok,
    workspaceRoot,
    verification
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok,
  workspaceRoot,
  verification
}, null, 2));
