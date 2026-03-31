module.exports = {
  hero: {
    eyebrow: "Open Source Multi-Agent Delivery",
    title: "Multi-Agent Delivery Control Plane",
    body: "A workflow-oriented API, supervised worker runtime, and operator interfaces for planning, dispatch, review, governance, and publish handoff.",
    supportingPoints: [
      "Model repositories, runs, task DAGs, approvals, validations, artifacts, and audit exports directly.",
      "Dispatch Codex-backed work into isolated worktrees with recovery-aware worker supervision.",
      "Keep blockers, evidence, policy posture, and branch or PR handoff in one operator loop.",
    ],
    primaryCta: {
      label: "View on GitHub",
      href: "https://github.com/beisel-it/codex-swarm",
    },
    secondaryCta: {
      label: "Read the Docs",
      href: "https://github.com/beisel-it/codex-swarm/blob/main/docs/README.md",
    },
    tertiaryCta: {
      label: "See the Operator Journey",
      href: "https://github.com/beisel-it/codex-swarm/blob/main/docs/operator-journey.md",
    },
    proofStrip: [
      "Workflow-oriented API",
      "Isolated worktrees",
      "Dependency-safe task graph",
      "Audit-ready evidence",
    ],
    art: {
      src: "assets/images/art/2026-03-30-23-49-50-orbital-control-plane.png",
      alt: "Abstract orbital control-plane artwork with luminous telemetry rings in deep space",
    },
    screenshot: {
      src: "assets/images/screenshots/run-board.png",
      alt: "Codex Swarm run board screenshot showing the board-first operator workspace",
      label: "Flagship Surface",
      caption:
        "Run Board keeps active work, blockers, approvals, and diagnostics in one control frame.",
    },
  },
  operatorLoop: {
    eyebrow: "Operator Loop",
    title: "From repository trust to publish handoff.",
    intro:
      "Codex Swarm is built around a concrete operating sequence, not a pile of disconnected AI sessions. Each phase keeps context, evidence, and ownership intact.",
    steps: [
      {
        index: "01",
        title: "Onboard",
        body: "Attach provider, workspace, trust, and policy posture to a repository before work starts.",
      },
      {
        index: "02",
        title: "Define Run",
        body: "Create a delivery goal with branch context, concurrency budget, and a dependency-safe task graph.",
      },
      {
        index: "03",
        title: "Dispatch",
        body: "Route slices across Codex-backed agents and supervised workers in isolated worktrees.",
      },
      {
        index: "04",
        title: "Monitor & Review",
        body: "Track blockers, approvals, validations, artifacts, and transcript context from one board-first workspace.",
      },
      {
        index: "05",
        title: "Govern",
        body: "Confirm retention, provenance, policy posture, and audit evidence without digging through raw storage.",
      },
      {
        index: "06",
        title: "Publish Handoff",
        body: "Attach branch publish status, PR metadata, or manual handoff artifacts when the run is ready to leave the control plane.",
      },
    ],
  },
  why: {
    eyebrow: "Why Codex Swarm",
    title: "AI delivery needs an operating model, not session sprawl.",
    intro:
      "The failure mode in AI-assisted software delivery is fragmentation: flat task lists, invisible approvals, stray artifacts, and no reliable handoff state. Codex Swarm treats those as first-class workflow concerns.",
    cards: [
      {
        title: "Plan with task graphs",
        body: "Runs persist a dependency-safe DAG instead of a flat checklist, so coordination, sequencing, and parallelism are explicit.",
      },
      {
        title: "Treat evidence as product state",
        body: "Approvals, validations, artifacts, and audit exports are modeled directly, so review and governance survive beyond chat transcripts.",
      },
      {
        title: "Supervise real execution",
        body: "Workers materialize isolated worktrees, launch Codex sessions, track thread state, and surface recovery clues when slices stall.",
      },
      {
        title: "Keep handoff visible",
        body: "Branch publish and PR handoff are part of the run contract, which makes delivery posture inspectable instead of implied.",
      },
    ],
    evidencePanel: {
      title: "Locked proof points",
      items: [
        "Workflow-oriented API plus supervised worker runtime",
        "Browser and terminal operator interfaces",
        "Projects, Automation, Runs, Lifecycle, and Settings surfaces",
        "Governance posture, retention state, and audit export evidence",
      ],
    },
  },
  capabilities: {
    eyebrow: "Core Capabilities",
    title:
      "The control plane is opinionated where delivery risk actually lives.",
    intro:
      "Codex Swarm ships the primitives operators need to plan, supervise, recover, and prove software delivery. The system stays grounded in repositories, runs, workers, and evidence rather than generic assistant abstractions.",
    items: [
      {
        title: "Workflow-first control plane",
        body: "Repositories carry provider, trust, and policy metadata while runs, tasks, and handoff state stay anchored to delivery reality.",
      },
      {
        title: "Codex-backed execution",
        body: "Supervised workers handle worktree provisioning, Codex session launch, validation execution, and recovery-aware placement.",
      },
      {
        title: "Operator interfaces",
        body: "Browser surfaces cover projects, project runs, automation, run board, lifecycle, and settings while the TUI supports terminal-heavy operation.",
      },
      {
        title: "Governance and evidence",
        body: "Validation status, approval provenance, artifact retention, and audit exports remain visible throughout the operating loop.",
      },
    ],
    highlights: [
      "Dependency-safe task DAG",
      "Recovery-aware workers",
      "Board-first run workspace",
      "Review and approval visibility",
      "Audit export evidence",
      "PR or branch handoff tracking",
    ],
  },
  surfaces: {
    eyebrow: "Product Surfaces",
    title: "Real interfaces for the real operator loop.",
    intro:
      "The repository already ships concrete browser surfaces, not just architecture diagrams. Run Board and Run Lifecycle are the deepest proofs because they expose active operation, diagnostics, and recovery context directly.",
    spotlight: [
      {
        title: "Run Board",
        role: "Primary work surface",
        src: "assets/images/screenshots/run-board.png",
        alt: "Codex Swarm Run Board screenshot",
        body: "The board prioritizes task execution first, with blockers and diagnostics close enough to act on without losing flow.",
      },
      {
        title: "Run Lifecycle",
        role: "Operational deep dive",
        src: "assets/images/screenshots/run-lifecycle.png",
        alt: "Codex Swarm Run Lifecycle screenshot",
        body: "Lifecycle centralizes placement, transcript context, recovery clues, and recent events when a slice needs intervention.",
      },
    ],
    gallery: [
      {
        title: "Projects",
        role: "Project-scoped inventory and navigation",
        src: "assets/images/screenshots/projects.png",
        alt: "Projects view screenshot",
      },
      {
        title: "Project Runs",
        role: "Run history and launch context",
        src: "assets/images/screenshots/project-runs.png",
        alt: "Project Runs view screenshot",
      },
      {
        title: "Project Automation",
        role: "Repeatable triggers and webhook setup",
        src: "assets/images/screenshots/project-automation.png",
        alt: "Project Automation view screenshot",
      },
      {
        title: "Ad-Hoc Runs",
        role: "Isolated work outside project ownership",
        src: "assets/images/screenshots/adhoc-runs.png",
        alt: "Ad-Hoc Runs view screenshot",
      },
      {
        title: "Settings",
        role: "Workspace identity, policy, and provider controls",
        src: "assets/images/screenshots/settings.png",
        alt: "Settings view screenshot",
      },
    ],
  },
  technicalFoundation: {
    eyebrow: "Technical Foundation",
    title: "Open source delivery infrastructure with a credible runtime shape.",
    intro:
      "Codex Swarm is a working open source product with a modular repository layout, operator materials, and a concrete local bootstrap path.",
    stack: ["Node 22+", "pnpm 10.28+", "Fastify", "React + Vite", "Postgres"],
    modules: [
      "apps/api for control-plane API, persistence, governance, and scheduling",
      "apps/worker for worktree provisioning, Codex supervision, and validation execution",
      "frontend for projects, runs, automation, lifecycle, review, and settings surfaces",
      "apps/tui for terminal workflows and capture-oriented operator views",
      "shared packages for contracts, orchestration, and database support",
    ],
    quickStart: [
      "corepack pnpm install",
      "cp .env.example .env",
      "corepack pnpm dev:api",
      "corepack pnpm dev:worker",
      "corepack pnpm dev:frontend",
    ],
    links: [
      {
        label: "Quick Start",
        href: "https://github.com/beisel-it/codex-swarm#quick-start",
      },
      {
        label: "Operator Guide",
        href: "https://github.com/beisel-it/codex-swarm/blob/main/docs/operator-guide.md",
      },
    ],
  },
  finalCta: {
    eyebrow: "Open Source Control Plane",
    title:
      "Inspect the repo. Read the operating docs. Start shaping governed delivery.",
    body: "Codex Swarm is already opinionated about repositories, runs, workers, evidence, and publish handoff. The fastest way to evaluate it is to inspect the repo, trace the operator journey, and read the product docs side by side.",
    art: {
      src: "assets/images/art/2026-03-30-23-49-50-signal-handoff-cloud.png",
      alt: "Abstract signal lattice artwork suggesting converging agent handoff flows",
    },
    actions: [
      {
        label: "View on GitHub",
        href: "https://github.com/beisel-it/codex-swarm",
      },
      {
        label: "Read the Docs",
        href: "https://github.com/beisel-it/codex-swarm/blob/main/docs/README.md",
      },
      {
        label: "See the Operator Journey",
        href: "https://github.com/beisel-it/codex-swarm/blob/main/docs/operator-journey.md",
      },
    ],
  },
};
