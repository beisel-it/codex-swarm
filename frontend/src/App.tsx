import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  ExternalEventReceipt as ContractExternalEventReceipt,
  RepeatableRunDefinition as ContractRepeatableRunDefinition,
  RepeatableRunDefinitionCreateInput,
  RepeatableRunTrigger as ContractRepeatableRunTrigger,
  RepeatableRunTriggerCreateInput,
} from '../../packages/contracts/src/index.ts'
import { buildAgentTranscriptTargets, chooseTranscriptSessionId } from './agent-observability'
import { RepeatableRunsPanel } from './repeatable-runs-panel'
import { buildSeedProjects, deriveAdHocWorkspace, deriveProjectSummaries, type ProjectRecord } from './projects'
import { RepeatableRunsPanel } from './repeatable-runs-panel'
import { useTheme } from './theme'

type ViewMode = 'projects' | 'board' | 'detail' | 'review' | 'admin'
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
type AgentObservabilityMode = 'session' | 'transcript_visibility' | 'unavailable'
type AgentObservabilityLineageSource =
  | 'active_session'
  | 'session_rollover'
  | 'task_reassignment'
  | 'task_state_transition'
  | 'terminal_session'
  | 'not_started'
type ApprovalStatus = 'pending' | 'approved' | 'rejected'
type ValidationStatus = 'pending' | 'passed' | 'failed'
type ArtifactKind = 'plan' | 'patch' | 'log' | 'report' | 'diff' | 'screenshot' | 'pr_link' | 'other'
type ActorType = 'system' | 'user' | 'service'
type SessionTranscriptEntry = {
  id: string
  sessionId: string
  kind: 'prompt' | 'response' | 'system'
  text: string
  createdAt: string
  metadata?: Record<string, unknown>
}

type TeamTemplateMember = {
  key: string
  displayName: string
  roleProfile: string
  responsibility: string
}

type TeamTemplate = {
  id: string
  name: string
  summary: string
  focus: 'delivery' | 'platform'
  suggestedGoal: string
  suggestedConcurrencyCap: number
  members: TeamTemplateMember[]
}

type PendingDeleteAction =
  | { kind: 'project'; id: string; label: string }
  | { kind: 'repository'; id: string; label: string }
  | { kind: 'run'; id: string; label: string }

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

type TaskDagNode = {
  taskId: string
  title: string
  role: string
  status: TaskStatus
  parentTaskId: string | null
  dependencyIds: string[]
  dependentTaskIds: string[]
  blockedByTaskIds: string[]
  isRoot: boolean
  isBlocked: boolean
}

type TaskDagEdge = {
  id: string
  sourceTaskId: string
  targetTaskId: string
  kind: 'dependency'
  isSatisfied: boolean
  isBlocking: boolean
}

type TaskDagUnblockPath = {
  taskId: string
  blockingTaskIds: string[]
  pathTaskIds: string[]
  pathEdgeIds: string[]
}

type TaskDagGraph = {
  nodes: TaskDagNode[]
  edges: TaskDagEdge[]
  rootTaskIds: string[]
  blockedTaskIds: string[]
  unblockPaths: TaskDagUnblockPath[]
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
  observability?: {
    mode: AgentObservabilityMode
    currentSessionId: string | null
    currentSessionState: WorkerSessionState | null
    visibleTranscriptSessionId: string | null
    visibleTranscriptSessionState: WorkerSessionState | null
    visibleTranscriptUpdatedAt: string | null
    lineageSource: AgentObservabilityLineageSource
  }
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

type RepeatableRunDefinition = ContractRepeatableRunDefinition
type RepeatableRunTrigger = ContractRepeatableRunTrigger
type ExternalEventReceipt = ContractExternalEventReceipt

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
  taskDag: TaskDagGraph
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
  repeatableRunDefinitions: RepeatableRunDefinition[]
  repeatableRunTriggers: RepeatableRunTrigger[]
  externalEventReceipts: ExternalEventReceipt[]
  runs: Run[]
  tasks: Task[]
  agents: Agent[]
  sessions: Session[]
  taskDagByRun: Record<string, TaskDagGraph>
  workerNodes: WorkerNode[]
  approvals: Approval[]
  validations: Validation[]
  artifacts: Artifact[]
  messages: Message[]
  identity: IdentityContext | null
  governance: GovernanceAdminReport | null
  secretAccessPlan: SecretAccessPlan | null
  auditExport: RunAuditExport | null
  source: 'mock' | 'api'
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

type RuntimeConfig = {
  apiBaseUrl?: string
  apiToken?: string
}

type DemoMode = 'auto' | 'mock'
type CapturePreset = {
  view: ViewMode
  runId?: string
  approvalId?: string
  artifactId?: string
  transcriptSessionId?: string
  theme?: string
  sidebarWidth?: number
  showDagSection?: boolean
  showAgentSection?: boolean
}

type UrlState = {
  demoMode: DemoMode
  captureId: string | null
  view: ViewMode
  runId: string
  approvalId: string
  artifactId: string
  transcriptSessionId: string
  theme: string | null
  sidebarWidth: number | null
  showDagSection: boolean | null
  showAgentSection: boolean | null
}

const runtimeConfig = (
  window as typeof window & {
    __CODEX_SWARM_CONFIG__?: RuntimeConfig
  }
).__CODEX_SWARM_CONFIG__

let currentRuntimeConfig: RuntimeConfig = runtimeConfig ?? {}

let API_BASE_URL = (
  currentRuntimeConfig.apiBaseUrl
  ?? import.meta.env.VITE_API_BASE_URL
  ?? `${window.location.protocol}//${window.location.hostname}:4300`
).replace(/\/$/, '')
let API_TOKEN = (currentRuntimeConfig.apiToken ?? import.meta.env.VITE_API_TOKEN ?? '').trim()
const APPROVAL_RESOLVER = import.meta.env.VITE_APPROVAL_RESOLVER ?? 'frontend-dev'
const MOCK_FALLBACK_ENABLED = import.meta.env.VITE_ENABLE_MOCK_FALLBACK === 'true'
const REFRESH_MS = 15_000
const EMPTY_TASK_DAG_GRAPH: TaskDagGraph = {
  nodes: [],
  edges: [],
  rootTaskIds: [],
  blockedTaskIds: [],
  unblockPaths: [],
}
const UUID_PATTERN =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/

const defaultTeamTemplates: TeamTemplate[] = [
  {
    id: 'development-stack',
    name: 'Development stack',
    summary: 'Leader, design, frontend, backend, review, QA, and docs coverage for product delivery slices.',
    focus: 'delivery',
    suggestedGoal: 'Ship the next product iteration through codex-swarm with real implementation, review, and verification evidence.',
    suggestedConcurrencyCap: 4,
    members: [
      { key: 'leader', displayName: 'Leader', roleProfile: 'leader', responsibility: 'Own sequencing, task DAG updates, and milestone acceptance.' },
      { key: 'designer', displayName: 'Designer', roleProfile: 'designer', responsibility: 'Define information architecture, interaction states, and screenshot-backed UI targets.' },
      { key: 'frontend', displayName: 'Frontend Developer', roleProfile: 'frontend-developer', responsibility: 'Implement browser and TUI product surfaces against live contracts.' },
      { key: 'backend', displayName: 'Backend Developer', roleProfile: 'backend-developer', responsibility: 'Implement API, orchestration, runtime, and persistence slices.' },
      { key: 'reviewer', displayName: 'Reviewer', roleProfile: 'reviewer', responsibility: 'Find correctness, regression, and integration defects before closure.' },
      { key: 'tester', displayName: 'Tester', roleProfile: 'tester', responsibility: 'Prove acceptance with repeatable checks and end-to-end evidence.' },
      { key: 'writer', displayName: 'Technical Writer', roleProfile: 'technical-writer', responsibility: 'Keep operator and rollout docs aligned to shipped behavior.' },
    ],
  },
  {
    id: 'platform-ops-stack',
    name: 'Platform / ops stack',
    summary: 'Leader, infrastructure, backend, review, QA, and docs coverage for deployment and runtime reliability work.',
    focus: 'platform',
    suggestedGoal: 'Deploy, harden, and verify codex-swarm runtime topology without exposing unintended services.',
    suggestedConcurrencyCap: 3,
    members: [
      { key: 'leader', displayName: 'Leader', roleProfile: 'leader', responsibility: 'Own rollout sequencing, unblock dependencies, and close the operational objective.' },
      { key: 'architect', displayName: 'Architect', roleProfile: 'architect', responsibility: 'Define topology, contracts, and durable operational boundaries.' },
      { key: 'infra', displayName: 'Infrastructure Engineer', roleProfile: 'infrastructure-engineer', responsibility: 'Implement service packaging, CI/CD, runtime config, and private exposure rules.' },
      { key: 'backend', displayName: 'Backend Developer', roleProfile: 'backend-developer', responsibility: 'Close runtime and orchestration gaps exposed by the platform goal.' },
      { key: 'reviewer', displayName: 'Reviewer', roleProfile: 'reviewer', responsibility: 'Review rollout, regression, and operational risk.' },
      { key: 'tester', displayName: 'Tester', roleProfile: 'tester', responsibility: 'Prove deployment, recovery, and service behavior in the target topology.' },
      { key: 'writer', displayName: 'Technical Writer', roleProfile: 'technical-writer', responsibility: 'Update runbooks, operator docs, and recovery guidance.' },
    ],
  },
]

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

const mockApprovalDetails: Record<string, Approval> = {
  'approval-plan': {
    id: 'approval-plan',
    runId: 'run-beta',
    taskId: 'task-review',
    kind: 'plan',
    status: 'pending',
    requestedBy: 'tech-lead',
    requestedPayload: {
      summary: 'Need explicit reviewer approval before the beta handoff opens.',
      target: 'beta handoff',
      rationale: 'The beta docs run is blocked on reviewer signoff because the recovery follow-up still depends on this decision.',
      artifactIds: ['artifact-diff-beta'],
      validationIds: ['validation-recovery'],
    },
    resolutionPayload: {},
    resolver: null,
    resolvedAt: null,
    createdAt: '2026-03-28T19:40:00.000Z',
    updatedAt: '2026-03-28T19:40:00.000Z',
  },
  'approval-policy': {
    id: 'approval-policy',
    runId: 'run-alpha',
    taskId: 'task-runtime',
    kind: 'policy_exception',
    status: 'rejected',
    requestedBy: 'backend-dev',
    requestedPayload: {
      summary: 'Request temporary network access for runtime smoke tests.',
      target: 'runtime bootstrap',
    },
    resolutionPayload: {
      feedback: 'Network smoke tests remain disallowed until the bootstrap path is stable.',
    },
    resolver: 'security',
    resolvedAt: '2026-03-28T20:03:00.000Z',
    createdAt: '2026-03-28T18:35:00.000Z',
    updatedAt: '2026-03-28T20:03:00.000Z',
  },
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
      url: 'https://github.com/example/codex-swarm/pull/52/files',
      sizeBytes: 7168,
      sha256: '9df4df6425852d5ceec44943f4b8bf35d29ac0bd713f5acb39974856db7560f7',
      createdAt: '2026-03-28T19:46:00.000Z',
    },
    contentState: 'available',
    bodyText: [
      'Beta handoff diff focuses on the restart-recovery notes and reviewer guidance.',
      '',
      '- documents stale-session symptoms on the degraded node',
      '- adds the reviewer checklist needed before reopening the handoff',
      '- clarifies follow-up validation expectations for restart recovery',
    ].join('\n'),
    diffSummary: {
      title: 'Beta handoff reviewer packet',
      changeSummary: '3 files changed across recovery notes, reviewer checklist text, and the handoff summary.',
      filesChanged: 3,
      insertions: 48,
      deletions: 9,
      truncated: false,
      providerUrl: 'https://github.com/example/codex-swarm/pull/52/files',
      fileSummaries: [
        {
          path: 'docs/operator-guide.md',
          changeType: 'modified',
          additions: 18,
          deletions: 2,
          summary: 'Adds explicit reviewer handoff checkpoints and degraded-node escalation wording.',
          previousPath: null,
          providerUrl: 'https://github.com/example/codex-swarm/pull/52/files#diff-operator-guide',
        },
        {
          path: 'docs/support-playbooks.md',
          changeType: 'modified',
          additions: 15,
          deletions: 4,
          summary: 'Documents restart recovery checks before the beta run can continue.',
          previousPath: null,
          providerUrl: 'https://github.com/example/codex-swarm/pull/52/files#diff-support-playbooks',
        },
        {
          path: '.swarm/review.md',
          changeType: 'modified',
          additions: 15,
          deletions: 3,
          summary: 'Refreshes the approval summary and ties the recovery blocker to reviewer signoff.',
          previousPath: null,
          providerUrl: 'https://github.com/example/codex-swarm/pull/52/files#diff-review-md',
        },
      ],
      diffPreview: [
        '@@ -10,7 +10,12 @@',
        ' - recovery follow-up remains blocked',
        ' + reviewer must confirm stale session ownership and degraded-node visibility',
        ' + add restart verification checklist before handoff opens',
        '',
        '@@ -24,6 +29,11 @@',
        ' + Capture degraded-node evidence in the operator guide',
        ' + Link validation failure to the approval context',
      ].join('\n'),
      rawDiff: [
        'diff --git a/docs/operator-guide.md b/docs/operator-guide.md',
        'index 1111111..2222222 100644',
        '--- a/docs/operator-guide.md',
        '+++ b/docs/operator-guide.md',
        '@@ -10,7 +10,12 @@',
        '- recovery follow-up remains blocked',
        '+ reviewer must confirm stale session ownership and degraded-node visibility',
        '+ add restart verification checklist before handoff opens',
        '',
        'diff --git a/.swarm/review.md b/.swarm/review.md',
        'index 3333333..4444444 100644',
        '--- a/.swarm/review.md',
        '+++ b/.swarm/review.md',
        '@@ -24,6 +29,11 @@',
        '+ Capture degraded-node evidence in the operator guide',
        '+ Link validation failure to the approval context',
      ].join('\n'),
    },
  },
}

