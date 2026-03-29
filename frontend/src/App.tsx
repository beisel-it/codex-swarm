import { startTransition, useDeferredValue, useEffect, useState } from 'react'

type ViewMode = 'board' | 'detail' | 'review' | 'admin'
type RepositoryProvider = 'github' | 'gitlab' | 'local' | 'other'
type RepositoryTrustLevel = 'trusted' | 'sandboxed' | 'restricted'
type PullRequestStatus = 'draft' | 'open' | 'merged' | 'closed'
type HandoffStatus = 'pending' | 'branch_published' | 'pr_open' | 'manual_handoff' | 'merged' | 'closed'
type WorkerNodeStatus = 'online' | 'degraded' | 'offline'
type WorkerNodeDrainState = 'active' | 'draining' | 'drained'
type WorkerSessionState = 'pending' | 'active' | 'stopped' | 'failed' | 'stale' | 'archived'

type RunStatus =
  | 'pending'
  | 'planning'
  | 'in_progress'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

type TaskStatus =
  | 'pending'
  | 'blocked'
  | 'in_progress'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'cancelled'

type AgentStatus = 'provisioning' | 'idle' | 'busy' | 'paused' | 'stopped' | 'failed'
type ApprovalStatus = 'pending' | 'approved' | 'rejected'
type ValidationStatus = 'pending' | 'passed' | 'failed'
type ArtifactKind = 'plan' | 'patch' | 'log' | 'report' | 'diff' | 'screenshot' | 'pr_link' | 'other'
type ActorType = 'system' | 'user' | 'service'

type Repository = {
  id: string
  name: string
  url: string
  provider: RepositoryProvider
  defaultBranch: string
  localPath: string | null
  trustLevel: RepositoryTrustLevel
  approvalProfile?: string
  createdAt?: string
  updatedAt?: string
}

type WorkspaceRef = {
  id: string
  name: string
}

type TeamRef = {
  id: string
  workspaceId: string
  name: string
}

type IdentityContext = {
  principal: string
  subject: string
  email: string | null
  roles: string[]
  workspace: WorkspaceRef
  team: TeamRef
  actorType: ActorType
}

type ActorIdentity = {
  principal: string
  actorId: string
  actorType: ActorType
  email: string | null
  role: string
  workspaceId: string | null
  workspaceName: string | null
  teamId: string | null
  teamName: string | null
  policyProfile: string | null
}

type ApprovalAuditEntry = {
  approvalId: string
  runId: string
  taskId: string | null
  kind: string
  status: ApprovalStatus
  requestedAt: string
  resolvedAt: string | null
  requestedBy: string
  requestedByActor: ActorIdentity | null
  resolver: string | null
  resolverActor: ActorIdentity | null
  policyProfile: string | null
  requestedPayload: Record<string, unknown>
  resolutionPayload: Record<string, unknown>
}

type GovernanceAdminReport = {
  generatedAt: string
  requestedBy: ActorIdentity
  retention: {
    policy: {
      runsDays: number
      artifactsDays: number
      eventsDays: number
    }
    runs: { total: number; expired: number; retained: number }
    artifacts: { total: number; expired: number; retained: number }
    events: { total: number; expired: number; retained: number }
  }
  approvals: {
    total: number
    pending: number
    approved: number
    rejected: number
    history: ApprovalAuditEntry[]
  }
  policies: {
    repositoryProfiles: Array<{
      profile: string
      repositoryCount: number
      runCount: number
    }>
    sensitiveRepositories: Array<{
      repositoryId: string
      repositoryName: string
      trustLevel: RepositoryTrustLevel
      approvalProfile: string
    }>
  }
  secrets: {
    sourceMode: 'environment' | 'external_manager'
    provider: string | null
    remoteCredentialEnvNames: string[]
    allowedRepositoryTrustLevels: RepositoryTrustLevel[]
    sensitivePolicyProfiles: string[]
    credentialDistribution: string[]
    policyDrivenAccess: boolean
  }
}

type SecretAccessPlan = {
  repositoryId: string
  repositoryName: string
  trustLevel: RepositoryTrustLevel
  policyProfile: string
  access: 'allowed' | 'brokered' | 'denied'
  sourceMode: 'environment' | 'external_manager'
  provider: string | null
  credentialEnvNames: string[]
  distributionBoundary: string[]
  reason: string
}

type RunAuditExport = {
  repository: Repository
  run: Run
  tasks: Task[]
  agents: Agent[]
  sessions: Session[]
  workerNodes: WorkerNode[]
  approvals: Approval[]
  validations: Validation[]
  artifacts: Artifact[]
  events: Array<{
    id: string
    runId: string | null
    taskId: string | null
    agentId: string | null
    traceId: string
    eventType: string
    entityType: string
    entityId: string
    status: string
    summary: string
    actor: ActorIdentity | null
    metadata: Record<string, unknown>
    createdAt: string
  }>
  provenance: {
    exportedBy: ActorIdentity
    approvals: ApprovalAuditEntry[]
    eventActors: ActorIdentity[]
    generatedAt: string
  }
  retention: GovernanceAdminReport['retention']
  exportedAt: string
}

type Run = {
  id: string
  repositoryId: string
  goal: string
  status: RunStatus
  branchName: string | null
  planArtifactPath: string | null
  budgetTokens?: number | null
  budgetCostUsd?: number | null
  concurrencyCap?: number
  policyProfile?: string | null
  publishedBranch: string | null
  branchPublishedAt: string | null
  pullRequestUrl: string | null
  pullRequestNumber: number | null
  pullRequestStatus: PullRequestStatus | null
  handoffStatus: HandoffStatus
  completedAt?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  metadata: Record<string, unknown>
}

type Task = {
  id: string
  runId: string
  parentTaskId?: string | null
  title: string
  description: string
  role: string
  status: TaskStatus
  priority: number
  ownerAgentId?: string | null
  dependencyIds: string[]
  acceptanceCriteria: string[]
  createdAt?: string
  updatedAt?: string
}

type Agent = {
  id: string
  runId: string
  name: string
  role: string
  status: AgentStatus
  branchName: string | null
  worktreePath: string | null
  currentTaskId?: string | null
  lastHeartbeatAt?: string | null
  createdAt?: string
  updatedAt?: string
}

