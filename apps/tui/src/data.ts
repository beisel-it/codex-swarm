import type {
  AgentRecord,
  ApprovalRecord,
  ArtifactRecord,
  DashboardData,
  MessageRecord,
  RepositoryRecord,
  RunRecord,
  SessionRecord,
  SourceMode,
  TaskRecord,
  ValidationRecord,
  WorkerNodeRecord,
} from "./mock-data.js";
import { mockDashboardData } from "./mock-data.js";

const API_BASE_URL = (
  process.env.CODEX_SWARM_API_BASE_URL ??
  process.env.VITE_API_BASE_URL ??
  ""
).replace(/\/$/, "");
const API_TOKEN =
  process.env.CODEX_SWARM_API_TOKEN ??
  process.env.VITE_API_TOKEN ??
  "codex-swarm-dev-token";

type RunDetailResponse = {
  tasks?: TaskRecord[];
  agents?: AgentRecord[];
  sessions?: SessionRecord[];
};

type LoadResult = {
  data: DashboardData;
  source: SourceMode;
  fallbackReason: string | null;
};

function buildApiUrl(path: string) {
  if (!API_BASE_URL) {
    throw new Error("No CODEX_SWARM_API_BASE_URL configured");
  }

  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function loadFromApi(): Promise<DashboardData> {
  const repositories = await requestJson<RepositoryRecord[]>(
    "/api/v1/repositories",
  );
  const runs = await requestJson<RunRecord[]>("/api/v1/runs");
  const workerNodes = await requestJson<WorkerNodeRecord[]>(
    "/api/v1/worker-nodes",
  ).catch(() => []);

  if (runs.length === 0 || repositories.length === 0) {
    return {
      ...mockDashboardData,
      repositories,
      runs,
      workerNodes,
      tasks: [],
      agents: [],
      sessions: [],
      approvals: [],
      validations: [],
      artifacts: [],
      messages: [],
      source: "api",
    };
  }

  const details = await Promise.all(
    runs.map((run) =>
      requestJson<RunDetailResponse>(
        `/api/v1/runs/${encodeURIComponent(run.id)}`,
      ),
    ),
  );
  const approvalsPerRun = await Promise.all(
    runs.map((run) =>
      requestJson<ApprovalRecord[]>(
        `/api/v1/approvals?runId=${encodeURIComponent(run.id)}`,
      ).catch(() => []),
    ),
  );
  const validationsPerRun = await Promise.all(
    runs.map((run) =>
      requestJson<ValidationRecord[]>(
        `/api/v1/validations?runId=${encodeURIComponent(run.id)}`,
      ).catch(() => []),
    ),
  );
  const artifactsPerRun = await Promise.all(
    runs.map((run) =>
      requestJson<ArtifactRecord[]>(
        `/api/v1/artifacts?runId=${encodeURIComponent(run.id)}`,
      ).catch(() => []),
    ),
  );
  const messagesPerRun = await Promise.all(
    runs.map((run) =>
      requestJson<MessageRecord[]>(
        `/api/v1/messages?runId=${encodeURIComponent(run.id)}`,
      ).catch(() => []),
    ),
  );

  return {
    repositories,
    runs,
    tasks: details.flatMap((detail) => detail.tasks ?? []),
    agents: details.flatMap((detail) => detail.agents ?? []),
    sessions: details.flatMap((detail) => detail.sessions ?? []),
    workerNodes,
    approvals: approvalsPerRun.flat(),
    validations: validationsPerRun.flat(),
    artifacts: artifactsPerRun.flat(),
    messages: messagesPerRun.flat(),
    source: "api",
  };
}

export async function loadDashboardData(): Promise<LoadResult> {
  try {
    const data = await loadFromApi();
    return {
      data,
      source: "api",
      fallbackReason: null,
    };
  } catch (error) {
    return {
      data: mockDashboardData,
      source: "mock",
      fallbackReason:
        error instanceof Error
          ? error.message
          : "Unable to reach the codex-swarm API",
    };
  }
}
