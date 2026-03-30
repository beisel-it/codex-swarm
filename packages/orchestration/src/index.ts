export function resolveInitialTaskStatus(dependencyIds: string[]) {
  return dependencyIds.length > 0 ? "blocked" : "pending";
}

export function areDependencyStatusesComplete(statuses: string[]) {
  return statuses.every((status) => status === "completed");
}

export interface LeaderPlanTask {
  key: string;
  title: string;
  role: string;
  description: string;
  acceptanceCriteria: string[];
  dependencyKeys: string[];
}

export interface LeaderPlan {
  summary?: string;
  tasks: LeaderPlanTask[];
}

export type WorkerCoordinationMessageTarget =
  | "leader"
  | "broadcast"
  | `agent:${string}`
  | `role:${string}`;

export interface WorkerCoordinationMessage {
  target: WorkerCoordinationMessageTarget;
  body: string;
}

export interface WorkerOutcomeArtifact {
  kind: "plan" | "patch" | "log" | "report" | "diff" | "screenshot" | "pr_link" | "other";
  path: string;
  contentType: string;
  contentBase64?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkerOutcomeBranchPublish {
  branchName?: string;
  commitSha?: string;
  notes?: string;
}

export interface WorkerOutcomePullRequestHandoff {
  title: string;
  body: string;
  baseBranch?: string;
  headBranch?: string;
  url?: string;
  number?: number;
  status?: "draft" | "open" | "merged" | "closed";
}

export interface WorkerTaskOutcome {
  summary: string;
  status: "completed" | "needs_slicing" | "blocked";
  messages: WorkerCoordinationMessage[];
  blockingIssues: string[];
  artifacts?: WorkerOutcomeArtifact[];
  branchPublish?: WorkerOutcomeBranchPublish;
  pullRequestHandoff?: WorkerOutcomePullRequestHandoff;
}

export interface RunExecutionContextLike {
  externalInput?: unknown;
  values?: Record<string, unknown>;
}

const leaderPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    summary: { type: "string" },
    tasks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "title", "role", "description", "acceptanceCriteria", "dependencyKeys"],
        properties: {
          key: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          role: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          acceptanceCriteria: { type: "array", items: { type: "string" } },
          dependencyKeys: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
} as const;

const workerTaskOutcomeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "status", "messages", "blockingIssues"],
  properties: {
    summary: { type: "string", minLength: 1 },
    status: { type: "string", enum: ["completed", "needs_slicing", "blocked"] },
    messages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["target", "body"],
        properties: {
          target: { type: "string", minLength: 1 },
          body: { type: "string", minLength: 1 }
        }
      }
    },
    blockingIssues: { type: "array", items: { type: "string" } },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "path", "contentType"],
        properties: {
          kind: { type: "string", enum: ["plan", "patch", "log", "report", "diff", "screenshot", "pr_link", "other"] },
          path: { type: "string", minLength: 1 },
          contentType: { type: "string", minLength: 1 },
          contentBase64: { type: "string", minLength: 1 },
          metadata: { type: "object" }
        }
      }
    },
    branchPublish: {
      type: "object",
      additionalProperties: false,
      properties: {
        branchName: { type: "string", minLength: 1 },
        commitSha: { type: "string", minLength: 1 },
        notes: { type: "string", minLength: 1 }
      }
    },
    pullRequestHandoff: {
      type: "object",
      additionalProperties: false,
      required: ["title", "body"],
      properties: {
        title: { type: "string", minLength: 1 },
        body: { type: "string", minLength: 1 },
        baseBranch: { type: "string", minLength: 1 },
        headBranch: { type: "string", minLength: 1 },
        url: { type: "string", minLength: 1 },
        number: { type: "number", minimum: 1 },
        status: { type: "string", enum: ["draft", "open", "merged", "closed"] }
      }
    }
  }
} as const;

function parseStringField(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`leader plan ${fieldName} must be a non-empty string`);
  }

  return value;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function extractJsonDocument(output: string) {
  const trimmed = output.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  throw new Error("output must be exactly one JSON object");
}

function shouldRenderRunContext(context?: RunExecutionContextLike | null) {
  if (!context) {
    return false;
  }

  if (context.externalInput !== null && context.externalInput !== undefined) {
    return true;
  }

  return Object.keys(context.values ?? {}).length > 0;
}