type Session = {
  id: string
  agentId: string
  threadId: string
  cwd: string
  sandbox: string
  approvalPolicy: string
  includePlanTool: boolean
  workerNodeId: string | null
  stickyNodeId: string | null
  placementConstraintLabels: string[]
  state: WorkerSessionState
  staleReason: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

type WorkerNode = {
  id: string
  name: string
  endpoint: string | null
  capabilityLabels: string[]
  status: WorkerNodeStatus
  drainState: WorkerNodeDrainState
  lastHeartbeatAt: string | null
  metadata: Record<string, unknown>
  eligibleForScheduling: boolean
  createdAt?: string
  updatedAt?: string
}

type Approval = {
  id: string
  runId: string
  taskId: string | null
  kind: string
  status: ApprovalStatus
  requestedBy: string
  requestedPayload: Record<string, unknown>
  resolutionPayload: Record<string, unknown>
  resolver: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

type Validation = {
  id: string
  runId: string
  taskId?: string | null
  name: string
  command: string
  summary?: string | null
  status: ValidationStatus
  createdAt?: string
  updatedAt?: string
}

type Artifact = {
  id: string
  runId: string
  taskId?: string | null
  kind: ArtifactKind
  path: string
  contentType: string
  url?: string | null
  sizeBytes?: number | null
  sha256?: string | null
  metadata?: Record<string, unknown>
  createdAt?: string
}

type ArtifactContentState = 'available' | 'missing' | 'binary' | 'truncated'
type ArtifactDiffChangeType = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unknown'

type ArtifactDiffFileSummary = {
  path: string
  changeType: ArtifactDiffChangeType
  additions: number
  deletions: number
  summary: string | null
  previousPath: string | null
  providerUrl: string | null
}

type ArtifactDiffSummary = {
  title: string | null
  changeSummary: string | null
  filesChanged: number
  insertions: number
  deletions: number
  truncated: boolean
  fileSummaries: ArtifactDiffFileSummary[]
  diffPreview: string | null
  rawDiff: string | null
  providerUrl: string | null
}

type ArtifactDetail = {
  artifact: Artifact
  contentState: ArtifactContentState
  bodyText: string | null
  diffSummary: ArtifactDiffSummary | null
}

type Message = {
  id: string
  runId: string
  senderAgentId: string | null
  recipientAgentId: string | null
  kind: 'direct' | 'broadcast' | 'system'
  body: string
  createdAt: string
}

type RunDetail = Run & {
  tasks: Task[]
  agents: Agent[]
  sessions: Session[]
}

type ActivityItem = {
  id: string
  kind: string
  title: string
  detail: string
  timestamp: string
  tone: 'muted' | 'warning' | 'success' | 'danger' | 'active'
}

type SwarmData = {
  repositories: Repository[]
  runs: Run[]
  tasks: Task[]
  agents: Agent[]
  sessions: Session[]
  workerNodes: WorkerNode[]
  approvals: Approval[]
  validations: Validation[]
  artifacts: Artifact[]
  messages: Message[]
  identity: IdentityContext
  governance: GovernanceAdminReport
  secretAccessPlan: SecretAccessPlan | null
  auditExport: RunAuditExport | null
  source: 'mock' | 'api'
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL
  ?? `${window.location.protocol}//${window.location.hostname}:4300`
).replace(/\/$/, '')
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? 'codex-swarm-dev-token'
const APPROVAL_RESOLVER = import.meta.env.VITE_APPROVAL_RESOLVER ?? 'frontend-dev'
const MOCK_FALLBACK_ENABLED = import.meta.env.VITE_ENABLE_MOCK_FALLBACK === 'true'
const REFRESH_MS = 15_000
const UUID_PATTERN =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/

const mockIdentity: IdentityContext = {
  principal: 'dev-user',
  subject: 'dev-user',
  email: 'dev-user@example.com',
  roles: ['platform-admin'],
  workspace: {
    id: 'default-workspace',
    name: 'Default Workspace',
  },
  team: {
    id: 'codex-swarm',
    workspaceId: 'default-workspace',
    name: 'Codex Swarm',
  },
  actorType: 'user',
}

const mockGovernance: GovernanceAdminReport = {
  generatedAt: '2026-03-28T22:20:00.000Z',
  requestedBy: {
    principal: 'dev-user',
    actorId: 'dev-user',
    actorType: 'user',
    email: 'dev-user@example.com',
    role: 'platform-admin',
    workspaceId: 'default-workspace',
    workspaceName: 'Default Workspace',
    teamId: 'codex-swarm',
    teamName: 'Codex Swarm',
    policyProfile: 'standard',
  },
  retention: {
    policy: { runsDays: 30, artifactsDays: 30, eventsDays: 30 },
    runs: { total: 2, expired: 0, retained: 2 },
    artifacts: { total: 4, expired: 0, retained: 4 },
    events: { total: 18, expired: 2, retained: 16 },
  },
  approvals: {
    total: 3,
    pending: 1,
    approved: 1,
    rejected: 1,
    history: [
      {
        approvalId: 'approval-plan',
        runId: 'run-beta',
        taskId: 'task-review',
        kind: 'plan',
        status: 'pending',
        requestedAt: '2026-03-28T19:40:00.000Z',
        resolvedAt: null,
        requestedBy: 'tech-lead',
        requestedByActor: {
          principal: 'tech-lead',
          actorId: 'tech-lead',
          actorType: 'user',
          email: 'lead@example.com',
          role: 'platform-admin',
          workspaceId: 'default-workspace',
          workspaceName: 'Default Workspace',
          teamId: 'codex-swarm',
          teamName: 'Codex Swarm',
          policyProfile: 'standard',
        },
        resolver: null,
        resolverActor: null,
        policyProfile: 'standard',
        requestedPayload: { summary: 'Review beta handoff plan.' },
        resolutionPayload: {},
      },
      {
        approvalId: 'approval-policy',
        runId: 'run-alpha',
        taskId: 'task-runtime',
        kind: 'policy_exception',
        status: 'rejected',
        requestedAt: '2026-03-28T18:35:00.000Z',
        resolvedAt: '2026-03-28T20:03:00.000Z',
        requestedBy: 'backend-dev',
        requestedByActor: {
          principal: 'backend-dev',
          actorId: 'backend-dev',
          actorType: 'user',
          email: 'backend@example.com',
          role: 'engineer',
          workspaceId: 'default-workspace',
          workspaceName: 'Default Workspace',
          teamId: 'codex-swarm',
          teamName: 'Codex Swarm',
          policyProfile: 'standard',
        },
        resolver: 'security',
        resolverActor: {
          principal: 'security',
          actorId: 'security',
          actorType: 'user',
          email: 'security@example.com',
          role: 'security-admin',
          workspaceId: 'default-workspace',
          workspaceName: 'Default Workspace',
          teamId: 'codex-swarm',
          teamName: 'Codex Swarm',
          policyProfile: 'restricted',
        },
        policyProfile: 'restricted',
        requestedPayload: { summary: 'Request temporary network access for smoke tests.' },
        resolutionPayload: { feedback: 'Denied until runtime bootstrap is stable.' },
      },
    ],
  },
  policies: {
    repositoryProfiles: [
      { profile: 'standard', repositoryCount: 1, runCount: 1 },
      { profile: 'sandboxed-docs', repositoryCount: 1, runCount: 1 },
    ],
    sensitiveRepositories: [
      {
        repositoryId: 'repo-runbooks',
        repositoryName: 'swarm-runbooks',
        trustLevel: 'sandboxed',
        approvalProfile: 'sandboxed-docs',
      },
    ],
  },
  secrets: {
    sourceMode: 'environment',
    provider: null,
    remoteCredentialEnvNames: ['OPENAI_API_KEY'],
    allowedRepositoryTrustLevels: ['trusted'],
    sensitivePolicyProfiles: ['sandboxed-docs'],
    credentialDistribution: ['control-plane issues short-lived credentials', 'workers get task-scoped env'],
    policyDrivenAccess: true,
  },
}

const mockSecretAccessPlan: SecretAccessPlan = {
  repositoryId: 'repo-codex-swarm',
  repositoryName: 'codex-swarm',
  trustLevel: 'trusted',
  policyProfile: 'standard',
  access: 'allowed',
  sourceMode: 'environment',
  provider: null,
  credentialEnvNames: ['OPENAI_API_KEY'],
  distributionBoundary: ['workers get task-scoped env'],
  reason: 'repository can receive the standard environment secret path',
}

const mockAuditExport: RunAuditExport = {
  repository: {
    id: 'repo-codex-swarm',
    name: 'codex-swarm',
    url: 'https://github.com/example/codex-swarm',
    provider: 'github',
    defaultBranch: 'main',
    localPath: '/home/florian/codex-swarm',
    trustLevel: 'trusted',
    approvalProfile: 'standard',
    createdAt: '2026-03-20T09:00:00.000Z',
    updatedAt: '2026-03-28T20:58:00.000Z',
  },
  run: {
    id: 'run-alpha',
    repositoryId: 'repo-codex-swarm',
    goal: 'Ship M5 governance surfaces',
    status: 'in_progress',
    branchName: 'runs/m5-governance',
    planArtifactPath: null,
    budgetTokens: 120000,
    budgetCostUsd: 12.5,
    concurrencyCap: 2,
    policyProfile: 'standard',
    publishedBranch: null,
    branchPublishedAt: null,
    pullRequestUrl: null,
    pullRequestNumber: null,
    pullRequestStatus: null,
    handoffStatus: 'pending',
    completedAt: null,
    createdBy: 'tech-lead',
    createdAt: '2026-03-28T10:00:00.000Z',
    updatedAt: '2026-03-28T22:15:00.000Z',
    metadata: {},
  },
  tasks: [],
  agents: [],
  sessions: [],
  workerNodes: [],
  approvals: [],
  validations: [],
  artifacts: [],
  events: [
    {
      id: 'event-audit-1',
      runId: 'run-alpha',
      taskId: null,
      agentId: null,
      traceId: 'trace-audit',
      eventType: 'admin.governance_report_generated',
      entityType: 'admin_report',
      entityId: 'run-alpha',
      status: 'completed',
      summary: 'Governance report generated for run-alpha',
      actor: mockGovernance.requestedBy,
      metadata: {},
      createdAt: '2026-03-28T22:16:00.000Z',
    },
  ],
  provenance: {
    exportedBy: mockGovernance.requestedBy,
    approvals: mockGovernance.approvals.history,
    eventActors: [mockGovernance.requestedBy],
    generatedAt: '2026-03-28T22:17:00.000Z',
  },
  retention: mockGovernance.retention,
  exportedAt: '2026-03-28T22:17:00.000Z',
}

const mockArtifactDetails: Record<string, ArtifactDetail> = {
  'artifact-diff-beta': {
    artifact: {
      id: 'artifact-diff-beta',
      runId: 'run-beta',
      taskId: 'task-review',
      kind: 'diff',
      path: 'artifacts/review/beta-handoff.diff',
      contentType: 'text/x-diff',
      url: null,
      sizeBytes: 936,
      sha256: null,
      metadata: {},
      createdAt: '2026-03-28T19:46:00.000Z',
    },
    contentState: 'available',
    bodyText: `diff --git a/docs/user-guide.md b/docs/user-guide.md
index 1234567..89abcde 100644
--- a/docs/user-guide.md
+++ b/docs/user-guide.md
@@ -81,7 +81,9 @@ Use the review console when a run is waiting on human or delegated approval:
  1. Open \`Review\` and select the approval request from the left-side review list.
  2. Read the requested context and structured payload before deciding.
-3. Inspect recent validations and artifacts in the same surface so approval is tied to current evidence.
+3. Inspect the diff summary, changed files, recent validations, and linked artifacts in the same surface.
+4. Confirm the changed files match the requested review scope before approving.
  4. Record resolution feedback directly in the browser, then approve or reject from the action row.

diff --git a/frontend/src/App.tsx b/frontend/src/App.tsx
index aaaaaaa..bbbbbbb 100644
--- a/frontend/src/App.tsx
+++ b/frontend/src/App.tsx
@@ -2300,6 +2300,24 @@ function App() {
+  <section className="diff-review-surface">
+    <h4>Diff summary</h4>
+    <p>Render changed-file evidence beside the approval decision controls.</p>
+  </section>`,
    diffSummary: {
      title: '2 files changed',
      changeSummary: '2 files changed, 12 insertions, 3 deletions',
      filesChanged: 2,
      insertions: 12,
      deletions: 3,
      truncated: false,
      fileSummaries: [
        {
          path: 'docs/user-guide.md',
          changeType: 'modified',
          additions: 6,
          deletions: 1,
          summary: 'Review workflow updated for in-browser diff inspection.',
          previousPath: null,
          providerUrl: null,
        },
        {
          path: 'frontend/src/App.tsx',
          changeType: 'modified',
          additions: 6,
          deletions: 2,
          summary: 'Review workspace now includes diff-summary evidence.',
          previousPath: null,
          providerUrl: null,
        },
      ],
      diffPreview: `docs/user-guide.md
  + Inspect the diff summary, changed files, recent validations, and linked artifacts

frontend/src/App.tsx
  + <section className="diff-review-surface">`,
      rawDiff: null,
      providerUrl: null,
    },
  },
}

const mockData: SwarmData = {
  source: 'mock',
  repositories: [
    {
      id: 'repo-codex-swarm',
      name: 'codex-swarm',
      url: 'https://github.com/example/codex-swarm',
      provider: 'github',
      defaultBranch: 'main',
      localPath: '/home/florian/codex-swarm',
      trustLevel: 'trusted',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-28T20:58:00.000Z',
    },
    {
      id: 'repo-runbooks',
      name: 'swarm-runbooks',
      url: 'https://gitlab.com/example/swarm-runbooks',
      provider: 'gitlab',
      defaultBranch: 'main',
      localPath: null,
      trustLevel: 'sandboxed',
      createdAt: '2026-03-26T11:00:00.000Z',
      updatedAt: '2026-03-28T18:20:00.000Z',
    },
  ],
  runs: [
    {
      id: 'run-alpha',
      repositoryId: 'repo-codex-swarm',
      goal: 'Schedule the live provider handoff run across multiple worker nodes while preserving sticky placement and fleet visibility.',
      status: 'in_progress',
      branchName: 'runs/m3-provider-handoff',
      planArtifactPath: '.swarm/plan.md',
      budgetTokens: 180000,
      budgetCostUsd: 48,
      concurrencyCap: 4,
      policyProfile: 'internal-default',
      publishedBranch: 'runs/m3-provider-handoff',
      branchPublishedAt: '2026-03-28T20:48:00.000Z',
      pullRequestUrl: 'https://github.com/example/codex-swarm/pull/42',
      pullRequestNumber: 42,
      pullRequestStatus: 'open',
      handoffStatus: 'pr_open',
      completedAt: null,
      createdBy: 'tech-lead',
      createdAt: '2026-03-28T08:15:00.000Z',
      updatedAt: '2026-03-28T21:18:00.000Z',
      metadata: { phase: 'M3', concurrency: 4, queueDepth: 3 },
    },
    {
      id: 'run-beta',
      repositoryId: 'repo-runbooks',
      goal: 'Drain the degraded docs node safely while keeping reviewer sessions visible and recoverable.',
      status: 'awaiting_approval',
      branchName: 'runs/m3-runbook-onboarding',
      planArtifactPath: '.swarm/review.md',
      budgetTokens: 60000,
      budgetCostUsd: 18,
      concurrencyCap: 2,
      policyProfile: 'sandboxed-docs',
      publishedBranch: null,
      branchPublishedAt: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      handoffStatus: 'pending',
      completedAt: null,
      createdBy: 'tech-lead',
      createdAt: '2026-03-27T14:10:00.000Z',
      updatedAt: '2026-03-28T19:55:00.000Z',
      metadata: { phase: 'M3', concurrency: 2, queueDepth: 1 },
    },
  ],
  tasks: [
    {
      id: 'task-plan',
      runId: 'run-alpha',
      title: 'Persist leader plan and task DAG',
      description: 'Translate the PRD into executable tracks and durable task dependencies.',
      role: 'leader',
      status: 'completed',
      priority: 5,
      ownerAgentId: 'agent-leader',
      parentTaskId: null,
      dependencyIds: [],
      acceptanceCriteria: ['Plan artifact published', 'Dependencies linked', 'Milestone scope captured'],
      createdAt: '2026-03-28T08:18:00.000Z',
      updatedAt: '2026-03-28T09:01:00.000Z',
    },
    {
      id: 'task-runtime',
      runId: 'run-alpha',
      title: 'Patch runtime bootstrap for list endpoints',
      description: 'Resolve the backend runtime error so the board can hydrate real run and repository data.',
      role: 'backend',
      status: 'in_progress',
      priority: 5,
      ownerAgentId: 'agent-backend',
      parentTaskId: 'task-plan',
      dependencyIds: ['task-plan'],
      acceptanceCriteria: ['List endpoints return 200', 'Database bootstrap handled', 'Fallback no longer needed'],
      createdAt: '2026-03-28T09:05:00.000Z',
      updatedAt: '2026-03-28T20:55:00.000Z',
    },
    {
      id: 'task-ui',
      runId: 'run-alpha',
      title: 'Deliver M4 fleet visibility: node health, placement, and drain indicators',
      description: 'Expose worker-node health, utilization hints, placement, and drain-aware scheduling indicators across the board and run detail surfaces.',
      role: 'frontend',
      status: 'in_progress',
      priority: 5,
      ownerAgentId: 'agent-frontend',
      parentTaskId: 'task-plan',
      dependencyIds: ['task-plan'],
      acceptanceCriteria: ['Node health and utilization visible', 'Session placement and sticky assignment shown', 'Drain and degraded states reflected in board surfaces'],
      createdAt: '2026-03-28T09:10:00.000Z',
      updatedAt: '2026-03-28T21:19:00.000Z',
    },
    {
      id: 'task-approval',
      runId: 'run-alpha',
      title: 'Expose approval list endpoint',
      description: 'Backend adds GET /approvals with run-scoped filtering for review cards.',
      role: 'backend',
      status: 'completed',
      priority: 4,
      ownerAgentId: 'agent-backend',
      parentTaskId: 'task-runtime',
      dependencyIds: ['task-runtime'],
      acceptanceCriteria: ['Approval rows are queryable', 'Frontend can patch state from the browser'],
      createdAt: '2026-03-28T17:40:00.000Z',
      updatedAt: '2026-03-28T20:10:00.000Z',
    },
    {
      id: 'task-review',
      runId: 'run-beta',
      title: 'Review beta approval gate',
      description: 'Reviewers inspect pending plan and policy approvals, validations, and related artifacts.',
      role: 'reviewer',
      status: 'awaiting_review',
      priority: 3,
      ownerAgentId: 'agent-reviewer',
      parentTaskId: null,
      dependencyIds: [],
      acceptanceCriteria: ['Pending approvals visible', 'Validation summary shown', 'Reject-with-feedback path available'],
      createdAt: '2026-03-27T14:15:00.000Z',
      updatedAt: '2026-03-28T19:44:00.000Z',
    },
    {
      id: 'task-recovery',
      runId: 'run-beta',
      title: 'Reattach worker sessions after orchestrator restart',
      description: 'Confirm session ownership, worktree path, and heartbeat health after restart.',
      role: 'infrastructure',
      status: 'blocked',
      priority: 4,
      ownerAgentId: null,
      parentTaskId: 'task-review',
      dependencyIds: ['task-review'],
      acceptanceCriteria: ['Sessions mapped to agents', 'Stale workers highlighted', 'Recovery path documented'],
      createdAt: '2026-03-28T18:10:00.000Z',
      updatedAt: '2026-03-28T20:01:00.000Z',
    },
  ],
  agents: [
    {
      id: 'agent-leader',
      runId: 'run-alpha',
      name: 'tech-lead',
      role: 'leader',
      status: 'busy',
      branchName: 'runs/m2-board-beta',
      worktreePath: '/worktrees/run-alpha/leader',
      currentTaskId: 'task-ui',
      lastHeartbeatAt: '2026-03-28T21:08:00.000Z',
    },
    {
      id: 'agent-backend',
      runId: 'run-alpha',
      name: 'backend-dev',
      role: 'backend',
      status: 'busy',
      branchName: 'feature/runtime-bootstrap',
      worktreePath: '/worktrees/run-alpha/backend',
      currentTaskId: 'task-runtime',
      lastHeartbeatAt: '2026-03-28T21:07:00.000Z',
    },
    {
      id: 'agent-frontend',
      runId: 'run-alpha',
      name: 'frontend-dev',
      role: 'frontend',
      status: 'busy',
      branchName: 'feature/m4-fleet-visibility',
      worktreePath: '/worktrees/run-alpha/frontend',
      currentTaskId: 'task-ui',
      lastHeartbeatAt: '2026-03-28T21:09:00.000Z',
    },
    {
      id: 'agent-reviewer',
      runId: 'run-beta',
      name: 'reviewer',
      role: 'reviewer',
      status: 'paused',
      branchName: 'review/beta-handoff',
      worktreePath: '/worktrees/run-beta/reviewer',
      currentTaskId: 'task-review',
      lastHeartbeatAt: '2026-03-28T20:15:00.000Z',
    },
  ],
  sessions: [
    {
      id: 'session-leader',
      agentId: 'agent-leader',
      threadId: 'thread-alpha-leader',
      cwd: '/worktrees/run-alpha/leader',
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      includePlanTool: true,
      workerNodeId: 'node-primary',
      stickyNodeId: 'node-primary',
      placementConstraintLabels: ['linux', 'node'],
      state: 'active',
      staleReason: null,
      metadata: { profile: 'leader' },
      createdAt: '2026-03-28T08:16:00.000Z',
      updatedAt: '2026-03-28T21:08:00.000Z',
    },
    {
      id: 'session-backend',
      agentId: 'agent-backend',
      threadId: 'thread-alpha-backend',
      cwd: '/worktrees/run-alpha/backend',
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      includePlanTool: false,
      workerNodeId: 'node-remote-a',
      stickyNodeId: 'node-remote-a',
      placementConstraintLabels: ['remote', 'linux'],
      state: 'active',
      staleReason: null,
      metadata: { profile: 'backend' },
      createdAt: '2026-03-28T09:03:00.000Z',
      updatedAt: '2026-03-28T21:07:00.000Z',
    },
    {
      id: 'session-reviewer',
      agentId: 'agent-reviewer',
      threadId: 'thread-beta-review',
      cwd: '/worktrees/run-beta/reviewer',
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      includePlanTool: false,
      workerNodeId: 'node-remote-b',
      stickyNodeId: 'node-remote-b',
      placementConstraintLabels: ['remote', 'browser'],
      state: 'stale',
      staleReason: 'node degraded during reconnect',
      metadata: { profile: 'reviewer' },
      createdAt: '2026-03-28T18:00:00.000Z',
      updatedAt: '2026-03-28T20:15:00.000Z',
    },
    {
      id: 'session-frontend',
      agentId: 'agent-frontend',
      threadId: 'thread-alpha-frontend',
      cwd: '/worktrees/run-alpha/frontend',
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      includePlanTool: false,
      workerNodeId: 'node-remote-a',
      stickyNodeId: 'node-remote-a',
      placementConstraintLabels: ['remote', 'node', 'browser'],
      state: 'active',
      staleReason: null,
      metadata: { profile: 'frontend' },
      createdAt: '2026-03-28T09:09:00.000Z',
      updatedAt: '2026-03-28T21:09:00.000Z',
    },
  ],
  workerNodes: [
    {
      id: 'node-primary',
      name: 'node-primary',
      endpoint: 'tcp://node-primary.internal:7777',
      capabilityLabels: ['linux', 'node', 'local-ssd'],
      status: 'online',
      drainState: 'active',
      lastHeartbeatAt: '2026-03-28T21:11:00.000Z',
      metadata: { cpuPercent: 41, memoryPercent: 58, queueDepth: 2, sessionCount: 1 },
      eligibleForScheduling: true,
      createdAt: '2026-03-28T07:50:00.000Z',
      updatedAt: '2026-03-28T21:11:00.000Z',
    },
    {
      id: 'node-remote-a',
      name: 'node-remote-a',
      endpoint: 'tcp://node-remote-a.internal:7777',
      capabilityLabels: ['linux', 'node', 'remote', 'browser'],
      status: 'online',
      drainState: 'active',
      lastHeartbeatAt: '2026-03-28T21:10:00.000Z',
      metadata: { cpuPercent: 73, memoryPercent: 67, queueDepth: 4, sessionCount: 2 },
      eligibleForScheduling: true,
      createdAt: '2026-03-28T07:55:00.000Z',
      updatedAt: '2026-03-28T21:10:00.000Z',
    },
    {
      id: 'node-remote-b',
      name: 'node-remote-b',
      endpoint: 'tcp://node-remote-b.internal:7777',
      capabilityLabels: ['linux', 'node', 'remote', 'browser'],
      status: 'degraded',
      drainState: 'draining',
      lastHeartbeatAt: '2026-03-28T20:14:00.000Z',
      metadata: { cpuPercent: 92, memoryPercent: 84, queueDepth: 6, sessionCount: 1, drainReason: 'maintenance' },
      eligibleForScheduling: false,
      createdAt: '2026-03-28T08:10:00.000Z',
      updatedAt: '2026-03-28T20:16:00.000Z',
    },
  ],
  approvals: [
    {
      id: 'approval-plan',
      runId: 'run-beta',
      taskId: 'task-review',
      kind: 'plan',
      status: 'pending',
      requestedBy: 'tech-lead',
      requestedPayload: {
        summary: 'Need explicit reviewer approval before the beta handoff opens.',
        target: 'beta handoff',
        artifactIds: ['artifact-diff-beta'],
      },
      resolutionPayload: {},
      resolver: null,
      resolvedAt: null,
      createdAt: '2026-03-28T19:40:00.000Z',
      updatedAt: '2026-03-28T19:40:00.000Z',
    },
    {
      id: 'approval-policy',
      runId: 'run-alpha',
      taskId: 'task-runtime',
      kind: 'policy_exception',
      status: 'rejected',
      requestedBy: 'backend-dev',
      requestedPayload: {
        summary: 'Request temporary network access for runtime smoke tests.',
      },
      resolutionPayload: {
        feedback: 'Network smoke tests remain disallowed until the bootstrap path is stable.',
      },
      resolver: 'security',
      resolvedAt: '2026-03-28T20:03:00.000Z',
      createdAt: '2026-03-28T18:35:00.000Z',
      updatedAt: '2026-03-28T20:03:00.000Z',
    },
  ],
  validations: [
    {
      id: 'validation-api',
      runId: 'run-alpha',
      taskId: 'task-runtime',
      name: 'Runtime bootstrap smoke',
      command: 'npm --prefix apps/api test',
      summary: 'Backend contracts and bootstrap code compile, but the list endpoints still need runtime verification.',
      status: 'pending',
      createdAt: '2026-03-28T20:00:00.000Z',
      updatedAt: '2026-03-28T20:58:00.000Z',
    },
    {
      id: 'validation-ui',
      runId: 'run-alpha',
      taskId: 'task-ui',
      name: 'Board build',
      command: 'npm --prefix frontend run build',
      summary: 'Frontend M2 board work compiles cleanly.',
      status: 'passed',
      createdAt: '2026-03-28T20:22:00.000Z',
      updatedAt: '2026-03-28T21:00:00.000Z',
    },
    {
      id: 'validation-recovery',
      runId: 'run-beta',
      taskId: 'task-recovery',
      name: 'Restart recovery smoke',
      command: 'npm --prefix apps/api test -- recovery',
      summary: 'Session reconciliation is still blocked on restart verification.',
      status: 'failed',
      createdAt: '2026-03-28T19:54:00.000Z',
      updatedAt: '2026-03-28T20:12:00.000Z',
    },
  ],
  artifacts: [
    {
      id: 'artifact-plan',
      runId: 'run-alpha',
      taskId: 'task-plan',
      kind: 'plan',
      path: '.swarm/plan.md',
      contentType: 'text/markdown',
      createdAt: '2026-03-28T09:02:00.000Z',
    },
    {
      id: 'artifact-report',
      runId: 'run-alpha',
      taskId: 'task-ui',
      kind: 'report',
      path: 'artifacts/ui/m3-provider-preview.html',
      contentType: 'text/html',
      createdAt: '2026-03-28T21:01:00.000Z',
    },
    {
      id: 'artifact-pr-link',
      runId: 'run-alpha',
      taskId: 'task-ui',
      kind: 'pr_link',
      path: 'https://github.com/example/codex-swarm/pull/42',
      contentType: 'text/uri-list',
      createdAt: '2026-03-28T21:18:00.000Z',
    },
    {
      id: 'artifact-diff-beta',
      runId: 'run-beta',
      taskId: 'task-review',
      kind: 'diff',
      path: 'artifacts/review/beta-handoff.diff',
      contentType: 'text/x-diff',
      createdAt: '2026-03-28T19:46:00.000Z',
    },
    {
      id: 'artifact-log',
      runId: 'run-beta',
      taskId: 'task-recovery',
      kind: 'log',
      path: 'artifacts/recovery/restart-smoke.log',
      contentType: 'text/plain',
      createdAt: '2026-03-28T20:12:00.000Z',
    },
  ],
  messages: [
    {
      id: 'message-1',
      runId: 'run-alpha',
      senderAgentId: 'agent-leader',
      recipientAgentId: 'agent-frontend',
      kind: 'direct',
      body: 'Push the M2 board beyond a shell: task DAG, review workspace, and recovery surfaces.',
      createdAt: '2026-03-28T20:34:00.000Z',
    },
    {
      id: 'message-2',
      runId: 'run-beta',
      senderAgentId: 'agent-reviewer',
      recipientAgentId: null,
      kind: 'broadcast',
      body: 'Pending plan approval is still blocking the beta review handoff.',
      createdAt: '2026-03-28T20:14:00.000Z',
    },
  ],
  identity: mockIdentity,
  governance: mockGovernance,
  secretAccessPlan: mockSecretAccessPlan,
  auditExport: mockAuditExport,
}

const taskStatusOrder: TaskStatus[] = ['pending', 'blocked', 'in_progress', 'awaiting_review', 'completed']

const runStatusTone: Record<RunStatus, string> = {
  pending: 'muted',
  planning: 'warning',
  in_progress: 'active',
  awaiting_approval: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'muted',
}

const agentStatusTone: Record<AgentStatus, string> = {
  provisioning: 'warning',
  idle: 'muted',
  busy: 'active',
  paused: 'warning',
  stopped: 'muted',
  failed: 'danger',
}

const approvalStatusTone: Record<ApprovalStatus, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

const validationStatusTone: Record<ValidationStatus, string> = {
  pending: 'warning',
  passed: 'success',
  failed: 'danger',
}

const repositoryTrustTone: Record<RepositoryTrustLevel, ActivityItem['tone']> = {
  trusted: 'success',
  sandboxed: 'warning',
  restricted: 'danger',
}

const handoffTone: Record<HandoffStatus, ActivityItem['tone']> = {
  pending: 'warning',
  branch_published: 'active',
  pr_open: 'success',
  manual_handoff: 'warning',
  merged: 'success',
  closed: 'muted',
}

const pullRequestTone: Record<PullRequestStatus, ActivityItem['tone']> = {
  draft: 'warning',
  open: 'active',
  merged: 'success',
  closed: 'muted',
}

const workerNodeStatusTone: Record<WorkerNodeStatus, ActivityItem['tone']> = {
  online: 'success',
  degraded: 'warning',
  offline: 'danger',
}

const workerNodeDrainTone: Record<WorkerNodeDrainState, ActivityItem['tone']> = {
  active: 'success',
  draining: 'warning',
  drained: 'muted',
}

const workerSessionTone: Record<WorkerSessionState, ActivityItem['tone']> = {
  pending: 'warning',
  active: 'success',
  stopped: 'muted',
  failed: 'danger',
  stale: 'warning',
  archived: 'muted',
}

function buildApiUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && UUID_PATTERN.test(value))
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

async function updateApprovalDecision(
  approvalId: string,
  status: ApprovalStatus,
  notes: string,
): Promise<Approval> {
  return requestJson<Approval>(`/api/v1/approvals/${encodeURIComponent(approvalId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      resolver: APPROVAL_RESOLVER,
      feedback: notes.trim() || undefined,
      resolutionPayload: notes.trim()
        ? {
            feedback: notes.trim(),
          }
        : {},
    }),
  })
}

async function createRepository(input: {
  name: string
  url: string
  provider?: RepositoryProvider
}): Promise<Repository> {
  return requestJson<Repository>('/api/v1/repositories', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function createRun(input: {
  repositoryId: string
  goal: string
  branchName?: string
}): Promise<Run> {
  return requestJson<Run>('/api/v1/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function startRun(runId: string): Promise<RunDetail> {
  return requestJson<RunDetail>(`/api/v1/runs/${encodeURIComponent(runId)}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

async function createTask(input: {
  runId: string
  title: string
  description: string
  role: string
}): Promise<Task> {
  return requestJson<Task>('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      acceptanceCriteria: [],
      dependencyIds: [],
      validationTemplates: [],
    }),
  })
}