const mockSessionTranscripts: Record<string, SessionTranscriptEntry[]> = {
  'session-frontend': [
    {
      id: 'transcript-frontend-1',
      sessionId: 'session-frontend',
      kind: 'prompt',
      text: 'Prepare the fleet-visibility board surface for README documentation screenshots.',
      createdAt: '2026-03-28T20:40:00.000Z',
    },
    {
      id: 'transcript-frontend-2',
      sessionId: 'session-frontend',
      kind: 'response',
      text: 'Updated the board layout with node utilization, drain indicators, and placement context. Build passed locally.',
      createdAt: '2026-03-28T20:46:00.000Z',
    },
    {
      id: 'transcript-frontend-3',
      sessionId: 'session-frontend',
      kind: 'system',
      text: 'Validation queued: npm --prefix frontend run build',
      createdAt: '2026-03-28T20:47:00.000Z',
    },
  ],
  'session-reviewer': [
    {
      id: 'transcript-reviewer-1',
      sessionId: 'session-reviewer',
      kind: 'prompt',
      text: 'Review the beta handoff diff and confirm whether recovery notes are explicit enough for the operator guide.',
      createdAt: '2026-03-28T19:42:00.000Z',
    },
    {
      id: 'transcript-reviewer-2',
      sessionId: 'session-reviewer',
      kind: 'response',
      text: 'Diff is focused, but the degraded-node restart guidance still needs a clear reviewer checklist before approval.',
      createdAt: '2026-03-28T19:48:00.000Z',
    },
    {
      id: 'transcript-reviewer-3',
      sessionId: 'session-reviewer',
      kind: 'system',
      text: 'Heartbeat degraded during reconnect; session marked stale on node-remote-b.',
      createdAt: '2026-03-28T20:15:00.000Z',
    },
  ],
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
  repeatableRunDefinitions: [],
  repeatableRunTriggers: [],
  externalEventReceipts: [],
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
      observability: {
        mode: 'session',
        currentSessionId: 'session-leader',
        currentSessionState: 'active',
        visibleTranscriptSessionId: 'session-leader',
        visibleTranscriptSessionState: 'active',
        visibleTranscriptUpdatedAt: '2026-03-28T21:08:00.000Z',
        lineageSource: 'active_session',
      },
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
      observability: {
        mode: 'session',
        currentSessionId: 'session-backend',
        currentSessionState: 'active',
        visibleTranscriptSessionId: 'session-backend',
        visibleTranscriptSessionState: 'active',
        visibleTranscriptUpdatedAt: '2026-03-28T21:07:00.000Z',
        lineageSource: 'active_session',
      },
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
      observability: {
        mode: 'session',
        currentSessionId: 'session-frontend',
        currentSessionState: 'active',
        visibleTranscriptSessionId: 'session-frontend',
        visibleTranscriptSessionState: 'active',
        visibleTranscriptUpdatedAt: '2026-03-28T21:09:00.000Z',
        lineageSource: 'active_session',
      },
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
      observability: {
        mode: 'transcript_visibility',
        currentSessionId: null,
        currentSessionState: null,
        visibleTranscriptSessionId: 'session-reviewer',
        visibleTranscriptSessionState: 'stale',
        visibleTranscriptUpdatedAt: '2026-03-28T20:15:00.000Z',
        lineageSource: 'session_rollover',
      },
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
  taskDagByRun: {},
  identity: mockIdentity,
  governance: mockGovernance,
  secretAccessPlan: mockSecretAccessPlan,
  auditExport: mockAuditExport,
}

const taskStatusOrder: TaskStatus[] = ['pending', 'blocked', 'in_progress', 'awaiting_review', 'completed']

function createEmptySwarmData(): SwarmData {
  return {
    repositories: [],
    repeatableRunDefinitions: [],
    repeatableRunTriggers: [],
    externalEventReceipts: [],
    runs: [],
    tasks: [],
    agents: [],
    sessions: [],
    taskDagByRun: {},
    workerNodes: [],
    approvals: [],
    validations: [],
    artifacts: [],
    messages: [],
    identity: null,
    governance: null,
    secretAccessPlan: null,
    auditExport: null,
    source: 'api',
  }
}

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

const transcriptAccessTone: Record<'live_session' | 'fallback_transcript' | 'unavailable', ActivityItem['tone']> = {
  live_session: 'success',
  fallback_transcript: 'warning',
  unavailable: 'muted',
}

function buildTaskDagGraph(tasks: Task[]): TaskDagGraph {
  if (tasks.length === 0) {
    return EMPTY_TASK_DAG_GRAPH
  }

  const taskIds = new Set(tasks.map((task) => task.id))
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const dependentTaskIdsByTaskId = new Map<string, string[]>()

  for (const task of tasks) {
    dependentTaskIdsByTaskId.set(task.id, [])
  }

  for (const task of tasks) {
    for (const dependencyId of task.dependencyIds) {
      if (!taskIds.has(dependencyId)) {
        continue
      }

      dependentTaskIdsByTaskId.get(dependencyId)?.push(task.id)
    }
  }

  const nodes: TaskDagNode[] = tasks.map((task) => {
    const dependencyIds = task.dependencyIds.filter((dependencyId) => taskIds.has(dependencyId))
    const blockedByTaskIds = dependencyIds.filter((dependencyId) => {
      const dependency = taskById.get(dependencyId)
      return dependency ? dependency.status !== 'completed' : false
    })

    return {
      taskId: task.id,
      title: task.title,
      role: task.role,
      status: task.status,
      parentTaskId: task.parentTaskId ?? null,
      dependencyIds,
      dependentTaskIds: dependentTaskIdsByTaskId.get(task.id) ?? [],
      blockedByTaskIds,
      isRoot: dependencyIds.length === 0,
      isBlocked: task.status === 'blocked' || blockedByTaskIds.length > 0,
    }
  })

  const nodeById = new Map(nodes.map((node) => [node.taskId, node]))
  const edges: TaskDagEdge[] = nodes.flatMap((node) =>
    node.dependencyIds.flatMap((dependencyId) => {
      const dependencyNode = nodeById.get(dependencyId)
      if (!dependencyNode) {
        return []
      }

      const isSatisfied = dependencyNode.status === 'completed'
      return [{
        id: `${dependencyId}->${node.taskId}`,
        sourceTaskId: dependencyId,
        targetTaskId: node.taskId,
        kind: 'dependency' as const,
        isSatisfied,
        isBlocking: !isSatisfied && node.isBlocked,
      }]
    }),
  )

  const blockedTaskIds = nodes.filter((node) => node.isBlocked).map((node) => node.taskId)
  const unblockPaths: TaskDagUnblockPath[] = blockedTaskIds.map((taskId) => {
    const pathTaskIds = new Set<string>([taskId])
    const blockingTaskIds = new Set<string>()
    const pathEdgeIds = new Set<string>()
    const queue = [taskId]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const currentTaskId = queue.shift()
      if (!currentTaskId || visited.has(currentTaskId)) {
        continue
      }

      visited.add(currentTaskId)
      const currentNode = nodeById.get(currentTaskId)
      if (!currentNode) {
        continue
      }

      for (const dependencyId of currentNode.blockedByTaskIds) {
        blockingTaskIds.add(dependencyId)
        pathTaskIds.add(dependencyId)
        pathEdgeIds.add(`${dependencyId}->${currentTaskId}`)
        queue.push(dependencyId)
      }
    }

    return {
      taskId,
      blockingTaskIds: [...blockingTaskIds],
      pathTaskIds: [...pathTaskIds],
      pathEdgeIds: [...pathEdgeIds],
    }
  })

  return {
    nodes,
    edges,
    rootTaskIds: nodes.filter((node) => node.isRoot).map((node) => node.taskId),
    blockedTaskIds,
    unblockPaths,
  }
}

function buildTaskDagGraphModel(tasks: Task[], publishedGraph?: TaskDagGraph | null): TaskDagGraph {
  if (tasks.length === 0) {
    return publishedGraph ?? EMPTY_TASK_DAG_GRAPH
  }

  const derivedGraph = buildTaskDagGraph(tasks)
  if (!publishedGraph) {
    return derivedGraph
  }

  const validTaskIds = new Set(derivedGraph.nodes.map((node) => node.taskId))
  const publishedNodeById = new Map(
    publishedGraph.nodes
      .filter((node) => validTaskIds.has(node.taskId))
      .map((node) => [node.taskId, node]),
  )

  const nodes = derivedGraph.nodes.map((node) => {
    const publishedNode = publishedNodeById.get(node.taskId)
    if (!publishedNode) {
      return node
    }

    return {
      ...node,
      dependentTaskIds: publishedNode.dependentTaskIds.filter((taskId) => validTaskIds.has(taskId)),
    }
  })

  const publishedEdgeById = new Map(
    publishedGraph.edges
      .filter((edge) => validTaskIds.has(edge.sourceTaskId) && validTaskIds.has(edge.targetTaskId))
      .map((edge) => [edge.id, edge]),
  )
  const edges = derivedGraph.edges.map((edge) => ({
    ...edge,
    kind: publishedEdgeById.get(edge.id)?.kind ?? edge.kind,
  }))

  const rootTaskIds = publishedGraph.rootTaskIds.filter((taskId) => validTaskIds.has(taskId))
  return {
    nodes,
    edges,
    rootTaskIds: rootTaskIds.length > 0 ? rootTaskIds : derivedGraph.rootTaskIds,
    blockedTaskIds: derivedGraph.blockedTaskIds,
    unblockPaths: derivedGraph.unblockPaths,
  }
}

type DagGraphLayoutNode = {
  node: TaskDagNode
  x: number
  y: number
}

type DagGraphLayout = {
  nodes: DagGraphLayoutNode[]
  width: number
  height: number
}

function layoutTaskDag(graph: TaskDagGraph): DagGraphLayout {
  if (graph.nodes.length === 0) {
    return { nodes: [], width: 0, height: 0 }
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.taskId, node]))
  const levelByTaskId = new Map<string, number>()
  const visiting = new Set<string>()

  const assignLevel = (taskId: string): number => {
    if (levelByTaskId.has(taskId)) {
      return levelByTaskId.get(taskId) ?? 0
    }

    if (visiting.has(taskId)) {
      return 0
    }

    visiting.add(taskId)

    const dependencyIds = nodeById.get(taskId)?.dependencyIds ?? []
    const level = dependencyIds.length === 0
      ? 0
      : Math.max(
          ...dependencyIds
            .filter((dependencyId) => nodeById.has(dependencyId))
            .map((dependencyId) => assignLevel(dependencyId)),
          0,
        ) + 1

    visiting.delete(taskId)
    levelByTaskId.set(taskId, level)
    return level
  }

  for (const node of graph.nodes) {
    assignLevel(node.taskId)
  }

  const columns = new Map<number, TaskDagNode[]>()
  for (const node of graph.nodes) {
    const column = levelByTaskId.get(node.taskId) ?? 0
    const current = columns.get(column) ?? []
    current.push(node)
    columns.set(column, current)
  }

  const orderedColumns = [...columns.entries()].sort(([left], [right]) => left - right)
  const highestColumn = orderedColumns[orderedColumns.length - 1]?.[0] ?? 0
  const columnWidth = 248
  const rowHeight = 112
  const paddingX = 28
  const paddingY = 24
  const nodes: DagGraphLayoutNode[] = []
  let maxRows = 0

  for (const [columnIndex, columnNodes] of orderedColumns) {
    columnNodes.sort((left, right) =>
      Number(right.isBlocked) - Number(left.isBlocked)
      || Number(right.isRoot) - Number(left.isRoot)
      || left.title.localeCompare(right.title),
    )

    maxRows = Math.max(maxRows, columnNodes.length)

    columnNodes.forEach((node, rowIndex) => {
      nodes.push({
        node,
        x: paddingX + columnIndex * columnWidth,
        y: paddingY + rowIndex * rowHeight,
      })
    })
  }

  return {
    nodes,
    width: paddingX * 2 + Math.max(1, highestColumn + 1) * columnWidth,
    height: paddingY * 2 + Math.max(1, maxRows) * rowHeight,
  }
}

type TaskDagGraphPanelProps = {
  graph: TaskDagGraph
  loading: boolean
  error: string
}

function taskDagNodeStatusClass(status: TaskStatus) {
  switch (status) {
    case 'completed':
      return 'is-status-completed'
    case 'in_progress':
      return 'is-status-in-progress'
    case 'awaiting_review':
      return 'is-status-awaiting-review'
    case 'failed':
      return 'is-status-failed'
    case 'cancelled':
      return 'is-status-cancelled'
    case 'blocked':
      return 'is-status-blocked'
    default:
      return 'is-status-pending'
  }
}

