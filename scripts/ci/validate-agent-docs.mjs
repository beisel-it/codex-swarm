import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];

const requiredFiles = [
  "AGENTS.md",
  "LLMS.md",
  "CLAUDE.md",
  "AGENT.md",
  ".github/copilot-instructions.md",
  "apps/api/AGENTS.md",
  "frontend/AGENTS.md",
  "packages/contracts/AGENTS.md",
  ".github/agents/plan-architect.md",
  ".github/agents/backend-api.md",
  ".github/agents/frontend-ui.md",
  ".github/agents/contracts-schema.md",
  ".github/agents/review-qa.md",
  ".github/agents/ops-docs.md",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    failures.push(`Missing required file: ${file}`);
  }
}

if (existsSync("LLMS.md")) {
  const llms = readFileSync("LLMS.md", "utf8");
  const llmsSize = statSync("LLMS.md").size;
  const requiredHeadings = [
    "## Summary",
    "## Key Directories",
    "## Entry Points",
    "## Ignore / Deprioritize",
    "## Run & Test",
    "## Reasoning Hints",
  ];

  if (llmsSize > 100 * 1024) {
    failures.push(`LLMS.md exceeds 100 KB (${llmsSize} bytes).`);
  }

  for (const heading of requiredHeadings) {
    if (!llms.includes(heading)) {
      failures.push(`LLMS.md is missing heading: ${heading}`);
    }
  }
}

if (existsSync("AGENTS.md")) {
  const agents = readFileSync("AGENTS.md", "utf8");
  for (const heading of [
    "## Autonomy Rules",
    "## Run & Verify",
    "## Documentation Map",
  ]) {
    if (!agents.includes(heading)) {
      failures.push(`AGENTS.md is missing heading: ${heading}`);
    }
  }
}

for (const file of ["CLAUDE.md", "AGENT.md", ".github/copilot-instructions.md"]) {
  if (!existsSync(file)) {
    continue;
  }

  const contents = readFileSync(file, "utf8");
  if (!contents.includes("AGENTS.md")) {
    failures.push(`${file} does not point back to AGENTS.md.`);
  }
}

const referencedPaths = [
  "apps/api/src/server.ts",
  "apps/worker/src/index.ts",
  "apps/cli/src/bin/codex-swarm.ts",
  "frontend/src/main.tsx",
  "packages/contracts/src/index.ts",
  "packages/orchestration/src/index.ts",
  ".agents/skills/README.md",
  ".codex/agents",
  ".swarm/plan.md",
  ".swarm/status.md",
];

for (const target of referencedPaths) {
  if (!existsSync(target)) {
    failures.push(`Referenced path does not exist: ${target}`);
  }
}

if (failures.length > 0) {
  console.error("Agent-document validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Agent-document validation passed.");