export function formatRunExecutionContext(context?: RunExecutionContextLike | null) {
  if (!shouldRenderRunContext(context)) {
    return null;
  }

  return [
    "Run context:",
    JSON.stringify(context, null, 2)
  ].join("\n");
}

export function buildLeaderPlanningPrompt(goal: string, runContext?: RunExecutionContextLike | null) {
  return [
    "You are the leader agent for a Codex Swarm orchestration run.",
    `Goal: ${goal}`,
    ...(formatRunExecutionContext(runContext)
      ? ["", formatRunExecutionContext(runContext) as string]
      : []),
    "",
    "Return exactly one JSON object and nothing else.",
    "The response must start with `{` and end with `}`.",
    "Do not include markdown fences, prose, headings, explanations, or any text outside the JSON object.",
    "Follow this JSON Schema exactly:",
    JSON.stringify(leaderPlanSchema, null, 2),
    "",
    "Rules:",
    "- provide at least one task",
    "- keys must be unique",
    "- dependencyKeys must reference earlier or later task keys in the same JSON",
    "- use concrete role names such as `frontend-developer`, `backend-developer`, `infrastructure-engineer`, `technical-writer`, or `tech-lead`",
    "- do not add any properties beyond the schema"
  ].join("\n");
}

export function buildWorkerTaskExecutionPrompt(input: {
  repositoryName: string;
  runGoal: string;
  runContext?: {
    kind: "project" | "ad_hoc";
    projectName?: string | null;
    jobName?: string | null;
  };
  taskTitle: string;
  taskRole: string;
  taskDescription: string;
  acceptanceCriteria: string[];
  runContext?: RunExecutionContextLike | null;
  inboundMessages?: Array<{
    sender: string;
    body: string;
  }>;
}) {
  const acceptanceCriteria = input.acceptanceCriteria.length > 0
    ? input.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")
    : "- Complete the assigned task and leave clear implementation notes.";
  const inbox = (input.inboundMessages ?? []).length > 0
    ? (input.inboundMessages ?? [])
      .map((message) => `- ${message.sender}: ${message.body}`)
      .join("\n")
    : "- No inbound agent messages.";
  const runContextLine = input.runContext?.kind === "project"
    ? `Run context: Project${input.runContext.projectName ? ` ${input.runContext.projectName}` : ""}${input.runContext.jobName ? ` / Job ${input.runContext.jobName}` : ""}`
    : "Run context: Ad-Hoc job";

  return [
    `Repository: ${input.repositoryName}`,
    `Run goal: ${input.runGoal}`,
    ...(formatRunExecutionContext(input.runContext)
      ? [formatRunExecutionContext(input.runContext) as string]
      : []),
    `Task: ${input.taskTitle}`,
    `Role: ${input.taskRole}`,
    "",
    input.taskDescription,
    "",
    "Acceptance criteria:",
    acceptanceCriteria,
    "",
    "Inbound agent messages:",
    inbox,
    "",
    "Return exactly one JSON object and nothing else.",
    "The response must start with `{` and end with `}`.",
    "Do not include markdown fences, prose, headings, explanations, or any text outside the JSON object.",
    "Follow this JSON Schema exactly:",
    JSON.stringify(workerTaskOutcomeSchema, null, 2),
    "",
    "Rules:",
    "- every message target must be one of `leader`, `broadcast`, `role:<role>`, or `agent:<agentId>`",
    "- Use completed when the task can stand as done for this slice.",
    "- Use needs_slicing when the task should be broken into smaller follow-on tasks.",
    "- Use blocked when an external blocker prevents useful progress.",
    "- Include a leader message whenever status is needs_slicing or blocked.",
    "- If you publish a branch, include branchPublish with the published branch details.",
    "- If you open or prepare a PR handoff, include pullRequestHandoff with the PR details.",
    "- If you produce durable evidence worth surfacing in codex-swarm, include it in artifacts.",
    "- do not add any properties beyond the schema"
  ].join("\n");
}

