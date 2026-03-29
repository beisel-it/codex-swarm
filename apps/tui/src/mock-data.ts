export type ViewMode = 'board' | 'run' | 'review' | 'fleet' | 'help'
export type SourceMode = 'api' | 'mock'
export type RunStatus = 'pending' | 'planning' | 'in_progress' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled'
export type TaskStatus = 'pending' | 'blocked' | 'in_progress' | 'awaiting_review' | 'completed' | 'failed' | 'cancelled'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type ValidationStatus = 'pending' | 'passed' | 'failed'
export type WorkerNodeStatus = 'online' | 'degraded' | 'offline'
export type WorkerNodeDrainState = 'active' | 'draining' | 'drained'
export type WorkerSessionState = 'pending' | 'active' | 'stopped' | 'failed' | 'stale' | 'archived'
export type PullRequestStatus = 'draft' | 'open' | 'merged' | 'closed'
export type HandoffStatus = 'pending' | 'branch_published' | 'pr_open' | 'manual_handoff' | 'merged' | 'closed'
export type RepositoryProvider = 'github' | 'gitlab' | 'local' | 'other'

export type RepositoryRecord = {
  id: string
  name: string
  url: string
  provider: RepositoryProvider
  defaultBranch: string
  localPath: string | null
  trustLevel: string
}

