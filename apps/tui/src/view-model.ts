import type { DashboardData, RunRecord, TaskRecord, TaskStatus, WorkerNodeRecord } from './mock-data.js'

export type StatCard = {
  label: string
  value: string
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  detail: string
}

export type AlertRow = {
  id: string
  label: string
  detail: string
  tone: 'warning' | 'danger' | 'info'
}

export type TaskLane = {
  id: string
  title: string
  tasks: TaskRecord[]
}

export type BoardModel = {
  selectedRun: RunRecord | null
  selectedRepositoryName: string
  stats: StatCard[]
  lanes: TaskLane[]
  alerts: AlertRow[]
  inboxSummary: string[]
  fleetSummary: string[]
  reviewSummary: string[]
}

const laneOrder: Array<{ id: string; title: string; statuses: TaskStatus[] }> = [
  { id: 'pending', title: 'Pending', statuses: ['pending'] },
  { id: 'blocked', title: 'Blocked', statuses: ['blocked'] },
  { id: 'in-progress', title: 'In Progress', statuses: ['in_progress'] },
  { id: 'review-done', title: 'Review / Done', statuses: ['awaiting_review', 'completed'] },
]

export function deriveBoardModel(data: DashboardData, selectedRunId: string | null): BoardModel {
  const selectedRun = data.runs.find((run) => run.id === selectedRunId) ?? data.runs[0] ?? null
  const selectedRepositoryName =
    data.repositories.find((repository) => repository.id === selectedRun?.repositoryId)?.name ?? 'No repository selected'
  const runTasks = data.tasks.filter((task) => task.runId === selectedRun?.id)
  const runApprovals = data.approvals.filter((approval) => approval.runId === selectedRun?.id)
  const runValidations = data.validations.filter((validation) => validation.runId === selectedRun?.id)
  const runMessages = data.messages.filter((message) => message.runId === selectedRun?.id)
  const runSessions = data.sessions.filter((session) =>
    data.agents.some((agent) => agent.id === session.agentId && agent.runId === selectedRun?.id),
  )
  const runWorkerNodes = data.workerNodes.filter((workerNode) =>
    runSessions.some((session) => session.workerNodeId === workerNode.id || session.stickyNodeId === workerNode.id),
  )

  const blockedTasks = runTasks.filter((task) => task.status === 'blocked')
  const pendingApprovals = runApprovals.filter((approval) => approval.status === 'pending')
  const failedValidations = runValidations.filter((validation) => validation.status === 'failed')
  const fleetIssues = runWorkerNodes.filter((node) => node.status !== 'online' || node.drainState !== 'active')
  const staleSessions = runSessions.filter((session) => session.state === 'stale' || session.state === 'failed')

  return {
    selectedRun,
    selectedRepositoryName,
    stats: [
      {
        label: 'Runs',
        value: String(data.runs.length),
        tone: 'info',
        detail: `${data.runs.filter((run) => run.status === 'in_progress' || run.status === 'awaiting_approval').length} active or awaiting approval`,
      },
      {
        label: 'Blocked',
        value: String(blockedTasks.length),
        tone: blockedTasks.length > 0 ? 'warning' : 'success',
        detail: 'Tasks waiting on dependency edges',
      },
      {
        label: 'Approvals',
        value: String(pendingApprovals.length),
        tone: pendingApprovals.length > 0 ? 'warning' : 'success',
        detail: 'Pending reviewer or operator gates',
      },
      {
        label: 'Failed checks',
        value: String(failedValidations.length),
        tone: failedValidations.length > 0 ? 'danger' : 'success',
        detail: 'Recent validation failures on the selected run',
      },
      {
        label: 'Fleet alerts',
        value: String(fleetIssues.length + staleSessions.length),
        tone: fleetIssues.length + staleSessions.length > 0 ? 'danger' : 'success',
        detail: 'Degraded nodes and stale session placement',
      },
    ],
    lanes: laneOrder.map((lane) => ({
      id: lane.id,
      title: lane.title,
      tasks: runTasks.filter((task) => lane.statuses.includes(task.status)),
    })),
    alerts: [
      ...pendingApprovals.map((approval) => ({
        id: `approval-${approval.id}`,
        label: `${approval.kind} approval pending`,
        detail: String(approval.requestedPayload.summary ?? `Requested by ${approval.requestedBy}`),
        tone: 'warning' as const,
      })),
      ...failedValidations.map((validation) => ({
        id: `validation-${validation.id}`,
        label: `${validation.name} failed`,
        detail: validation.summary ?? validation.command,
        tone: 'danger' as const,
      })),
      ...fleetIssues.map((node) => ({
        id: `fleet-${node.id}`,
        label: `${node.name} ${node.status}`,
        detail: describeFleetIssue(node),
        tone: node.status === 'offline' ? 'danger' as const : 'warning' as const,
      })),
      ...staleSessions.map((session) => ({
        id: `session-${session.id}`,
        label: `${session.threadId} ${session.state}`,
        detail: session.staleReason ?? 'Session placement requires operator attention.',
        tone: 'danger' as const,
      })),
    ].slice(0, 8),
    inboxSummary: runMessages
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 4)
      .map((message) => `${message.kind}: ${message.body}`),
    fleetSummary: runWorkerNodes.map((node) => summarizeWorkerNode(node)),
    reviewSummary: [
      selectedRun?.pullRequestUrl
        ? `PR #${selectedRun.pullRequestNumber ?? 'pending'} ${selectedRun.pullRequestStatus ?? 'open'}`
        : `Handoff ${selectedRun?.handoffStatus ?? 'pending'}`,
      `${pendingApprovals.length} pending approvals`,
      `${failedValidations.length} failed validations`,
      `${data.artifacts.filter((artifact) => artifact.runId === selectedRun?.id).length} published artifacts`,
    ],
  }
}

function describeFleetIssue(node: WorkerNodeRecord) {
  const reason = typeof node.metadata.drainReason === 'string' ? node.metadata.drainReason : null
  if (node.status !== 'online') {
    return reason ?? `Drain ${node.drainState}`
  }

  return reason ?? `Drain ${node.drainState}`
}

function summarizeWorkerNode(node: WorkerNodeRecord) {
  const cpu = formatMetric(node.metadata.cpuPercent)
  const memory = formatMetric(node.metadata.memoryPercent)
  const queue = formatMetric(node.metadata.queueDepth)
  return `${node.name} · ${node.status} · cpu ${cpu} · mem ${memory} · queue ${queue}`
}

function formatMetric(input: unknown) {
  return typeof input === 'number' && Number.isFinite(input) ? String(Math.round(input)) : 'n/a'
}
