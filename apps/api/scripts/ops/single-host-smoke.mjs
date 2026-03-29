import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

function buildPlanMarkdown(goal) {
  return [
    "# Swarm Plan",
    "",
    "## Goal",
    goal,
    "",
    "## Tasks",
    "",
    "1. Draft the leader plan",
    "   Role: tech-lead",
    "   Acceptance Criteria:",
    "   - .swarm/plan.md exists",
    "   - run.planArtifactPath is populated",
    "",
    "2. Execute the delegated task",
    "   Role: backend-developer",
    "   Acceptance Criteria:",
    "   - worker receives a direct message from the leader",
    "   - run detail shows both sessions"
  ].join("\n");
}

const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-swarm-smoke-"));
const planDir = join(workspaceRoot, ".swarm");
const planPath = join(planDir, "plan.md");

await mkdir(planDir, { recursive: true });
await writeFile(planPath, `${buildPlanMarkdown(runGoal)}\n`, "utf8");

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

const leaderTask = await request("POST", "/api/v1/tasks", {
  runId: run.id,
  title: "Draft the leader plan",
  description: "Write and persist the plan artifact",
  role: "tech-lead",
  priority: 1,
  dependencyIds: [],
  acceptanceCriteria: ["plan artifact exists", "run is linked to the plan artifact"]
});

const workerTask = await request("POST", "/api/v1/tasks", {
  runId: run.id,
  title: "Execute the delegated task",
  description: "Pick up the next delegated backend action",
  role: "backend-developer",
  priority: 2,
  dependencyIds: [leaderTask.id],
  acceptanceCriteria: ["delegation message exists", "worker session is registered"]
});

const leaderAgent = await request("POST", "/api/v1/agents", {
  runId: run.id,
  name: "leader",
  role: "tech-lead",
  status: "idle",
  currentTaskId: leaderTask.id,
  session: {
    threadId: leaderThreadId,
    cwd: workspaceRoot,
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    includePlanTool: true,
    metadata: {
      source: "single-host-smoke"
    }
  }
});

await request("POST", "/api/v1/artifacts", {
  runId: run.id,
  taskId: leaderTask.id,
  kind: "plan",
  path: planPath,
  contentType: "text/markdown",
  metadata: {
    relativePath: ".swarm/plan.md",
    source: "single-host-smoke"
  }
});

await request("PATCH", `/api/v1/runs/${run.id}/status`, {
  status: "planning",
  planArtifactPath: planPath
});

await request("PATCH", `/api/v1/tasks/${leaderTask.id}/status`, {
  status: "completed",
  ownerAgentId: leaderAgent.id
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
  senderAgentId: leaderAgent.id,
  recipientAgentId: workerAgent.id,
  kind: "direct",
  body: `Implement task ${workerTask.id} using the persisted plan at ${planPath}`
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
  directMessages: messages.length
};

const ok = verification.planArtifactPath === planPath
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
