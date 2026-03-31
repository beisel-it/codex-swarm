import { describe, expect, it } from "vitest";

import {
  areDependencyStatusesComplete,
  buildLeaderUnblockPrompt,
  buildLeaderPlanningPrompt,
  buildLeaderReslicePrompt,
  buildVerifierTaskExecutionPrompt,
  buildWorkerTaskExecutionPrompt,
  formatRunExecutionContext,
  normalizeLeaderPlanTasks,
  orderLeaderPlanTasks,
  parseLeaderPlanOutput,
  parseVerifierTaskOutcome,
  parseWorkerTaskOutcome,
  resolveInitialTaskStatus,
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
    expect(areDependencyStatusesComplete(["completed", "completed"])).toBe(
      true,
    );
    expect(areDependencyStatusesComplete(["completed", "blocked"])).toBe(false);
  });

  it("treats an empty dependency list as complete", () => {
    expect(areDependencyStatusesComplete([])).toBe(true);
  });
});

describe("parseLeaderPlanOutput", () => {
  it("parses plain JSON leader plans", () => {
    const plan = parseLeaderPlanOutput(
      JSON.stringify({
        summary: "Ship the first slice",
        tasks: [
          {
            key: "leader-plan",
            title: "Draft the plan",
            role: "tech-lead",
            description: "Outline the work",
            definitionOfDone: ["plan artifact is persisted for the run"],
            acceptanceCriteria: ["plan exists"],
            dependencyKeys: [],
          },
        ],
      }),
    );

    expect(plan.summary).toBe("Ship the first slice");
    expect(plan.tasks).toHaveLength(1);
  });

  it("rejects wrapped or fenced output", () => {
    expect(() =>
      parseLeaderPlanOutput(
        [
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
          "```",
        ].join("\n"),
      ),
    ).toThrow(/exactly one JSON object|must be exactly one JSON object/);
  });

  it("requires definitionOfDone for every planned task", () => {
    expect(() =>
      parseLeaderPlanOutput(
        JSON.stringify({
          tasks: [
            {
              key: "leader-plan",
              title: "Draft the plan",
              role: "tech-lead",
              description: "Outline the work",
              acceptanceCriteria: ["plan exists"],
              dependencyKeys: [],
            },
          ],
        }),
      ),
    ).toThrow(/definitionOfDone/);
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
          definitionOfDone: ["tests pass for the implemented feature"],
          acceptanceCriteria: ["tests pass"],
          dependencyKeys: ["leader-plan"],
        },
        {
          key: "leader-plan",
          title: "Draft the plan",
          role: "tech-lead",
          description: "Plan the work",
          definitionOfDone: ["plan scope is defined and reviewable"],
          acceptanceCriteria: ["plan approved"],
          dependencyKeys: [],
        },
      ],
    });

    expect(ordered.map((task) => task.key)).toEqual([
      "leader-plan",
      "worker-impl",
    ]);
  });

  it("rejects cyclic task graphs", () => {
    expect(() =>
      orderLeaderPlanTasks({
        tasks: [
          {
            key: "a",
            title: "A",
            role: "tech-lead",
            description: "A",
            definitionOfDone: ["A is verifiable"],
            acceptanceCriteria: [],
            dependencyKeys: ["b"],
          },
          {
            key: "b",
            title: "B",
            role: "backend-dev",
            description: "B",
            definitionOfDone: ["B is verifiable"],
            acceptanceCriteria: [],
            dependencyKeys: ["a"],
          },
        ],
      }),
    ).toThrow(/cycle/);
  });
});

