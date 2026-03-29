import { describe, expect, it } from "vitest";

import {
  areDependencyStatusesComplete,
  buildLeaderPlanningPrompt,
  buildLeaderReslicePrompt,
  buildWorkerTaskExecutionPrompt,
  orderLeaderPlanTasks,
  parseLeaderPlanOutput,
  parseWorkerTaskOutcome,
  resolveInitialTaskStatus
} from "../src/index.js";

describe("resolveInitialTaskStatus", () => {
  it("marks independent tasks as pending", () => {
    expect(resolveInitialTaskStatus([])).toBe("pending");
  });

  it("marks dependent tasks as blocked", () => {
    expect(resolveInitialTaskStatus(["task-1"])).toBe("blocked");
  });
});

describe("areDependencyStatusesComplete", () => {
  it("returns true only when every dependency is completed", () => {
    expect(areDependencyStatusesComplete(["completed", "completed"])).toBe(true);
    expect(areDependencyStatusesComplete(["completed", "blocked"])).toBe(false);
  });

  it("treats an empty dependency list as complete", () => {
    expect(areDependencyStatusesComplete([])).toBe(true);
  });
});

describe("parseLeaderPlanOutput", () => {
  it("parses plain JSON leader plans", () => {
    const plan = parseLeaderPlanOutput(JSON.stringify({
      summary: "Ship the first slice",
      tasks: [
        {
          key: "leader-plan",
          title: "Draft the plan",
          role: "tech-lead",
          description: "Outline the work",
          acceptanceCriteria: ["plan exists"],
          dependencyKeys: []
        }
      ]
    }));

    expect(plan.summary).toBe("Ship the first slice");
    expect(plan.tasks).toHaveLength(1);
  });

  it("rejects wrapped or fenced output", () => {
    expect(() => parseLeaderPlanOutput([
      "```json",
      "{",
      '  "tasks": [',
      "    {",
      '      "key": "leader-plan",',
      '      "title": "Draft the plan",',
      '      "role": "tech-lead",',
      '      "description": "Outline the work",',
      '      "acceptanceCriteria": [],',
      '      "dependencyKeys": []',
      "    }",
      "  ]",
      "}",
      "```"
    ].join("\n"))).toThrow(/exactly one JSON object|must be exactly one JSON object/);
  });
});

describe("orderLeaderPlanTasks", () => {
  it("topologically orders task dependencies", () => {
    const ordered = orderLeaderPlanTasks({
      summary: "Deliver the feature",
      tasks: [
        {
          key: "worker-impl",
          title: "Implement the feature",
          role: "backend-dev",
          description: "Write the code",
          acceptanceCriteria: ["tests pass"],
          dependencyKeys: ["leader-plan"]
        },
        {
          key: "leader-plan",
          title: "Draft the plan",
          role: "tech-lead",
          description: "Plan the work",
          acceptanceCriteria: ["plan approved"],
          dependencyKeys: []
        }
      ]
    });

    expect(ordered.map((task) => task.key)).toEqual(["leader-plan", "worker-impl"]);
  });

  it("rejects cyclic task graphs", () => {
    expect(() => orderLeaderPlanTasks({
      tasks: [
        {
          key: "a",
          title: "A",
          role: "tech-lead",
          description: "A",
          acceptanceCriteria: [],
          dependencyKeys: ["b"]
        },
        {
          key: "b",
          title: "B",
          role: "backend-dev",
          description: "B",
          acceptanceCriteria: [],
          dependencyKeys: ["a"]
        }
      ]
    })).toThrow(/cycle/);
  });
});

describe("buildLeaderPlanningPrompt", () => {
  it("includes the run goal and JSON schema guidance", () => {
    const prompt = buildLeaderPlanningPrompt("Ship a hello-world planning loop");
    expect(prompt).toContain("Ship a hello-world planning loop");
    expect(prompt).toContain("\"tasks\"");
    expect(prompt).toContain("Follow this JSON Schema exactly:");
    expect(prompt).toContain("\"additionalProperties\": false");
  });
});

describe("buildWorkerTaskExecutionPrompt", () => {
  it("includes inbox context and JSON instructions", () => {
    const prompt = buildWorkerTaskExecutionPrompt({
      repositoryName: "codex-swarm",
      runGoal: "Ship the next slice",
      taskTitle: "Implement the worker path",
      taskRole: "backend-developer",
      taskDescription: "Patch the worker path",
      acceptanceCriteria: ["tests pass"],
      inboundMessages: [
        {
          sender: "leader",
          body: "Take the task and report blockers."
        }
      ]
    });

    expect(prompt).toContain("Inbound agent messages:");
    expect(prompt).toContain("leader: Take the task and report blockers.");
    expect(prompt).toContain("\"enum\": [");
    expect(prompt).toContain("\"needs_slicing\"");
  });
});

describe("buildLeaderReslicePrompt", () => {
  it("includes the worker outcome and reslice contract", () => {
    const prompt = buildLeaderReslicePrompt({
      goal: "Deliver the next slice",
      taskTitle: "Initial worker task",
      taskRole: "backend-developer",
      taskDescription: "Investigate and split if needed.",
      workerSummary: "Need smaller slices.",
      blockingIssues: ["Too much work for one agent"],
      messages: [
        {
          target: "leader",
          body: "Please split this into smaller tasks."
        }
      ]
    });

    expect(prompt).toContain("Worker outcome summary: Need smaller slices.");
    expect(prompt).toContain("\"tasks\"");
    expect(prompt).toContain("Please split this into smaller tasks.");
    expect(prompt).toContain("Follow this JSON Schema exactly:");
  });
});

describe("parseWorkerTaskOutcome", () => {
  it("parses a structured worker outcome document", () => {
    const outcome = parseWorkerTaskOutcome(JSON.stringify({
      summary: "Need smaller follow-on slices.",
      status: "needs_slicing",
      messages: [
        {
          target: "leader",
          body: "Please break this into schema and API tasks."
        },
        {
          target: "role:frontend-developer",
          body: "Frontend review will be needed after the API lands."
        }
      ],
      blockingIssues: ["Current task spans too many concerns."]
    }));

    expect(outcome.status).toBe("needs_slicing");
    expect(outcome.messages).toHaveLength(2);
    expect(outcome.blockingIssues).toEqual(["Current task spans too many concerns."]);
  });

  it("rejects non-json worker output", () => {
    expect(() => parseWorkerTaskOutcome("plain worker output")).toThrow(/exactly one JSON object|must be exactly one JSON object/);
  });
});