async function loadApprovalDetail(approvalId: string): Promise<Approval> {
  return requestJson<Approval>(`/api/v1/approvals/${encodeURIComponent(approvalId)}`)
}

async function loadArtifactDetail(artifactId: string): Promise<ArtifactDetail> {
  return requestJson<ArtifactDetail>(`/api/v1/artifacts/${encodeURIComponent(artifactId)}`)
}

async function loadIdentity(): Promise<IdentityContext> {
  return requestJson<IdentityContext>('/api/v1/me')
}

async function loadGovernanceReport(runId?: string): Promise<GovernanceAdminReport> {
  const suffix = runId ? `?runId=${encodeURIComponent(runId)}` : ''
  return requestJson<GovernanceAdminReport>(`/api/v1/admin/governance-report${suffix}`)
}

async function loadSecretAccessPlan(repositoryId: string): Promise<SecretAccessPlan> {
  return requestJson<SecretAccessPlan>(`/api/v1/admin/secrets/access-plan/${encodeURIComponent(repositoryId)}`)
}

async function loadRunAuditExport(runId: string): Promise<RunAuditExport> {
  return requestJson<RunAuditExport>(`/api/v1/runs/${encodeURIComponent(runId)}/audit-export`)
}

async function loadSwarmData(): Promise<SwarmData> {
  try {
    const repositories = await requestJson<Repository[]>('/api/v1/repositories')
    const runs = await requestJson<Run[]>('/api/v1/runs')
    const workerNodes = await requestJson<WorkerNode[]>('/api/v1/worker-nodes').catch(() => [])
    const identity = await loadIdentity().catch(() => mockIdentity)

    if (repositories.length === 0 || runs.length === 0) {
      return {
        ...mockData,
        repositories,
        runs,
        tasks: [],
        agents: [],
        sessions: [],
        workerNodes,
        approvals: [],
        validations: [],
        artifacts: [],
        messages: [],
        identity,
        secretAccessPlan: null,
        auditExport: null,
        source: 'api',
      }
    }

    const details = await Promise.all(
      runs.map((run) =>
        requestJson<RunDetail>(`/api/v1/runs/${encodeURIComponent(run.id)}`),
      ),
    )

    const approvalsPerRun = await Promise.all(
      runs.map((run) =>
        requestJson<Approval[]>(`/api/v1/approvals?runId=${encodeURIComponent(run.id)}`).catch(
          () => [],
        ),
      ),
    )

    const validationsPerRun = await Promise.all(
      runs.map((run) =>
        requestJson<Validation[]>(`/api/v1/validations?runId=${encodeURIComponent(run.id)}`).catch(
          () => [],
        ),
      ),
    )

    const artifactsPerRun = await Promise.all(
      runs.map((run) =>
        requestJson<Artifact[]>(`/api/v1/artifacts?runId=${encodeURIComponent(run.id)}`).catch(
          () => [],
        ),
      ),
    )

    const messagesPerRun = await Promise.all(
      runs.map((run) =>
        requestJson<Message[]>(`/api/v1/messages?runId=${encodeURIComponent(run.id)}`).catch(
          () => [],
        ),
      ),
    )

    const primaryRun = runs[0]
    const primaryRepository = repositories.find((repository) => repository.id === primaryRun?.repositoryId)
    const governance = await loadGovernanceReport(primaryRun?.id).catch(() => mockGovernance)
    const secretAccessPlan =
      primaryRepository
        ? await loadSecretAccessPlan(primaryRepository.id).catch(() => mockSecretAccessPlan)
        : null
    const auditExport =
      primaryRun
        ? await loadRunAuditExport(primaryRun.id).catch(() => mockAuditExport)
        : null

    return {
      repositories,
      runs,
      tasks: details.flatMap((detail) => detail.tasks),
      agents: details.flatMap((detail) => detail.agents),
      sessions: details.flatMap((detail) => detail.sessions),
      workerNodes,
      approvals: approvalsPerRun.flat(),
      validations: validationsPerRun.flat(),
      artifacts: artifactsPerRun.flat(),
      messages: messagesPerRun.flat(),
      identity,
      governance,
      secretAccessPlan,
      auditExport,
      source: 'api',
    }
  } catch {
    if (MOCK_FALLBACK_ENABLED) {
      return mockData
    }

    return {
      ...mockData,
      repositories: [],
      runs: [],
      tasks: [],
      agents: [],
      sessions: [],
      workerNodes: [],
      approvals: [],
      validations: [],
      artifacts: [],
      messages: [],
      source: 'api',
    }
  }
}

