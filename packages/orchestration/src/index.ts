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
