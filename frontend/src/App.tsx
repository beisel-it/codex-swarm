import { startTransition, useDeferredValue, useEffect, useState } from 'react'

type ViewMode = 'board' | 'detail' | 'review'
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

type Repository = {
  id: string
  name: string
  url: string
  provider: RepositoryProvider
  defaultBranch: string
  localPath: string | null
  trustLevel: RepositoryTrustLevel
  createdAt?: string
  updatedAt?: string
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
  createdAt?: string
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
  source: 'mock' | 'api'
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? 'codex-swarm-dev-token'
const APPROVAL_RESOLVER = import.meta.env.VITE_APPROVAL_RESOLVER ?? 'frontend-dev'
const REFRESH_MS = 15_000

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
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path
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

async function loadApprovalDetail(approvalId: string): Promise<Approval> {
  return requestJson<Approval>(`/api/v1/approvals/${encodeURIComponent(approvalId)}`)
}

async function loadSwarmData(): Promise<SwarmData> {
  try {
    const repositories = await requestJson<Repository[]>('/api/v1/repositories')
    const runs = await requestJson<Run[]>('/api/v1/runs')
    const workerNodes = await requestJson<WorkerNode[]>('/api/v1/worker-nodes').catch(() => [])

    if (repositories.length === 0 || runs.length === 0) {
      return mockData
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
      source: 'api',
    }
  } catch {
    return mockData
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

function formatPayload(payload?: Record<string, unknown> | null) {
  if (!payload || Object.keys(payload).length === 0) {
    return 'No structured payload recorded yet.'
  }

  return JSON.stringify(payload, null, 2)
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
  const [selectedApprovalDetail, setSelectedApprovalDetail] = useState<Approval | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [taskQuery, setTaskQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState<string>('')
  const [actionPending, setActionPending] = useState(false)

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
        setSelectedRunId((current) => current || nextData.runs[0]?.id || '')
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
  const activity = deriveActivity(selectedRun, runWorkerNodes, runApprovals, runValidations, runArtifacts, runMessages)
  const selectedApproval =
    runApprovals.find((approval) => approval.id === selectedApprovalId) ??
    runApprovals.find((approval) => approval.status === 'pending') ??
    null

  useEffect(() => {
    setSelectedApprovalId(selectedApproval?.id ?? '')
  }, [selectedApproval?.id])

  useEffect(() => {
    let active = true

    async function hydrateApprovalDetail() {
      if (!selectedApprovalId) {
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
  }, [selectedApprovalId, runApprovals])

  const blockedTasks = runTasks.filter((task) => task.status === 'blocked')
  const degradedNodes = data.workerNodes.filter((workerNode) => workerNode.status === 'degraded' || workerNode.status === 'offline')
  const drainingNodes = data.workerNodes.filter((workerNode) => workerNode.drainState !== 'active')
  const openPullRequests = data.runs.filter((run) => run.pullRequestStatus === 'open' || run.pullRequestStatus === 'draft').length

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

  return (
    <div className="app-shell">
      <div className="backdrop-grid" aria-hidden="true" />

      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Codex Swarm M4 Board</p>
          <h1>Fleet health, placement, and drain-aware execution in one board.</h1>
          <p className="lede">
            Phase 4 extends the board into distributed execution: worker-node health, utilization
            hints, sticky placement, and drain or degraded indicators now sit beside the existing
            run, provider, and review surfaces.
          </p>
        </div>

        <div className="hero-metrics">
          <MetricCard label="Active runs" value={String(data.runs.filter((run) => run.status === 'in_progress' || run.status === 'awaiting_approval').length)} hint="Runs needing operator attention" />
          <MetricCard label="Fleet alerts" value={String(degradedNodes.length + drainingNodes.length)} hint="Nodes that are degraded, offline, or draining" />
          <MetricCard label="Open PRs" value={String(openPullRequests)} hint="Draft or open pull requests reflected from the API" />
        </div>
      </header>

      <div className="view-switcher">
        {(['board', 'detail', 'review'] as ViewMode[]).map((view) => (
          <button
            key={view}
            type="button"
            className={`view-tab ${selectedView === view ? 'is-active' : ''}`}
            onClick={() => setSelectedView(view)}
          >
            {view === 'board' ? 'Board' : view === 'detail' ? 'Run Detail' : 'Review'}
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
            <span className="data-pill">{data.source === 'api' ? 'Live API' : 'Mock fallback'}</span>
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

                <section className="panel panel-board">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Task board</p>
                      <h2>Status lanes and blockers</h2>
                    </div>

                    <label className="search-field">
                      <span className="visually-hidden">Filter tasks</span>
                      <input
                        type="search"
                        value={taskQuery}
                        onChange={(event) => setTaskQuery(event.target.value)}
                        placeholder="Filter tasks, roles, or milestones"
                      />
                    </label>
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
          </>
        ) : null}
      </main>

      <footer className="footer-bar">
        <span>{loading ? 'Refreshing board state…' : 'Board data ready.'}</span>
        <span>
          {errorText
            ? `API fallback active: ${errorText}`
            : data.source === 'api'
              ? 'Live repositories, worker nodes, placement, provider handoff, approvals, validations, artifacts, and messages are polling.'
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