function formatDate(input: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(input))
}

function formatLabel(input: string) {
  return input.replace(/_/g, ' ')
}

function summarizeApprovalForBoard(approval: Approval) {
  if (approval.status === 'pending') {
    return String(approval.requestedPayload?.summary ?? 'Awaiting reviewer decision.')
  }

  return String(approval.resolutionPayload?.feedback ?? `Resolved by ${approval.resolver ?? 'unknown reviewer'}`)
}

function summarizeValidationForBoard(validation: Validation) {
  return validation.summary ?? validation.command
}

function formatPayload(payload?: Record<string, unknown> | null) {
  if (!payload || Object.keys(payload).length === 0) {
    return 'No structured payload recorded yet.'
  }

  return JSON.stringify(payload, null, 2)
}

function extractArtifactIds(payload?: Record<string, unknown> | null) {
  const artifactIds = payload?.artifactIds
  return Array.isArray(artifactIds) ? artifactIds.filter((value): value is string => typeof value === 'string') : []
}

function formatDiffChangeType(changeType: ArtifactDiffChangeType) {
  return changeType === 'unknown' ? 'changed' : formatLabel(changeType)
}

function describeArtifactContentState(contentState: ArtifactContentState) {
  if (contentState === 'available') {
    return 'Full text content is available for review.'
  }

  if (contentState === 'truncated') {
    return 'The stored artifact exceeded the preview limit, so only a partial diff is shown.'
  }

  if (contentState === 'binary') {
    return 'This artifact is binary or unsupported for inline diff rendering.'
  }

  return 'The artifact blob is missing, so only stored summary metadata is available.'
}

function describeRepositoryOnboarding(repository: Repository | null) {
  if (!repository) {
    return 'No repository linked to this run yet.'
  }

  if (repository.provider === 'local') {
    return repository.localPath
      ? 'Local checkout is connected and ready for worktrees.'
      : 'Local repository tracked without a checkout path.'
  }

  if (repository.localPath) {
    return `${repository.provider} provider linked with a local checkout ready for run execution.`
  }

  return `${repository.provider} provider linked, but a local checkout path has not been recorded yet.`
}

function describeHandoff(run: Run) {
  if (run.pullRequestUrl) {
    return `PR #${run.pullRequestNumber ?? 'pending'} is ${formatLabel(run.pullRequestStatus ?? 'open')}.`
  }

  if (run.publishedBranch) {
    return `Branch ${run.publishedBranch} was published and is waiting for PR handoff.`
  }

  return 'No branch publish or PR handoff has been recorded yet.'
}

function formatRelativeHeartbeat(input?: string | null) {
  if (!input) {
    return 'No heartbeat'
  }

  const deltaMinutes = Math.max(0, Math.round((Date.now() - new Date(input).getTime()) / 60_000))

  if (deltaMinutes < 1) {
    return 'Heartbeat just now'
  }

  if (deltaMinutes === 1) {
    return 'Heartbeat 1 minute ago'
  }

  return `Heartbeat ${deltaMinutes} minutes ago`
}

function formatPercentage(input: unknown) {
  return typeof input === 'number' && Number.isFinite(input) ? `${Math.round(input)}%` : 'n/a'
}

function nodeUtilizationSummary(workerNode: WorkerNode, assignedSessions: number) {
  const cpu = formatPercentage(workerNode.metadata?.cpuPercent)
  const memory = formatPercentage(workerNode.metadata?.memoryPercent)
  const queueDepth =
    typeof workerNode.metadata?.queueDepth === 'number' ? String(workerNode.metadata.queueDepth) : 'n/a'

  return `CPU ${cpu} · MEM ${memory} · queue ${queueDepth} · sessions ${assignedSessions}`
}

function describePlacement(session: Session, workerNode: WorkerNode | null, stickyNode: WorkerNode | null) {
  const nodeLabel = workerNode?.name ?? session.workerNodeId ?? 'unplaced'
  const stickyLabel = stickyNode?.name ?? session.stickyNodeId ?? 'none'
  const constraints = session.placementConstraintLabels.length > 0 ? session.placementConstraintLabels.join(', ') : 'none'
  return `Placed on ${nodeLabel} · sticky ${stickyLabel} · labels ${constraints}`
}

function formatActorLabel(actor: ActorIdentity | null | undefined) {
  if (!actor) {
    return 'System-unresolved'
  }

  return `${actor.actorId} · ${actor.role}`
}

function deriveActivity(
  run: Run | null,
  workerNodes: WorkerNode[],
  approvals: Approval[],
  validations: Validation[],
  artifacts: Artifact[],
  messages: Message[],
): ActivityItem[] {
  const activity = [
    ...(run?.publishedBranch
      ? [
          {
            id: `run-branch-${run.id}`,
            kind: 'publish',
            title: `Branch ${run.publishedBranch} published`,
            detail: run.branchPublishedAt ? `Published ${formatDate(run.branchPublishedAt)}` : 'Provider handoff is recorded.',
            timestamp: run.branchPublishedAt ?? run.updatedAt,
            tone: handoffTone[run.handoffStatus],
          } satisfies ActivityItem,
        ]
      : []),
    ...(run?.pullRequestUrl
      ? [
          {
            id: `run-pr-${run.id}`,
            kind: 'pull request',
            title: `PR #${run.pullRequestNumber ?? 'pending'} ${formatLabel(run.pullRequestStatus ?? 'open')}`,
            detail: run.pullRequestUrl,
            timestamp: run.updatedAt,
            tone: pullRequestTone[run.pullRequestStatus ?? 'open'],
          } satisfies ActivityItem,
        ]
      : []),
    ...workerNodes.map((workerNode) => ({
      id: `worker-node-${workerNode.id}`,
      kind: 'worker node',
      title: `${workerNode.name} ${formatLabel(workerNode.status)}`,
      detail: workerNode.drainState === 'active'
        ? String(workerNode.metadata?.drainReason ?? 'Accepting new assignments')
        : String(workerNode.metadata?.drainReason ?? `Drain state ${formatLabel(workerNode.drainState)}`),
      timestamp: workerNode.lastHeartbeatAt ?? workerNode.updatedAt ?? new Date().toISOString(),
      tone: workerNode.status === 'offline' ? 'danger' : workerNodeDrainTone[workerNode.drainState],
    })),
    ...approvals.map((approval) => ({
      id: `approval-${approval.id}`,
      kind: 'approval',
      title: `${approval.kind} ${approval.status}`,
      detail:
        approval.status === 'pending'
          ? `Requested by ${approval.requestedBy}`
          : String(approval.resolutionPayload?.feedback ?? `Resolved by ${approval.resolver ?? 'unknown reviewer'}`),
      timestamp: approval.updatedAt,
      tone: (approval.status === 'approved' ? 'success' : approval.status === 'rejected' ? 'danger' : 'warning') as ActivityItem['tone'],
    })),
    ...validations.map((validation) => ({
      id: `validation-${validation.id}`,
      kind: 'validation',
      title: `${validation.name} ${validation.status}`,
      detail: validation.summary ?? validation.command,
      timestamp: validation.updatedAt ?? validation.createdAt ?? new Date().toISOString(),
      tone: (validation.status === 'passed' ? 'success' : validation.status === 'failed' ? 'danger' : 'warning') as ActivityItem['tone'],
    })),
    ...artifacts.map((artifact) => ({
      id: `artifact-${artifact.id}`,
      kind: 'artifact',
      title: `${artifact.kind} published`,
      detail: artifact.path,
      timestamp: artifact.createdAt ?? new Date().toISOString(),
      tone: 'active' as const,
    })),
    ...messages.map((message) => ({
      id: `message-${message.id}`,
      kind: 'message',
      title: `${message.kind} message`,
      detail: message.body,
      timestamp: message.createdAt,
      tone: 'muted' as const,
    })),
  ]

  return activity
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8)
}