export type RunRecord = {
  id: string
  repositoryId: string
  goal: string
  status: RunStatus
  branchName: string | null
  publishedBranch: string | null
  pullRequestUrl: string | null
  pullRequestNumber: number | null
  pullRequestStatus: PullRequestStatus | null
  handoffStatus: HandoffStatus
  policyProfile: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type TaskRecord = {
  id: string
  runId: string
  title: string
  description: string
  role: string
  status: TaskStatus
  priority: number
  ownerAgentId: string | null
  dependencyIds: string[]
}

export type AgentRecord = {
  id: string
  runId: string
  name: string
  role: string
  status: string
  branchName: string | null
  currentTaskId: string | null
  lastHeartbeatAt: string | null
}

export type SessionRecord = {
  id: string
  agentId: string
  threadId: string
  cwd: string
  sandbox: string
  approvalPolicy: string
  workerNodeId: string | null
  stickyNodeId: string | null
  placementConstraintLabels: string[]
  state: WorkerSessionState
  staleReason: string | null
}

export type WorkerNodeRecord = {
  id: string
  name: string
  endpoint: string | null
  capabilityLabels: string[]
  status: WorkerNodeStatus
  drainState: WorkerNodeDrainState
  eligibleForScheduling: boolean
  lastHeartbeatAt: string | null
  metadata: Record<string, unknown>
}

export type ApprovalRecord = {
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
  updatedAt: string
}

export type ValidationRecord = {
  id: string
  runId: string
  taskId: string | null
  name: string
  command: string
  summary: string | null
  status: ValidationStatus
  updatedAt: string
}

export type ArtifactRecord = {
  id: string
  runId: string
  taskId: string | null
  kind: string
  path: string
  contentType: string
  createdAt: string
}

export type MessageRecord = {
  id: string
  runId: string
  senderAgentId: string | null
  recipientAgentId: string | null
  kind: 'direct' | 'broadcast' | 'system'
  body: string
  createdAt: string
}

export type DashboardData = {
  repositories: RepositoryRecord[]
  runs: RunRecord[]
  tasks: TaskRecord[]
  agents: AgentRecord[]
  sessions: SessionRecord[]
  workerNodes: WorkerNodeRecord[]
  approvals: ApprovalRecord[]
  validations: ValidationRecord[]
  artifacts: ArtifactRecord[]
  messages: MessageRecord[]
  source: SourceMode
}

export const mockDashboardData: DashboardData = {
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
    },
    {
      id: 'repo-runbooks',
      name: 'swarm-runbooks',
      url: 'https://gitlab.com/example/swarm-runbooks',
      provider: 'gitlab',
      defaultBranch: 'main',
      localPath: null,
      trustLevel: 'sandboxed',
    },
  ],
  runs: [
    {
      id: 'run-alpha',
      repositoryId: 'repo-codex-swarm',
      goal: 'Ship the live TUI board shell without losing review, fleet, or governance signal density.',
      status: 'in_progress',
      branchName: 'runs/tui-shell',
      publishedBranch: 'runs/tui-shell',
      pullRequestUrl: 'https://github.com/example/codex-swarm/pull/71',
      pullRequestNumber: 71,
      pullRequestStatus: 'open',
      handoffStatus: 'pr_open',
      policyProfile: 'standard',
      createdBy: 'tech-lead',
      createdAt: '2026-03-29T07:00:00.000Z',
      updatedAt: '2026-03-29T08:10:00.000Z',
    },
    {
      id: 'run-beta',
      repositoryId: 'repo-runbooks',
      goal: 'Stabilize M9 readiness docs and fresh-workdir procedure before the landing-page scenario is dispatched.',
      status: 'awaiting_approval',
      branchName: 'runs/m9-readiness',
      publishedBranch: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      handoffStatus: 'pending',
      policyProfile: 'sandboxed-docs',
      createdBy: 'tech-lead',
      createdAt: '2026-03-29T06:10:00.000Z',
      updatedAt: '2026-03-29T08:05:00.000Z',
    },
  ],
  tasks: [
    {
      id: 'task-design',
      runId: 'run-alpha',
      title: 'Translate clawteam board inspiration into Ink composition language',
      description: 'Use codex-swarm-specific panels and operator density instead of a generic terminal dashboard.',
      role: 'designer',
      status: 'completed',
      priority: 5,
      ownerAgentId: 'agent-designer',
      dependencyIds: [],
    },
    {
      id: 'task-board',
      runId: 'run-alpha',
      title: 'Implement Ink board shell and live refresh',
      description: 'Ship live summary cards, kanban columns, and shell navigation in apps/tui.',
      role: 'frontend',
      status: 'in_progress',
      priority: 5,
      ownerAgentId: 'agent-frontend',
      dependencyIds: ['task-design'],
    },
    {
      id: 'task-fleet',
      runId: 'run-alpha',
      title: 'Surface fleet drift and dispatch pressure',
      description: 'Highlight degraded workers, draining nodes, and stale sessions from the TUI shell.',
      role: 'developer',
      status: 'blocked',
      priority: 4,
      ownerAgentId: 'agent-frontend',
      dependencyIds: ['task-board'],
    },
    {
      id: 'task-review',
      runId: 'run-beta',
      title: 'Review M9 designer/developer playbook',
      description: 'Confirm the handoff boundary, required artifacts, and failure rules before scenario dispatch.',
      role: 'reviewer',
      status: 'awaiting_review',
      priority: 4,
      ownerAgentId: 'agent-reviewer',
      dependencyIds: [],
    },
  ],
  agents: [
    {
      id: 'agent-designer',
      runId: 'run-alpha',
      name: 'designer',
      role: 'designer',
      status: 'idle',
      branchName: 'design/tui-language',
      currentTaskId: 'task-design',
      lastHeartbeatAt: '2026-03-29T07:58:00.000Z',
    },
    {
      id: 'agent-frontend',
      runId: 'run-alpha',
      name: 'frontend-dev',
      role: 'frontend',
      status: 'busy',
      branchName: 'feature/tui-shell',
      currentTaskId: 'task-board',
      lastHeartbeatAt: '2026-03-29T08:11:00.000Z',
    },
    {
      id: 'agent-reviewer',
      runId: 'run-beta',
      name: 'reviewer',
      role: 'reviewer',
      status: 'paused',
      branchName: 'review/m9-readiness',
      currentTaskId: 'task-review',
      lastHeartbeatAt: '2026-03-29T08:02:00.000Z',
    },
  ],
  sessions: [
    {
      id: 'session-frontend',
      agentId: 'agent-frontend',
      threadId: 'thread-tui-shell',
      cwd: '/worktrees/run-alpha/frontend',
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      workerNodeId: 'node-primary',
      stickyNodeId: 'node-primary',
      placementConstraintLabels: ['linux', 'node'],
      state: 'active',
      staleReason: null,
    },
    {
      id: 'session-reviewer',
      agentId: 'agent-reviewer',
      threadId: 'thread-m9-review',
      cwd: '/worktrees/run-beta/reviewer',
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      workerNodeId: 'node-remote-b',
      stickyNodeId: 'node-remote-b',
      placementConstraintLabels: ['remote', 'browser'],
      state: 'stale',
      staleReason: 'Node degraded during reconnect',
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
      eligibleForScheduling: true,
      lastHeartbeatAt: '2026-03-29T08:11:00.000Z',
      metadata: { cpuPercent: 42, memoryPercent: 51, queueDepth: 2, sessionCount: 1 },
    },
    {
      id: 'node-remote-b',
      name: 'node-remote-b',
      endpoint: 'tcp://node-remote-b.internal:7777',
      capabilityLabels: ['linux', 'node', 'remote', 'browser'],
      status: 'degraded',
      drainState: 'draining',
      eligibleForScheduling: false,
      lastHeartbeatAt: '2026-03-29T08:02:00.000Z',
      metadata: { cpuPercent: 88, memoryPercent: 79, queueDepth: 5, sessionCount: 1, drainReason: 'maintenance' },
    },
  ],
  approvals: [
    {
      id: 'approval-m9',
      runId: 'run-beta',
      taskId: 'task-review',
      kind: 'plan',
      status: 'pending',
      requestedBy: 'tech-lead',
      requestedPayload: { summary: 'Approve the M9 designer/developer playbook before the landing-page scenario is dispatched.' },
      resolutionPayload: {},
      resolver: null,
      resolvedAt: null,
      updatedAt: '2026-03-29T08:03:00.000Z',
    },
  ],
  validations: [
    {
      id: 'validation-tui-build',
      runId: 'run-alpha',
      taskId: 'task-board',
      name: 'Ink shell build',
      command: 'corepack pnpm --dir apps/tui run build',
      summary: 'TUI shell compiles locally.',
      status: 'pending',
      updatedAt: '2026-03-29T08:06:00.000Z',
    },
    {
      id: 'validation-drill',
      runId: 'run-beta',
      taskId: 'task-review',
      name: 'M9 readiness review',
      command: 'docs review',
      summary: 'Waiting for reviewer sign-off on the M9 readiness package.',
      status: 'failed',
      updatedAt: '2026-03-29T08:04:00.000Z',
    },
  ],
  artifacts: [
    {
      id: 'artifact-playbook',
      runId: 'run-beta',
      taskId: 'task-review',
      kind: 'plan',
      path: 'docs/architecture/m9-designer-developer-playbook.md',
      contentType: 'text/markdown',
      createdAt: '2026-03-29T08:04:00.000Z',
    },
  ],
  messages: [
    {
      id: 'message-1',
      runId: 'run-alpha',
      senderAgentId: 'agent-designer',
      recipientAgentId: 'agent-frontend',
      kind: 'direct',
      body: 'Terminal board density should feel like an operator cockpit, not a browser card wall.',
      createdAt: '2026-03-29T07:52:00.000Z',
    },
    {
      id: 'message-2',
      runId: 'run-beta',
      senderAgentId: 'agent-reviewer',
      recipientAgentId: null,
      kind: 'broadcast',
      body: 'M9 cannot start until the designer/developer handoff boundary is explicit.',
      createdAt: '2026-03-29T08:02:00.000Z',
    },
  ],
}