function TaskDagGraphPanel({ graph, loading, error }: TaskDagGraphPanelProps) {
  if (loading && graph.nodes.length === 0) {
    return <div className="empty-state">Loading task DAG graph…</div>
  }

  if (error && graph.nodes.length === 0) {
    return <div className="empty-state">{error}</div>
  }

  if (graph.nodes.length === 0) {
    return <div className="empty-state">No task DAG data published for this run yet.</div>
  }

  const layout = layoutTaskDag(graph)
  const nodeWidth = 196
  const nodeHeight = 72
  const hasDependencyEdges = graph.edges.length > 0
  const layoutNodeById = new Map(layout.nodes.map((layoutNode) => [layoutNode.node.taskId, layoutNode]))
  const unblockPathTaskIds = new Set(graph.unblockPaths.flatMap((path) => path.pathTaskIds))
  const unblockPathEdgeIds = new Set(graph.unblockPaths.flatMap((path) => path.pathEdgeIds))

  return (
    <div className="dag-graph-shell">
      <div className="dag-graph-summary">
        <span>{graph.nodes.length} tasks</span>
        <span>{graph.edges.length} links</span>
        <span>{graph.blockedTaskIds.length} blocked</span>
        {!hasDependencyEdges ? <span>All tasks are dependency-free</span> : null}
      </div>

      <div className="dag-graph-legend" aria-label="Task DAG graph legend">
        <span className="dag-legend-item"><span className="dag-legend-swatch is-root" />Root task</span>
        <span className="dag-legend-item"><span className="dag-legend-swatch is-path" />Unblock path</span>
        <span className="dag-legend-item"><span className="dag-legend-swatch is-blocked" />Blocked task</span>
        <span className="dag-legend-item"><span className="dag-legend-swatch is-blocking-edge" />Blocking link</span>
      </div>

      {!hasDependencyEdges ? (
        <div className="dag-graph-note">
          Every task is currently a root task. The graph stays in a single ready column until dependency links are added.
        </div>
      ) : null}

      <div className="dag-graph-frame">
        <svg
          className="dag-graph-canvas"
          viewBox={`0 0 ${Math.max(layout.width, 320)} ${Math.max(layout.height, 180)}`}
          role="img"
          aria-label="Task dependency graph"
        >
          <defs>
            <marker id="dag-arrow-default" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" className="dag-arrow-marker" />
            </marker>
          </defs>

          {graph.edges.map((edge) => {
            const source = layoutNodeById.get(edge.sourceTaskId)
            const target = layoutNodeById.get(edge.targetTaskId)

            if (!source || !target) {
              return null
            }

            const sourceX = source.x + nodeWidth
            const sourceY = source.y + nodeHeight / 2
            const targetX = target.x
            const targetY = target.y + nodeHeight / 2
            const controlOffset = Math.max(36, (targetX - sourceX) / 2)
            const className = [
              'dag-graph-edge',
              edge.isBlocking ? 'is-blocking' : '',
              edge.isSatisfied ? 'is-satisfied' : '',
              unblockPathEdgeIds.has(edge.id) ? 'is-unblock-path' : '',
            ].filter(Boolean).join(' ')

            return (
              <path
                key={edge.id}
                className={className}
                d={`M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`}
                markerEnd="url(#dag-arrow-default)"
              />
            )
          })}

          {layout.nodes.map(({ node, x, y }) => {
            const className = [
              'dag-graph-node',
              node.isRoot ? 'is-root' : '',
              graph.blockedTaskIds.includes(node.taskId) ? 'is-blocked' : '',
              unblockPathTaskIds.has(node.taskId) ? 'is-unblock-path' : '',
              taskDagNodeStatusClass(node.status),
            ].filter(Boolean).join(' ')

            return (
              <g key={node.taskId} className={className} transform={`translate(${x}, ${y})`}>
                <rect width={nodeWidth} height={nodeHeight} rx="16" ry="16" />
                <text className="dag-graph-node-title" x="14" y="25">
                  {node.title.length > 29 ? `${node.title.slice(0, 28)}…` : node.title}
                </text>
                <text className="dag-graph-node-meta" x="14" y="45">
                  {formatLabel(node.status)}
                </text>
                <text className="dag-graph-node-meta" x="14" y="61">
                  {node.role}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

const capturePresets: Record<string, CapturePreset> = {
  'board-desktop': {
    view: 'board',
    runId: 'run-alpha',
    theme: 'system',
    sidebarWidth: 344,
    showDagSection: false,
    showAgentSection: false,
  },
  'board-mobile': {
    view: 'board',
    runId: 'run-alpha',
    theme: 'system',
    showDagSection: false,
    showAgentSection: false,
  },
  'detail-desktop': {
    view: 'detail',
    runId: 'run-alpha',
    theme: 'system',
    transcriptSessionId: 'session-frontend',
  },
  'detail-mobile': {
    view: 'detail',
    runId: 'run-alpha',
    theme: 'system',
    transcriptSessionId: 'session-reviewer',
  },
  'review-desktop': {
    view: 'review',
    runId: 'run-beta',
    approvalId: 'approval-plan',
    artifactId: 'artifact-diff-beta',
    theme: 'system',
  },
  'review-mobile': {
    view: 'review',
    runId: 'run-beta',
    approvalId: 'approval-plan',
    artifactId: 'artifact-diff-beta',
    theme: 'system',
  },
  'admin-desktop': {
    view: 'admin',
    runId: 'run-alpha',
    theme: 'system',
  },
  'admin-mobile': {
    view: 'admin',
    runId: 'run-alpha',
    theme: 'system',
  },
}

const SIDEBAR_WIDTH_STORAGE_KEY = 'codex-swarm.sidebar-width'
const PROJECTS_STORAGE_KEY = 'codex-swarm.projects'
const SIDEBAR_MIN_WIDTH = 280
const SIDEBAR_MAX_WIDTH = 560

function buildApiUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function parseViewMode(value: string | null): ViewMode {
  return value === 'projects' || value === 'board' || value === 'detail' || value === 'review' || value === 'admin'
    ? value
    : 'projects'
}

function parseBooleanParam(value: string | null) {
  if (value === null) {
    return null
  }

  return value === '1' || value === 'true'
}

function parseSidebarWidth(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed))
}

function readUrlState(): UrlState {
  if (typeof window === 'undefined') {
    return {
      demoMode: 'auto',
      captureId: null,
      view: 'projects',
      runId: '',
      approvalId: '',
      artifactId: '',
      transcriptSessionId: '',
      theme: null,
      sidebarWidth: null,
      showDagSection: null,
      showAgentSection: null,
    }
  }

  const params = new URLSearchParams(window.location.search)
  const captureId = params.get('capture')
  const preset = captureId ? capturePresets[captureId] : undefined

  return {
    demoMode: params.get('demo') === 'mock' ? 'mock' : 'auto',
    captureId,
    view: parseViewMode(params.get('view') ?? preset?.view ?? null),
    runId: params.get('run') ?? preset?.runId ?? '',
    approvalId: params.get('approval') ?? preset?.approvalId ?? '',
    artifactId: params.get('artifact') ?? preset?.artifactId ?? '',
    transcriptSessionId: params.get('transcript') ?? preset?.transcriptSessionId ?? '',
    theme: params.get('theme') ?? preset?.theme ?? null,
    sidebarWidth: parseSidebarWidth(params.get('sidebar')) ?? preset?.sidebarWidth ?? null,
    showDagSection: parseBooleanParam(params.get('dag')) ?? preset?.showDagSection ?? null,
    showAgentSection: parseBooleanParam(params.get('agents')) ?? preset?.showAgentSection ?? null,
  }
}

function readStoredProjects(): ProjectRecord[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as ProjectRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function replaceUrlState(state: {
  demoMode: DemoMode
  captureId: string | null
  view: ViewMode
  runId: string
  approvalId: string
  artifactId: string
  transcriptSessionId: string
  theme: string
}) {
  if (typeof window === 'undefined') {
    return
  }

  const params = new URLSearchParams(window.location.search)

  if (state.demoMode === 'mock') {
    params.set('demo', 'mock')
  } else {
    params.delete('demo')
  }

  if (state.captureId) {
    params.set('capture', state.captureId)
  } else {
    params.delete('capture')
  }

  params.set('view', state.view)

  if (state.runId) {
    params.set('run', state.runId)
  } else {
    params.delete('run')
  }

  if (state.approvalId) {
    params.set('approval', state.approvalId)
  } else {
    params.delete('approval')
  }

  if (state.artifactId) {
    params.set('artifact', state.artifactId)
  } else {
    params.delete('artifact')
  }

  if (state.transcriptSessionId) {
    params.set('transcript', state.transcriptSessionId)
  } else {
    params.delete('transcript')
  }

  if (state.theme) {
    params.set('theme', state.theme)
  } else {
    params.delete('theme')
  }

  const nextSearch = params.toString()
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
  window.history.replaceState(null, '', nextUrl)
}

function applyRuntimeConfig(config: RuntimeConfig) {
  currentRuntimeConfig = config
  API_BASE_URL = (
    config.apiBaseUrl
    ?? import.meta.env.VITE_API_BASE_URL
    ?? `${window.location.protocol}//${window.location.hostname}:4300`
  ).replace(/\/$/, '')
  API_TOKEN = (config.apiToken ?? import.meta.env.VITE_API_TOKEN ?? '').trim()
}

async function refreshRuntimeConfig() {
  const response = await fetch(`/runtime-config.json?ts=${Date.now()}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Runtime config refresh failed: ${response.status}`)
  }

  applyRuntimeConfig((await response.json()) as RuntimeConfig)
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && UUID_PATTERN.test(value))
}

function getRunTemplateId(run: Run | null | undefined) {
  const value = run?.metadata?.teamTemplateId
  return typeof value === 'string' ? value : ''
}

function getRunTemplateName(run: Run | null | undefined) {
  const value = run?.metadata?.teamTemplateName
  return typeof value === 'string' ? value : null
}

function buildRunTemplateMetadata(template: TeamTemplate | null) {
  if (!template) {
    return {}
  }

  return {
    teamTemplateId: template.id,
    teamTemplateName: template.name,
    teamTemplateFocus: template.focus,
    teamTemplateMembers: template.members.map((member) => ({
      key: member.key,
      displayName: member.displayName,
      roleProfile: member.roleProfile,
      responsibility: member.responsibility,
    })),
  }
}

async function buildRequestError(response: Response) {
  let payload: unknown = null

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (payload && typeof payload === 'object') {
    const record = payload as { error?: unknown; details?: unknown }
    const baseMessage = typeof record.error === 'string' ? record.error : `Request failed: ${response.status}`

    if (Array.isArray(record.details) && record.details.length > 0) {
      const details = record.details
        .map((detail) => {
          if (!detail || typeof detail !== 'object') {
            return null
          }

          const issue = detail as { path?: unknown; message?: unknown }
          const path = Array.isArray(issue.path)
            ? issue.path.map((segment) => String(segment)).join('.')
            : ''
          const message = typeof issue.message === 'string' ? issue.message : null

          if (!message) {
            return null
          }

          return path ? `${path}: ${message}` : message
        })
        .filter((value): value is string => Boolean(value))

      if (details.length > 0) {
        return new Error(`${baseMessage} (${details.join('; ')})`)
      }
    }

    if (typeof record.details === 'string' && record.details.trim()) {
      return new Error(`${baseMessage} (${record.details.trim()})`)
    }

    return new Error(baseMessage)
  }

  return new Error(`Request failed: ${response.status}`)
}

async function requestJson<T>(path: string, init?: RequestInit, allowRetry = true): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (API_TOKEN.trim()) {
    headers.set('Authorization', `Bearer ${API_TOKEN}`)
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
  })

  if (response.status === 401 && allowRetry) {
    await refreshRuntimeConfig()
    return requestJson<T>(path, init, false)
  }

  if (!response.ok) {
    throw await buildRequestError(response)
  }

  if (response.status === 204) {
    return undefined as T
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
  localPath?: string
}): Promise<Repository> {
  return requestJson<Repository>('/api/v1/repositories', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function updateRepository(
  repositoryId: string,
  input: {
    name?: string
    url?: string
    provider?: RepositoryProvider
    localPath?: string | null
  },
): Promise<Repository> {
  return requestJson<Repository>(`/api/v1/repositories/${encodeURIComponent(repositoryId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

async function deleteRepository(repositoryId: string): Promise<void> {
  await requestJson(`/api/v1/repositories/${encodeURIComponent(repositoryId)}`, {
    method: 'DELETE',
  })
}

async function loadTeamTemplates(): Promise<TeamTemplate[]> {
  return requestJson<TeamTemplate[]>('/api/v1/team-templates')
}

async function createRun(input: {
  repositoryId: string
  goal: string
  branchName?: string
  concurrencyCap?: number
  metadata?: Record<string, unknown>
}): Promise<Run> {
  return requestJson<Run>('/api/v1/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function updateRun(
  runId: string,
  input: {
    goal?: string
    branchName?: string | null
    concurrencyCap?: number
    metadata?: Record<string, unknown>
  },
): Promise<Run> {
  return requestJson<Run>(`/api/v1/runs/${encodeURIComponent(runId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

async function deleteRun(runId: string): Promise<void> {
  await requestJson(`/api/v1/runs/${encodeURIComponent(runId)}`, {
    method: 'DELETE',
  })
}

async function startRun(runId: string): Promise<RunDetail> {
  return requestJson<RunDetail>(`/api/v1/runs/${encodeURIComponent(runId)}/start`, {
    method: 'POST',
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

async function loadSessionTranscript(sessionId: string): Promise<SessionTranscriptEntry[]> {
  return requestJson<SessionTranscriptEntry[]>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/transcript`)
}

async function loadRepeatableRunDefinitions(repositoryId?: string): Promise<RepeatableRunDefinition[]> {
  const suffix = repositoryId ? `?repositoryId=${encodeURIComponent(repositoryId)}` : ''
  return requestJson<RepeatableRunDefinition[]>(`/api/v1/repeatable-runs${suffix}`)
}

async function createRepeatableRunDefinition(input: RepeatableRunDefinitionCreateInput): Promise<RepeatableRunDefinition> {
  return requestJson<RepeatableRunDefinition>('/api/v1/repeatable-runs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function updateRepeatableRunDefinition(
  definitionId: string,
  input: Partial<RepeatableRunDefinitionCreateInput>,
): Promise<RepeatableRunDefinition> {
  return requestJson<RepeatableRunDefinition>(`/api/v1/repeatable-runs/${encodeURIComponent(definitionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

async function deleteRepeatableRunDefinition(definitionId: string): Promise<void> {
  await requestJson(`/api/v1/repeatable-runs/${encodeURIComponent(definitionId)}`, {
    method: 'DELETE',
  })
}

async function loadRepeatableRunTriggers(repositoryId?: string): Promise<RepeatableRunTrigger[]> {
  const suffix = repositoryId ? `?repositoryId=${encodeURIComponent(repositoryId)}` : ''
  return requestJson<RepeatableRunTrigger[]>(`/api/v1/repeatable-run-triggers${suffix}`)
}

async function createRepeatableRunTrigger(input: RepeatableRunTriggerCreateInput): Promise<RepeatableRunTrigger> {
  return requestJson<RepeatableRunTrigger>('/api/v1/repeatable-run-triggers', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function updateRepeatableRunTrigger(
  triggerId: string,
  input: Partial<Omit<RepeatableRunTriggerCreateInput, 'kind'>>,
): Promise<RepeatableRunTrigger> {
  return requestJson<RepeatableRunTrigger>(`/api/v1/repeatable-run-triggers/${encodeURIComponent(triggerId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

async function deleteRepeatableRunTrigger(triggerId: string): Promise<void> {
  await requestJson(`/api/v1/repeatable-run-triggers/${encodeURIComponent(triggerId)}`, {
    method: 'DELETE',
  })
}

async function loadExternalEventReceipts(repositoryId?: string): Promise<ExternalEventReceipt[]> {
  const suffix = repositoryId ? `?repositoryId=${encodeURIComponent(repositoryId)}` : ''
  return requestJson<ExternalEventReceipt[]>(`/api/v1/external-event-receipts${suffix}`)
}

async function loadSwarmData(): Promise<SwarmData> {
  try {
    const repositories = await requestJson<Repository[]>('/api/v1/repositories')
    const repeatableRunDefinitions = await loadRepeatableRunDefinitions().catch(() => [])
    const repeatableRunTriggers = await loadRepeatableRunTriggers().catch(() => [])
    const externalEventReceipts = await loadExternalEventReceipts().catch(() => [])
    const runs = await requestJson<Run[]>('/api/v1/runs')
    const workerNodes = await requestJson<WorkerNode[]>('/api/v1/worker-nodes').catch(() => [])
    const identity = await loadIdentity().catch(() => null)

    if (repositories.length === 0 || runs.length === 0) {
      return {
        ...createEmptySwarmData(),
        repositories,
        repeatableRunDefinitions,
        repeatableRunTriggers,
        externalEventReceipts,
        runs,
        workerNodes,
        identity,
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
    const governance = await loadGovernanceReport(primaryRun?.id).catch(() => null)
    const secretAccessPlan =
      primaryRepository
        ? await loadSecretAccessPlan(primaryRepository.id).catch(() => null)
        : null
    const auditExport =
      primaryRun
        ? await loadRunAuditExport(primaryRun.id).catch(() => null)
        : null

    return {
      repositories,
      repeatableRunDefinitions,
      repeatableRunTriggers,
      externalEventReceipts,
      runs,
      tasks: details.flatMap((detail) => detail.tasks),
      agents: details.flatMap((detail) => detail.agents),
      sessions: details.flatMap((detail) => detail.sessions),
      taskDagByRun: Object.fromEntries(
        details.map((detail) => [detail.id, buildTaskDagGraphModel(detail.tasks, detail.taskDag)]),
      ),
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
      ...createEmptySwarmData(),
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
    return 'Unavailable'
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
  const initialUrlState = readUrlState()
  const { activeTheme, setActiveTheme, themes } = useTheme()
  const [demoMode] = useState<DemoMode>(initialUrlState.demoMode)
  const [captureId] = useState<string | null>(initialUrlState.captureId)
  const [data, setData] = useState<SwarmData>(createEmptySwarmData())
  const [teamTemplates, setTeamTemplates] = useState<TeamTemplate[]>(defaultTeamTemplates)
  const [selectedRunId, setSelectedRunId] = useState(initialUrlState.runId)
  const [selectedView, setSelectedView] = useState<ViewMode>(initialUrlState.view)
  const [projects, setProjects] = useState<ProjectRecord[]>(() => readStoredProjects())
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedApprovalId, setSelectedApprovalId] = useState<string>(initialUrlState.approvalId)
  const [selectedReviewArtifactId, setSelectedReviewArtifactId] = useState<string>(initialUrlState.artifactId)
  const [selectedApprovalDetail, setSelectedApprovalDetail] = useState<Approval | null>(null)
  const [selectedArtifactDetail, setSelectedArtifactDetail] = useState<ArtifactDetail | null>(null)
  const [selectedTranscriptSessionId, setSelectedTranscriptSessionId] = useState<string>(initialUrlState.transcriptSessionId)
  const [selectedTranscript, setSelectedTranscript] = useState<SessionTranscriptEntry[]>([])
  const [transcriptState, setTranscriptState] = useState<LoadState>('idle')
  const [transcriptError, setTranscriptError] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [taskQuery, setTaskQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState<string>('')
  const [approvalDetailState, setApprovalDetailState] = useState<LoadState>('idle')
  const [approvalDetailError, setApprovalDetailError] = useState('')
  const [artifactDetailState, setArtifactDetailState] = useState<LoadState>('idle')
  const [artifactDetailError, setArtifactDetailError] = useState('')
  const [adminSurfaceState, setAdminSurfaceState] = useState<LoadState>('idle')
  const [adminSurfaceError, setAdminSurfaceError] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [projectDraftName, setProjectDraftName] = useState('')
  const [projectDraftSummary, setProjectDraftSummary] = useState('')
  const [projectDraftRepositoryIds, setProjectDraftRepositoryIds] = useState<string[]>([])
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [repoDraftName, setRepoDraftName] = useState('codex-swarm')
  const [repoDraftUrl, setRepoDraftUrl] = useState('https://github.com/beisel-it/codex-swarm.git')
  const [repoDraftLocalPath, setRepoDraftLocalPath] = useState('/home/florian/codex-swarm')
  const [repoDraftProvider, setRepoDraftProvider] = useState<RepositoryProvider>('github')
  const [editingRepositoryId, setEditingRepositoryId] = useState<string | null>(null)
  const [runDraftRepositoryId, setRunDraftRepositoryId] = useState('')
  const [selectedConfigRepositoryId, setSelectedConfigRepositoryId] = useState('')
  const [selectedTeamTemplateId, setSelectedTeamTemplateId] = useState(defaultTeamTemplates[0]?.id ?? '')
  const [runDraftGoal, setRunDraftGoal] = useState(defaultTeamTemplates[0]?.suggestedGoal ?? 'Ship the next iteration through codex-swarm.')
  const [runDraftBranchName, setRunDraftBranchName] = useState('main')
  const [runDraftConcurrencyCap, setRunDraftConcurrencyCap] = useState(String(defaultTeamTemplates[0]?.suggestedConcurrencyCap ?? 1))
  const [editingRunId, setEditingRunId] = useState<string | null>(null)
  const [taskDraftTitle, setTaskDraftTitle] = useState('')
  const [taskDraftDescription, setTaskDraftDescription] = useState('')
  const [taskDraftRole, setTaskDraftRole] = useState('developer')
  const [showProjectControls, setShowProjectControls] = useState(true)
  const [showProjectInventory, setShowProjectInventory] = useState(true)
  const [showAdHocInventory, setShowAdHocInventory] = useState(true)
  const [showRepoControls, setShowRepoControls] = useState(false)
  const [showRunControls, setShowRunControls] = useState(false)
  const [showRepositoryInventory, setShowRepositoryInventory] = useState(true)
  const [showRunInventory, setShowRunInventory] = useState(true)
  const [showDagSection, setShowDagSection] = useState(initialUrlState.showDagSection ?? false)
  const [showAgentSection, setShowAgentSection] = useState(initialUrlState.showAgentSection ?? false)
  const [showAllRuns, setShowAllRuns] = useState(false)
  const [showAllRepositories, setShowAllRepositories] = useState(false)
  const [runFormNotice, setRunFormNotice] = useState('')
  const [repoFormNotice, setRepoFormNotice] = useState('')
  const [highlightedPanel, setHighlightedPanel] = useState<'run' | 'repo' | null>(null)
  const [pendingDeleteAction, setPendingDeleteAction] = useState<PendingDeleteAction | null>(null)
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return 1280
    }

    return window.innerWidth
  })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return 344
    }

    if (initialUrlState.sidebarWidth) {
      return initialUrlState.sidebarWidth
    }

    const storedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
    if (!Number.isFinite(storedWidth)) {
      return 344
    }

    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, storedWidth))
  })

  const deferredTaskQuery = useDeferredValue(taskQuery)

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
  }, [projects])

  useEffect(() => {
    if (initialUrlState.theme && themes.some((theme) => theme.value === initialUrlState.theme)) {
      setActiveTheme(initialUrlState.theme as typeof activeTheme)
    }
  }, [activeTheme, initialUrlState.theme, setActiveTheme, themes])

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!highlightedPanel) {
      return
    }

    const timeoutId = window.setTimeout(() => setHighlightedPanel(null), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [highlightedPanel])

  useEffect(() => {
    if (!runFormNotice) {
      return
    }

    const timeoutId = window.setTimeout(() => setRunFormNotice(''), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [runFormNotice])

  useEffect(() => {
    if (!repoFormNotice) {
      return
    }

    const timeoutId = window.setTimeout(() => setRepoFormNotice(''), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [repoFormNotice])

  useEffect(() => {
    let active = true
    const intervalId = window.setInterval(() => {
      void hydrate()
    }, REFRESH_MS)

    async function hydrate() {
      try {
        const nextData = demoMode === 'mock' ? mockData : await loadSwarmData()

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
  }, [demoMode])

  useEffect(() => {
    if (projects.length > 0 || data.repositories.length === 0 || data.source !== 'mock') {
      return
    }

    const seededProjects = buildSeedProjects(
      data.repositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        provider: repository.provider,
        url: repository.url,
        localPath: repository.localPath,
      })),
    )
    if (seededProjects.length > 0) {
      setProjects(seededProjects)
      setSelectedProjectId(seededProjects[0].id)
    }
  }, [data.repositories, data.source, projects.length])

  useEffect(() => {
    let active = true

    async function hydrateTemplates() {
      try {
        const templates = await loadTeamTemplates()
        if (active && templates.length > 0) {
          setTeamTemplates(templates)
          setSelectedTeamTemplateId((current) => current || templates[0]?.id || '')
        }
      } catch {
        if (active) {
          setTeamTemplates(defaultTeamTemplates)
        }
      }
    }

    void hydrateTemplates()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    replaceUrlState({
      demoMode,
      captureId,
      view: selectedView,
      runId: selectedRunId,
      approvalId: selectedApprovalId,
      artifactId: selectedReviewArtifactId,
      transcriptSessionId: selectedTranscriptSessionId,
      theme: activeTheme,
    })
  }, [
    activeTheme,
    captureId,
    demoMode,
    selectedApprovalId,
    selectedReviewArtifactId,
    selectedRunId,
    selectedTranscriptSessionId,
    selectedView,
  ])

  const selectedRun =
    data.runs.find((run) => run.id === selectedRunId) ??
    data.runs[0] ??
    null
  const selectedTeamTemplate = selectedTeamTemplateId
    ? teamTemplates.find((template) => template.id === selectedTeamTemplateId) ?? null
    : null
  const projectSummaries = deriveProjectSummaries(
    projects,
    data.repositories.map((repository) => ({
      id: repository.id,
      name: repository.name,
      provider: repository.provider,
      url: repository.url,
      localPath: repository.localPath,
    })),
    data.runs.map((run) => ({
      id: run.id,
      repositoryId: run.repositoryId,
      goal: run.goal,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    })),
  )
  const adHocWorkspace = deriveAdHocWorkspace(
    projects,
    data.repositories.map((repository) => ({
      id: repository.id,
      name: repository.name,
      provider: repository.provider,
      url: repository.url,
      localPath: repository.localPath,
    })),
    data.runs.map((run) => ({
      id: run.id,
      repositoryId: run.repositoryId,
      goal: run.goal,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    })),
  )
  const selectedProjectSummary =
    projectSummaries.find((summary) => summary.project.id === selectedProjectId)
    ?? projectSummaries[0]
    ?? null

  const selectedRepository = data.repositories.find(
    (repository) => repository.id === selectedRun?.repositoryId,
  ) ?? null
  const selectedRunStableId = selectedRun?.id ?? null
  const selectedRepositoryStableId = selectedRepository?.id ?? null

  useEffect(() => {
    const availableRepositories = selectedView === 'projects' && selectedProjectSummary
      ? data.repositories.filter((repository) => selectedProjectSummary.project.repositoryIds.includes(repository.id))
      : data.repositories

    if (runDraftRepositoryId && availableRepositories.some((repository) => repository.id === runDraftRepositoryId)) {
      return
    }

    const nextRepositoryId = selectedRepositoryStableId ?? availableRepositories[0]?.id ?? ''
    setRunDraftRepositoryId(nextRepositoryId)
  }, [data.repositories, runDraftRepositoryId, selectedProjectSummary, selectedRepositoryStableId, selectedView])

  useEffect(() => {
    if (selectedProjectId && projectSummaries.some((summary) => summary.project.id === selectedProjectId)) {
      return
    }

    setSelectedProjectId(projectSummaries[0]?.project.id ?? '')
  }, [projectSummaries, selectedProjectId])

  useEffect(() => {
    if (!selectedProjectSummary?.runs.length) {
      return
    }

    if (selectedView !== 'projects') {
      return
    }

    if (selectedRunId && selectedProjectSummary.runs.some((run) => run.id === selectedRunId)) {
      return
    }

    setSelectedRunId(selectedProjectSummary.runs[0]?.id ?? '')
  }, [selectedProjectSummary, selectedRunId, selectedView])

  useEffect(() => {
    if (selectedConfigRepositoryId && data.repositories.some((repository) => repository.id === selectedConfigRepositoryId)) {
      return
    }

    const nextRepositoryId = selectedRepositoryStableId ?? data.repositories[0]?.id ?? ''
    setSelectedConfigRepositoryId(nextRepositoryId)
  }, [data.repositories, selectedConfigRepositoryId, selectedRepositoryStableId])

  const runTasks = data.tasks.filter((task) => task.runId === selectedRun?.id)
  const selectedTaskDag = selectedRun
    ? data.taskDagByRun[selectedRun.id] ?? buildTaskDagGraphModel(runTasks)
    : EMPTY_TASK_DAG_GRAPH
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
  const agentTranscriptTargets = buildAgentTranscriptTargets(runAgents, runSessions)
  const agentTranscriptTargetByAgentId = new Map(
    agentTranscriptTargets.map((target) => [target.agentId, target] as const),
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
  const selectedIdentity = data.identity
  const selectedGovernance = data.governance
  const selectedSecretAccessPlan = data.secretAccessPlan
  const selectedAuditExport = data.auditExport
  const projectScopedRepositories = selectedProjectSummary
    ? data.repositories.filter((repository) => selectedProjectSummary.project.repositoryIds.includes(repository.id))
    : data.repositories
  const governanceApprovalHistory = selectedGovernance?.approvals.history ?? []
  const governanceRepositoryProfiles = selectedGovernance?.policies.repositoryProfiles ?? []
  const reviewActionDisabled = !selectedApproval || actionPending || approvalDetailState !== 'ready'
  const approvalArtifactIds = extractArtifactIds(selectedApprovalDetail?.requestedPayload ?? selectedApproval?.requestedPayload)
  const reviewDiffArtifacts = runArtifacts.filter((artifact) =>
    artifact.kind === 'diff'
      && (approvalArtifactIds.length === 0 || approvalArtifactIds.includes(artifact.id)),
  )
  const selectedReviewArtifact =
    reviewDiffArtifacts.find((artifact) => artifact.id === selectedReviewArtifactId) ??
    reviewDiffArtifacts[0] ??
    null
  const isCompactViewport = viewportWidth <= 820

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
    setSelectedTranscriptSessionId((current) => {
      return chooseTranscriptSessionId(current, agentTranscriptTargets)
    })
  }, [agentTranscriptTargets])

  useEffect(() => {
    let active = true

    async function hydrateApprovalDetail() {
      if (!selectedApprovalId) {
        setSelectedApprovalDetail(null)
        setApprovalDetailState('idle')
        setApprovalDetailError('')
        setReviewNotes('')
        return
      }

      if (data.source === 'mock') {
        const detail = mockApprovalDetails[selectedApprovalId]
        setSelectedApprovalDetail(detail ?? null)
        setApprovalDetailState(detail ? 'ready' : 'error')
        setApprovalDetailError(detail ? '' : 'Mock approval detail is unavailable for this request.')
        setReviewNotes(String(detail?.resolutionPayload?.feedback ?? ''))
        return
      }

      if (!isUuid(selectedApprovalId)) {
        setSelectedApprovalDetail(null)
        setApprovalDetailState('idle')
        setApprovalDetailError('')
        setReviewNotes('')
        return
      }

      setApprovalDetailState('loading')
      setApprovalDetailError('')

      try {
        const detail = await loadApprovalDetail(selectedApprovalId)
        if (!active) {
          return
        }

        setSelectedApprovalDetail(detail)
        setApprovalDetailState('ready')
        setReviewNotes(String(detail.resolutionPayload?.feedback ?? ''))
      } catch (error) {
        if (!active) {
          return
        }

        setSelectedApprovalDetail(null)
        setApprovalDetailState('error')
        setApprovalDetailError(error instanceof Error ? error.message : 'Unable to load approval detail')
        setReviewNotes('')
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
      if (!selectedReviewArtifactId) {
        setSelectedArtifactDetail(null)
        setArtifactDetailState('idle')
        setArtifactDetailError('')
        return
      }

      if (data.source === 'mock') {
        const detail = mockArtifactDetails[selectedReviewArtifactId]
        setSelectedArtifactDetail(detail ?? null)
        setArtifactDetailState(detail ? 'ready' : 'error')
        setArtifactDetailError(detail ? '' : 'Mock artifact detail is unavailable for this artifact.')
        return
      }

      if (!isUuid(selectedReviewArtifactId)) {
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

    async function hydrateTranscript() {
      if (!selectedTranscriptSessionId) {
        setSelectedTranscript([])
        setTranscriptState('idle')
        setTranscriptError('')
        return
      }

      if (data.source === 'mock') {
        const transcript = mockSessionTranscripts[selectedTranscriptSessionId] ?? []
        setSelectedTranscript(transcript)
        setTranscriptState('ready')
        setTranscriptError('')
        return
      }

      if (!isUuid(selectedTranscriptSessionId)) {
        setSelectedTranscript([])
        setTranscriptState('idle')
        setTranscriptError('')
        return
      }

      setTranscriptState('loading')
      setTranscriptError('')

      try {
        const transcript = await loadSessionTranscript(selectedTranscriptSessionId)
        if (!active) {
          return
        }

        setSelectedTranscript(transcript)
        setTranscriptState('ready')
      } catch (error) {
        if (!active) {
          return
        }

        setSelectedTranscript([])
        setTranscriptState('error')
        setTranscriptError(error instanceof Error ? error.message : 'Unable to load transcript')
      }
    }

    void hydrateTranscript()

    return () => {
      active = false
    }
  }, [data.source, selectedTranscriptSessionId])

  useEffect(() => {
    let active = true

    async function hydrateAdminSurface() {
      if (data.source === 'mock') {
        setAdminSurfaceState('ready')
        setAdminSurfaceError('')
        return
      }

      if (!isUuid(selectedRunStableId) || !selectedRepositoryStableId) {
        setAdminSurfaceState('idle')
        setAdminSurfaceError('')
        return
      }

      setAdminSurfaceState('loading')
      setAdminSurfaceError('')

      const [governanceResult, secretAccessPlanResult, auditExportResult] = await Promise.allSettled([
        loadGovernanceReport(selectedRunStableId),
        loadSecretAccessPlan(selectedRepositoryStableId),
        loadRunAuditExport(selectedRunStableId),
      ])

      if (!active) {
        return
      }

      const surfaceErrors = [
        governanceResult.status === 'rejected' ? 'governance report' : null,
        secretAccessPlanResult.status === 'rejected' ? 'secret access plan' : null,
        auditExportResult.status === 'rejected' ? 'audit export' : null,
      ].filter(Boolean)

      setData((current) => ({
        ...current,
        governance: governanceResult.status === 'fulfilled' ? governanceResult.value : null,
        secretAccessPlan: secretAccessPlanResult.status === 'fulfilled' ? secretAccessPlanResult.value : null,
        auditExport: auditExportResult.status === 'fulfilled' ? auditExportResult.value : null,
      }))

      setAdminSurfaceState(surfaceErrors.length > 0 ? 'error' : 'ready')
      setAdminSurfaceError(
        surfaceErrors.length > 0
          ? `Unable to load ${surfaceErrors.join(', ')} from the live API.`
          : '',
      )
    }

    void hydrateAdminSurface()

    return () => {
      active = false
    }
  }, [data.source, selectedRepositoryStableId, selectedRunStableId])

  const blockedTasks = runTasks.filter((task) => task.status === 'blocked')
  const visibleLaneStatuses = taskStatusOrder.filter((status) =>
    visibleTasks.some((task) => task.status === status),
  )
  const laneStatusesToRender = visibleLaneStatuses.length > 0 ? visibleLaneStatuses : taskStatusOrder
  const repositoriesSorted = [...data.repositories].sort((left, right) => {
    const leftTime = left.updatedAt ?? left.createdAt ?? ''
    const rightTime = right.updatedAt ?? right.createdAt ?? ''
    return rightTime.localeCompare(leftTime) || left.name.localeCompare(right.name)
  })
  const runsSorted = [...data.runs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const visibleRepositories = showAllRepositories ? repositoriesSorted : repositoriesSorted.slice(0, 6)
  const visibleRuns = showAllRuns ? runsSorted : runsSorted.slice(0, 8)

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
    const nextData = demoMode === 'mock' ? mockData : await loadSwarmData()
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

  function resetProjectDraft() {
    setEditingProjectId(null)
    setProjectDraftName('')
    setProjectDraftSummary('')
    setProjectDraftRepositoryIds([])
  }

  function toggleProjectRepository(repositoryId: string) {
    setProjectDraftRepositoryIds((current) =>
      current.includes(repositoryId)
        ? current.filter((id) => id !== repositoryId)
        : [...current, repositoryId],
    )
  }

  function handleEditProject(project: ProjectRecord) {
    setEditingProjectId(project.id)
    setProjectDraftName(project.name)
    setProjectDraftSummary(project.summary)
    setProjectDraftRepositoryIds(project.repositoryIds)
    setShowProjectControls(true)
    setSelectedProjectId(project.id)
    setErrorText('')
  }

  function handleSelectProject(projectId: string, runId?: string) {
    setSelectedProjectId(projectId)
    if (runId) {
      setSelectedRunId(runId)
    }
  }

  function handleCreateProject() {
    if (!projectDraftName.trim()) {
      setErrorText('Project name is required.')
      return
    }

    if (projectDraftRepositoryIds.length === 0) {
      setErrorText('Assign at least one repository to the project.')
      return
    }

    const timestamp = new Date().toISOString()
    const nextProject: ProjectRecord = editingProjectId
      ? {
          id: editingProjectId,
          name: projectDraftName.trim(),
          summary: projectDraftSummary.trim(),
          repositoryIds: projectDraftRepositoryIds,
          createdAt: projects.find((project) => project.id === editingProjectId)?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
      : {
          id: `project-${Math.random().toString(36).slice(2, 10)}`,
          name: projectDraftName.trim(),
          summary: projectDraftSummary.trim(),
          repositoryIds: projectDraftRepositoryIds,
          createdAt: timestamp,
          updatedAt: timestamp,
        }

    setProjects((current) => {
      const remaining = current.filter((project) => project.id !== nextProject.id)
      return [nextProject, ...remaining]
    })
    setSelectedProjectId(nextProject.id)
    resetProjectDraft()
    setShowProjectControls(false)
    setErrorText('')
  }

  function handleDeleteProject(project: ProjectRecord, skipConfirmation = false) {
    if (skipConfirmation) {
      confirmDeleteProject(project.id)
      return
    }

    setPendingDeleteAction({ kind: 'project', id: project.id, label: project.name })
  }

  function confirmDeleteProject(projectId: string) {
    setProjects((current) => current.filter((project) => project.id !== projectId))
    if (editingProjectId === projectId) {
      resetProjectDraft()
    }
    if (selectedProjectId === projectId) {
      setSelectedProjectId('')
    }
    setPendingDeleteAction(null)
  }

  async function handleCreateRepository() {
    if (!repoDraftName.trim()) {
      setErrorText('Repository name is required.')
      return
    }

    if (repoDraftProvider === 'local' && !repoDraftLocalPath.trim()) {
      setErrorText('Local checkout path is required.')
      return
    }

    if (repoDraftProvider !== 'local' && !repoDraftUrl.trim()) {
      setErrorText('Remote URL is required.')
      return
    }

    setActionPending(true)

    try {
      const localPath = repoDraftProvider === 'local' ? repoDraftLocalPath.trim() : undefined
      const url = repoDraftProvider === 'local'
        ? `file://${localPath}`
        : repoDraftUrl.trim()
      const repository = editingRepositoryId
        ? await updateRepository(editingRepositoryId, {
            name: repoDraftName.trim(),
            url,
            provider: repoDraftProvider,
            localPath: localPath ?? null,
          })
        : await createRepository({
            name: repoDraftName.trim(),
            url,
            provider: repoDraftProvider,
            localPath,
          })
      setRunDraftRepositoryId(repository.id)
      setEditingRepositoryId(null)
      await refreshSwarmData()
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : `Unable to ${editingRepositoryId ? 'update' : 'register'} repository`)
    } finally {
      setActionPending(false)
    }
  }

  function applyTeamTemplate(template: TeamTemplate) {
    setSelectedTeamTemplateId(template.id)
    setRunDraftGoal(template.suggestedGoal)
    setRunDraftConcurrencyCap(String(template.suggestedConcurrencyCap))
    setShowRunControls(true)
    setHighlightedPanel('run')
    setRunFormNotice(`${template.name} applied to the run draft.`)
    setErrorText('')
  }

  async function handleCreateRun(autoStart: boolean) {
    if (!runDraftRepositoryId || !runDraftGoal.trim()) {
      setErrorText('Repository and run goal are required.')
      return
    }

    setActionPending(true)

    try {
      const parsedConcurrencyCap = Math.max(1, Number.parseInt(runDraftConcurrencyCap, 10) || 1)
      const selectedTemplate = teamTemplates.find((template) => template.id === selectedTeamTemplateId) ?? null
      const metadata = buildRunTemplateMetadata(selectedTemplate)
      const run = editingRunId
        ? await updateRun(editingRunId, {
            goal: runDraftGoal.trim(),
            branchName: runDraftBranchName.trim() || null,
            concurrencyCap: parsedConcurrencyCap,
            metadata,
          })
        : await createRun({
            repositoryId: runDraftRepositoryId,
            goal: runDraftGoal.trim(),
            branchName: runDraftBranchName.trim() || undefined,
            concurrencyCap: parsedConcurrencyCap,
            metadata,
          })

      if (autoStart && !editingRunId) {
        await startRun(run.id)
      }

      setEditingRunId(null)
      await refreshSwarmData(run.id)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : `Unable to ${editingRunId ? 'update' : 'create'} run`)
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

  function handleEditRepository(repository: Repository) {
    setEditingRepositoryId(repository.id)
    setRepoDraftName(repository.name)
    setRepoDraftProvider(repository.provider)
    setRepoDraftUrl(repository.provider === 'local' ? '' : repository.url)
    setRepoDraftLocalPath(repository.localPath ?? '')
    setShowRepoControls(true)
    setRepoFormNotice(`Editing ${repository.name}`)
    setHighlightedPanel('repo')
    setErrorText('')
  }

  async function handleDeleteRepository(repository: Repository, skipConfirmation = false) {
    if (skipConfirmation) {
      await confirmDeleteRepository(repository.id)
      return
    }

    setPendingDeleteAction({ kind: 'repository', id: repository.id, label: repository.name })
  }

  async function confirmDeleteRepository(repositoryId: string) {
    setActionPending(true)

    try {
      setData((current) => ({
        ...current,
        repositories: current.repositories.filter((repository) => repository.id !== repositoryId),
      }))
      if (runDraftRepositoryId === repositoryId) {
        setRunDraftRepositoryId('')
      }
      await deleteRepository(repositoryId)
      if (editingRepositoryId === repositoryId) {
        setEditingRepositoryId(null)
      }
      await refreshSwarmData()
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to delete repository')
    } finally {
      setPendingDeleteAction(null)
      setActionPending(false)
    }
  }

  function handleEditRun(run: Run) {
    setEditingRunId(run.id)
    setRunDraftRepositoryId(run.repositoryId)
    setRunDraftGoal(run.goal)
    setRunDraftBranchName(run.branchName ?? '')
    setRunDraftConcurrencyCap(String(run.concurrencyCap ?? 1))
    setSelectedTeamTemplateId(getRunTemplateId(run) || (teamTemplates[0]?.id ?? ''))
    setShowRunControls(true)
    setRunFormNotice(`Editing ${run.goal}`)
    setHighlightedPanel('run')
    setErrorText('')
  }

  function handleUseRepository(repository: Repository) {
    setRunDraftRepositoryId(repository.id)
    setShowRunControls(true)
    setRunFormNotice(`Using ${repository.name} in the run draft`)
    setHighlightedPanel('run')
    setErrorText('')
  }

  async function handleDeleteRun(run: Run, skipConfirmation = false) {
    if (skipConfirmation) {
      await confirmDeleteRun(run.id)
      return
    }

    setPendingDeleteAction({ kind: 'run', id: run.id, label: run.goal })
  }

  async function confirmDeleteRun(runId: string) {
    setActionPending(true)

    try {
      setData((current) => ({
        ...current,
        runs: current.runs.filter((run) => run.id !== runId),
        tasks: current.tasks.filter((task) => task.runId !== runId),
        agents: current.agents.filter((agent) => agent.runId !== runId),
        approvals: current.approvals.filter((approval) => approval.runId !== runId),
        validations: current.validations.filter((validation) => validation.runId !== runId),
        artifacts: current.artifacts.filter((artifact) => artifact.runId !== runId),
        messages: current.messages.filter((message) => message.runId !== runId),
      }))
      if (selectedRunId === runId) {
        setSelectedRunId('')
      }
      await deleteRun(runId)
      if (editingRunId === runId) {
        setEditingRunId(null)
      }
      await refreshSwarmData()
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to delete run')
    } finally {
      setPendingDeleteAction(null)
      setActionPending(false)
    }
  }

  async function handleCreateRepeatableRunDefinition(input: RepeatableRunDefinitionCreateInput) {
    setActionPending(true)

    try {
      await createRepeatableRunDefinition(input)
      await refreshSwarmData(selectedRun?.id)
      setErrorText('')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to create repeatable run')
    } finally {
      setActionPending(false)
    }
  }

  async function handleUpdateRepeatableRunDefinition(
    definitionId: string,
    input: Partial<RepeatableRunDefinitionCreateInput>,
  ) {
    setActionPending(true)

    try {
      await updateRepeatableRunDefinition(definitionId, input)
      await refreshSwarmData(selectedRun?.id)
      setErrorText('')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to update repeatable run')
    } finally {
      setActionPending(false)
    }
  }

  async function handleDeleteRepeatableRunDefinition(definition: RepeatableRunDefinition) {
    setActionPending(true)

    try {
      await deleteRepeatableRunDefinition(definition.id)
      await refreshSwarmData(selectedRun?.id)
      setErrorText('')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : `Unable to delete ${definition.name}`)
    } finally {
      setActionPending(false)
    }
  }

  async function handleCreateRepeatableRunTrigger(input: RepeatableRunTriggerCreateInput) {
    setActionPending(true)

    try {
      await createRepeatableRunTrigger(input)
      await refreshSwarmData(selectedRun?.id)
      setErrorText('')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to create webhook trigger')
    } finally {
      setActionPending(false)
    }
  }

  async function handleUpdateRepeatableRunTrigger(
    triggerId: string,
    input: Partial<Omit<RepeatableRunTriggerCreateInput, 'kind'>>,
  ) {
    setActionPending(true)

    try {
      await updateRepeatableRunTrigger(triggerId, input)
      await refreshSwarmData(selectedRun?.id)
      setErrorText('')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to update webhook trigger')
    } finally {
      setActionPending(false)
    }
  }

  async function handleDeleteRepeatableRunTrigger(trigger: RepeatableRunTrigger) {
    setActionPending(true)

    try {
      await deleteRepeatableRunTrigger(trigger.id)
      await refreshSwarmData(selectedRun?.id)
      setErrorText('')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : `Unable to delete ${trigger.name}`)
    } finally {
      setActionPending(false)
    }
  }

  function handleSidebarResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()

    const startX = event.clientX
    const startWidth = sidebarWidth

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextWidth = startWidth + (moveEvent.clientX - startX)
      setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, nextWidth)))
    }

    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteAction) {
      return
    }

    if (pendingDeleteAction.kind === 'project') {
      confirmDeleteProject(pendingDeleteAction.id)
      return
    }

    if (pendingDeleteAction.kind === 'repository') {
      await confirmDeleteRepository(pendingDeleteAction.id)
      return
    }

    await confirmDeleteRun(pendingDeleteAction.id)
  }

  return (
    <div className="app-shell">
      <div className="backdrop-grid" aria-hidden="true" />

      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Codex Swarm operator console</p>
          <h1>Projects, ad-hoc jobs, and run context.</h1>
          <p className="lede">Start from project portfolios, keep ad-hoc work clearly separate, and drop into board, review, or admin only when the selected job needs deeper inspection.</p>
        </div>

        <div className="hero-metrics">
          <MetricCard label="Active runs" value={String(data.runs.filter((run) => run.status === 'in_progress' || run.status === 'awaiting_approval').length)} hint="In progress or waiting on review" />
          <MetricCard label="Pending approvals" value={String(data.approvals.filter((approval) => approval.status === 'pending').length)} hint="Items that need a decision" />
          <MetricCard label="Online nodes" value={String(data.workerNodes.filter((node) => node.status === 'online').length)} hint="Workers ready to claim dispatch" />
        </div>
      </header>

      <div className="view-switcher">
        {(['projects', 'board', 'detail', 'review', 'admin'] as ViewMode[]).map((view) => (
          <button
            key={view}
            type="button"
            className={`view-tab ${selectedView === view ? 'is-active' : ''}`}
            onClick={() => setSelectedView(view)}
            disabled={!selectedRun && view !== 'projects' && view !== 'board'}
            title={!selectedRun && view !== 'projects' && view !== 'board' ? 'Select or start a run first.' : undefined}
          >
            {view === 'projects'
              ? 'Projects'
              : view === 'board'
                ? 'Board'
                : view === 'detail'
                  ? 'Run Detail'
                  : view === 'review'
                    ? 'Review'
                    : 'Admin'}
          </button>
        ))}
        <label className="theme-switcher">
          <span>Theme</span>
          <select
            value={activeTheme}
            onChange={(event) => setActiveTheme(event.target.value as typeof activeTheme)}
          >
            {themes.map((theme) => (
              <option key={theme.value} value={theme.value}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <main
        className={`board-layout ${selectedRun ? '' : 'is-empty'}`}
        style={
          isCompactViewport
            ? undefined
            : selectedRun
              ? {
                  gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr) minmax(260px, 340px)`,
                }
              : {
                  gridTemplateColumns: `${sidebarWidth}px`,
                }
        }
      >
        <aside className="panel panel-runs" style={isCompactViewport ? undefined : { width: sidebarWidth }}>
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{selectedView === 'projects' ? 'Workspace entry' : 'Active runs'}</p>
              <h2>{selectedView === 'projects' ? 'Projects and job setup' : 'Execution tracks'}</h2>
            </div>
            <span className="data-pill">
              {data.source === 'mock' ? 'Demo snapshot' : errorText ? 'API issue' : 'Live API'}
            </span>
          </div>

          <div className="control-stack">
            <div className="control-group">
            <section className={`control-card ${showProjectControls ? 'is-open' : 'is-collapsed'}`}>
              <div className="control-card-header">
                <div className="control-card-heading">
                  <strong>{editingProjectId ? 'Edit project' : 'Create project'}</strong>
                  <span>Project-centered entrypoint</span>
                </div>
                <button
                  type="button"
                  className="control-toggle"
                  aria-expanded={showProjectControls}
                  onClick={() => setShowProjectControls((current) => !current)}
                >
                  {showProjectControls ? 'Hide' : 'Show'}
                </button>
              </div>
              {showProjectControls ? (
                <>
                  <label className="control-field">
                    <span>Name</span>
                    <input value={projectDraftName} onChange={(event) => setProjectDraftName(event.target.value)} />
                  </label>
                  <label className="control-field">
                    <span>Summary</span>
                    <textarea value={projectDraftSummary} onChange={(event) => setProjectDraftSummary(event.target.value)} rows={3} />
                  </label>
                  <div className="project-checkbox-list">
                    {data.repositories.map((repository) => (
                      <label key={repository.id} className="project-checkbox">
                        <input
                          type="checkbox"
                          checked={projectDraftRepositoryIds.includes(repository.id)}
                          onChange={() => toggleProjectRepository(repository.id)}
                        />
                        <span>
                          <strong>{repository.name}</strong>
                          <em>{repository.provider}</em>
                        </span>
                      </label>
                    ))}
                    {data.repositories.length === 0 ? <p className="inventory-empty">Register a repository before creating a project.</p> : null}
                  </div>
                  <div className="action-row">
                    {editingProjectId ? (
                      <button
                        type="button"
                        className="action-button action-button-secondary"
                        onClick={() => resetProjectDraft()}
                        disabled={actionPending}
                      >
                        Cancel
                      </button>
                    ) : null}
                    <button type="button" className="action-button" onClick={handleCreateProject} disabled={actionPending}>
                      {editingProjectId ? 'Save project' : 'Create project'}
                    </button>
                  </div>
                </>
              ) : null}
            </section>

            <section className={`control-card ${showProjectInventory ? 'is-open' : 'is-collapsed'}`}>
              <div className="control-card-header">
                <div className="control-card-heading">
                  <strong>Projects</strong>
                  <span>{projectSummaries.length} grouped workspaces</span>
                </div>
                <button type="button" className="control-toggle" aria-expanded={showProjectInventory} onClick={() => setShowProjectInventory((current) => !current)}>
                  {showProjectInventory ? 'Hide' : 'Show'}
                </button>
              </div>
              {showProjectInventory ? (
                <div className="inventory-list project-inventory-list">
                  {projectSummaries.map((summary) => (
                    <article key={summary.project.id} className={`inventory-item project-inventory-item ${summary.project.id === selectedProjectSummary?.project.id ? 'is-selected' : ''}`}>
                      <div>
                        <strong>{summary.project.name}</strong>
                        <p>{summary.project.summary || `${summary.repositories.length} repositories linked`}</p>
                        <div className="inline-meta">
                          <span className="role-chip">{summary.repositories.length} repos</span>
                          <span className="role-chip">{summary.runs.length} runs</span>
                        </div>
                      </div>
                      <div className="inventory-actions">
                        <button type="button" className="table-action" onClick={() => handleSelectProject(summary.project.id, summary.lastRun?.id)}>
                          Select
                        </button>
                        <button type="button" className="table-action" onClick={() => handleEditProject(summary.project)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="table-action table-action-danger"
                          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => handleDeleteProject(summary.project, event.shiftKey)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                  {projectSummaries.length === 0 ? <p className="inventory-empty">No projects yet. Create one to turn repos and runs into a project workspace.</p> : null}
                </div>
              ) : null}
            </section>

            <section className={`control-card ${showAdHocInventory ? 'is-open' : 'is-collapsed'}`}>
              <div className="control-card-header">
                <div className="control-card-heading">
                  <strong>Ad-hoc jobs</strong>
                  <span>{adHocWorkspace.runs.length} runs outside projects</span>
                </div>
                <button type="button" className="control-toggle" aria-expanded={showAdHocInventory} onClick={() => setShowAdHocInventory((current) => !current)}>
                  {showAdHocInventory ? 'Hide' : 'Show'}
                </button>
              </div>
              {showAdHocInventory ? (
                <div className="inventory-list">
                  {adHocWorkspace.runs.map((run) => {
                    const repository = data.repositories.find((item) => item.id === run.repositoryId)
                    return (
                      <article key={run.id} className="inventory-item">
                        <div>
                          <strong>{run.goal}</strong>
                          <p>{repository?.name ?? 'Unlinked repository'} · {formatLabel(run.status)}</p>
                        </div>
                        <div className="inventory-actions">
                          <button
                            type="button"
                            className="table-action"
                            onClick={() => {
                              setSelectedRunId(run.id)
                              setSelectedView('board')
                            }}
                          >
                            Open
                          </button>
                        </div>
                      </article>
                    )
                  })}
                  {adHocWorkspace.runs.length === 0 ? <p className="inventory-empty">All current runs are assigned to projects.</p> : null}
                </div>
              ) : null}
            </section>
            </div>

            <div className="control-group">
            <section className={`control-card ${showRepoControls ? 'is-open' : 'is-collapsed'} ${highlightedPanel === 'repo' ? 'is-flash' : ''}`}>
              <div className="control-card-header">
                <div className="control-card-heading">
                  <strong>{editingRepositoryId ? 'Edit repository' : 'Register repository'}</strong>
                  <span>{editingRepositoryId ? 'Update existing record' : 'Real API'}</span>
                </div>
                <button
                  type="button"
                  className="control-toggle"
                  aria-expanded={showRepoControls}
                  onClick={() => setShowRepoControls((current) => !current)}
                >
                  {showRepoControls ? 'Hide' : 'Show'}
                </button>
              </div>
              {showRepoControls ? (
                <>
                  <label className="control-field">
                    <span>Name</span>
                    <input value={repoDraftName} onChange={(event) => setRepoDraftName(event.target.value)} />
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
                  {repoDraftProvider === 'local' ? (
                    <label className="control-field">
                      <span>Local checkout path</span>
                      <input value={repoDraftLocalPath} onChange={(event) => setRepoDraftLocalPath(event.target.value)} />
                    </label>
                  ) : (
                    <label className="control-field">
                      <span>Remote URL</span>
                      <input value={repoDraftUrl} onChange={(event) => setRepoDraftUrl(event.target.value)} />
                    </label>
                  )}
                  <div className="action-row">
                    {editingRepositoryId ? (
                      <button
                        type="button"
                        className="action-button action-button-secondary"
                        onClick={() => {
                          setEditingRepositoryId(null)
                          setRepoDraftName('codex-swarm')
                          setRepoDraftUrl('https://github.com/beisel-it/codex-swarm.git')
                          setRepoDraftLocalPath('/home/florian/codex-swarm')
                          setRepoDraftProvider('github')
                        }}
                        disabled={actionPending}
                      >
                        Cancel
                      </button>
                    ) : null}
                    <button type="button" className="action-button" onClick={handleCreateRepository} disabled={actionPending}>
                      {editingRepositoryId ? 'Save repository' : 'Register repository'}
                    </button>
                  </div>
                </>
              ) : null}
              {repoFormNotice ? <p className="control-feedback">{repoFormNotice}</p> : null}
            </section>

            <section className={`control-card ${showRunControls ? 'is-open' : 'is-collapsed'} ${highlightedPanel === 'run' ? 'is-flash' : ''}`}>
              <div className="control-card-header">
                <div className="control-card-heading">
                  <strong>{editingRunId ? 'Edit run' : 'Create and start run'}</strong>
                  <span>{editingRunId ? 'Update selected run' : 'Live orchestration'}</span>
                </div>
                <button
                  type="button"
                  className="control-toggle"
                  aria-expanded={showRunControls}
                  onClick={() => setShowRunControls((current) => !current)}
                >
                  {showRunControls ? 'Hide' : 'Show'}
                </button>
              </div>
              {showRunControls ? (
                <>
                  <label className="control-field">
                    <span>Team template</span>
                    <select value={selectedTeamTemplateId} onChange={(event) => setSelectedTeamTemplateId(event.target.value)}>
                      <option value="">No template</option>
                      {teamTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedTeamTemplate ? (
                    <div className="template-preview">
                      <div className="template-preview-header">
                        <strong>{selectedTeamTemplate.name}</strong>
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => applyTeamTemplate(selectedTeamTemplate)}
                          disabled={actionPending}
                        >
                          Apply template
                        </button>
                      </div>
                      <p>{selectedTeamTemplate.summary}</p>
                      <div className="member-chip-grid">
                        {selectedTeamTemplate.members.map((member) => (
                          <article key={member.key} className="member-chip">
                            <strong>{member.displayName}</strong>
                            <span>{member.roleProfile}</span>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <label className="control-field">
                    <span>Repository</span>
                    <select value={runDraftRepositoryId} onChange={(event) => setRunDraftRepositoryId(event.target.value)}>
                      <option value="">Select repository</option>
                      {projectScopedRepositories.map((repository) => (
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
                  <label className="control-field">
                    <span>Concurrency cap</span>
                    <input
                      type="number"
                      min={1}
                      value={runDraftConcurrencyCap}
                      onChange={(event) => setRunDraftConcurrencyCap(event.target.value)}
                    />
                  </label>
                  <div className="action-row">
                    {editingRunId ? (
                      <button
                        type="button"
                        className="action-button action-button-secondary"
                        onClick={() => {
                          setEditingRunId(null)
                          setSelectedTeamTemplateId(teamTemplates[0]?.id ?? '')
                          setRunDraftGoal(teamTemplates[0]?.suggestedGoal ?? 'Ship the next iteration through codex-swarm.')
                          setRunDraftBranchName('main')
                          setRunDraftConcurrencyCap(String(teamTemplates[0]?.suggestedConcurrencyCap ?? 1))
                        }}
                        disabled={actionPending}
                      >
                        Cancel
                      </button>
                    ) : null}
                    <button type="button" className="action-button action-button-secondary" onClick={() => handleCreateRun(false)} disabled={actionPending}>
                      {editingRunId ? 'Save only' : 'Create only'}
                    </button>
                    {!editingRunId ? (
                      <button type="button" className="action-button" onClick={() => handleCreateRun(true)} disabled={actionPending}>
                        Create and start
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
              {runFormNotice ? <p className="control-feedback">{runFormNotice}</p> : null}
            </section>
            </div>

            <div className="control-group control-group-tracks">
            <section className={`control-card ${showRepositoryInventory ? 'is-open' : 'is-collapsed'}`}>
              <div className="control-card-header">
                <div className="control-card-heading">
                  <strong>Repositories</strong>
                  <span>{data.repositories.length} tracked</span>
                </div>
                <div className="control-card-actions">
                  {data.repositories.length > 6 ? (
                    <button type="button" className="control-toggle" onClick={() => setShowAllRepositories((current) => !current)}>
                      {showAllRepositories ? 'Less' : `All ${data.repositories.length}`}
                    </button>
                  ) : null}
                  <button type="button" className="control-toggle" aria-expanded={showRepositoryInventory} onClick={() => setShowRepositoryInventory((current) => !current)}>
                    {showRepositoryInventory ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {showRepositoryInventory ? (
              <div className="inventory-list">
                {visibleRepositories.map((repository) => (
                  <article key={repository.id} className="inventory-item">
                    <div>
                      <strong>{repository.name}</strong>
                      <p>{repository.provider === 'local' ? repository.localPath ?? repository.url : repository.url}</p>
                    </div>
                    <div className="inventory-actions">
                      <button type="button" className="table-action" onClick={() => handleUseRepository(repository)}>
                        Use
                      </button>
                      <button type="button" className="table-action" onClick={() => handleEditRepository(repository)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="table-action table-action-danger"
                        onClick={(event: ReactMouseEvent<HTMLButtonElement>) =>
                          void handleDeleteRepository(repository, event.shiftKey)
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
                {data.repositories.length === 0 ? <p className="inventory-empty">No repositories registered yet.</p> : null}
              </div>
              ) : null}
            </section>
            <section className={`control-card run-inventory-card ${showRunInventory ? 'is-open' : 'is-collapsed'}`}>
              <div className="control-card-header">
                <div className="control-card-heading">
                  <strong>Runs</strong>
                  <span>{data.runs.length} tracked</span>
                </div>
                <div className="control-card-actions">
                  {data.runs.length > 8 ? (
                    <button type="button" className="control-toggle" onClick={() => setShowAllRuns((current) => !current)}>
                      {showAllRuns ? 'Recent' : `All ${data.runs.length}`}
                    </button>
                  ) : null}
                  <button type="button" className="control-toggle" aria-expanded={showRunInventory} onClick={() => setShowRunInventory((current) => !current)}>
                    {showRunInventory ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {showRunInventory ? (
              <div className="run-stack">
                {visibleRuns.map((run) => (
                  <div key={run.id} className={`run-entry ${run.id === selectedRun?.id ? 'is-selected' : ''}`}>
                    <button
                      type="button"
                      className={`run-card ${run.id === selectedRun?.id ? 'is-selected' : ''}`}
                      onClick={() => {
                        startTransition(() => setSelectedRunId(run.id))
                      }}
                    >
                      <div className="run-card-topline">
                        <span className="run-timestamp">{formatDate(run.updatedAt)}</span>
                        <div className="run-status-badges">
                          <div className="run-status-badge">
                            <span className="badge-label">Run</span>
                            <span className={`tone-chip tone-${runStatusTone[run.status]}`}>
                              {formatLabel(run.status)}
                            </span>
                          </div>
                        </div>
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
                        <span className="run-card-handoff">handoff {formatLabel(run.handoffStatus)}</span>
                      </div>
                    </button>
                    {run.id === selectedRun?.id ? (
                      <div className="run-card-actions">
                        <button type="button" className="action-button run-start-button" onClick={handleStartSelectedRun} disabled={actionPending || !selectedRun}>
                          Start selected run
                        </button>
                        <button type="button" className="table-action" onClick={() => handleEditRun(run)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="table-action table-action-danger"
                          onClick={(event: ReactMouseEvent<HTMLButtonElement>) =>
                            void handleDeleteRun(run, event.shiftKey)
                          }
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {data.runs.length === 0 ? (
                  <article className="live-empty-state">
                    <strong>No active runs yet.</strong>
                    <p>Register a repository or create a run from this panel. The other views stay locked until a run exists.</p>
                  </article>
                ) : null}
              </div>
              ) : null}
            </section>
            </div>
          </div>

          <RepeatableRunsPanel
            repositories={data.repositories}
            selectedRepositoryId={selectedConfigRepositoryId}
            onSelectedRepositoryIdChange={setSelectedConfigRepositoryId}
            definitions={data.repeatableRunDefinitions}
            triggers={data.repeatableRunTriggers}
            receipts={data.externalEventReceipts}
            actionPending={actionPending}
            errorText={errorText}
            onCreateDefinition={handleCreateRepeatableRunDefinition}
            onUpdateDefinition={handleUpdateRepeatableRunDefinition}
            onDeleteDefinition={handleDeleteRepeatableRunDefinition}
            onCreateTrigger={handleCreateRepeatableRunTrigger}
            onUpdateTrigger={handleUpdateRepeatableRunTrigger}
            onDeleteTrigger={handleDeleteRepeatableRunTrigger}
          />

          {errorText ? <p className="control-error control-error-inline">{errorText}</p> : null}

          <div className="run-summary-grid">
            <MiniStat label="Blocked tasks" value={String(blockedTasks.length)} />
            <MiniStat label="Placement issues" value={String(runSessions.filter((session) => session.state === 'stale' || session.state === 'failed').length)} />
            <MiniStat label="Fleet alerts" value={String(runWorkerNodes.filter((node) => node.status !== 'online' || node.drainState !== 'active').length)} />
          </div>

          {!isCompactViewport ? (
            <div
              className="sidebar-resize-handle"
              role="separator"
              aria-label="Resize active runs sidebar"
              aria-orientation="vertical"
              onPointerDown={handleSidebarResizeStart}
            />
          ) : null}
        </aside>

        {selectedView === 'projects' ? (
          <>
            <section className="panel panel-overview">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Project overview</p>
                  <h2>{selectedProjectSummary?.project.name ?? 'Projects are now the primary entrypoint'}</h2>
                </div>
                <span className="tone-chip tone-active">
                  {selectedProjectSummary ? `${selectedProjectSummary.runs.length} linked runs` : `${adHocWorkspace.runs.length} ad-hoc runs`}
                </span>
              </div>

              <div className="overview-grid">
                <InfoCard label="Projects" value={String(projectSummaries.length)} />
                <InfoCard label="Project repos" value={String(projectSummaries.reduce((count, summary) => count + summary.repositories.length, 0))} />
                <InfoCard label="Ad-hoc repos" value={String(adHocWorkspace.repositories.length)} />
                <InfoCard label="Ad-hoc runs" value={String(adHocWorkspace.runs.length)} />
                <InfoCard label="Pending approvals" value={String(data.approvals.filter((approval) => approval.status === 'pending').length)} />
                <InfoCard label="Online nodes" value={String(data.workerNodes.filter((node) => node.status === 'online').length)} />
              </div>

              <div className="signal-band">
                <div>
                  <p className="signal-label">Selected project</p>
                  <strong>{selectedProjectSummary?.project.name ?? 'None selected'}</strong>
                </div>
                <div>
                  <p className="signal-label">Project summary</p>
                  <strong>{selectedProjectSummary?.project.summary || 'Group repos to create a durable project workspace.'}</strong>
                </div>
                <div>
                  <p className="signal-label">Ad-hoc boundary</p>
                  <strong>Jobs without project ownership stay isolated here.</strong>
                </div>
              </div>
            </section>

            <section className="panel panel-project-workspace">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Project workspace</p>
                  <h2>Selected project context</h2>
                </div>
                <div className="panel-actions">
                  <button
                    type="button"
                    className="action-button action-button-secondary"
                    onClick={() => {
                      if (!selectedProjectSummary?.lastRun) {
                        return
                      }

                      setSelectedRunId(selectedProjectSummary.lastRun.id)
                      setSelectedView('board')
                    }}
                    disabled={!selectedProjectSummary?.lastRun}
                  >
                    Open board
                  </button>
                  <button
                    type="button"
                    className="action-button action-button-secondary"
                    onClick={() => {
                      if (!selectedProjectSummary?.lastRun) {
                        return
                      }

                      setSelectedRunId(selectedProjectSummary.lastRun.id)
                      setSelectedView('detail')
                    }}
                    disabled={!selectedProjectSummary?.lastRun}
                  >
                    Run detail
                  </button>
                </div>
              </div>

              {selectedProjectSummary ? (
                <div className="project-workspace-grid">
                  <article className="detail-card">
                    <p className="panel-kicker">Scope</p>
                    <strong>{selectedProjectSummary.repositories.length} repositories mapped</strong>
                    <p>{selectedProjectSummary.project.summary || 'This project is the durable home for linked repos and their run history.'}</p>
                    <div className="detail-list">
                      {selectedProjectSummary.repositories.map((repository) => (
                        <span key={repository.id}>{repository.name} · {repository.provider}</span>
                      ))}
                    </div>
                  </article>

                  <article className="detail-card">
                    <p className="panel-kicker">Run history</p>
                    <strong>{selectedProjectSummary.runs.length} runs tracked</strong>
                    <p>{selectedProjectSummary.activeRuns.length} active or awaiting approval, {selectedProjectSummary.completedRuns} completed.</p>
                    <div className="detail-list">
                      <span>Latest run: {selectedProjectSummary.lastRun?.goal ?? 'No runs linked yet'}</span>
                      <span>Updated: {selectedProjectSummary.lastRun ? formatDate(selectedProjectSummary.lastRun.updatedAt) : 'n/a'}</span>
                    </div>
                  </article>

                  <article className="detail-card">
                    <p className="panel-kicker">Quick launch</p>
                    <strong>{selectedProjectSummary.lastRun ? 'Existing run selected' : 'Project ready for its first run'}</strong>
                      <p>Use the run draft in the left rail to create or start another job for one of this project’s repositories.</p>
                      <div className="inline-meta">
                        {selectedProjectSummary.repositories.map((repository) => {
                          const repositoryRecord = data.repositories.find((item) => item.id === repository.id)

                          return (
                            <button
                              key={repository.id}
                              type="button"
                              className="table-action"
                              onClick={() => {
                                if (!repositoryRecord) {
                                  return
                                }

                                handleUseRepository(repositoryRecord)
                              }}
                              disabled={!repositoryRecord}
                            >
                              Use {repository.name}
                            </button>
                          )
                        })}
                      </div>
                    </article>
                </div>
              ) : (
                <div className="empty-state">Create or select a project to establish its repo and run context.</div>
              )}
            </section>

            <section className="panel panel-project-runs">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Project runs</p>
                  <h2>Historical and active jobs</h2>
                </div>
              </div>

              <div className="project-run-grid">
                {(selectedProjectSummary?.runs ?? []).map((run) => {
                  const repository = data.repositories.find((item) => item.id === run.repositoryId)
                  return (
                    <article key={run.id} className="run-card project-run-card">
                      <div className="run-card-topline">
                        <span className="run-timestamp">{formatDate(run.updatedAt)}</span>
                        <span className={`tone-chip tone-${runStatusTone[run.status as RunStatus]}`}>
                          {formatLabel(run.status)}
                        </span>
                      </div>
                      <h3>{run.goal}</h3>
                      <p>{repository?.name ?? 'Unlinked repository'}</p>
                      <div className="run-card-meta">
                        <span className="role-chip">{repository?.provider ?? 'other'}</span>
                        <span className="run-card-handoff">{formatLabel(data.runs.find((item) => item.id === run.id)?.handoffStatus ?? 'pending')}</span>
                      </div>
                      <div className="project-run-actions">
                        <button type="button" className="table-action" onClick={() => { setSelectedRunId(run.id); setSelectedView('board') }}>
                          Board
                        </button>
                        <button type="button" className="table-action" onClick={() => { setSelectedRunId(run.id); setSelectedView('review') }}>
                          Review
                        </button>
                        <button type="button" className="table-action" onClick={() => { setSelectedRunId(run.id); setSelectedView('admin') }}>
                          Admin
                        </button>
                      </div>
                    </article>
                  )
                })}
                {(selectedProjectSummary?.runs.length ?? 0) === 0 ? (
                  <div className="empty-state">No runs are linked to the selected project yet.</div>
                ) : null}
              </div>
            </section>

            <section className="panel panel-ad-hoc">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Ad-hoc jobs</p>
                  <h2>Runs outside projects</h2>
                </div>
              </div>

              <div className="project-workspace-grid">
                <article className="detail-card">
                  <p className="panel-kicker">Ungrouped repositories</p>
                  <strong>{adHocWorkspace.repositories.length} repositories</strong>
                  <div className="detail-list">
                    {adHocWorkspace.repositories.map((repository) => (
                      <span key={repository.id}>{repository.name} · {repository.provider}</span>
                    ))}
                    {adHocWorkspace.repositories.length === 0 ? <span>No repositories are currently outside a project.</span> : null}
                  </div>
                </article>

                <article className="detail-card">
                  <p className="panel-kicker">Ad-hoc run queue</p>
                  <strong>{adHocWorkspace.runs.length} runs</strong>
                  <div className="detail-list">
                    {adHocWorkspace.runs.map((run) => (
                      <span key={run.id}>{run.goal}</span>
                    ))}
                    {adHocWorkspace.runs.length === 0 ? <span>No ad-hoc runs right now.</span> : null}
                  </div>
                </article>
              </div>
            </section>
          </>
        ) : null}

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
                  <strong>{loading ? 'Refreshing' : data.source === 'api' ? `Polling every ${REFRESH_MS / 1000}s` : 'Demo snapshot'}</strong>
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
                      <h2>{pendingApprovals.length === 0 && boardValidations.length === 0 ? 'No open approvals or recent validation activity' : 'Pending approvals and recent validations'}</h2>
                    </div>
                  </div>

                  {pendingApprovals.length === 0 && boardValidations.length === 0 ? (
                    <div className="signal-strip">
                      <div className="signal-strip-item">
                        <span className="signal-label">Pending approvals</span>
                        <strong>0</strong>
                      </div>
                      <div className="signal-strip-item">
                        <span className="signal-label">Recent validations</span>
                        <strong>0</strong>
                      </div>
                      <div className="signal-strip-item">
                        <span className="signal-label">Board posture</span>
                        <strong>Quiet</strong>
                      </div>
                    </div>
                  ) : (
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
                  )}
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
                    {laneStatusesToRender.map((status) => {
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
                    <button type="button" className="control-toggle" onClick={() => setShowDagSection((current) => !current)}>
                      {showDagSection ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {showDagSection ? (
                  <div className="dag-panel-stack">
                    <div className="dag-copy">
                      <p>The visual map mirrors the textual DAG below so operators can trace dependency pressure and unblock routes without losing the raw task list.</p>
                    </div>

                    <TaskDagGraphPanel
                      graph={selectedTaskDag}
                      loading={loading}
                      error={errorText ? 'Unable to load task DAG graph from the live API.' : ''}
                    />

                    <div className="dag-list">
                      {runTasks.length > 0 ? runTasks.map((task) => (
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
                      )) : (
                        <div className="empty-state">No task DAG entries recorded for this run.</div>
                      )}
                    </div>
                  </div>
                  ) : (
                    <div className="compact-summary-row">
                      <span>{runTasks.length} tasks mapped</span>
                      <span>{blockedTasks.length} blocked</span>
                    </div>
                  )}
                </section>

                <section className="panel panel-agents">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Agent lanes</p>
                      <h2>Worker ownership, placement, and session state</h2>
                    </div>
                    <button type="button" className="control-toggle" onClick={() => setShowAgentSection((current) => !current)}>
                      {showAgentSection ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {showAgentSection ? (
                  <div className="agent-lanes">
                    {runAgents.map((agent) => {
                      const agentTask = runTasks.find((task) => task.id === agent.currentTaskId)
                      const transcriptTarget = agentTranscriptTargetByAgentId.get(agent.id)
                      const session = transcriptTarget?.session ?? runSessions.find((item) => item.agentId === agent.id)
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
                              <dd>{session?.threadId ?? 'Session record reconciling'}</dd>
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
                            <div>
                              <dt>Transcript access</dt>
                              <dd>{transcriptTarget?.summaryLabel ?? 'Transcript pending'}</dd>
                            </div>
                          </dl>
                          {transcriptTarget ? (
                            <div className="inline-meta">
                              <span className={`tone-chip tone-${transcriptAccessTone[transcriptTarget.mode]}`}>
                                {transcriptTarget.badgeLabel}
                              </span>
                              {session ? (
                                <span className={`tone-chip tone-${workerSessionTone[session.state]}`}>
                                  {formatLabel(session.state)}
                                </span>
                              ) : null}
                              {workerNode ? (
                                <span className={`tone-chip tone-${workerNodeDrainTone[workerNode.drainState]}`}>
                                  {formatLabel(workerNode.drainState)}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <p className="agent-transcript-copy">{transcriptTarget?.summaryDetail ?? 'Transcript visibility has not been attached to this agent yet.'}</p>
                          {transcriptTarget?.sessionId ? (
                            <button
                              type="button"
                              className="inline-link-button"
                              onClick={() => {
                                setSelectedTranscriptSessionId(transcriptTarget.sessionId ?? '')
                                setSelectedView('detail')
                              }}
                            >
                              Open transcript
                            </button>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                  ) : (
                    <div className="compact-summary-row">
                      <span>{runAgents.length} agents tracked</span>
                      <span>{runSessions.filter((session) => session.state === 'active').length} active sessions</span>
                      <span>{runWorkerNodes.length} nodes in path</span>
                    </div>
                  )}
                </section>
              </>
            ) : null}

            {selectedView === 'detail' ? (
              <>
                <section className="panel panel-detail">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Run detail</p>
                      <h2>Lifecycle and handoff</h2>
                    </div>
                  </div>

                  <div className="detail-grid">
                    <article className="detail-card">
                      <p className="panel-kicker">Team template</p>
                      <strong>{getRunTemplateName(selectedRun) ?? 'Ad hoc run'}</strong>
                      <p>
                        {getRunTemplateName(selectedRun)
                          ? `This run was launched with the ${getRunTemplateName(selectedRun)} roster shape.`
                          : 'No launch template metadata was recorded for this run.'}
                      </p>
                    </article>

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
                      <h2>Provider and publish state</h2>
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
                      <h2>Session placement</h2>
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
                      <h2>Recovery and stale sessions</h2>
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
                      <h2>Recent events</h2>
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

                <section className="panel panel-transcript">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Session transcript</p>
                      <h2>Prompt and response log</h2>
                    </div>
                  </div>

                  <div className="review-list">
                    {agentTranscriptTargets.map((target) => {
                      const selected = target.sessionId !== null && target.sessionId === selectedTranscriptSessionId

                      return (
                        <button
                          key={target.agentId}
                          type="button"
                          className={`review-card ${selected ? 'is-selected' : ''}`}
                          onClick={() => {
                            if (!target.sessionId) {
                              return
                            }

                            setSelectedTranscriptSessionId(target.sessionId)
                          }}
                          disabled={!target.sessionId}
                        >
                          <div className="approval-title">
                            <strong>{target.agentName}</strong>
                            <span className={`tone-chip tone-${transcriptAccessTone[target.mode]}`}>
                              {target.badgeLabel}
                            </span>
                          </div>
                          <p>{target.summaryDetail}</p>
                          <div className="detail-list">
                            <span>Primary session: {target.session?.threadId ?? 'Awaiting session reconciliation'}</span>
                            <span>
                              Session state: {target.session ? formatLabel(target.session.state) : formatLabel(target.observability.visibleTranscriptSessionState ?? target.observability.currentSessionState ?? 'pending')}
                            </span>
                            <span>Lineage: {formatLabel(target.observability.lineageSource)}</span>
                            <span>
                              Updated: {target.observability.visibleTranscriptUpdatedAt ? formatDate(target.observability.visibleTranscriptUpdatedAt) : 'No transcript timestamp yet'}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                    {agentTranscriptTargets.length === 0 ? (
                      <div className="empty-state">No active agents recorded for this run.</div>
                    ) : null}
                  </div>

                  <div className="activity-list">
                    {selectedTranscript.map((entry) => (
                      <article key={entry.id} className="activity-card">
                        <div className="activity-topline">
                          <span className="role-chip">{entry.kind}</span>
                          <span className="tone-chip tone-active">{formatDate(entry.createdAt)}</span>
                        </div>
                        <p>{entry.text}</p>
                      </article>
                    ))}
                    {transcriptState === 'loading' ? (
                      <div className="empty-state">Loading transcript…</div>
                    ) : null}
                    {transcriptState === 'error' ? (
                      <div className="empty-state">{transcriptError || 'Transcript unavailable.'}</div>
                    ) : null}
                    {transcriptState !== 'loading' && transcriptState !== 'error' && !selectedTranscriptSessionId && agentTranscriptTargets.length > 0 ? (
                      <div className="empty-state">Active agents are still reconciling transcript visibility. The latest fallback session will appear here as soon as it is published.</div>
                    ) : null}
                    {transcriptState !== 'loading' && transcriptState !== 'error' && selectedTranscriptSessionId && selectedTranscript.length === 0 ? (
                      <div className="empty-state">No transcript entries recorded for this session yet.</div>
                    ) : null}
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
                      <h2>Approvals and evidence</h2>
                    </div>
                  </div>

                  <div className={`review-grid ${runApprovals.length === 0 ? 'is-empty' : ''}`}>
                    {runApprovals.length > 0 ? (
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
                      </div>
                    ) : (
                      <div className="review-empty-rail">
                        <div className="empty-state">No approvals returned for this run.</div>
                      </div>
                    )}

                    <div className="review-editor">
                      <p className="panel-kicker">Decision workspace</p>
                      <h3>{selectedApprovalDetail?.kind ?? selectedApproval?.kind ?? 'Select an approval'}</h3>
                      <p>
                        {selectedApprovalDetail
                          ? String(selectedApprovalDetail.requestedPayload?.summary ?? 'No request summary attached yet.')
                          : 'Choose an approval request to inspect its context and record a reviewer decision.'}
                      </p>
                      {approvalDetailState === 'loading' ? (
                        <div className="empty-state">Loading live approval detail for this review request.</div>
                      ) : null}
                      {approvalDetailState === 'error' ? (
                        <div className="empty-state">
                          Unable to load approval detail. {approvalDetailError || 'The live API did not return a usable approval payload.'}
                        </div>
                      ) : null}
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
                          disabled={reviewActionDisabled}
                        />
                      </label>
                      <div className="action-row">
                        <button
                          type="button"
                          className="action-button approve"
                          disabled={reviewActionDisabled}
                          onClick={() => void handleApprovalAction('approved')}
                        >
                          Approve request
                        </button>
                        <button
                          type="button"
                          className="action-button reject"
                          disabled={reviewActionDisabled}
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
                      <h2>Checks</h2>
                    </div>
                  </div>

                  <div className={`validation-list ${runValidations.length === 0 ? 'is-empty' : ''}`}>
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
                      <h2>Artifacts and handoff</h2>
                    </div>
                  </div>

                  <div className={`artifact-list ${runArtifacts.length === 0 ? 'is-empty' : ''}`}>
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
                      <h2>Actor and boundary</h2>
                    </div>
                  </div>

                  {adminSurfaceState === 'loading' ? (
                    <div className="empty-state">Loading live governance, audit, and boundary data.</div>
                  ) : null}

                  {adminSurfaceState === 'error' ? (
                    <div className="empty-state">
                      {adminSurfaceError || 'One or more admin detail surfaces are unavailable from the live API.'}
                    </div>
                  ) : null}

                  <div className="provider-detail-grid">
                    <article className="detail-card">
                      <p className="panel-kicker">Principal</p>
                      <strong>{selectedIdentity?.subject ?? 'Identity unavailable'}</strong>
                      <div className="detail-list">
                        <span>Principal: {selectedIdentity?.principal ?? 'No live identity returned'}</span>
                        <span>Role: {selectedIdentity?.roles.join(', ') || 'No roles returned'}</span>
                        <span>Actor type: {selectedIdentity?.actorType ?? 'Unavailable'}</span>
                        <span>Email: {selectedIdentity?.email ?? 'No email asserted'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Workspace boundary</p>
                      <strong>{selectedIdentity?.workspace.name ?? 'Workspace unavailable'}</strong>
                      <div className="detail-list">
                        <span>Workspace ID: {selectedIdentity?.workspace.id ?? 'Unavailable'}</span>
                        <span>Team: {selectedIdentity?.team.name ?? 'Unavailable'}</span>
                        <span>Team ID: {selectedIdentity?.team.id ?? 'Unavailable'}</span>
                        <span>Policy profile: {selectedGovernance?.requestedBy.policyProfile ?? 'Unavailable'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Selected run</p>
                      <strong>{selectedRun.goal}</strong>
                      <div className="detail-list">
                        <span>Repository profile: {selectedRepository?.approvalProfile ?? selectedRun.policyProfile ?? 'standard'}</span>
                        <span>Run policy: {selectedRun.policyProfile ?? 'standard'}</span>
                        <span>Delegation state: {runAgents.length} agents / {runSessions.length} sessions</span>
                        <span>
                          Workspace-scoped actor report generated {selectedGovernance?.generatedAt ? formatDate(selectedGovernance.generatedAt) : 'Unavailable'}
                        </span>
                      </div>
                    </article>
                  </div>
                </section>

                <section className="panel panel-admin-governance">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Governance report</p>
                      <h2>Policy and retention</h2>
                    </div>
                  </div>

                  <div className="admin-grid">
                    <article className="detail-card">
                      <p className="panel-kicker">Approvals</p>
                      <strong>{selectedGovernance?.approvals.total ?? 0} governed approvals</strong>
                      <div className="detail-list">
                        <span>Pending: {selectedGovernance?.approvals.pending ?? 'Unavailable'}</span>
                        <span>Approved: {selectedGovernance?.approvals.approved ?? 'Unavailable'}</span>
                        <span>Rejected: {selectedGovernance?.approvals.rejected ?? 'Unavailable'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Retention</p>
                      <strong>{selectedGovernance?.retention.policy.runsDays ?? 'Unavailable'} day run window</strong>
                      <div className="detail-list">
                        <span>Runs retained: {selectedGovernance ? `${selectedGovernance.retention.runs.retained} / ${selectedGovernance.retention.runs.total}` : 'Unavailable'}</span>
                        <span>Artifacts retained: {selectedGovernance ? `${selectedGovernance.retention.artifacts.retained} / ${selectedGovernance.retention.artifacts.total}` : 'Unavailable'}</span>
                        <span>Events expired: {selectedGovernance?.retention.events.expired ?? 'Unavailable'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Secrets boundary</p>
                      <strong>{selectedGovernance?.secrets.sourceMode ?? 'Unavailable'}</strong>
                      <div className="detail-list">
                        <span>Policy-driven access: {selectedGovernance ? (selectedGovernance.secrets.policyDrivenAccess ? 'enabled' : 'disabled') : 'Unavailable'}</span>
                        <span>Trust levels: {selectedGovernance?.secrets.allowedRepositoryTrustLevels.join(', ') || 'Unavailable'}</span>
                        <span>Credentials: {selectedGovernance?.secrets.remoteCredentialEnvNames.join(', ') || 'None listed'}</span>
                      </div>
                    </article>
                  </div>
                </section>

                <section className="panel panel-admin-provenance">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Approval provenance</p>
                      <h2>Approval trail</h2>
                    </div>
                  </div>

                  <div className="provenance-list">
                    {governanceApprovalHistory.map((entry) => (
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
                    {governanceApprovalHistory.length === 0 ? (
                      <div className="empty-state">No live approval provenance was returned for this run.</div>
                    ) : null}
                  </div>
                </section>

                <section className="panel panel-admin-audit">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Audit and secrets</p>
                      <h2>Audit and secrets</h2>
                    </div>
                  </div>

                  <div className="admin-grid">
                    <article className="detail-card">
                      <p className="panel-kicker">Secret access plan</p>
                      <strong>{selectedSecretAccessPlan?.access ?? 'Unavailable'}</strong>
                      <div className="detail-list">
                        <span>Repository: {selectedSecretAccessPlan?.repositoryName ?? selectedRepository?.name ?? 'Unknown'}</span>
                        <span>Policy profile: {selectedSecretAccessPlan?.policyProfile ?? selectedRun.policyProfile ?? 'Unavailable'}</span>
                        <span>Credentials: {selectedSecretAccessPlan?.credentialEnvNames.join(', ') || 'None listed'}</span>
                        <span>Boundary: {selectedSecretAccessPlan?.distributionBoundary.join(', ') || 'No boundary text returned'}</span>
                        <span>Reason: {selectedSecretAccessPlan?.reason ?? 'No reason returned'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Audit export</p>
                      <strong>{selectedAuditExport ? formatDate(selectedAuditExport.exportedAt) : 'Unavailable'}</strong>
                      <div className="detail-list">
                        <span>Exported by: {selectedAuditExport ? formatActorLabel(selectedAuditExport.provenance.exportedBy) : 'Unavailable'}</span>
                        <span>Event actors: {selectedAuditExport?.provenance.eventActors.length ?? 0}</span>
                        <span>Audit events: {selectedAuditExport?.events.length ?? 0}</span>
                        <span>Approval entries: {selectedAuditExport?.provenance.approvals.length ?? 0}</span>
                        <span>Run retention policy: {selectedAuditExport ? `${selectedAuditExport.retention.policy.runsDays} days` : 'Unavailable'}</span>
                      </div>
                    </article>

                    <article className="detail-card">
                      <p className="panel-kicker">Repository profiles</p>
                      <strong>{governanceRepositoryProfiles.length} active profiles</strong>
                      <div className="detail-list">
                        {governanceRepositoryProfiles.map((profile) => (
                          <span key={profile.profile}>
                            {profile.profile}: {profile.repositoryCount} repos / {profile.runCount} runs
                          </span>
                        ))}
                        {governanceRepositoryProfiles.length === 0 ? (
                          <span>No live repository profile summary returned.</span>
                        ) : null}
                      </div>
                    </article>
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </main>

      {pendingDeleteAction ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPendingDeleteAction(null)}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="panel-kicker">Confirm delete</p>
            <h2 id="confirm-delete-title">
              Delete {pendingDeleteAction.kind === 'project' ? 'project' : pendingDeleteAction.kind === 'repository' ? 'repository' : 'run'}?
            </h2>
            <p>
              {pendingDeleteAction.kind === 'project'
                ? `This removes “${pendingDeleteAction.label}” from the project overview but keeps its repositories and runs as ad-hoc jobs.`
                : pendingDeleteAction.kind === 'repository'
                ? `This removes “${pendingDeleteAction.label}” from the workspace.`
                : `This removes the run “${pendingDeleteAction.label}” and its run-owned records.`}
            </p>
            <div className="action-row">
              <button
                type="button"
                className="action-button action-button-secondary"
                onClick={() => setPendingDeleteAction(null)}
                disabled={actionPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="action-button action-button-danger"
                onClick={() => void handleConfirmDelete()}
                disabled={actionPending}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
    <article className="metric-card" title={hint}>
      <p>{label}</p>
      <strong>{value}</strong>
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
