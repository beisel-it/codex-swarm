import { describe, expect, it } from "vitest";

import {
  areDependencyStatusesComplete,
  buildLeaderPlanningPrompt,
  orderLeaderPlanTasks,
  parseLeaderPlanOutput,
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

  it("parses fenced JSON leader plans", () => {
    const plan = parseLeaderPlanOutput([
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
    ].join("\n"));

    expect(plan.tasks[0]?.key).toBe("leader-plan");
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
  it("includes the run goal and JSON contract guidance", () => {
    const prompt = buildLeaderPlanningPrompt("Ship a hello-world planning loop");
    expect(prompt).toContain("Ship a hello-world planning loop");
    expect(prompt).toContain("\"tasks\"");
    expect(prompt).toContain("Respond with JSON only");
  });
});