describe("normalizeLeaderPlanTasks", () => {
  it("keeps valid plans topologically ordered", () => {
    const ordered = normalizeLeaderPlanTasks({
      tasks: [
        {
          key: "impl",
          title: "Implement",
          role: "backend-developer",
          description: "Ship it",
          definitionOfDone: ["implementation diff is ready for review"],
          acceptanceCriteria: [],
          dependencyKeys: ["plan"],
        },
        {
          key: "plan",
          title: "Plan",
          role: "tech-lead",
          description: "Plan it",
          definitionOfDone: ["plan scope is ready for delegation"],
          acceptanceCriteria: [],
          dependencyKeys: [],
        },
      ],
    });

    expect(ordered.map((task) => task.key)).toEqual(["plan", "impl"]);
  });

  it("rejects cyclic plans instead of silently serializing them", () => {
    expect(() =>
      normalizeLeaderPlanTasks({
        tasks: [
          {
            key: "env-check",
            title: "Verify prerequisites",
            role: "infrastructure-engineer",
            description: "Check the environment",
            definitionOfDone: ["environment prerequisites are verified"],
            acceptanceCriteria: [],
            dependencyKeys: ["stack-start"],
          },
          {
            key: "stack-start",
            title: "Start the stack",
            role: "backend-developer",
            description: "Boot the services",
            definitionOfDone: ["services start successfully"],
            acceptanceCriteria: [],
            dependencyKeys: ["env-check", "ui-validate"],
          },
          {
            key: "ui-validate",
            title: "Validate the UI",
            role: "frontend-developer",
            description: "Open the app",
            definitionOfDone: ["UI loads in the target environment"],
            acceptanceCriteria: [],
            dependencyKeys: ["stack-start"],
          },
        ],
      }),
    ).toThrow(/invalid cyclic dependencies|cycle/);
  });
});