function App() {
  const [data, setData] = useState<SwarmData>(mockData)
  const [selectedRunId, setSelectedRunId] = useState(mockData.runs[0]?.id ?? '')
  const [selectedView, setSelectedView] = useState<ViewMode>('board')
  const [selectedApprovalId, setSelectedApprovalId] = useState<string>('')
  const [selectedReviewArtifactId, setSelectedReviewArtifactId] = useState<string>('')
  const [selectedApprovalDetail, setSelectedApprovalDetail] = useState<Approval | null>(null)
  const [selectedArtifactDetail, setSelectedArtifactDetail] = useState<ArtifactDetail | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [taskQuery, setTaskQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState<string>('')
  const [artifactDetailState, setArtifactDetailState] = useState<LoadState>('idle')
  const [artifactDetailError, setArtifactDetailError] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [repoDraftName, setRepoDraftName] = useState('codex-swarm')
  const [repoDraftUrl, setRepoDraftUrl] = useState('https://github.com/beisel-it/codex-swarm.git')
  const [repoDraftProvider, setRepoDraftProvider] = useState<RepositoryProvider>('github')
  const [runDraftRepositoryId, setRunDraftRepositoryId] = useState('')
  const [runDraftGoal, setRunDraftGoal] = useState('Ship the next iteration through codex-swarm.')
  const [runDraftBranchName, setRunDraftBranchName] = useState('main')
  const [taskDraftTitle, setTaskDraftTitle] = useState('')
  const [taskDraftDescription, setTaskDraftDescription] = useState('')
  const [taskDraftRole, setTaskDraftRole] = useState('developer')

  const deferredTaskQuery = useDeferredValue(taskQuery)

  useEffect(() => {
    let active = true
    const intervalId = window.setInterval(() => {
      void hydrate()
    }, REFRESH_MS)

    async function hydrate() {
      try {
        const nextData = await loadSwarmData()

        if (!active) {
          return
        }

        setData(nextData)
        setSelectedRunId((current) => {
          if (current && nextData.runs.some((run) => run.id === current)) {
            return current
          }

          return nextData.runs[0]?.id || ''
        })
        setErrorText('')
      } catch (error) {
        if (!active) {
          return
        }

        setErrorText(error instanceof Error ? error.message : 'Unknown error')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void hydrate()

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  const selectedRun =
    data.runs.find((run) => run.id === selectedRunId) ??
    data.runs[0] ??
    null

  const selectedRepository = data.repositories.find(
    (repository) => repository.id === selectedRun?.repositoryId,
  ) ?? null
  const selectedRunStableId = selectedRun?.id ?? null
  const selectedRepositoryStableId = selectedRepository?.id ?? null

  useEffect(() => {
    if (runDraftRepositoryId && data.repositories.some((repository) => repository.id === runDraftRepositoryId)) {
      return
    }

    const nextRepositoryId = selectedRepositoryStableId ?? data.repositories[0]?.id ?? ''
    setRunDraftRepositoryId(nextRepositoryId)
  }, [data.repositories, runDraftRepositoryId, selectedRepositoryStableId])

  const runTasks = data.tasks.filter((task) => task.runId === selectedRun?.id)
  const visibleTasks = runTasks.filter((task) => {
    if (!deferredTaskQuery.trim()) {
      return true
    }

    const query = deferredTaskQuery.trim().toLowerCase()
    return `${task.title} ${task.description} ${task.role}`.toLowerCase().includes(query)
  })
  const runAgents = data.agents.filter((agent) => agent.runId === selectedRun?.id)
  const runSessions = data.sessions.filter((session) =>
    runAgents.some((agent) => agent.id === session.agentId),
  )
  const runWorkerNodes = data.workerNodes.filter((workerNode) =>
    runSessions.some(
      (session) => session.workerNodeId === workerNode.id || session.stickyNodeId === workerNode.id,
    ),
  )
  const runApprovals = data.approvals.filter((approval) => approval.runId === selectedRun?.id)
  const runValidations = data.validations.filter((validation) => validation.runId === selectedRun?.id)
  const runArtifacts = data.artifacts.filter((artifact) => artifact.runId === selectedRun?.id)
  const runMessages = data.messages.filter((message) => message.runId === selectedRun?.id)
  const pendingApprovals = runApprovals.filter((approval) => approval.status === 'pending')
  const boardValidations = [...runValidations]
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt ?? left.createdAt ?? '')
      const rightTime = Date.parse(right.updatedAt ?? right.createdAt ?? '')
      return rightTime - leftTime
    })
    .slice(0, 4)
  const activity = deriveActivity(selectedRun, runWorkerNodes, runApprovals, runValidations, runArtifacts, runMessages)
  const selectedApproval =
    runApprovals.find((approval) => approval.id === selectedApprovalId) ??
    runApprovals.find((approval) => approval.status === 'pending') ??
    null
  const approvalArtifactIds = extractArtifactIds(selectedApprovalDetail?.requestedPayload ?? selectedApproval?.requestedPayload)
  const reviewDiffArtifacts = runArtifacts.filter((artifact) =>
    artifact.kind === 'diff'
      && (approvalArtifactIds.length === 0 || approvalArtifactIds.includes(artifact.id)),
  )
  const selectedReviewArtifact =
    reviewDiffArtifacts.find((artifact) => artifact.id === selectedReviewArtifactId) ??
    reviewDiffArtifacts[0] ??
    null

  useEffect(() => {
    setSelectedApprovalId(selectedApproval?.id ?? '')
  }, [selectedApproval?.id])

  useEffect(() => {
    setSelectedReviewArtifactId((current) => {
      if (!selectedApprovalId) {
        return ''
      }

      if (reviewDiffArtifacts.some((artifact) => artifact.id === current)) {
        return current
      }

      return reviewDiffArtifacts[0]?.id ?? ''
    })
  }, [selectedApprovalId, reviewDiffArtifacts])

  useEffect(() => {
    let active = true

    async function hydrateApprovalDetail() {
      if (!selectedApprovalId || data.source !== 'api' || !isUuid(selectedApprovalId)) {
        setSelectedApprovalDetail(null)
        setReviewNotes('')
        return
      }

      try {
        const detail = await loadApprovalDetail(selectedApprovalId)
        if (!active) {
          return
        }

        setSelectedApprovalDetail(detail)
        setReviewNotes(String(detail.resolutionPayload?.feedback ?? ''))
      } catch {
        if (!active) {
          return
        }

        const fallback = runApprovals.find((approval) => approval.id === selectedApprovalId) ?? null
        setSelectedApprovalDetail(fallback)
        setReviewNotes(String(fallback?.resolutionPayload?.feedback ?? ''))
      }
    }

    void hydrateApprovalDetail()

    return () => {
      active = false
    }
  }, [data.source, selectedApprovalId, runApprovals])

  useEffect(() => {
    let active = true

    async function hydrateArtifactDetail() {
      if (!selectedReviewArtifactId || data.source !== 'api' || !isUuid(selectedReviewArtifactId)) {
        setSelectedArtifactDetail(null)
        setArtifactDetailState('idle')
        setArtifactDetailError('')
        return
      }

      setArtifactDetailState('loading')
      setArtifactDetailError('')

      try {
        const detail = await loadArtifactDetail(selectedReviewArtifactId)
        if (!active) {
          return
        }

        setSelectedArtifactDetail(detail)
        setArtifactDetailState('ready')
      } catch (error) {
        if (!active) {
          return
        }

        const fallback = mockArtifactDetails[selectedReviewArtifactId] ?? null
        if (fallback) {
          setSelectedArtifactDetail(fallback)
          setArtifactDetailState('ready')
          return
        }

        setSelectedArtifactDetail(null)
        setArtifactDetailState('error')
        setArtifactDetailError(error instanceof Error ? error.message : 'Unable to load artifact detail')
      }
    }

    void hydrateArtifactDetail()

    return () => {
      active = false
    }
  }, [data.source, selectedReviewArtifactId])

  useEffect(() => {
    let active = true

    async function hydrateAdminSurface() {
      if (data.source !== 'api' || !isUuid(selectedRunStableId) || !selectedRepositoryStableId) {
        return
      }

      const [governance, secretAccessPlan, auditExport] = await Promise.all([
        loadGovernanceReport(selectedRunStableId).catch(() => mockGovernance),
        loadSecretAccessPlan(selectedRepositoryStableId).catch(() => mockSecretAccessPlan),
        loadRunAuditExport(selectedRunStableId).catch(() => mockAuditExport),
      ])

      if (!active) {
        return
      }

      setData((current) => ({
        ...current,
        governance,
        secretAccessPlan,
        auditExport,
      }))
    }

    void hydrateAdminSurface()

    return () => {
      active = false
    }
  }, [data.source, selectedRepositoryStableId, selectedRunStableId])

  const blockedTasks = runTasks.filter((task) => task.status === 'blocked')

  async function handleApprovalAction(status: ApprovalStatus) {
    if (!selectedApproval) {
      return
    }

    setActionPending(true)

    try {
      const updatedApproval = await updateApprovalDecision(selectedApproval.id, status, reviewNotes)

      setData((current) => ({
        ...current,
        approvals: current.approvals.map((approval) =>
          approval.id === updatedApproval.id ? updatedApproval : approval,
        ),
      }))
      setSelectedApprovalDetail(updatedApproval)
    } finally {
      setActionPending(false)
    }
  }

  async function refreshSwarmData(nextSelectedRunId?: string) {
    const nextData = await loadSwarmData()
    setData(nextData)
    setSelectedRunId(() => {
      if (nextSelectedRunId && nextData.runs.some((run) => run.id === nextSelectedRunId)) {
        return nextSelectedRunId
      }

      if (selectedRunId && nextData.runs.some((run) => run.id === selectedRunId)) {
        return selectedRunId
      }

      return nextData.runs[0]?.id ?? ''
    })
    setErrorText('')
  }

  async function handleCreateRepository() {
    if (!repoDraftName.trim() || !repoDraftUrl.trim()) {
      setErrorText('Repository name and URL are required.')
      return
    }

    setActionPending(true)

    try {
      const repository = await createRepository({
        name: repoDraftName.trim(),
        url: repoDraftUrl.trim(),
        provider: repoDraftProvider,
      })
      setRunDraftRepositoryId(repository.id)
      await refreshSwarmData()
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to register repository')
    } finally {
      setActionPending(false)
    }
  }

  async function handleCreateRun(autoStart: boolean) {
    if (!runDraftRepositoryId || !runDraftGoal.trim()) {
      setErrorText('Repository and run goal are required.')
      return
    }

    setActionPending(true)

    try {
      const run = await createRun({
        repositoryId: runDraftRepositoryId,
        goal: runDraftGoal.trim(),
        branchName: runDraftBranchName.trim() || undefined,
      })

      if (autoStart) {
        await startRun(run.id)
      }

      await refreshSwarmData(run.id)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to create run')
    } finally {
      setActionPending(false)
    }
  }

  async function handleStartSelectedRun() {
    if (!selectedRun) {
      setErrorText('Select a run first.')
      return
    }

    setActionPending(true)

    try {
      await startRun(selectedRun.id)
      await refreshSwarmData(selectedRun.id)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to start run')
    } finally {
      setActionPending(false)
    }
  }

  async function handleCreateTask() {
    if (!selectedRun || !taskDraftTitle.trim() || !taskDraftDescription.trim() || !taskDraftRole.trim()) {
      setErrorText('Run, title, description, and role are required for backlog items.')
      return
    }

    setActionPending(true)

    try {
      await createTask({
        runId: selectedRun.id,
        title: taskDraftTitle.trim(),
        description: taskDraftDescription.trim(),
        role: taskDraftRole.trim(),
      })
      setTaskDraftTitle('')
      setTaskDraftDescription('')
      await refreshSwarmData(selectedRun.id)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to create backlog item')
    } finally {
      setActionPending(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="backdrop-grid" aria-hidden="true" />

      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Codex Swarm operator console</p>
          <h1>Runs, reviews, and fleet state.</h1>
          <p className="lede">Use the board to watch work move, inspect blocked items, and step into review or admin detail only when needed.</p>
        </div>

        <div className="hero-metrics">
          <MetricCard label="Active runs" value={String(data.runs.filter((run) => run.status === 'in_progress' || run.status === 'awaiting_approval').length)} hint="In progress or waiting on review" />
          <MetricCard label="Pending approvals" value={String(data.approvals.filter((approval) => approval.status === 'pending').length)} hint="Items that need a decision" />
          <MetricCard label="Online nodes" value={String(data.workerNodes.filter((node) => node.status === 'online').length)} hint="Workers ready to claim dispatch" />
        </div>
      </header>

      <div className="view-switcher">
        {(['board', 'detail', 'review', 'admin'] as ViewMode[]).map((view) => (
          <button
            key={view}
            type="button"
            className={`view-tab ${selectedView === view ? 'is-active' : ''}`}
            onClick={() => setSelectedView(view)}
          >
            {view === 'board' ? 'Board' : view === 'detail' ? 'Run Detail' : view === 'review' ? 'Review' : 'Admin'}
          </button>
        ))}
      </div>

      <main className="board-layout">
        <aside className="panel panel-runs">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Active runs</p>
              <h2>Execution tracks</h2>
            </div>
            <span className="data-pill">{errorText ? 'API issue' : 'Live API'}</span>
          </div>

          <div className="control-stack">
            <section className="control-card">
              <div className="control-card-header">
                <strong>Register repository</strong>
                <span>Real API</span>
              </div>
              <label className="control-field">
                <span>Name</span>
                <input value={repoDraftName} onChange={(event) => setRepoDraftName(event.target.value)} />
              </label>
              <label className="control-field">
                <span>Remote URL</span>
                <input value={repoDraftUrl} onChange={(event) => setRepoDraftUrl(event.target.value)} />
              </label>
              <label className="control-field">
                <span>Provider</span>
                <select value={repoDraftProvider} onChange={(event) => setRepoDraftProvider(event.target.value as RepositoryProvider)}>
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                  <option value="local">Local</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <button type="button" className="action-button" onClick={handleCreateRepository} disabled={actionPending}>
                Register repository
              </button>
            </section>

            <section className="control-card">
              <div className="control-card-header">
                <strong>Create and start run</strong>
                <span>Live orchestration</span>
              </div>
              <label className="control-field">
                <span>Repository</span>
                <select value={runDraftRepositoryId} onChange={(event) => setRunDraftRepositoryId(event.target.value)}>
                  <option value="">Select repository</option>
                  {data.repositories.map((repository) => (
                    <option key={repository.id} value={repository.id}>
                      {repository.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control-field">
                <span>Goal</span>
                <textarea value={runDraftGoal} onChange={(event) => setRunDraftGoal(event.target.value)} rows={4} />
              </label>
              <label className="control-field">
                <span>Branch</span>
                <input value={runDraftBranchName} onChange={(event) => setRunDraftBranchName(event.target.value)} />
              </label>
              <div className="action-row">
                <button type="button" className="action-button action-button-secondary" onClick={() => handleCreateRun(false)} disabled={actionPending}>
                  Create only
                </button>
                <button type="button" className="action-button" onClick={() => handleCreateRun(true)} disabled={actionPending}>
                  Create and start
                </button>
              </div>
            </section>
          </div>

          <div className="action-row action-row-inline">
            <button type="button" className="action-button" onClick={handleStartSelectedRun} disabled={actionPending || !selectedRun}>
              Start selected run
            </button>
            {errorText ? <p className="control-error">{errorText}</p> : null}
          </div>

          <div className="run-stack">
            {data.runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className={`run-card ${run.id === selectedRun?.id ? 'is-selected' : ''}`}
                onClick={() => {
                  startTransition(() => setSelectedRunId(run.id))
                }}
              >
                <div className="run-card-topline">
                  <span className={`tone-chip tone-${runStatusTone[run.status]}`}>
                    {formatLabel(run.status)}
                  </span>
                  <span className="run-timestamp">{formatDate(run.updatedAt)}</span>
                </div>
                <h3>{run.goal}</h3>
                <p>
                  {run.pullRequestUrl
                    ? `PR #${run.pullRequestNumber ?? 'pending'} · ${formatLabel(run.pullRequestStatus ?? 'open')}`
                    : run.publishedBranch ?? run.branchName ?? 'Branch not assigned yet'}
                </p>
                <div className="run-card-meta">
                  <span className="role-chip">
                    {data.repositories.find((repository) => repository.id === run.repositoryId)?.provider ?? 'other'}
                  </span>
                  <span className={`tone-chip tone-${handoffTone[run.handoffStatus]}`}>{formatLabel(run.handoffStatus)}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="run-summary-grid">
            <MiniStat label="Blocked tasks" value={String(blockedTasks.length)} />
            <MiniStat label="Placement issues" value={String(runSessions.filter((session) => session.state === 'stale' || session.state === 'failed').length)} />
            <MiniStat label="Fleet alerts" value={String(runWorkerNodes.filter((node) => node.status !== 'online' || node.drainState !== 'active').length)} />
          </div>
        </aside>

        {selectedRun ? (
          <>
            <section className="panel panel-overview">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Run overview</p>
                  <h2>{selectedRepository?.name ?? 'Unlinked repository'}</h2>
                </div>
                <span className={`tone-chip tone-${runStatusTone[selectedRun.status]}`}>
                  {formatLabel(selectedRun.status)}
                </span>
              </div>

              <div className="overview-grid">
                <InfoCard label="Goal" value={selectedRun.goal} />
                <InfoCard label="Branch" value={selectedRun.branchName ?? 'Pending branch assignment'} />
                <InfoCard label="Published branch" value={selectedRun.publishedBranch ?? 'Not published yet'} />
                <InfoCard label="PR status" value={selectedRun.pullRequestStatus ? `${formatLabel(selectedRun.pullRequestStatus)}${selectedRun.pullRequestNumber ? ` · #${selectedRun.pullRequestNumber}` : ''}` : 'PR handoff not started'} />
                <InfoCard label="Repository" value={selectedRepository?.url ?? 'No URL available'} />
                <InfoCard label="Plan artifact" value={selectedRun.planArtifactPath ?? 'Not published yet'} />
              </div>

              <div className="signal-band">
                <div>
                  <p className="signal-label">Milestone</p>
                  <strong>{String(selectedRun.metadata?.phase ?? 'Unspecified')}</strong>
                </div>
                <div>
                  <p className="signal-label">Handoff</p>
                  <strong>{formatLabel(selectedRun.handoffStatus)}</strong>
                </div>
                <div>
                  <p className="signal-label">Hydration</p>
                  <strong>{loading ? 'Refreshing' : data.source === 'api' ? `Polling every ${REFRESH_MS / 1000}s` : 'Fallback snapshot'}</strong>
                </div>
              </div>
            </section>

            {selectedView === 'board' ? (
              <>
                <section className="panel panel-fleet">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Fleet visibility</p>
                      <h2>Node health, utilization, and drain state</h2>
                    </div>
                  </div>

                  <div className="fleet-grid">
                    {data.workerNodes.map((workerNode) => {
                      const assignedSessions = data.sessions.filter(
                        (session) => session.workerNodeId === workerNode.id,
                      ).length

                      return (
                        <article key={workerNode.id} className="fleet-card">
                          <div className="dag-card-header">
                            <strong>{workerNode.name}</strong>
                            <span className={`tone-chip tone-${workerNodeStatusTone[workerNode.status]}`}>
                              {workerNode.status}
                            </span>
                          </div>
                          <p>{workerNode.endpoint ?? 'No endpoint recorded'}</p>
                          <div className="inline-meta">
                            <span className={`tone-chip tone-${workerNodeDrainTone[workerNode.drainState]}`}>
                              {formatLabel(workerNode.drainState)}
                            </span>
                            <span className={`tone-chip tone-${workerNode.eligibleForScheduling ? 'success' : 'warning'}`}>
                              {workerNode.eligibleForScheduling ? 'schedulable' : 'held'}
                            </span>
                          </div>
                          <p>{nodeUtilizationSummary(workerNode, assignedSessions)}</p>
                          <div className="dependency-strip">
                            {workerNode.capabilityLabels.map((label) => (
                              <span key={label} className="dependency-chip">
                                {label}
                              </span>
                            ))}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>

                <section className="panel panel-provider">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Repository onboarding</p>
                      <h2>Provider and handoff readiness</h2>
                    </div>
                  </div>

                  <div className="provider-grid">
                    <article className="detail-card">
                      <p className="panel-kicker">Provider link</p>
                      <strong>{selectedRepository ? `${selectedRepository.provider} · ${selectedRepository.name}` : 'Repository missing'}</strong>
                      <p>{describeRepositoryOnboarding(selectedRepository)}</p>
                      <div className="inline-meta">
                        <span className={`tone-chip tone-${selectedRepository ? repositoryTrustTone[selectedRepository.trustLevel] : 'warning'}`}>
                          {selectedRepository?.trustLevel ?? 'untracked'}
                        </span>
                        <span className="role-chip">{selectedRepository?.defaultBranch ?? 'main'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Branch publish</p>
                      <strong>{selectedRun.publishedBranch ?? 'Waiting for publish'}</strong>
                      <p>{describeHandoff(selectedRun)}</p>
                      <div className="inline-meta">
                        <span className={`tone-chip tone-${handoffTone[selectedRun.handoffStatus]}`}>
                          {formatLabel(selectedRun.handoffStatus)}
                        </span>
                        <span>{selectedRun.branchPublishedAt ? formatDate(selectedRun.branchPublishedAt) : 'Not published'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Pull request</p>
                      <strong>{selectedRun.pullRequestUrl ? `#${selectedRun.pullRequestNumber ?? 'pending'}` : 'No PR yet'}</strong>
                      <p>{selectedRun.pullRequestUrl ? 'Provider handoff is live and linked below.' : 'The board is waiting for the provider to create or attach a pull request.'}</p>
                      {selectedRun.pullRequestUrl ? (
                        <a className="inline-link" href={selectedRun.pullRequestUrl} target="_blank" rel="noreferrer">
                          Open pull request
                        </a>
                      ) : null}
                    </article>
                  </div>
                </section>

                <section className="panel panel-board-signals">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Board signals</p>
                      <h2>Pending approvals and recent validations</h2>
                    </div>
                  </div>

                  <div className="board-signal-grid">
                    <article className="board-signal-card">
                      <div className="task-column-header">
                        <h3>Pending approvals</h3>
                        <span>{pendingApprovals.length}</span>
                      </div>

                      <div className="signal-list">
                        {pendingApprovals.map((approval) => (
                          <article key={approval.id} className="approval-card">
                            <div className="approval-title">
                              <strong>{approval.kind}</strong>
                              <span className={`tone-chip tone-${approvalStatusTone[approval.status]}`}>
                                {approval.status}
                              </span>
                            </div>
                            <p>{summarizeApprovalForBoard(approval)}</p>
                            <div className="approval-meta">
                              <span>{approval.requestedBy}</span>
                              <span>{approval.taskId ? `task ${approval.taskId.slice(0, 8)}` : 'run scoped'}</span>
                            </div>
                          </article>
                        ))}
                        {pendingApprovals.length === 0 ? (
                          <div className="empty-state">No pending approvals on this board.</div>
                        ) : null}
                      </div>
                    </article>

                    <article className="board-signal-card">
                      <div className="task-column-header">
                        <h3>Recent validations</h3>
                        <span>{boardValidations.length}</span>
                      </div>

                      <div className="signal-list">
                        {boardValidations.map((validation) => (
                          <article key={validation.id} className="validation-card">
                            <div className="validation-title">
                              <strong>{validation.name}</strong>
                              <span className={`tone-chip tone-${validationStatusTone[validation.status]}`}>
                                {validation.status}
                              </span>
                            </div>
                            <code>{validation.command}</code>
                            <p>{summarizeValidationForBoard(validation)}</p>
                          </article>
                        ))}
                        {boardValidations.length === 0 ? (
                          <div className="empty-state">No validation records published yet.</div>
                        ) : null}
                      </div>
                    </article>
                  </div>
                </section>

                <section className="panel panel-board">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Task board</p>
                      <h2>Status lanes and blockers</h2>
                    </div>

                    <div className="panel-actions">
                      <label className="search-field">
                        <span className="visually-hidden">Filter tasks</span>
                        <input
                          type="search"
                          value={taskQuery}
                          onChange={(event) => setTaskQuery(event.target.value)}
                          placeholder="Filter tasks, roles, or milestones"
                        />
                      </label>
                      <div className="inline-form">
                        <input
                          value={taskDraftTitle}
                          onChange={(event) => setTaskDraftTitle(event.target.value)}
                          placeholder="Backlog item title"
                        />
                        <input
                          value={taskDraftRole}
                          onChange={(event) => setTaskDraftRole(event.target.value)}
                          placeholder="Role"
                        />
                        <input
                          value={taskDraftDescription}
                          onChange={(event) => setTaskDraftDescription(event.target.value)}
                          placeholder="Implementation brief"
                        />
                        <button type="button" className="action-button" onClick={handleCreateTask} disabled={actionPending || !selectedRun}>
                          Add backlog item
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="task-columns">
                    {taskStatusOrder.map((status) => {
                      const laneTasks = visibleTasks.filter((task) => task.status === status)

                      return (
                        <section key={status} className="task-column">
                          <div className="task-column-header">
                            <h3>{formatLabel(status)}</h3>
                            <span>{laneTasks.length}</span>
                          </div>

                          <div className="task-list">
                            {laneTasks.map((task) => (
                              <article key={task.id} className="task-card">
                                <div className="task-card-topline">
                                  <span className="role-chip">{task.role}</span>
                                  <span className="priority-chip">P{task.priority}</span>
                                </div>
                                <h4>{task.title}</h4>
                                <p>{task.description}</p>
                                {task.dependencyIds.length > 0 ? (
                                  <div className="dependency-strip">
                                    {task.dependencyIds.map((dependencyId) => (
                                      <span key={dependencyId} className="dependency-chip">
                                        blocked by {dependencyId.slice(0, 8)}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                <ul>
                                  {task.acceptanceCriteria.map((criterion) => (
                                    <li key={criterion}>{criterion}</li>
                                  ))}
                                </ul>
                              </article>
                            ))}

                            {laneTasks.length === 0 ? (
                              <div className="empty-state">No tasks in this lane.</div>
                            ) : null}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                </section>

                <section className="panel panel-dag">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Task DAG</p>
                      <h2>Dependencies and unblock path</h2>
                    </div>
                  </div>

                  <div className="dag-list">
                    {runTasks.map((task) => (
                      <article key={task.id} className="dag-card">
                          <div className="dag-card-header">
                            <strong>{task.title}</strong>
                            <span className={`tone-chip tone-${runStatusToneForTask(task.status)}`}>
                              {formatLabel(task.status)}
                            </span>
                          </div>
                        <p>{task.description}</p>
                        <div className="dag-meta">
                          <span>{task.role}</span>
                          <span>{task.parentTaskId ? `parent ${task.parentTaskId.slice(0, 8)}` : 'top-level task'}</span>
                        </div>
                        <div className="dag-edges">
                          <span className="dag-label">Dependencies</span>
                          {task.dependencyIds.length > 0 ? (
                            task.dependencyIds.map((dependencyId) => (
                              <span key={dependencyId} className="dependency-chip">
                                {dependencyId.slice(0, 8)}
                              </span>
                            ))
                          ) : (
                            <span className="dependency-chip is-clear">ready</span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="panel panel-agents">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Agent lanes</p>
                      <h2>Worker ownership, placement, and session state</h2>
                    </div>
                  </div>

                  <div className="agent-lanes">
                    {runAgents.map((agent) => {
                      const agentTask = runTasks.find((task) => task.id === agent.currentTaskId)
                      const session = runSessions.find((item) => item.agentId === agent.id)
                      const workerNode = data.workerNodes.find((item) => item.id === session?.workerNodeId) ?? null

                      return (
                        <article key={agent.id} className="agent-card">
                          <div className="agent-card-topline">
                            <div>
                              <h3>{agent.name}</h3>
                              <p>{agent.role}</p>
                            </div>
                            <span className={`tone-chip tone-${agentStatusTone[agent.status]}`}>
                              {agent.status}
                            </span>
                          </div>

                          <dl>
                            <div>
                              <dt>Current task</dt>
                              <dd>{agentTask?.title ?? 'No task assigned'}</dd>
                            </div>
                            <div>
                              <dt>Branch</dt>
                              <dd>{agent.branchName ?? 'Branch pending'}</dd>
                            </div>
                            <div>
                              <dt>Session</dt>
                              <dd>{session?.threadId ?? 'No Codex session recorded'}</dd>
                            </div>
                            <div>
                              <dt>Placement</dt>
                              <dd>{workerNode?.name ?? session?.workerNodeId ?? 'Not placed'}</dd>
                            </div>
                            <div>
                              <dt>Session state</dt>
                              <dd>{session ? formatLabel(session.state) : 'Unknown'}</dd>
                            </div>
                            <div>
                              <dt>Heartbeat</dt>
                              <dd>{formatRelativeHeartbeat(agent.lastHeartbeatAt)}</dd>
                            </div>
                          </dl>
                          {session ? (
                            <div className="inline-meta">
                              <span className={`tone-chip tone-${workerSessionTone[session.state]}`}>
                                {formatLabel(session.state)}
                              </span>
                              {workerNode ? (
                                <span className={`tone-chip tone-${workerNodeDrainTone[workerNode.drainState]}`}>
                                  {formatLabel(workerNode.drainState)}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </section>
              </>
            ) : null}

            {selectedView === 'detail' ? (
              <>
                <section className="panel panel-detail">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Run detail</p>
                      <h2>Lifecycle, placement, and handoff</h2>
                    </div>
                  </div>

                  <div className="detail-grid">
                    <article className="detail-card">
                      <p className="panel-kicker">Repository</p>
                      <strong>{selectedRepository ? `${selectedRepository.provider} / ${selectedRepository.name}` : 'Repository missing'}</strong>
                      <p>{describeRepositoryOnboarding(selectedRepository)}</p>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Fleet posture</p>
                      <strong>
                        {runWorkerNodes.some((node) => node.status === 'offline')
                          ? 'Offline node in path'
                          : runWorkerNodes.some((node) => node.status === 'degraded' || node.drainState !== 'active')
                            ? 'Drain or degraded state present'
                            : 'Healthy'}
                      </strong>
                      <p>
                        {runWorkerNodes.some((node) => node.status === 'offline')
                          ? 'A placement node is offline and the run may need reassignment or retry.'
                          : runWorkerNodes.some((node) => node.status === 'degraded' || node.drainState !== 'active')
                            ? 'A placement node is degraded or draining, so scheduling and recovery need operator attention.'
                            : 'The nodes attached to this run are healthy and accepting assignments.'}
                      </p>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Session reconciliation</p>
                      <strong>{runSessions.length} sessions tracked</strong>
                      <p>Each run detail payload is now carrying session state, worker node placement, sticky assignment, and constraint labels.</p>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">PR handoff</p>
                      <strong>{selectedRun.pullRequestUrl ? `PR #${selectedRun.pullRequestNumber ?? 'pending'} ${formatLabel(selectedRun.pullRequestStatus ?? 'open')}` : formatLabel(selectedRun.handoffStatus)}</strong>
                      <p>{describeHandoff(selectedRun)}</p>
                    </article>
                  </div>
                </section>

                <section className="panel panel-provider-detail">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Provider detail</p>
                      <h2>Onboarding and PR reflection</h2>
                    </div>
                  </div>

                  <div className="provider-detail-grid">
                    <article className="detail-card">
                      <p className="panel-kicker">Onboarding state</p>
                      <strong>{selectedRepository ? `${selectedRepository.provider} / ${selectedRepository.trustLevel}` : 'Unlinked'}</strong>
                      <div className="detail-list">
                        <span>Remote: {selectedRepository?.url ?? 'Not recorded'}</span>
                        <span>Default branch: {selectedRepository?.defaultBranch ?? 'main'}</span>
                        <span>Checkout: {selectedRepository?.localPath ?? 'Missing local path'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Publish state</p>
                      <strong>{selectedRun.publishedBranch ?? 'Pending publish'}</strong>
                      <div className="detail-list">
                        <span>Requested branch: {selectedRun.branchName ?? 'Not assigned'}</span>
                        <span>Published branch: {selectedRun.publishedBranch ?? 'Not published'}</span>
                        <span>Published at: {selectedRun.branchPublishedAt ? formatDate(selectedRun.branchPublishedAt) : 'Awaiting provider publish'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Pull request reflection</p>
                      <strong>{selectedRun.pullRequestStatus ? formatLabel(selectedRun.pullRequestStatus) : 'Not linked'}</strong>
                      <div className="detail-list">
                        <span>Handoff state: {formatLabel(selectedRun.handoffStatus)}</span>
                        <span>PR number: {selectedRun.pullRequestNumber ? `#${selectedRun.pullRequestNumber}` : 'Pending'}</span>
                        <span>PR link: {selectedRun.pullRequestUrl ?? 'No provider URL yet'}</span>
                      </div>
                      {selectedRun.pullRequestUrl ? (
                        <a className="inline-link" href={selectedRun.pullRequestUrl} target="_blank" rel="noreferrer">
                          Open provider link
                        </a>
                      ) : null}
                    </article>
                  </div>
                </section>

                <section className="panel panel-placement">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Placement surface</p>
                      <h2>Session placement and node diagnostics</h2>
                    </div>
                  </div>

                  <div className="placement-grid">
                    {runSessions.map((session) => {
                      const agent = runAgents.find((item) => item.id === session.agentId)
                      const workerNode = data.workerNodes.find((item) => item.id === session.workerNodeId) ?? null
                      const stickyNode = data.workerNodes.find((item) => item.id === session.stickyNodeId) ?? null

                      return (
                        <article key={session.id} className="placement-card">
                          <div className="dag-card-header">
                            <strong>{agent?.name ?? session.agentId}</strong>
                            <span className={`tone-chip tone-${workerSessionTone[session.state]}`}>
                              {formatLabel(session.state)}
                            </span>
                          </div>
                          <p>{describePlacement(session, workerNode, stickyNode)}</p>
                          <div className="detail-list">
                            <span>Thread: {session.threadId}</span>
                            <span>Current node: {workerNode?.name ?? session.workerNodeId ?? 'Not placed'}</span>
                            <span>Sticky node: {stickyNode?.name ?? session.stickyNodeId ?? 'None'}</span>
                            <span>Constraints: {session.placementConstraintLabels.length > 0 ? session.placementConstraintLabels.join(', ') : 'None'}</span>
                            <span>Stale reason: {session.staleReason ?? 'No stale marker'}</span>
                          </div>
                          {workerNode ? (
                            <div className="inline-meta">
                              <span className={`tone-chip tone-${workerNodeStatusTone[workerNode.status]}`}>
                                {workerNode.status}
                              </span>
                              <span className={`tone-chip tone-${workerNodeDrainTone[workerNode.drainState]}`}>
                                {formatLabel(workerNode.drainState)}
                              </span>
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </section>

                <section className="panel panel-recovery">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Recovery surface</p>
                      <h2>Sessions, stale workers, and node impact</h2>
                    </div>
                  </div>

                  <div className="recovery-list">
                    {runSessions.map((session) => {
                      const agent = runAgents.find((item) => item.id === session.agentId)

                      return (
                        <article key={session.id} className="recovery-card">
                          <div className="dag-card-header">
                            <strong>{agent?.name ?? session.agentId}</strong>
                            <span className={`tone-chip tone-${agent ? agentStatusTone[agent.status] : 'muted'}`}>
                              {agent?.status ?? 'unknown'}
                            </span>
                          </div>
                          <p>{session.threadId}</p>
                          <div className="recovery-meta">
                            <span>{session.workerNodeId ?? 'No worker node'}</span>
                            <span>{formatLabel(session.state)}</span>
                            <span>{session.cwd}</span>
                            <span>{session.sandbox}</span>
                            <span>{session.approvalPolicy}</span>
                          </div>
                          {session.staleReason ? <p>{session.staleReason}</p> : null}
                        </article>
                      )
                    })}
                  </div>
                </section>

                <section className="panel panel-activity">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Activity</p>
                      <h2>Recent run events</h2>
                    </div>
                  </div>

                  <div className="activity-list">
                    {activity.map((item) => (
                      <article key={item.id} className="activity-card">
                        <div className="activity-topline">
                          <span className="role-chip">{item.kind}</span>
                          <span className={`tone-chip tone-${item.tone}`}>{formatDate(item.timestamp)}</span>
                        </div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {selectedView === 'review' ? (
              <>
                <section className="panel panel-review">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Review workspace</p>
                      <h2>Approvals and decision flow</h2>
                    </div>
                  </div>

                  <div className="review-grid">
                    <div className="review-list">
                      {runApprovals.map((approval) => (
                        <button
                          key={approval.id}
                          type="button"
                          className={`review-card ${approval.id === selectedApproval?.id ? 'is-selected' : ''}`}
                          onClick={() => setSelectedApprovalId(approval.id)}
                        >
                          <div className="approval-title">
                            <strong>{approval.kind}</strong>
                            <span className={`tone-chip tone-${approvalStatusTone[approval.status]}`}>
                              {approval.status}
                            </span>
                          </div>
                          <p>
                            {approval.status === 'pending'
                              ? String(approval.requestedPayload?.summary ?? 'Awaiting a reviewer decision.')
                              : String(approval.resolutionPayload?.feedback ?? 'No resolution feedback returned.')}
                          </p>
                          <div className="approval-meta">
                            <span>{approval.requestedBy}</span>
                            <span>{approval.resolver ?? 'Reviewer unassigned'}</span>
                          </div>
                        </button>
                      ))}
                      {runApprovals.length === 0 ? (
                        <div className="empty-state">No approvals returned for this run.</div>
                      ) : null}
                    </div>

                    <div className="review-editor">
                      <p className="panel-kicker">Decision workspace</p>
                      <h3>{selectedApprovalDetail?.kind ?? selectedApproval?.kind ?? 'Select an approval'}</h3>
                      <p>
                        {selectedApprovalDetail
                          ? String(selectedApprovalDetail.requestedPayload?.summary ?? 'No request summary attached yet.')
                          : 'Choose an approval request to inspect its context and record a reviewer decision.'}
                      </p>
                      <div className="contract-surface">
                        <div className="contract-card">
                          <span className="panel-kicker">Requested context</span>
                          <strong>{selectedApprovalDetail?.requestedBy ?? selectedApproval?.requestedBy ?? 'No requester selected'}</strong>
                          <p>{String(selectedApprovalDetail?.requestedPayload?.summary ?? 'No textual request summary attached yet.')}</p>
                          <pre>{formatPayload(selectedApprovalDetail?.requestedPayload)}</pre>
                        </div>
                        <div className="contract-card">
                          <span className="panel-kicker">Resolution</span>
                          <strong>{selectedApprovalDetail?.resolver ?? 'Unresolved'}</strong>
                          <p>
                            {selectedApprovalDetail?.resolvedAt
                              ? `Resolved ${formatDate(selectedApprovalDetail.resolvedAt)}`
                              : 'No explicit resolver metadata returned yet.'}
                          </p>
                          <pre>{formatPayload(selectedApprovalDetail?.resolutionPayload)}</pre>
                        </div>
                      </div>

                      <div className="diff-review-surface">
                        <div className="diff-surface-header">
                          <div>
                            <p className="panel-kicker">Diff summary</p>
                            <h4>{selectedArtifactDetail?.diffSummary?.title ?? selectedReviewArtifact?.path ?? 'Reviewer evidence'}</h4>
                          </div>
                          {reviewDiffArtifacts.length > 1 ? (
                            <label className="artifact-picker">
                              <span>Artifact</span>
                              <select
                                value={selectedReviewArtifact?.id ?? ''}
                                onChange={(event) => setSelectedReviewArtifactId(event.target.value)}
                              >
                                {reviewDiffArtifacts.map((artifact) => (
                                  <option key={artifact.id} value={artifact.id}>
                                    {artifact.path}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                        </div>

                        {artifactDetailState === 'loading' ? (
                          <div className="empty-state">Loading diff summary for reviewer inspection.</div>
                        ) : null}

                        {artifactDetailState === 'error' ? (
                          <div className="empty-state">
                            Unable to load diff detail. {artifactDetailError || 'The artifact endpoint returned an error.'}
                          </div>
                        ) : null}

                        {artifactDetailState !== 'loading' && artifactDetailState !== 'error' && !selectedReviewArtifact ? (
                          <div className="empty-state">
                            No diff artifact is linked to this approval yet. Generic artifacts remain available below.
                          </div>
                        ) : null}

                        {selectedArtifactDetail?.diffSummary ? (
                          <>
                            <div className="diff-summary-metrics">
                              <article className="diff-metric-card">
                                <span className="panel-kicker">Change summary</span>
                                <strong>{selectedArtifactDetail.diffSummary.changeSummary ?? 'Diff metadata is available.'}</strong>
                                <p>{describeArtifactContentState(selectedArtifactDetail.contentState)}</p>
                              </article>
                              <article className="diff-metric-card">
                                <span className="panel-kicker">Files changed</span>
                                <strong>{selectedArtifactDetail.diffSummary.filesChanged}</strong>
                                <p>{selectedArtifactDetail.diffSummary.insertions} insertions · {selectedArtifactDetail.diffSummary.deletions} deletions</p>
                              </article>
                              <article className="diff-metric-card">
                                <span className="panel-kicker">Artifact path</span>
                                <strong>{selectedArtifactDetail.artifact.path}</strong>
                                <p>{selectedArtifactDetail.artifact.contentType}</p>
                              </article>
                            </div>

                            <div className="diff-file-list">
                              {selectedArtifactDetail.diffSummary.fileSummaries.map((fileSummary) => (
                                <article key={`${fileSummary.path}-${fileSummary.changeType}`} className="diff-file-card">
                                  <div className="diff-file-topline">
                                    <strong>{fileSummary.path}</strong>
                                    <span className={`tone-chip tone-${fileSummary.changeType === 'deleted' ? 'danger' : fileSummary.changeType === 'added' ? 'success' : 'active'}`}>
                                      {formatDiffChangeType(fileSummary.changeType)}
                                    </span>
                                  </div>
                                  <p>{fileSummary.summary ?? `${fileSummary.additions} additions, ${fileSummary.deletions} deletions`}</p>
                                  <div className="inline-meta">
                                    <span>+{fileSummary.additions}</span>
                                    <span>-{fileSummary.deletions}</span>
                                    {fileSummary.previousPath ? <span>from {fileSummary.previousPath}</span> : null}
                                    {fileSummary.providerUrl ? (
                                      <a className="inline-link" href={fileSummary.providerUrl} target="_blank" rel="noreferrer">
                                        Open provider view
                                      </a>
                                    ) : null}
                                  </div>
                                </article>
                              ))}
                              {selectedArtifactDetail.diffSummary.fileSummaries.length === 0 ? (
                                <div className="empty-state">
                                  The diff artifact did not return per-file summaries. Use the preview below for reviewer context.
                                </div>
                              ) : null}
                            </div>

                            <div className="contract-surface">
                              <div className="contract-card">
                                <span className="panel-kicker">Reviewer context</span>
                                <strong>{selectedArtifactDetail.diffSummary.changeSummary ?? 'Stored diff metadata'}</strong>
                                <p>{selectedArtifactDetail.bodyText ? 'The backend returned reviewer-readable diff text.' : 'Only summary metadata is available for this artifact.'}</p>
                                <pre>{selectedArtifactDetail.bodyText ?? 'No inline body text returned for this artifact.'}</pre>
                              </div>
                              <div className="contract-card">
                                <span className="panel-kicker">Raw diff preview</span>
                                <strong>{selectedArtifactDetail.diffSummary.truncated ? 'Partial preview' : 'Inline preview'}</strong>
                                <p>
                                  {selectedArtifactDetail.diffSummary.providerUrl
                                    ? 'A provider review link is available for deeper inspection.'
                                    : 'This preview is rendered from the stored artifact detail endpoint.'}
                                </p>
                                <pre>
                                  {selectedArtifactDetail.diffSummary.rawDiff
                                    ?? selectedArtifactDetail.diffSummary.diffPreview
                                    ?? 'No diff preview returned for this artifact.'}
                                </pre>
                                {selectedArtifactDetail.diffSummary.providerUrl ? (
                                  <a className="inline-link" href={selectedArtifactDetail.diffSummary.providerUrl} target="_blank" rel="noreferrer">
                                    Open provider diff
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                      <label className="notes-field">
                        <span>Resolution notes</span>
                        <textarea
                          value={reviewNotes}
                          onChange={(event) => setReviewNotes(event.target.value)}
                          placeholder="Record the reviewer decision or rejection feedback"
                          rows={7}
                          disabled={!selectedApproval || actionPending}
                        />
                      </label>
                      <div className="action-row">
                        <button
                          type="button"
                          className="action-button approve"
                          disabled={!selectedApproval || actionPending}
                          onClick={() => void handleApprovalAction('approved')}
                        >
                          Approve request
                        </button>
                        <button
                          type="button"
                          className="action-button reject"
                          disabled={!selectedApproval || actionPending}
                          onClick={() => void handleApprovalAction('rejected')}
                        >
                          Reject with feedback
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="panel panel-validation">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Validation history</p>
                      <h2>Recent checks and reports</h2>
                    </div>
                  </div>

                  <div className="validation-list">
                    {runValidations.map((validation) => (
                      <article key={validation.id} className="validation-card">
                        <div className="validation-title">
                          <strong>{validation.name}</strong>
                          <span className={`tone-chip tone-${validationStatusTone[validation.status]}`}>
                            {validation.status}
                          </span>
                        </div>
                        <code>{validation.command}</code>
                        <p>{validation.summary ?? 'No summary available.'}</p>
                      </article>
                    ))}
                    {runValidations.length === 0 ? (
                      <div className="empty-state">No validation records published yet.</div>
                    ) : null}
                  </div>
                </section>

                <section className="panel panel-artifacts">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Artifact review</p>
                      <h2>Logs, reports, and handoff payloads</h2>
                    </div>
                  </div>

                  <div className="artifact-list">
                    {runArtifacts.map((artifact) => (
                      <article key={artifact.id} className="artifact-card">
                        <span className="role-chip">{artifact.kind}</span>
                        {artifact.kind === 'pr_link' ? (
                          <a className="inline-link" href={artifact.path} target="_blank" rel="noreferrer">
                            Open pull request artifact
                          </a>
                        ) : (
                          <strong>{artifact.path}</strong>
                        )}
                        <p>{artifact.contentType}</p>
                      </article>
                    ))}
                    {runArtifacts.length === 0 ? (
                      <div className="empty-state">No artifacts published yet.</div>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}

            {selectedView === 'admin' ? (
              <>
                <section className="panel panel-admin-identity">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Admin context</p>
                      <h2>Actor, workspace, and delegated policy state</h2>
                    </div>
                  </div>

                  <div className="provider-detail-grid">
                    <article className="detail-card">
                      <p className="panel-kicker">Principal</p>
                      <strong>{data.identity.subject}</strong>
                      <div className="detail-list">
                        <span>Principal: {data.identity.principal}</span>
                        <span>Role: {data.identity.roles.join(', ')}</span>
                        <span>Actor type: {data.identity.actorType}</span>
                        <span>Email: {data.identity.email ?? 'No email asserted'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Workspace boundary</p>
                      <strong>{data.identity.workspace.name}</strong>
                      <div className="detail-list">
                        <span>Workspace ID: {data.identity.workspace.id}</span>
                        <span>Team: {data.identity.team.name}</span>
                        <span>Team ID: {data.identity.team.id}</span>
                        <span>Policy profile: {data.governance.requestedBy.policyProfile ?? 'standard'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Selected run</p>
                      <strong>{selectedRun.goal}</strong>
                      <div className="detail-list">
                        <span>Repository profile: {selectedRepository?.approvalProfile ?? selectedRun.policyProfile ?? 'standard'}</span>
                        <span>Run policy: {selectedRun.policyProfile ?? 'standard'}</span>
                        <span>Delegation state: {runAgents.length} agents / {runSessions.length} sessions</span>
                        <span>Workspace-scoped actor report generated {formatDate(data.governance.generatedAt)}</span>
                      </div>
                    </article>
                  </div>
                </section>

                <section className="panel panel-admin-governance">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Governance report</p>
                      <h2>Policy visibility and retention posture</h2>
                    </div>
                  </div>

                  <div className="admin-grid">
                    <article className="detail-card">
                      <p className="panel-kicker">Approvals</p>
                      <strong>{data.governance.approvals.total} governed approvals</strong>
                      <div className="detail-list">
                        <span>Pending: {data.governance.approvals.pending}</span>
                        <span>Approved: {data.governance.approvals.approved}</span>
                        <span>Rejected: {data.governance.approvals.rejected}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Retention</p>
                      <strong>{data.governance.retention.policy.runsDays} day run window</strong>
                      <div className="detail-list">
                        <span>Runs retained: {data.governance.retention.runs.retained} / {data.governance.retention.runs.total}</span>
                        <span>Artifacts retained: {data.governance.retention.artifacts.retained} / {data.governance.retention.artifacts.total}</span>
                        <span>Events expired: {data.governance.retention.events.expired}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Secrets boundary</p>
                      <strong>{data.governance.secrets.sourceMode}</strong>
                      <div className="detail-list">
                        <span>Policy-driven access: {data.governance.secrets.policyDrivenAccess ? 'enabled' : 'disabled'}</span>
                        <span>Trust levels: {data.governance.secrets.allowedRepositoryTrustLevels.join(', ')}</span>
                        <span>Credentials: {data.governance.secrets.remoteCredentialEnvNames.join(', ') || 'None listed'}</span>
                      </div>
                    </article>
                  </div>
                </section>

                <section className="panel panel-admin-provenance">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Approval provenance</p>
                      <h2>Who requested, delegated, and resolved approvals</h2>
                    </div>
                  </div>

                  <div className="provenance-list">
                    {data.governance.approvals.history.map((entry) => (
                      <article key={entry.approvalId} className="placement-card">
                        <div className="dag-card-header">
                          <strong>{entry.kind}</strong>
                          <span className={`tone-chip tone-${approvalStatusTone[entry.status]}`}>
                            {entry.status}
                          </span>
                        </div>
                        <p>{String(entry.requestedPayload?.summary ?? 'No textual approval summary recorded.')}</p>
                        <div className="detail-list">
                          <span>Requested by: {entry.requestedBy}</span>
                          <span>Requested actor: {formatActorLabel(entry.requestedByActor)}</span>
                          <span>Resolved by: {entry.resolver ?? 'Pending'}</span>
                          <span>Resolver actor: {formatActorLabel(entry.resolverActor)}</span>
                          <span>Policy profile: {entry.policyProfile ?? 'standard'}</span>
                          <span>Resolved at: {entry.resolvedAt ? formatDate(entry.resolvedAt) : 'Not resolved'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="panel panel-admin-audit">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Audit and secrets</p>
                      <h2>Run audit export and repository secret access</h2>
                    </div>
                  </div>

                  <div className="admin-grid">
                    <article className="detail-card">
                      <p className="panel-kicker">Secret access plan</p>
                      <strong>{data.secretAccessPlan?.access ?? 'Unknown access'}</strong>
                      <div className="detail-list">
                        <span>Repository: {data.secretAccessPlan?.repositoryName ?? selectedRepository?.name ?? 'Unknown'}</span>
                        <span>Policy profile: {data.secretAccessPlan?.policyProfile ?? selectedRun.policyProfile ?? 'standard'}</span>
                        <span>Credentials: {data.secretAccessPlan?.credentialEnvNames.join(', ') || 'None listed'}</span>
                        <span>Boundary: {data.secretAccessPlan?.distributionBoundary.join(', ') || 'No boundary text returned'}</span>
                        <span>Reason: {data.secretAccessPlan?.reason ?? 'No reason returned'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Audit export</p>
                      <strong>{data.auditExport ? formatDate(data.auditExport.exportedAt) : 'Not exported'}</strong>
                      <div className="detail-list">
                        <span>Exported by: {data.auditExport ? formatActorLabel(data.auditExport.provenance.exportedBy) : 'Unknown'}</span>
                        <span>Event actors: {data.auditExport?.provenance.eventActors.length ?? 0}</span>
                        <span>Audit events: {data.auditExport?.events.length ?? 0}</span>
                        <span>Approval entries: {data.auditExport?.provenance.approvals.length ?? 0}</span>
                        <span>Run retention policy: {data.auditExport ? `${data.auditExport.retention.policy.runsDays} days` : 'Unknown'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Repository profiles</p>
                      <strong>{data.governance.policies.repositoryProfiles.length} active profiles</strong>
                      <div className="detail-list">
                        {data.governance.policies.repositoryProfiles.map((profile) => (
                          <span key={profile.profile}>
                            {profile.profile}: {profile.repositoryCount} repos / {profile.runCount} runs
                          </span>
                        ))}
                      </div>
                    </article>
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </main>

      <footer className="footer-bar">
        <span>{loading ? 'Refreshing board state…' : 'Board data ready.'}</span>
        <span>
          {errorText
            ? `API fallback active: ${errorText}`
            : data.source === 'api'
              ? 'Live repositories, worker nodes, governance/admin views, approvals, audits, and messages are polling.'
              : 'Using fallback seed data until the API is reachable.'}
        </span>
      </footer>
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{hint}</span>
    </article>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="info-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function runStatusToneForTask(status: TaskStatus): 'muted' | 'warning' | 'success' | 'danger' | 'active' {
  if (status === 'completed') {
    return 'success'
  }

  if (status === 'failed') {
    return 'danger'
  }

  if (status === 'blocked' || status === 'awaiting_review') {
    return 'warning'
  }

  if (status === 'in_progress') {
    return 'active'
  }

  return 'muted'
}

export default App
