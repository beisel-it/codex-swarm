import type { AgentTeamTemplate } from "@codex-swarm/contracts";

export const agentTeamTemplates: AgentTeamTemplate[] = [
  {
    id: "development-stack",
    name: "Development stack",
    summary: "Leader, design, frontend, backend, review, QA, and docs coverage for product delivery slices.",
    focus: "delivery",
    suggestedGoal: "Ship the next product iteration through codex-swarm with real implementation, review, and verification evidence.",
    suggestedConcurrencyCap: 4,
    members: [
      {
        key: "leader",
        displayName: "Leader",
        roleProfile: "leader",
        responsibility: "Own sequencing, task DAG updates, and milestone acceptance."
      },
      {
        key: "designer",
        displayName: "Designer",
        roleProfile: "designer",
        responsibility: "Define information architecture, interaction states, and screenshot-backed UI targets."
      },
      {
        key: "frontend",
        displayName: "Frontend Developer",
        roleProfile: "frontend-developer",
        responsibility: "Implement browser and TUI product surfaces against live contracts."
      },
      {
        key: "backend",
        displayName: "Backend Developer",
        roleProfile: "backend-developer",
        responsibility: "Implement API, orchestration, runtime, and persistence slices."
      },
      {
        key: "reviewer",
        displayName: "Reviewer",
        roleProfile: "reviewer",
        responsibility: "Find correctness, regression, and integration defects before closure."
      },
      {
        key: "tester",
        displayName: "Tester",
        roleProfile: "tester",
        responsibility: "Prove acceptance with repeatable checks and end-to-end evidence."
      },
      {
        key: "writer",
        displayName: "Technical Writer",
        roleProfile: "technical-writer",
        responsibility: "Keep operator and rollout docs aligned to shipped behavior."
      }
    ]
  },
  {
    id: "platform-ops-stack",
    name: "Platform / ops stack",
    summary: "Leader, infrastructure, backend, review, QA, and docs coverage for deployment and runtime reliability work.",
    focus: "platform",
    suggestedGoal: "Deploy, harden, and verify codex-swarm runtime topology without exposing unintended services.",
    suggestedConcurrencyCap: 3,
    members: [
      {
        key: "leader",
        displayName: "Leader",
        roleProfile: "leader",
        responsibility: "Own rollout sequencing, unblock dependencies, and close the operational objective."
      },
      {
        key: "architect",
        displayName: "Architect",
        roleProfile: "architect",
        responsibility: "Define topology, contracts, and durable operational boundaries."
      },
      {
        key: "infra",
        displayName: "Infrastructure Engineer",
        roleProfile: "infrastructure-engineer",
        responsibility: "Implement service packaging, CI/CD, runtime config, and private exposure rules."
      },
      {
        key: "backend",
        displayName: "Backend Developer",
        roleProfile: "backend-developer",
        responsibility: "Close runtime and orchestration gaps exposed by the platform goal."
      },
      {
        key: "reviewer",
        displayName: "Reviewer",
        roleProfile: "reviewer",
        responsibility: "Review rollout, regression, and operational risk."
      },
      {
        key: "tester",
        displayName: "Tester",
        roleProfile: "tester",
        responsibility: "Prove deployment, recovery, and service behavior in the target topology."
      },
      {
        key: "writer",
        displayName: "Technical Writer",
        roleProfile: "technical-writer",
        responsibility: "Update runbooks, operator docs, and recovery guidance."
      }
    ]
  }
];