export function buildLeaderReslicePrompt(input: {
  goal: string;
  taskTitle: string;
  taskRole: string;
  taskDescription: string;
  workerSummary: string;
  blockingIssues: string[];
  messages: WorkerCoordinationMessage[];
}) {
  const blockingIssues = input.blockingIssues.length > 0
    ? input.blockingIssues.map((issue) => `- ${issue}`).join("\n")
    : "- No explicit blocking issues were reported.";
  const workerMessages = input.messages.length > 0
    ? input.messages.map((message) => `- ${message.target}: ${message.body}`).join("\n")
    : "- No explicit worker coordination messages were returned.";

  return [
    "You are continuing the leader orchestration session for a running Codex Swarm run.",
    `Goal: ${input.goal}`,
    `Parent task: ${input.taskTitle}`,
    `Parent role: ${input.taskRole}`,
    "",
    "Parent task description:",
    input.taskDescription,
    "",
    `Worker outcome summary: ${input.workerSummary}`,
    "",
    "Blocking issues:",
    blockingIssues,
    "",
    "Worker coordination messages:",
    workerMessages,
    "",
    "Return exactly one JSON object and nothing else.",
    "The response must start with `{` and end with `}`.",
    "Do not include markdown fences, prose, headings, explanations, or any text outside the JSON object.",
    "Follow this JSON Schema exactly:",
    JSON.stringify(leaderPlanSchema, null, 2),
    "",
    "Rules:",
    "- Return at least one follow-on task when the worker asked for more slicing.",
    "- dependencyKeys may only reference keys from the same response.",
    "- Keep the tasks specific enough for workers to execute without hidden context.",
    "- do not add any properties beyond the schema"
  ].join("\n");
}

export function parseLeaderPlanOutput(output: string): LeaderPlan {
  const parsed = JSON.parse(extractJsonDocument(output)) as Partial<LeaderPlan>;

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error("leader plan output must contain at least one task");
  }

  const tasks = parsed.tasks.map((task, index): LeaderPlanTask => {
    if (!task || typeof task !== "object") {
      throw new Error(`leader plan task ${index} is not an object`);
    }

    const candidate = task as Partial<Record<keyof LeaderPlanTask, unknown>>;

    return {
      key: parseStringField(candidate.key, `task ${index} key`),
      title: parseStringField(candidate.title, `task ${index} title`),
      role: parseStringField(candidate.role, `task ${index} role`),
      description: parseStringField(candidate.description, `task ${index} description`),
      acceptanceCriteria: parseStringArray(candidate.acceptanceCriteria),
      dependencyKeys: parseStringArray(candidate.dependencyKeys)
    };
  });

  return {
    ...(typeof parsed.summary === "string" ? { summary: parsed.summary } : {}),
    tasks
  };
}