describe("buildLeaderPlanningPrompt", () => {
  it("includes the run goal and JSON schema guidance", () => {
    const prompt = buildLeaderPlanningPrompt(
      "Ship a hello-world planning loop",
    );
    expect(prompt).toContain("Ship a hello-world planning loop");
    expect(prompt).toContain('"tasks"');
    expect(prompt).toContain("Follow this JSON Schema exactly:");
    expect(prompt).toContain('"additionalProperties": false');
  });

  it("includes structured run context when present", () => {
    const prompt = buildLeaderPlanningPrompt(
      "React to an external issue event",
      {
        externalInput: {
          kind: "webhook",
          trigger: {
            id: "trigger-1",
            repeatableRunId: "repeatable-1",
            name: "Issue opened",
            kind: "webhook",
            metadata: {
              provider: "github",
            },
          },
          event: {
            sourceType: "webhook",
            eventName: "issues.opened",
          },
        },
        values: {},
      },
    );

    expect(prompt).toContain("Run context:");
    expect(prompt).toContain('"eventName": "issues.opened"');
    expect(prompt).toContain('"provider": "github"');
  });

  it("tells the leader to reference only earlier dependency keys", () => {
    const prompt = buildLeaderPlanningPrompt(
      "Ship a hello-world planning loop",
    );
    expect(prompt).toContain(
      "dependencyKeys may only reference earlier task keys",
    );
    expect(prompt).toContain("definitionOfDone");
    expect(prompt).toContain("concrete, testable verification checks");
    expect(prompt).toContain(
      "prefer parallel branches when work can proceed independently",
    );
    expect(prompt).toContain("materialize only concrete near-term work");
  });

  it("constrains the leader to roles supplied by the run team", () => {
    const prompt = buildLeaderPlanningPrompt("Ship a studio page", null, [
      {
        role: "design-researcher",
        profile: "design-researcher",
        name: "Design Researcher",
        responsibility: "Research the topic and reference landscape.",
      },
      {
        role: "art-director",
        profile: "art-director",
        name: "Art Director",
        responsibility: "Define the visual thesis.",
      },
      {
        role: "design-engineer",
        profile: "design-engineer",
        name: "Design Engineer",
        responsibility: "Implement the designed experience.",
      },
    ]);

    expect(prompt).toContain("Available team roles:");
    expect(prompt).toContain("`design-researcher`");
    expect(prompt).toContain("`art-director`");
    expect(prompt).toContain("`design-engineer`");
    expect(prompt).toContain(
      "do not invent task roles outside the available team role list",
    );
    expect(prompt).not.toContain(
      "use concrete role names such as `frontend-developer`",
    );
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
      definitionOfDone: ["worker path is implemented and reviewable"],
      acceptanceCriteria: ["tests pass"],
      inboundMessages: [
        {
          sender: "leader",
          body: "Take the task and report blockers.",
        },
      ],
    });

    expect(prompt).toContain("Inbound agent messages:");
    expect(prompt).toContain("Definition of done:");
    expect(prompt).toContain("worker path is implemented and reviewable");
    expect(prompt).toContain("leader: Take the task and report blockers.");
    expect(prompt).toContain('"enum": [');
    expect(prompt).toContain('"needs_slicing"');
    expect(prompt).toContain('"blockerKind"');
    expect(prompt).toContain("blockerKind to `external`");
  });

  it("includes run context when present and omits it for ad-hoc runs", () => {
    const withContext = buildWorkerTaskExecutionPrompt({
      repositoryName: "codex-swarm",
      runGoal: "Handle external triggers",
      runContext: {
        externalInput: {
          kind: "webhook",
          trigger: {
            id: "trigger-1",
            repeatableRunId: "repeatable-1",
            name: "PR opened",
            kind: "webhook",
            metadata: {
              provider: "github",
            },
          },
          event: {
            sourceType: "webhook",
            eventName: "pull_request.opened",
            payload: {
              action: "opened",
            },
          },
        },
        values: {
          receiptId: "receipt-1",
        },
      },
      taskTitle: "Inspect event context",
      taskRole: "backend-developer",
      taskDescription: "Verify the execution prompt",
      definitionOfDone: [
        "execution prompt carries the persisted task contract",
      ],
      acceptanceCriteria: [],
    });
    const withoutContext = buildWorkerTaskExecutionPrompt({
      repositoryName: "codex-swarm",
      runGoal: "Handle manual runs",
      runContext: {
        externalInput: null,
        values: {},
      },
      taskTitle: "Inspect event context",
      taskRole: "backend-developer",
      taskDescription: "Verify the execution prompt",
      definitionOfDone: [],
      acceptanceCriteria: [],
    });

    expect(withContext).toContain("Run context:");
    expect(withContext).toContain('"action": "opened"');
    expect(withContext).toContain('"receiptId": "receipt-1"');
    expect(withoutContext).not.toContain("Run context:");
  });
});

describe("formatRunExecutionContext", () => {
  it("returns null for empty ad-hoc run context", () => {
    expect(
      formatRunExecutionContext({
        externalInput: null,
        values: {},
      }),
    ).toBeNull();
  });
});

describe("buildVerifierTaskExecutionPrompt", () => {
  it("includes definition of done, validations, artifacts, and non-remediation rules", () => {
    const prompt = buildVerifierTaskExecutionPrompt({
      repositoryName: "codex-swarm",
      runGoal: "Ship verifier pairing",
      taskTitle: "Implement review gating",
      taskRole: "backend-developer",
      taskDescription:
        "Inspect the worker output against the stored task contract.",
      definitionOfDone: ["worker completion only advances to verification"],
      acceptanceCriteria: ["review gating is explicit"],
      workerSummary:
        "Worker reports the implementation is ready for verification.",
      artifacts: [
        {
          kind: "report",
          path: ".swarm/reports/worker-summary.md",
          contentType: "text/markdown",
          summary: "Worker summary artifact",
        },
      ],
      validations: [
        {
          name: "typecheck",
          status: "passed",
          command: "pnpm typecheck",
          summary: "Typecheck passed",
          artifactPath: ".swarm/validations/typecheck.json",
        },
      ],
      relevantMessages: [
        {
          sender: "leader",
          body: "Verify the definition of done only.",
        },
      ],
    });

    expect(prompt).toContain(
      "Worker summary: Worker reports the implementation is ready for verification.",
    );
    expect(prompt).toContain("typecheck: passed");
    expect(prompt).toContain(".swarm/reports/worker-summary.md");
    expect(prompt).toContain("Do not create follow-up tasks");
    expect(prompt).toContain('"failed"');
    expect(prompt).toContain('"blocked"');
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
          body: "Please split this into smaller tasks.",
        },
      ],
    });

    expect(prompt).toContain("Worker outcome summary: Need smaller slices.");
    expect(prompt).toContain('"tasks"');
    expect(prompt).toContain("Please split this into smaller tasks.");
    expect(prompt).toContain("Follow this JSON Schema exactly:");
  });
});

