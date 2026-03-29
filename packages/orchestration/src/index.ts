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

export interface WorkerTaskOutcome {
  summary: string;
  status: "completed" | "needs_slicing" | "blocked";
  messages: WorkerCoordinationMessage[];
  blockingIssues: string[];
}

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

  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  const fencedJson = trimmed.match(/```json\s*([\s\S]+?)```/i);

  if (fencedJson?.[1]) {
    return fencedJson[1].trim();
  }

  const genericFence = trimmed.match(/```\s*([\s\S]+?)```/);

  if (genericFence?.[1]) {
    return genericFence[1].trim();
  }

  throw new Error("leader plan output did not contain a JSON document");
}

export function buildLeaderPlanningPrompt(goal: string) {
  return [
    "You are the leader agent for a Codex Swarm orchestration run.",
    `Goal: ${goal}`,
    "",
    "Respond with JSON only using this shape:",
    "{",
    '  "summary": "short plan summary",',
    '  "tasks": [',
    "    {",
    '      "key": "leader-plan",',
    '      "title": "Draft the plan",',
    '      "role": "tech-lead",',
    '      "description": "clear task description",',
    '      "acceptanceCriteria": ["criterion"],',
    '      "dependencyKeys": []',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- provide at least one task",
    "- keys must be unique",
    "- dependencyKeys must reference earlier or later task keys in the same JSON",
    "- do not include markdown outside the JSON object"
  ].join("\n");
}

export function buildWorkerTaskExecutionPrompt(input: {
  repositoryName: string;
  runGoal: string;
  taskTitle: string;
  taskRole: string;
  taskDescription: string;
  acceptanceCriteria: string[];
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

  return [
    `Repository: ${input.repositoryName}`,
    `Run goal: ${input.runGoal}`,
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
    "Respond with JSON only using this shape:",
    "{",
    '  "summary": "short outcome summary",',
    '  "status": "completed | needs_slicing | blocked",',
    '  "messages": [',
    "    {",
    '      "target": "leader | broadcast | role:<role> | agent:<agentId>",',
    '      "body": "message text"',
    "    }",
    "  ],",
    '  "blockingIssues": ["issue summary"]',
    "}",
    "",
    "Rules:",
    "- Use completed when the task can stand as done for this slice.",
    "- Use needs_slicing when the task should be broken into smaller follow-on tasks.",
    "- Use blocked when an external blocker prevents useful progress.",
    "- Include a leader message whenever status is needs_slicing or blocked.",
    "- Do not include markdown outside the JSON object."
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
    "Respond with JSON only using this shape:",
    "{",
    '  "summary": "short coordination summary",',
    '  "tasks": [',
    "    {",
    '      "key": "slice-a",',
    '      "title": "follow-on task title",',
    '      "role": "backend-developer",',
    '      "description": "clear task description",',
    '      "acceptanceCriteria": ["criterion"],',
    '      "dependencyKeys": []',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Return at least one follow-on task when the worker asked for more slicing.",
    "- dependencyKeys may only reference keys from the same response.",
    "- Keep the tasks specific enough for workers to execute without hidden context.",
    "- Do not include markdown outside the JSON object."
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
  try {
    const parsed = JSON.parse(extractJsonDocument(output)) as Partial<WorkerTaskOutcome>;

    const summary = typeof parsed.summary === "string" && parsed.summary.trim().length > 0
      ? parsed.summary
      : output.trim() || "Worker completed the task.";
    const status = parsed.status === "needs_slicing" || parsed.status === "blocked" || parsed.status === "completed"
      ? parsed.status
      : "completed";
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.flatMap((message) => {
        if (!message || typeof message !== "object") {
          return [];
        }

        const target = (message as { target?: unknown }).target;
        const body = (message as { body?: unknown }).body;

        if (typeof target !== "string" || typeof body !== "string" || body.trim().length === 0) {
          return [];
        }

        if (target !== "leader" && target !== "broadcast" && !target.startsWith("agent:") && !target.startsWith("role:")) {
          return [];
        }

        return [{
          target: target as WorkerCoordinationMessageTarget,
          body
        }];
      })
      : [];
    const blockingIssues = Array.isArray(parsed.blockingIssues)
      ? parsed.blockingIssues.filter((issue): issue is string => typeof issue === "string" && issue.trim().length > 0)
      : [];

    return {
      summary,
      status,
      messages,
      blockingIssues
    };
  } catch {
    return {
      summary: output.trim() || "Worker completed the task.",
      status: "completed",
      messages: [],
      blockingIssues: []
    };
  }
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