export function parseWorkerTaskOutcome(output: string): WorkerTaskOutcome {
  const parsed = JSON.parse(extractJsonDocument(output)) as Partial<WorkerTaskOutcome>;

  const summary = parseStringField(parsed.summary, "worker outcome summary");
  const status = parsed.status;

  if (status !== "needs_slicing" && status !== "blocked" && status !== "completed") {
    throw new Error("worker outcome status must be completed, needs_slicing, or blocked");
  }

  if (!Array.isArray(parsed.messages)) {
    throw new Error("worker outcome messages must be an array");
  }

  const messages = parsed.messages.map((message, index) => {
    if (!message || typeof message !== "object") {
      throw new Error(`worker outcome message ${index} is not an object`);
    }

    const target = parseStringField((message as { target?: unknown }).target, `worker outcome message ${index} target`);
    const body = parseStringField((message as { body?: unknown }).body, `worker outcome message ${index} body`);

    if (target !== "leader" && target !== "broadcast" && !target.startsWith("agent:") && !target.startsWith("role:")) {
      throw new Error(`worker outcome message ${index} target is invalid`);
    }

    return {
      target: target as WorkerCoordinationMessageTarget,
      body
    };
  });

  const blockingIssues = parseStringArray(parsed.blockingIssues);
  const artifacts = Array.isArray(parsed.artifacts)
    ? parsed.artifacts.map((artifact, index): WorkerOutcomeArtifact => {
      if (!artifact || typeof artifact !== "object") {
        throw new Error(`worker outcome artifact ${index} is not an object`);
      }

      const candidate = artifact as Partial<WorkerOutcomeArtifact>;
      const kind = parseStringField(candidate.kind, `worker outcome artifact ${index} kind`);

      if (!["plan", "patch", "log", "report", "diff", "screenshot", "pr_link", "other"].includes(kind)) {
        throw new Error(`worker outcome artifact ${index} kind is invalid`);
      }

      return {
        kind: kind as WorkerOutcomeArtifact["kind"],
        path: parseStringField(candidate.path, `worker outcome artifact ${index} path`),
        contentType: parseStringField(candidate.contentType, `worker outcome artifact ${index} contentType`),
        ...(typeof candidate.contentBase64 === "string" && candidate.contentBase64.length > 0
          ? { contentBase64: candidate.contentBase64 }
          : {}),
        ...(candidate.metadata && typeof candidate.metadata === "object"
          ? { metadata: candidate.metadata as Record<string, unknown> }
          : {})
      };
    })
    : [];

  let branchPublish: WorkerOutcomeBranchPublish | undefined;
  if (parsed.branchPublish !== undefined) {
    if (!parsed.branchPublish || typeof parsed.branchPublish !== "object") {
      throw new Error("worker outcome branchPublish must be an object");
    }
    const candidate = parsed.branchPublish as Partial<WorkerOutcomeBranchPublish>;
    branchPublish = {
      ...(typeof candidate.branchName === "string" && candidate.branchName.trim().length > 0
        ? { branchName: candidate.branchName }
        : {}),
      ...(typeof candidate.commitSha === "string" && candidate.commitSha.trim().length > 0
        ? { commitSha: candidate.commitSha }
        : {}),
      ...(typeof candidate.notes === "string" && candidate.notes.trim().length > 0
        ? { notes: candidate.notes }
        : {})
    };
  }

  let pullRequestHandoff: WorkerOutcomePullRequestHandoff | undefined;
  if (parsed.pullRequestHandoff !== undefined) {
    if (!parsed.pullRequestHandoff || typeof parsed.pullRequestHandoff !== "object") {
      throw new Error("worker outcome pullRequestHandoff must be an object");
    }

    const candidate = parsed.pullRequestHandoff as Partial<WorkerOutcomePullRequestHandoff>;
    pullRequestHandoff = {
      title: parseStringField(candidate.title, "worker outcome pullRequestHandoff title"),
      body: parseStringField(candidate.body, "worker outcome pullRequestHandoff body"),
      ...(typeof candidate.baseBranch === "string" && candidate.baseBranch.trim().length > 0
        ? { baseBranch: candidate.baseBranch }
        : {}),
      ...(typeof candidate.headBranch === "string" && candidate.headBranch.trim().length > 0
        ? { headBranch: candidate.headBranch }
        : {}),
      ...(typeof candidate.url === "string" && candidate.url.trim().length > 0
        ? { url: candidate.url }
        : {}),
      ...(typeof candidate.number === "number" && Number.isInteger(candidate.number) && candidate.number > 0
        ? { number: candidate.number }
        : {}),
      ...(candidate.status === "draft" || candidate.status === "open" || candidate.status === "merged" || candidate.status === "closed"
        ? { status: candidate.status }
        : {})
    };
  }

  return {
    summary,
    status,
    messages,
    blockingIssues,
    ...(artifacts.length > 0 ? { artifacts } : {}),
    ...(branchPublish && Object.keys(branchPublish).length > 0 ? { branchPublish } : {}),
    ...(pullRequestHandoff ? { pullRequestHandoff } : {})
  };
}

export function orderLeaderPlanTasks(plan: LeaderPlan): LeaderPlanTask[] {
  const tasksByKey = new Map(plan.tasks.map((task) => [task.key, task] as const));

  for (const task of plan.tasks) {
    for (const dependencyKey of task.dependencyKeys) {
      if (!tasksByKey.has(dependencyKey)) {
        throw new Error(`leader plan task ${task.key} references missing dependency ${dependencyKey}`);
      }
    }
  }

  const pending = new Map<string, Set<string>>(plan.tasks.map((task) => [task.key, new Set(task.dependencyKeys)] as const));
  const emitted = new Set<string>();
  const ordered: LeaderPlanTask[] = [];

  while (ordered.length < plan.tasks.length) {
    const ready = plan.tasks.filter((task) => !emitted.has(task.key) && (pending.get(task.key)?.size ?? 0) === 0);

    if (ready.length === 0) {
      throw new Error("leader plan task graph contains a cycle");
    }

    for (const task of ready) {
      emitted.add(task.key);
      ordered.push(task);

      for (const dependencySet of pending.values()) {
        dependencySet.delete(task.key);
      }
    }
  }

  return ordered;
}