describe("parseWorkerTaskOutcome", () => {
  it("parses a structured worker outcome document", () => {
    const outcome = parseWorkerTaskOutcome(
      JSON.stringify({
        summary: "Need smaller follow-on slices.",
        status: "needs_slicing",
        messages: [
          {
            target: "leader",
            body: "Please break this into schema and API tasks.",
          },
          {
            target: "role:frontend-developer",
            body: "Frontend review will be needed after the API lands.",
          },
        ],
        blockingIssues: ["Current task spans too many concerns."],
      }),
    );

    expect(outcome.status).toBe("needs_slicing");
    expect(outcome.messages).toHaveLength(2);
    expect(outcome.blockingIssues).toEqual([
      "Current task spans too many concerns.",
    ]);
  });

  it("parses blocked actionable outcomes", () => {
    const outcome = parseWorkerTaskOutcome(
      JSON.stringify({
        summary: "Missing scaffold work blocks implementation.",
        status: "blocked",
        blockerKind: "actionable",
        messages: [
          {
            target: "leader",
            body: "Please create scaffold follow-up tasks.",
          },
        ],
        blockingIssues: ["Expected scaffold files are missing."],
      }),
    );

    expect(outcome.status).toBe("blocked");
    expect(outcome.blockerKind).toBe("actionable");
  });

  it("rejects non-json worker output", () => {
    expect(() => parseWorkerTaskOutcome("plain worker output")).toThrow(
      /exactly one JSON object|must be exactly one JSON object/,
    );
  });
});

describe("parseVerifierTaskOutcome", () => {
  it("parses structured verifier outcomes", () => {
    const outcome = parseVerifierTaskOutcome(
      JSON.stringify({
        summary: "Definition of done is not satisfied.",
        status: "failed",
        findings: ["The task still marks worker completion as fully complete."],
        changeRequests: [
          "Route worker completion into awaiting_review and queue a verifier assignment.",
        ],
        messages: [
          {
            target: "leader",
            body: "Verification failed; please create one rework task from the change requests.",
          },
        ],
        blockingIssues: [],
        artifacts: [
          {
            kind: "report",
            path: ".swarm/reports/verification.md",
            contentType: "text/markdown",
          },
        ],
      }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.findings).toEqual([
      "The task still marks worker completion as fully complete.",
    ]);
    expect(outcome.changeRequests).toEqual([
      "Route worker completion into awaiting_review and queue a verifier assignment.",
    ]);
  });
});

describe("buildLeaderUnblockPrompt", () => {
  it("asks for unblock follow-on tasks without recreating the parent", () => {
    const prompt = buildLeaderUnblockPrompt({
      goal: "Ship the next homepage revision",
      taskTitle: "Implement homepage",
      taskRole: "frontend-developer",
      taskDescription: "Build the homepage against the approved design.",
      workerSummary: "Missing scaffold work blocks implementation.",
      blockingIssues: ["Expected scaffold files are missing."],
      messages: [
        {
          target: "leader",
          body: "Please create scaffold follow-up tasks.",
        },
      ],
    });

    expect(prompt).toContain("remove or isolate the blocker");
    expect(prompt).toContain("Do not recreate the blocked parent task.");
  });
});
