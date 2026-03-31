import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  ExternalEventReceipt,
  ProjectSummary as ContractProjectSummary,
  TaskDagGraph,
  ProjectTeamCreateInput,
  ProjectTeamDetail,
  ProjectTeamImportInput,
  ProjectTeamUpdateInput,
  RepositoryUpdateInput,
  RepeatableRunDefinition,
  RepeatableRunDefinitionCreateInput,
  RepeatableRunTrigger,
  RepeatableRunTriggerCreateInput,
} from '../../packages/contracts/src/index.ts'
import { RepeatableRunsPanel } from './repeatable-runs-panel'
import { TaskDagGraphPanel } from './task-dag'
import {
  deriveAdHocWorkspace,
  deriveProjectSummaries,
  normalizeProjects,
  type ProjectRecord,
} from './projects'
import { useTheme } from './theme'

type RepositoryProvider = 'github' | 'gitlab' | 'local' | 'other'
type RepositoryTrustLevel = 'trusted' | 'sandboxed' | 'restricted'
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
type ApprovalStatus = 'pending' | 'approved' | 'rejected'
type ValidationStatus = 'pending' | 'passed' | 'failed'
type PullRequestStatus = 'draft' | 'open' | 'merged' | 'closed'
type HandoffStatus = 'pending' | 'branch_published' | 'pr_open' | 'manual_handoff' | 'merged' | 'closed'
type RunHandoffMode = 'manual' | 'auto'
type RuntimeConfig = {
  apiBaseUrl?: string
  apiToken?: string
}

declare global {
  interface Window {
    __CODEX_SWARM_CONFIG__?: RuntimeConfig
  }
}

type Repository = {
  id: string
  projectId?: string | null
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

type TeamBlueprint = {
  id: string
  name: string
  summary: string
  focus: 'delivery' | 'platform' | 'studio'
  suggestedGoal: string
  suggestedConcurrencyCap: number
}

type ProjectTeamMemberDraft = {
  name: string
  role: string
  profile: string
  responsibility: string
}

type Run = {
  id: string
  repositoryId: string
  projectId?: string | null
  projectTeamId?: string | null
  projectTeamName?: string | null
  goal: string
  status: RunStatus
  branchName: string | null
  planArtifactPath: string | null
  publishedBranch: string | null
  pullRequestUrl: string | null
  pullRequestNumber: number | null
  pullRequestStatus: PullRequestStatus | null
  handoffStatus: HandoffStatus
  handoff: {
    mode: RunHandoffMode
    provider: 'github' | null
    baseBranch: string | null
    autoPublishBranch: boolean
    autoCreatePullRequest: boolean
    titleTemplate: string | null
    bodyTemplate: string | null
  }
  createdBy: string
  createdAt: string
  updatedAt: string
  metadata: Record<string, unknown>
}

type Task = {
  id: string
  runId: string
  parentTaskId: string | null
  title: string
  description: string
  role: string
  status: TaskStatus
  priority: number
  ownerAgentId: string | null
  verificationStatus: 'not_required' | 'pending' | 'requested' | 'in_progress' | 'passed' | 'failed' | 'blocked'
  verifierAgentId: string | null
  latestVerificationSummary: string | null
  latestVerificationFindings: string[]
  latestVerificationChangeRequests: string[]
  latestVerificationEvidence: string[]
  dependencyIds: string[]
  definitionOfDone: string[]
  acceptanceCriteria: string[]
  validationTemplates: Array<{
    name: string
    command: string
    summary?: string
    artifactPath?: string
  }>
  createdAt: string
  updatedAt: string
}

type Agent = {
  id: string
  runId: string
  taskId: string | null
  projectTeamMemberId?: string | null
  name: string
  profile?: string
  status: string
}

type Session = {
  id: string
  runId: string
  agentId: string | null
  workerNodeId: string | null
  status: string
  createdAt: string
  updatedAt: string
  summary?: string | null
}

type WorkerNode = {
  id: string
  name: string
  status: 'online' | 'degraded' | 'offline'
  drainState: 'active' | 'draining' | 'drained'
  endpoint: string | null
}

type Approval = {
  id: string
  runId: string
  taskId: string | null
  kind: string
  status: ApprovalStatus
  requestedBy: string
  resolver: string | null
  requestedPayload?: Record<string, unknown> | null
  resolutionPayload?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  resolvedAt?: string | null
}

type Validation = {
  id: string
  runId: string
  name: string
  command: string
  status: ValidationStatus
  summary: string | null
  createdAt: string
}

type Artifact = {
  id: string
  runId: string
  kind: string
  path: string
  contentType: string
  createdAt: string
}

type ArtifactDetail = {
  artifact: Artifact
  bodyText?: string | null
  contentState?: 'inline' | 'truncated' | 'unavailable'
  diffSummary?: {
    title?: string | null
    changeSummary?: string | null
    filesChanged: number
    insertions: number
    deletions: number
    providerUrl?: string | null
    diffPreview?: string | null
    rawDiff?: string | null
    truncated?: boolean
    fileSummaries: Array<{
      path: string
      changeType: 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown'
      additions: number
      deletions: number
      summary?: string | null
      previousPath?: string | null
      providerUrl?: string | null
    }>
  } | null
}

type Message = {
  id: string
  runId: string
  kind: string
  body: string
  createdAt: string
}

type IdentityContext = {
  principal: string
  subject: string
  email: string | null
  roles: string[]
  workspace: {
    id: string
    name: string
  }
  team: {
    id: string
    workspaceId: string
    name: string
  }
  actorType: 'system' | 'user' | 'service'
}

type GovernanceAdminReport = {
  generatedAt: string
  approvals: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
  policies: {
    repositoryProfiles: Array<{
      profile: string
      repositoryCount: number
      runCount: number
    }>
  }
  secrets: {
    sourceMode: 'environment' | 'external_manager'
    provider: string | null
    allowedRepositoryTrustLevels: RepositoryTrustLevel[]
  }
}

type SessionTranscriptEntry = {
  id: string
  sessionId: string
  kind: 'prompt' | 'response' | 'system'
  text: string
  createdAt: string
}

type ControlPlaneEvent = {
  id: string
  runId: string | null
  taskId?: string | null
  agentId?: string | null
  traceId?: string | null
  eventType: string
  entityType: string
  entityId?: string
  status: string
  summary: string
  metadata?: Record<string, unknown>
  createdAt: string
}

type RunDetail = Run & {
  tasks: Task[]
  agents: Agent[]
  sessions: Session[]
  taskDag?: TaskDagGraph | null
}

type SwarmData = {
  projectSummaries: ContractProjectSummary[]
  projectTeams: ProjectTeamDetail[]
  repositories: Repository[]
  runs: Run[]
  tasks: Task[]
  agents: Agent[]
  sessions: Session[]
  runTaskDags: Record<string, TaskDagGraph | null>
  workerNodes: WorkerNode[]
  approvals: Approval[]
  validations: Validation[]
  artifacts: Artifact[]
  messages: Message[]
  repeatableRunDefinitions: RepeatableRunDefinition[]
  repeatableRunTriggers: RepeatableRunTrigger[]
  externalEventReceipts: ExternalEventReceipt[]
  identity: IdentityContext | null
  governance: GovernanceAdminReport | null
  source: 'api' | 'mock'
}

type RunLiveRefreshRequest = {
  runDetail?: boolean
  approvals?: boolean
  validations?: boolean
  artifacts?: boolean
  messages?: boolean
  events?: boolean
}

type StreamEventFrame = {
  event: string
  data: string
}

type Route =
  | { kind: 'projects' }
  | { kind: 'project-new' }
  | { kind: 'project'; projectId: string; section: 'overview' | 'teams' | 'repositories' | 'runs' | 'automation' | 'settings'; mode?: 'new-repository' | 'new-run' | 'new-repeatable-run' | 'new-webhook' | 'new-team' | 'import-team' }
  | { kind: 'adhoc-runs'; mode?: 'new' }
  | { kind: 'settings' }
  | { kind: 'run'; runId: string; section: 'overview' | 'board' | 'lifecycle' | 'review' }

type VerificationViewState =
  | 'legacy'
  | 'not_requested'
  | 'awaiting_verification'
  | 'verification_running'
  | 'verified_complete'
  | 'verification_failed'
  | 'rework_requested'
  | 'verification_blocked'

type ReviewQueueFilter = 'awaiting' | 'running' | 'failed' | 'verified' | 'all'

type TaskPresentation = {
  verificationState: VerificationViewState
  primaryStatusTone: string
  verificationTone: string
  verificationLabel: string
  verificationSummary: string
  verificationSubtitle: string
  ownerLabel: string
  verifierLabel: string
  latestSummary: string
  hasDefinitionOfDone: boolean
  isLegacy: boolean
  reworkTasks: Task[]
}

const SIDEBAR_WIDTH_STORAGE_KEY = 'codex-swarm-sidebar-width-v1'
const APPROVAL_RESOLVER = 'Codex reviewer'
const SIDEBAR_MIN_WIDTH = 340
const SIDEBAR_MAX_WIDTH = 520

let API_BASE_URL = (
  (window.__CODEX_SWARM_CONFIG__?.apiBaseUrl
    ?? (import.meta.env.VITE_API_BASE_URL as string | undefined))
  ?? `${window.location.protocol}//${window.location.hostname}:4300`
).replace(/\/$/, '')
let API_TOKEN = (
  window.__CODEX_SWARM_CONFIG__?.apiToken
  ?? (import.meta.env.VITE_API_TOKEN as string | undefined)
  ?? ''
).trim()

function createEmptySwarmData(): SwarmData {
  return {
    projectSummaries: [],
    projectTeams: [],
    repositories: [],
    runs: [],
    tasks: [],
    agents: [],
    sessions: [],
    runTaskDags: {},
    workerNodes: [],
    approvals: [],
    validations: [],
    artifacts: [],
    messages: [],
    repeatableRunDefinitions: [],
    repeatableRunTriggers: [],
    externalEventReceipts: [],
    identity: null,
    governance: null,
    source: 'api',
  }
}

function readStoredSidebarWidth() {
  if (typeof window === 'undefined') {
    return 380
  }

  const raw = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
  if (!Number.isFinite(raw)) {
    return 380
  }

  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, raw))
}

function parseRoute(pathname: string): Route {
  const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean)

  if (segments.length === 0) {
    return { kind: 'projects' }
  }

  if (segments[0] === 'projects') {
    if (segments.length === 1) {
      return { kind: 'projects' }
    }
    if (segments[1] === 'new') {
      return { kind: 'project-new' }
    }

    const projectId = segments[1]
    const section = segments[2] ?? 'overview'
    if (section === 'repositories') {
      return { kind: 'project', projectId, section, mode: segments[3] === 'new' ? 'new-repository' : undefined }
    }
    if (section === 'teams') {
      const mode =
        segments[3] === 'new'
          ? 'new-team'
          : segments[3] === 'import'
            ? 'import-team'
            : undefined
      return { kind: 'project', projectId, section, mode }
    }
    if (section === 'automation') {
      const mode =
        segments[3] === 'repeatable-runs' && segments[4] === 'new'
          ? 'new-repeatable-run'
          : segments[3] === 'webhooks' && segments[4] === 'new'
            ? 'new-webhook'
            : undefined
      return { kind: 'project', projectId, section, mode }
    }
    if (section === 'runs') {
      return { kind: 'project', projectId, section, mode: segments[3] === 'new' ? 'new-run' : undefined }
    }
    if (section === 'settings') {
      return { kind: 'project', projectId, section }
    }
    return { kind: 'project', projectId, section: 'overview' }
  }

  if (segments[0] === 'adhoc-runs') {
    return { kind: 'adhoc-runs', mode: segments[1] === 'new' ? 'new' : undefined }
  }

  if (segments[0] === 'settings') {
    return { kind: 'settings' }
  }

  if (segments[0] === 'runs' && segments[1]) {
    const section = segments[2]
    if (section === 'board' || section === 'lifecycle' || section === 'review' || section === 'overview') {
      return { kind: 'run', runId: segments[1], section }
    }
    return { kind: 'run', runId: segments[1], section: 'overview' }
  }

  return { kind: 'projects' }
}

function formatDate(input: string | null | undefined) {
  if (!input) {
    return 'n/a'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(input))
}

function formatLabel(input: string | null | undefined) {
  if (!input) {
    return 'n/a'
  }
  return input.replace(/_/g, ' ')
}

function buildApiUrl(path: string) {
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`
}

function applyRuntimeConfig(config: RuntimeConfig) {
  API_BASE_URL = (config.apiBaseUrl ?? API_BASE_URL).replace(/\/$/, '')
  API_TOKEN = (config.apiToken ?? API_TOKEN).trim()
}

async function refreshRuntimeConfig() {
  const timestamp = Date.now()
  const response = await fetch(`/runtime-config.json?ts=${timestamp}`, {
    cache: 'no-store',
  })
  if (response.ok) {
    const config = (await response.json()) as RuntimeConfig
    window.__CODEX_SWARM_CONFIG__ = config
    applyRuntimeConfig(config)
    return
  }

  const fallback = await fetch(`/runtime-config.js?ts=${timestamp}`, {
    cache: 'no-store',
  })
  if (!fallback.ok) {
    throw new Error(`Runtime config refresh failed: ${response.status}`)
  }

  const script = await fallback.text()
  const match = script.match(/window\.__CODEX_SWARM_CONFIG__\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)
  if (!match) {
    throw new Error('Runtime config refresh failed: invalid runtime-config.js payload')
  }

  const config = JSON.parse(match[1]) as RuntimeConfig
  window.__CODEX_SWARM_CONFIG__ = config
  applyRuntimeConfig(config)
}

async function buildRequestError(response: Response) {
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return new Error(payload.error)
  }

  return new Error(`Request failed: ${response.status}`)
}

async function requestJson<T>(path: string, init?: RequestInit, allowRetry = true): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (API_TOKEN) {
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

async function loadTeamBlueprints(): Promise<TeamBlueprint[]> {
  return requestJson<TeamBlueprint[]>('/api/v1/team-blueprints')
}

async function loadProjectSummaries() {
  return requestJson<ContractProjectSummary[]>('/api/v1/projects').catch(() => [])
}

async function createProject(input: { name: string; description?: string | null }) {
  return requestJson<ContractProjectSummary>('/api/v1/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function createRepository(input: {
  name: string
  url: string
  provider: RepositoryProvider
  localPath?: string
  projectId?: string | null
}): Promise<Repository> {
  return requestJson<Repository>('/api/v1/repositories', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function loadProjectTeams(projectId?: string) {
  const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
  return requestJson<ProjectTeamDetail[]>(`/api/v1/project-teams${suffix}`).catch(() => [])
}

async function createProjectTeam(input: ProjectTeamCreateInput) {
  return requestJson<ProjectTeamDetail>('/api/v1/project-teams', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function importProjectTeam(input: ProjectTeamImportInput) {
  return requestJson<ProjectTeamDetail>('/api/v1/project-teams/import', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function updateProjectTeam(projectTeamId: string, input: ProjectTeamUpdateInput) {
  return requestJson<ProjectTeamDetail>(`/api/v1/project-teams/${encodeURIComponent(projectTeamId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

async function deleteProjectTeam(projectTeamId: string) {
  return requestJson<void>(`/api/v1/project-teams/${encodeURIComponent(projectTeamId)}`, {
    method: 'DELETE',
  })
}

async function updateRepository(repositoryId: string, input: RepositoryUpdateInput): Promise<Repository> {
  return requestJson<Repository>(`/api/v1/repositories/${encodeURIComponent(repositoryId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

async function createRun(input: {
  repositoryId: string
  projectId?: string | null
  projectTeamId?: string | null
  goal: string
  branchName?: string | null
  concurrencyCap?: number
  handoff: Run['handoff']
}): Promise<Run> {
  return requestJson<Run>('/api/v1/runs', {
    method: 'POST',
    body: JSON.stringify(input),
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
      definitionOfDone: [],
      acceptanceCriteria: [],
      dependencyIds: [],
      validationTemplates: [],
    }),
  })
}

async function updateApprovalDecision(approvalId: string, status: ApprovalStatus, notes: string) {
  return requestJson<Approval>(`/api/v1/approvals/${encodeURIComponent(approvalId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      resolver: APPROVAL_RESOLVER,
      feedback: notes.trim() || undefined,
      resolutionPayload: notes.trim() ? { feedback: notes.trim() } : {},
    }),
  })
}

async function loadApprovalDetail(approvalId: string) {
  return requestJson<Approval>(`/api/v1/approvals/${encodeURIComponent(approvalId)}`)
}

async function loadArtifactDetail(artifactId: string) {
  return requestJson<ArtifactDetail>(`/api/v1/artifacts/${encodeURIComponent(artifactId)}`)
}

async function loadRunEvents(runId: string) {
  return requestJson<ControlPlaneEvent[]>(`/api/v1/events?runId=${encodeURIComponent(runId)}`).catch(() => [])
}

async function loadRunDetail(runId: string) {
  return requestJson<RunDetail>(`/api/v1/runs/${encodeURIComponent(runId)}`)
}

async function loadRunApprovals(runId: string) {
  return requestJson<Approval[]>(`/api/v1/approvals?runId=${encodeURIComponent(runId)}`).catch(() => [])
}

async function loadRunValidations(runId: string) {
  return requestJson<Validation[]>(`/api/v1/validations?runId=${encodeURIComponent(runId)}`).catch(() => [])
}

async function loadRunArtifacts(runId: string) {
  return requestJson<Artifact[]>(`/api/v1/artifacts?runId=${encodeURIComponent(runId)}`).catch(() => [])
}

async function loadRunMessages(runId: string) {
  return requestJson<Message[]>(`/api/v1/messages?runId=${encodeURIComponent(runId)}`).catch(() => [])
}

async function loadSessionTranscript(sessionId: string) {
  return requestJson<SessionTranscriptEntry[]>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/transcript`).catch(() => [])
}

function mergeRunLiveRefreshRequests(left: RunLiveRefreshRequest | null, right: RunLiveRefreshRequest) {
  return {
    runDetail: Boolean(left?.runDetail || right.runDetail),
    approvals: Boolean(left?.approvals || right.approvals),
    validations: Boolean(left?.validations || right.validations),
    artifacts: Boolean(left?.artifacts || right.artifacts),
    messages: Boolean(left?.messages || right.messages),
    events: Boolean(left?.events || right.events),
  }
}

function replaceRunScopedItems<T extends { runId: string }>(items: T[], runId: string, nextItems: T[]) {
  return [...items.filter((item) => item.runId !== runId), ...nextItems]
}

function appendLiveRunEvent(items: ControlPlaneEvent[], nextItem: ControlPlaneEvent) {
  if (items.some((item) => item.id === nextItem.id)) {
    return items
  }

  return [...items, nextItem].sort((left, right) =>
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
}

function refreshRequestForControlPlaneEvent(event: ControlPlaneEvent): RunLiveRefreshRequest {
  switch (event.entityType) {
    case 'approval':
      return { approvals: true }
    case 'validation':
      return { validations: true }
    case 'artifact':
      return { artifacts: true }
    case 'message':
      return { messages: true }
    default:
      return { runDetail: true }
  }
}

function parseSseFrames(buffer: string) {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const frameChunks = normalized.split('\n\n')
  const rest = frameChunks.pop() ?? ''
  const frames: StreamEventFrame[] = []

  for (const frameChunk of frameChunks) {
    if (!frameChunk.trim()) {
      continue
    }

    let event = 'message'
    const dataLines: string[] = []

    for (const line of frameChunk.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart())
      }
    }

    if (dataLines.length === 0) {
      continue
    }

    frames.push({
      event,
      data: dataLines.join('\n'),
    })
  }

  return {
    frames,
    rest,
  }
}

async function openRunStream(
  runId: string,
  signal: AbortSignal,
  onFrame: (frame: StreamEventFrame) => void,
  onOpen?: () => void,
) {
  const headers = new Headers()
  if (API_TOKEN) {
    headers.set('Authorization', `Bearer ${API_TOKEN}`)
  }

  const response = await fetch(buildApiUrl(`/api/v1/runs/${encodeURIComponent(runId)}/stream`), {
    headers,
    signal,
    cache: 'no-store',
  })

  if (!response.ok) {
    throw await buildRequestError(response)
  }

  if (!response.body) {
    throw new Error('run stream did not return a readable body')
  }

  onOpen?.()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const { frames, rest } = parseSseFrames(buffer)
    buffer = rest

    for (const frame of frames) {
      onFrame(frame)
    }
  }
}

async function loadRepeatableRunDefinitions(repositoryId?: string) {
  const suffix = repositoryId ? `?repositoryId=${encodeURIComponent(repositoryId)}` : ''
  return requestJson<RepeatableRunDefinition[]>(`/api/v1/repeatable-runs${suffix}`)
}

async function createRepeatableRunDefinition(input: RepeatableRunDefinitionCreateInput) {
  return requestJson<RepeatableRunDefinition>('/api/v1/repeatable-runs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function updateRepeatableRunDefinition(definitionId: string, input: Partial<RepeatableRunDefinitionCreateInput>) {
  return requestJson<RepeatableRunDefinition>(`/api/v1/repeatable-runs/${encodeURIComponent(definitionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

async function deleteRepeatableRunDefinition(definitionId: string) {
  return requestJson<void>(`/api/v1/repeatable-runs/${encodeURIComponent(definitionId)}`, {
    method: 'DELETE',
  })
}

async function loadRepeatableRunTriggers(repositoryId?: string) {
  const suffix = repositoryId ? `?repositoryId=${encodeURIComponent(repositoryId)}` : ''
  return requestJson<RepeatableRunTrigger[]>(`/api/v1/repeatable-run-triggers${suffix}`)
}

async function createRepeatableRunTrigger(input: RepeatableRunTriggerCreateInput) {
  return requestJson<RepeatableRunTrigger>('/api/v1/repeatable-run-triggers', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

type RepeatableRunTriggerUpdateInput = Partial<Omit<RepeatableRunTriggerCreateInput, 'kind'>> & {
  config?: Partial<RepeatableRunTriggerCreateInput['config']>
}

async function updateRepeatableRunTrigger(
  triggerId: string,
  input: RepeatableRunTriggerUpdateInput,
) {
  return requestJson<RepeatableRunTrigger>(`/api/v1/repeatable-run-triggers/${encodeURIComponent(triggerId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

async function deleteRepeatableRunTrigger(triggerId: string) {
  return requestJson<void>(`/api/v1/repeatable-run-triggers/${encodeURIComponent(triggerId)}`, {
    method: 'DELETE',
  })
}

async function loadExternalEventReceipts(repositoryId?: string) {
  const suffix = repositoryId ? `?repositoryId=${encodeURIComponent(repositoryId)}` : ''
  return requestJson<ExternalEventReceipt[]>(`/api/v1/external-event-receipts${suffix}`)
}

async function loadIdentity() {
  return requestJson<IdentityContext>('/api/v1/me').catch(() => null)
}

async function loadGovernanceReport() {
  return requestJson<GovernanceAdminReport>('/api/v1/admin/governance-report').catch(() => null)
}

async function loadSwarmData(): Promise<SwarmData> {
  try {
    const projectSummaries = await loadProjectSummaries()
    const projectTeams = await loadProjectTeams()
    const repositories = await requestJson<Repository[]>('/api/v1/repositories').catch(() => [])
    const runs = await requestJson<Run[]>('/api/v1/runs').catch(() => [])
    const workerNodes = await requestJson<WorkerNode[]>('/api/v1/worker-nodes').catch(() => [])
    const repeatableRunDefinitions = await loadRepeatableRunDefinitions().catch(() => [])
    const repeatableRunTriggers = await loadRepeatableRunTriggers().catch(() => [])
    const externalEventReceipts = await loadExternalEventReceipts().catch(() => [])
    const identity = await loadIdentity()
    const governance = await loadGovernanceReport()

    if (runs.length === 0) {
      return {
        ...createEmptySwarmData(),
        projectSummaries,
        projectTeams,
        repositories,
        runs,
        workerNodes,
        repeatableRunDefinitions,
        repeatableRunTriggers,
        externalEventReceipts,
        identity,
        governance,
      }
    }

    const details = await Promise.all(
      runs.map((run) => requestJson<RunDetail>(`/api/v1/runs/${encodeURIComponent(run.id)}`).catch(() => ({
        ...run,
        tasks: [],
        agents: [],
        sessions: [],
        taskDag: null,
      }))),
    )

    const approvals = (await Promise.all(
      runs.map((run) => requestJson<Approval[]>(`/api/v1/approvals?runId=${encodeURIComponent(run.id)}`).catch(() => [])),
    )).flat()
    const validations = (await Promise.all(
      runs.map((run) => requestJson<Validation[]>(`/api/v1/validations?runId=${encodeURIComponent(run.id)}`).catch(() => [])),
    )).flat()
    const artifacts = (await Promise.all(
      runs.map((run) => requestJson<Artifact[]>(`/api/v1/artifacts?runId=${encodeURIComponent(run.id)}`).catch(() => [])),
    )).flat()
    const messages = (await Promise.all(
      runs.map((run) => requestJson<Message[]>(`/api/v1/messages?runId=${encodeURIComponent(run.id)}`).catch(() => [])),
    )).flat()

    return {
      projectSummaries,
      projectTeams,
      repositories,
      runs,
      tasks: details.flatMap((detail) => detail.tasks),
      agents: details.flatMap((detail) => detail.agents),
      sessions: details.flatMap((detail) => detail.sessions),
      runTaskDags: Object.fromEntries(details.map((detail) => [detail.id, detail.taskDag ?? null])),
      workerNodes,
      approvals,
      validations,
      artifacts,
      messages,
      repeatableRunDefinitions,
      repeatableRunTriggers,
      externalEventReceipts,
      identity,
      governance,
      source: 'api',
    }
  } catch {
    return createEmptySwarmData()
  }
}

function toneForStatus(status: string) {
  if (status === 'completed' || status === 'approved' || status === 'passed' || status === 'run_created' || status === 'open') {
    return 'success'
  }
  if (status === 'failed' || status === 'rejected' || status === 'cancelled' || status === 'closed') {
    return 'danger'
  }
  if (status === 'awaiting_approval' || status === 'blocked' || status === 'pending' || status === 'planning') {
    return 'warning'
  }
  return 'active'
}

function compareTasks(left: Task, right: Task) {
  if (left.priority !== right.priority) {
    return left.priority - right.priority
  }

  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
}

function agentLabel(agentId: string | null, agentsById: Map<string, Agent>) {
  if (!agentId) {
    return 'Unassigned'
  }

  const agent = agentsById.get(agentId)
  if (!agent) {
    return `Agent ${agentId.slice(0, 8)}`
  }

  return agent.profile ? `${agent.name} (${agent.profile})` : agent.name
}

function buildTaskPresentation(task: Task, allTasks: Task[], agentsById: Map<string, Agent>): TaskPresentation {
  const reworkTasks = allTasks.filter((candidate) =>
    candidate.parentTaskId === task.id
    && candidate.status !== 'completed'
    && candidate.status !== 'cancelled',
  )
  const hasDefinitionOfDone = task.definitionOfDone.length > 0
  const isLegacy = !hasDefinitionOfDone && task.verificationStatus === 'not_required'

  let verificationState: VerificationViewState
  if (isLegacy) {
    verificationState = 'legacy'
  } else if (task.latestVerificationChangeRequests.length > 0 && reworkTasks.length > 0) {
    verificationState = 'rework_requested'
  } else if (task.verificationStatus === 'requested' || (task.status === 'awaiting_review' && task.verificationStatus === 'pending')) {
    verificationState = 'awaiting_verification'
  } else if (task.verificationStatus === 'in_progress') {
    verificationState = 'verification_running'
  } else if (task.verificationStatus === 'passed') {
    verificationState = 'verified_complete'
  } else if (task.verificationStatus === 'failed') {
    verificationState = 'verification_failed'
  } else if (task.verificationStatus === 'blocked') {
    verificationState = 'verification_blocked'
  } else {
    verificationState = 'not_requested'
  }

  const verificationLabelMap: Record<VerificationViewState, string> = {
    legacy: 'Legacy task',
    not_requested: 'Verification not requested',
    awaiting_verification: 'Awaiting verification',
    verification_running: 'Verification in progress',
    verified_complete: 'Verified complete',
    verification_failed: 'Verification failed',
    rework_requested: 'Rework requested',
    verification_blocked: 'Verification blocked',
  }
  const verificationToneMap: Record<VerificationViewState, string> = {
    legacy: 'muted',
    not_requested: 'muted',
    awaiting_verification: 'warning',
    verification_running: 'warning',
    verified_complete: 'success',
    verification_failed: 'danger',
    rework_requested: 'danger',
    verification_blocked: 'danger',
  }
  const verificationCopyMap: Record<VerificationViewState, string> = {
    legacy: 'This task was created before mandatory verification metadata was stored.',
    not_requested: 'Verification has not been requested yet.',
    awaiting_verification: 'Worker finished. Waiting for verifier assignment.',
    verification_running: 'Verifier is checking delivered work against the definition of done.',
    verified_complete: 'Passed verification against the definition of done.',
    verification_failed: 'Verifier found unmet definition-of-done items.',
    rework_requested: 'Leader opened follow-up work from verifier change requests.',
    verification_blocked: 'Verifier escalated a blocker to the leader.',
  }
  const verificationSubtitleMap: Record<VerificationViewState, string> = {
    legacy: 'Legacy task metadata remains readable, but automatic verification does not apply.',
    not_requested: 'Execution has not reached the verification step yet.',
    awaiting_verification: 'Execution is finished. Verification has not started yet.',
    verification_running: 'Verifier is reviewing delivered work against the stored definition of done.',
    verified_complete: 'All required definition-of-done checks passed.',
    verification_failed: 'Verification failed. Review findings are listed below.',
    rework_requested: 'Rework was requested from verifier findings. The original task stays open until follow-up work lands.',
    verification_blocked: 'Verification could not complete and was escalated to the leader.',
  }

  return {
    verificationState,
    primaryStatusTone: toneForStatus(task.status),
    verificationTone: verificationToneMap[verificationState],
    verificationLabel: verificationLabelMap[verificationState],
    verificationSummary: verificationCopyMap[verificationState],
    verificationSubtitle: verificationSubtitleMap[verificationState],
    ownerLabel: agentLabel(task.ownerAgentId, agentsById),
    verifierLabel: task.verifierAgentId
      ? agentLabel(task.verifierAgentId, agentsById)
      : (verificationState === 'awaiting_verification'
        || verificationState === 'verification_running'
        || verificationState === 'verification_failed'
        || verificationState === 'verification_blocked'
        || verificationState === 'rework_requested')
        ? 'Assignment pending'
        : 'Not assigned',
    latestSummary: task.latestVerificationSummary?.trim() || (
      verificationState === 'legacy'
        ? 'This task predates stored definition of done.'
        : verificationState === 'not_requested'
          ? 'No verification summary published yet.'
          : verificationCopyMap[verificationState]
    ),
    hasDefinitionOfDone,
    isLegacy,
    reworkTasks,
  }
}

function matchesReviewFilter(presentation: TaskPresentation, filter: ReviewQueueFilter) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'awaiting') {
    return presentation.verificationState === 'awaiting_verification'
  }

  if (filter === 'running') {
    return presentation.verificationState === 'verification_running'
  }

  if (filter === 'failed') {
    return presentation.verificationState === 'verification_failed' || presentation.verificationState === 'rework_requested'
  }

  return presentation.verificationState === 'verified_complete'
}

function runKindLabel(projectId: string | null) {
  return projectId ? 'Project run' : 'Ad-hoc run'
}

function sidebarPillClassName(active: boolean) {
  return active ? 'ghost-pill is-active' : 'ghost-pill'
}

function shortRunId(runId: string) {
  return runId.slice(0, 8)
}

function App() {
  const { activeTheme, setActiveTheme, themes } = useTheme()
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  const [data, setData] = useState<SwarmData>(createEmptySwarmData())
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [teamBlueprints, setTeamBlueprints] = useState<TeamBlueprint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshError, setRefreshError] = useState('')
  const [busy, setBusy] = useState(false)
  const [projectQuery, setProjectQuery] = useState('')
  const [runQuery, setRunQuery] = useState('')
  const [repoQuery, setRepoQuery] = useState('')
  const [projectView, setProjectView] = useState<'all' | 'recent' | 'needs-setup'>('all')
  const [settingsScope, setSettingsScope] = useState<'workspace' | 'policy' | 'provider'>('workspace')
  const [projectForm, setProjectForm] = useState({ name: '', summary: '', repositoryIds: [] as string[] })
  const [projectTeamForm, setProjectTeamForm] = useState({
    name: '',
    description: '',
    concurrencyCap: '1',
    members: [
      { name: 'Leader', role: 'tech-lead', profile: 'leader', responsibility: 'Own sequencing, planning, and run closure.' },
      { name: 'Implementer', role: 'implementer', profile: 'implementer', responsibility: 'Implement the assigned slice.' },
    ] as ProjectTeamMemberDraft[],
  })
  const [projectTeamImportForm, setProjectTeamImportForm] = useState({ blueprintId: '', name: '', description: '' })
  const [editingProjectTeamId, setEditingProjectTeamId] = useState('')
  const [repoForm, setRepoForm] = useState({ name: '', url: '', provider: 'github' as RepositoryProvider, localPath: '' })
  const [runForm, setRunForm] = useState({ repositoryId: '', projectTeamId: '', goal: '', branchName: 'main', concurrencyCap: '1' })
  const [boardDraft, setBoardDraft] = useState({ title: '', description: '', role: 'implementer' })
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewFilter, setReviewFilter] = useState<ReviewQueueFilter>('awaiting')
  const [selectedApprovalId, setSelectedApprovalId] = useState('')
  const [selectedArtifactId, setSelectedArtifactId] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [approvalDetail, setApprovalDetail] = useState<Approval | null>(null)
  const [artifactDetail, setArtifactDetail] = useState<ArtifactDetail | null>(null)
  const [runEvents, setRunEvents] = useState<ControlPlaneEvent[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [transcript, setTranscript] = useState<SessionTranscriptEntry[]>([])
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [automationRepositoryId, setAutomationRepositoryId] = useState('')
  const [message, setMessage] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth)
  const [pendingRunStarts, setPendingRunStarts] = useState<string[]>([])
  const liveRunRefreshStateRef = useRef<{
    inFlight: boolean
    pendingByRunId: Map<string, RunLiveRefreshRequest>
  }>({
    inFlight: false,
    pendingByRunId: new Map<string, RunLiveRefreshRequest>(),
  })
  const queueRunLiveRefreshRef = useRef<(runId: string, request: RunLiveRefreshRequest) => void>(() => undefined)

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute(window.location.pathname))
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    let active = true
    async function hydrate() {
      setLoading(true)
      const [swarmData, nextTeamBlueprints] = await Promise.all([
        loadSwarmData(),
        loadTeamBlueprints().catch(() => []),
      ])

      if (!active) {
        return
      }

      setData(swarmData)
      setTeamBlueprints(nextTeamBlueprints)
      setProjects(normalizeProjects(
        swarmData.projectSummaries.map((project) => ({
          id: project.id,
          name: project.name,
          summary: project.description ?? '',
          repositoryIds: swarmData.repositories
            .filter((repository) => repository.projectId === project.id)
            .map((repository) => repository.id),
          createdAt: new Date(project.createdAt).toISOString(),
          updatedAt: new Date(project.updatedAt).toISOString(),
        })),
      ))
      setLoading(false)
      setRefreshError('')
    }

    void hydrate().catch((error: unknown) => {
      if (!active) {
        return
      }
      setRefreshError(error instanceof Error ? error.message : 'Unable to refresh workspace')
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const projectTeam = data.projectTeams.find((item) => item.id === runForm.projectTeamId)
    if (!projectTeam) {
      return
    }
    setRunForm((current) => ({
      ...current,
      concurrencyCap: current.concurrencyCap === String(projectTeam.concurrencyCap)
        ? current.concurrencyCap
        : String(projectTeam.concurrencyCap),
    }))
  }, [data.projectTeams, runForm.projectTeamId])

  const projectSummaries = useMemo(
    () => deriveProjectSummaries(projects, data.repositories, data.runs),
    [data.repositories, data.runs, projects],
  )
  const adHocWorkspace = useMemo(
    () => deriveAdHocWorkspace(projects, data.repositories, data.runs),
    [data.repositories, data.runs, projects],
  )

  const selectedProject = route.kind === 'project'
    ? projectSummaries.find((item) => item.project.id === route.projectId) ?? null
    : null
  const selectedProjectTeams = useMemo(
    () => (selectedProject
      ? data.projectTeams.filter((projectTeam) => projectTeam.projectId === selectedProject.project.id)
      : []),
    [data.projectTeams, selectedProject],
  )
  const selectedProjectRepositories = useMemo(
    () => (selectedProject
      ? data.repositories.filter((repository) => selectedProject.project.repositoryIds.includes(repository.id))
      : []),
    [data.repositories, selectedProject],
  )
  const selectedRun = route.kind === 'run'
    ? data.runs.find((run) => run.id === route.runId) ?? null
    : null
  const selectedRunId = selectedRun?.id ?? null
  const isSelectedRunStartPending = selectedRun ? pendingRunStarts.includes(selectedRun.id) : false
  const selectedRepository = selectedRun
    ? data.repositories.find((repository) => repository.id === selectedRun.repositoryId) ?? null
    : null
  const selectedRunProject = selectedRun
    ? projectSummaries.find((summary) => summary.project.id === (selectedRun.projectId ?? null)) ?? null
    : null
  const selectedProjectRunsFull = useMemo(
    () => (selectedProject
      ? data.runs.filter((run) => run.projectId === selectedProject.project.id)
      : []),
    [data.runs, selectedProject],
  )
  const isProjectRunCreate = route.kind === 'project' && route.section === 'runs' && route.mode === 'new-run'
  const newRunRepositories = isProjectRunCreate ? selectedProjectRepositories : adHocWorkspace.repositories
  const shouldShowRunRepositoryPicker = isProjectRunCreate ? newRunRepositories.length > 1 : true
  const runTasks = useMemo(
    () => (selectedRun ? data.tasks.filter((task) => task.runId === selectedRun.id) : []),
    [data.tasks, selectedRun],
  )
  const runApprovals = useMemo(
    () => (selectedRun ? data.approvals.filter((approval) => approval.runId === selectedRun.id) : []),
    [data.approvals, selectedRun],
  )
  const runValidations = useMemo(
    () => (selectedRun ? data.validations.filter((validation) => validation.runId === selectedRun.id) : []),
    [data.validations, selectedRun],
  )
  const runArtifacts = useMemo(
    () => (selectedRun ? data.artifacts.filter((artifact) => artifact.runId === selectedRun.id) : []),
    [data.artifacts, selectedRun],
  )
  const runSessions = useMemo(
    () => (selectedRun ? data.sessions.filter((session) => session.runId === selectedRun.id) : []),
    [data.sessions, selectedRun],
  )
  const runAgents = useMemo(
    () => (selectedRun ? data.agents.filter((agent) => agent.runId === selectedRun.id) : []),
    [data.agents, selectedRun],
  )
  const runAgentsById = useMemo(
    () => new Map(runAgents.map((agent) => [agent.id, agent] as const)),
    [runAgents],
  )
  const runTaskPresentations = useMemo(
    () => new Map(runTasks.map((task) => [task.id, buildTaskPresentation(task, runTasks, runAgentsById)] as const)),
    [runAgentsById, runTasks],
  )
  const selectedRunTaskDag = selectedRun ? data.runTaskDags[selectedRun.id] ?? null : null

  function handleTaskSelection(nextTaskId: string) {
    startTransition(() => setSelectedTaskId(nextTaskId))
  }

  function handleDagTaskSelection(nextTaskId: string) {
    handleTaskSelection(nextTaskId)
    if (typeof window !== 'undefined' && window.innerWidth < 720) {
      window.requestAnimationFrame(() => {
        document.getElementById('task-detail-panel')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    }
  }

  const dagToneByTaskId = useMemo(
    () => new Map<string, string>(
      Array.from(runTaskPresentations.entries(), ([taskId, presentation]) => [taskId, presentation.primaryStatusTone]),
    ),
    [runTaskPresentations],
  )

  useEffect(() => {
    if (!selectedRunId) {
      setRunEvents([])
      return
    }

    void loadRunEvents(selectedRunId).then(setRunEvents)
  }, [selectedRunId])

  useEffect(() => {
    if (route.kind !== 'run' || !selectedRunId) {
      return
    }

    const runId = selectedRunId
    const liveRefreshState = liveRunRefreshStateRef.current
    let disposed = false
    let reconnectTimer: number | null = null
    let attempt = 0
    let hasConnected = false
    let activeController: AbortController | null = null

    const scheduleReconnect = () => {
      if (disposed) {
        return
      }

      const delay = Math.min(10000, 1000 * 2 ** attempt)
      attempt += 1

      reconnectTimer = window.setTimeout(() => {
        if (disposed) {
          return
        }

        queueRunLiveRefreshRef.current(runId, {
          runDetail: true,
          approvals: true,
          validations: true,
          artifacts: true,
          messages: true,
          events: true,
        })
        void connect()
      }, delay)
    }

    const connect = async () => {
      activeController = new AbortController()

      try {
        await openRunStream(
          runId,
          activeController.signal,
          (frame) => {
            if (frame.event !== 'control_plane_event') {
              return
            }

            try {
              const nextEvent = JSON.parse(frame.data) as ControlPlaneEvent
              setRunEvents((current) => appendLiveRunEvent(current, nextEvent))
              queueRunLiveRefreshRef.current(runId, refreshRequestForControlPlaneEvent(nextEvent))
            } catch (error) {
              console.error('[run-stream] failed to parse control plane event', error)
            }
          },
          () => {
            attempt = 0

            if (hasConnected) {
              queueRunLiveRefreshRef.current(runId, {
                runDetail: true,
                approvals: true,
                validations: true,
                artifacts: true,
                messages: true,
                events: true,
              })
            }

            hasConnected = true
          },
        )

        if (!disposed && !activeController.signal.aborted) {
          scheduleReconnect()
        }
      } catch (error) {
        if (disposed || activeController.signal.aborted) {
          return
        }

        console.error('[run-stream] connection failed', error)
        scheduleReconnect()
      }
    }

    void connect()

    return () => {
      disposed = true
      activeController?.abort()
      liveRefreshState.pendingByRunId.delete(runId)
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
      }
    }
  }, [route.kind, selectedRunId])

  useEffect(() => {
    const approval = runApprovals[0] ?? null
    setSelectedApprovalId(approval?.id ?? '')
    setReviewNotes('')
  }, [runApprovals])

  useEffect(() => {
    const artifact = runArtifacts.find((item) => item.kind === 'diff') ?? runArtifacts[0] ?? null
    setSelectedArtifactId(artifact?.id ?? '')
  }, [selectedRun?.id, runArtifacts])

  useEffect(() => {
    if (newRunRepositories.length === 1) {
      const onlyRepository = newRunRepositories[0]
      setRunForm((current) => current.repositoryId === onlyRepository.id ? current : { ...current, repositoryId: onlyRepository.id })
      return
    }

    setRunForm((current) => {
      if (!current.repositoryId) {
        return current
      }
      const stillVisible = newRunRepositories.some((repository) => repository.id === current.repositoryId)
      return stillVisible ? current : { ...current, repositoryId: '' }
    })
  }, [newRunRepositories])

  useEffect(() => {
    if (!isProjectRunCreate) {
      return
    }
    if (selectedProjectTeams.length === 1) {
      const onlyTeam = selectedProjectTeams[0]
      setRunForm((current) => current.projectTeamId === onlyTeam.id ? current : { ...current, projectTeamId: onlyTeam.id })
      return
    }
    setRunForm((current) => {
      if (!current.projectTeamId) {
        return current
      }
      const stillVisible = selectedProjectTeams.some((projectTeam) => projectTeam.id === current.projectTeamId)
      return stillVisible ? current : { ...current, projectTeamId: '' }
    })
  }, [isProjectRunCreate, selectedProjectTeams])

  useEffect(() => {
    if (!selectedApprovalId) {
      setApprovalDetail(null)
      return
    }
    void loadApprovalDetail(selectedApprovalId).then(setApprovalDetail).catch(() => setApprovalDetail(null))
  }, [selectedApprovalId])

  useEffect(() => {
    if (!selectedArtifactId) {
      setArtifactDetail(null)
      return
    }
    void loadArtifactDetail(selectedArtifactId).then(setArtifactDetail).catch(() => setArtifactDetail(null))
  }, [selectedArtifactId])

  useEffect(() => {
    const nextSession = runSessions[0]?.id ?? ''
    setSelectedSessionId(nextSession)
  }, [selectedRun?.id, runSessions])

  useEffect(() => {
    if (!runTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(runTasks[0]?.id ?? '')
    }
  }, [runTasks, selectedTaskId])

  useEffect(() => {
    if (!selectedSessionId) {
      setTranscript([])
      return
    }
    void loadSessionTranscript(selectedSessionId).then(setTranscript)
  }, [selectedSessionId])

  useEffect(() => {
    if (route.kind === 'project' && route.section === 'automation' && !automationRepositoryId) {
      setAutomationRepositoryId(selectedProject?.repositories[0]?.id ?? '')
    }
  }, [automationRepositoryId, route, selectedProject])

  useEffect(() => {
    if (pendingRunStarts.length === 0) {
      return
    }
    const activePendingRunIds = new Set(
      data.runs
        .filter((run) => run.status === 'pending')
        .map((run) => run.id),
    )
    setPendingRunStarts((current) => current.filter((runId) => activePendingRunIds.has(runId)))
  }, [data.runs, pendingRunStarts.length])

  function navigate(to: string) {
    if (window.location.pathname === to) {
      return
    }
    window.history.pushState(null, '', to)
    setRoute(parseRoute(to))
  }

  async function refresh() {
    setLoading(true)
    const nextData = await loadSwarmData()
    setData(nextData)
    setLoading(false)
  }

  async function refreshRunSlices(runId: string, request: RunLiveRefreshRequest) {
    const [
      nextRunDetail,
      nextApprovals,
      nextValidations,
      nextArtifacts,
      nextMessages,
      nextEvents,
    ] = await Promise.all([
      request.runDetail ? loadRunDetail(runId) : Promise.resolve(null),
      request.approvals ? loadRunApprovals(runId) : Promise.resolve(null),
      request.validations ? loadRunValidations(runId) : Promise.resolve(null),
      request.artifacts ? loadRunArtifacts(runId) : Promise.resolve(null),
      request.messages ? loadRunMessages(runId) : Promise.resolve(null),
      request.events ? loadRunEvents(runId) : Promise.resolve(null),
    ])

    setData((current) => {
      let nextData = current

      if (nextRunDetail) {
        const { tasks, agents, sessions, taskDag, ...runSummary } = nextRunDetail
        nextData = {
          ...nextData,
          runs: nextData.runs.map((run) => run.id === runId ? {
            ...run,
            ...runSummary,
          } : run),
          tasks: replaceRunScopedItems(nextData.tasks, runId, tasks),
          agents: replaceRunScopedItems(nextData.agents, runId, agents),
          sessions: replaceRunScopedItems(nextData.sessions, runId, sessions),
          runTaskDags: {
            ...nextData.runTaskDags,
            [runId]: taskDag ?? null,
          },
        }
      }

      if (nextApprovals) {
        nextData = {
          ...nextData,
          approvals: replaceRunScopedItems(nextData.approvals, runId, nextApprovals),
        }
      }

      if (nextValidations) {
        nextData = {
          ...nextData,
          validations: replaceRunScopedItems(nextData.validations, runId, nextValidations),
        }
      }

      if (nextArtifacts) {
        nextData = {
          ...nextData,
          artifacts: replaceRunScopedItems(nextData.artifacts, runId, nextArtifacts),
        }
      }

      if (nextMessages) {
        nextData = {
          ...nextData,
          messages: replaceRunScopedItems(nextData.messages, runId, nextMessages),
        }
      }

      return nextData
    })

    if (nextEvents) {
      setRunEvents(nextEvents)
    }
  }

  function queueRunLiveRefresh(runId: string, request: RunLiveRefreshRequest) {
    const refreshState = liveRunRefreshStateRef.current
    refreshState.pendingByRunId.set(
      runId,
      mergeRunLiveRefreshRequests(refreshState.pendingByRunId.get(runId) ?? null, request),
    )

    if (refreshState.inFlight) {
      return
    }

    refreshState.inFlight = true

    void (async () => {
      try {
        while (liveRunRefreshStateRef.current.pendingByRunId.size > 0) {
          const nextEntry = liveRunRefreshStateRef.current.pendingByRunId.entries().next().value as [string, RunLiveRefreshRequest] | undefined

          if (!nextEntry) {
            continue
          }

          const [nextRunId, nextRequest] = nextEntry
          liveRunRefreshStateRef.current.pendingByRunId.delete(nextRunId)
          await refreshRunSlices(nextRunId, nextRequest)
        }
      } catch (error) {
        console.error('[live-run-refresh] refresh failed', error)
      } finally {
        liveRunRefreshStateRef.current.inFlight = false
      }
    })()
  }

  queueRunLiveRefreshRef.current = queueRunLiveRefresh

  function flash(nextMessage: string) {
    setMessage(nextMessage)
    window.setTimeout(() => setMessage(''), 2400)
  }

  function handleSidebarResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    const startX = event.clientX
    const initialWidth = sidebarWidth

    function onPointerMove(moveEvent: PointerEvent) {
      const delta = moveEvent.clientX - startX
      const nextWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, initialWidth + delta))
      setSidebarWidth(nextWidth)
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault()
    if (!projectForm.name.trim()) {
      return
    }
    setBusy(true)
    try {
      const project = await createProject({
        name: projectForm.name.trim(),
        description: projectForm.summary.trim() || null,
      })
      if (projectForm.repositoryIds.length > 0) {
        await Promise.all(
          projectForm.repositoryIds.map((repositoryId) => updateRepository(repositoryId, { projectId: project.id })),
        )
      }
      setProjects((current) => normalizeProjects([
        ...current,
        {
          id: project.id,
          name: project.name,
          summary: project.description ?? '',
          repositoryIds: [],
          createdAt: new Date(project.createdAt).toISOString(),
          updatedAt: new Date(project.updatedAt).toISOString(),
        },
      ]))
      setProjectForm({ name: '', summary: '', repositoryIds: [] })
      await refresh()
      flash('Project created')
      navigate(`/projects/${project.id}`)
    } finally {
      setBusy(false)
    }
  }

  function resetProjectTeamForm() {
    setEditingProjectTeamId('')
    setProjectTeamForm({
      name: '',
      description: '',
      concurrencyCap: '1',
      members: [
        { name: 'Leader', role: 'tech-lead', profile: 'leader', responsibility: 'Own sequencing, planning, and run closure.' },
        { name: 'Implementer', role: 'implementer', profile: 'implementer', responsibility: 'Implement the assigned slice.' },
      ],
    })
  }

  function patchProjectTeamMember(index: number, patch: Partial<ProjectTeamMemberDraft>) {
    setProjectTeamForm((current) => ({
      ...current,
      members: current.members.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member),
    }))
  }

  async function handleSubmitProjectTeam(event: FormEvent) {
    event.preventDefault()
    if (!selectedProject || !projectTeamForm.name.trim()) {
      return
    }

    const members = projectTeamForm.members
      .map((member) => ({
        name: member.name.trim(),
        role: member.role.trim(),
        profile: member.profile.trim(),
        responsibility: member.responsibility.trim() || null,
      }))
      .filter((member) => member.name && member.role && member.profile)

    if (members.length === 0) {
      return
    }

    setBusy(true)
    try {
      if (editingProjectTeamId) {
        await updateProjectTeam(editingProjectTeamId, {
          name: projectTeamForm.name.trim(),
          description: projectTeamForm.description.trim() || null,
          concurrencyCap: Math.max(1, Number.parseInt(projectTeamForm.concurrencyCap, 10) || 1),
          members,
        })
        flash('Project team updated')
      } else {
        await createProjectTeam({
          projectId: selectedProject.project.id,
          name: projectTeamForm.name.trim(),
          description: projectTeamForm.description.trim() || null,
          concurrencyCap: Math.max(1, Number.parseInt(projectTeamForm.concurrencyCap, 10) || 1),
          members,
        })
        flash('Project team created')
      }
      resetProjectTeamForm()
      await refresh()
      navigate(`/projects/${selectedProject.project.id}/teams`)
    } finally {
      setBusy(false)
    }
  }

  async function handleImportProjectTeam(event: FormEvent) {
    event.preventDefault()
    if (!selectedProject || !projectTeamImportForm.blueprintId) {
      return
    }
    setBusy(true)
    try {
      await importProjectTeam({
        projectId: selectedProject.project.id,
        blueprintId: projectTeamImportForm.blueprintId,
        name: projectTeamImportForm.name.trim() || null,
        description: projectTeamImportForm.description.trim() || null,
      })
      setProjectTeamImportForm({ blueprintId: '', name: '', description: '' })
      await refresh()
      flash('Project team imported')
      navigate(`/projects/${selectedProject.project.id}/teams`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteProjectTeam(projectTeamId: string) {
    if (!selectedProject) {
      return
    }
    setBusy(true)
    try {
      await deleteProjectTeam(projectTeamId)
      if (runForm.projectTeamId === projectTeamId) {
        setRunForm((current) => ({ ...current, projectTeamId: '' }))
      }
      await refresh()
      flash('Project team deleted')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateRepository(event: FormEvent) {
    event.preventDefault()
    if (!repoForm.name.trim() || !repoForm.url.trim()) {
      return
    }
    setBusy(true)
    try {
      const repository = await createRepository({
        name: repoForm.name.trim(),
        url: repoForm.url.trim(),
        provider: repoForm.provider,
        localPath: repoForm.localPath.trim() || undefined,
        projectId: selectedProject?.project.id ?? null,
      })
      await refresh()
      if (selectedProject) {
        setProjects((current) => current.map((project) => project.id === selectedProject.project.id
          ? { ...project, repositoryIds: [...new Set([...project.repositoryIds, repository.id])], updatedAt: new Date().toISOString() }
          : project))
      }
      setRepoForm({ name: '', url: '', provider: 'github', localPath: '' })
      flash('Repository created')
      if (selectedProject) {
        navigate(`/projects/${selectedProject.project.id}/repositories`)
      } else {
        navigate('/settings')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateRun(event: FormEvent) {
    event.preventDefault()
    if (!runForm.repositoryId || !runForm.goal.trim()) {
      return
    }
    setBusy(true)
    try {
      const run = await createRun({
        repositoryId: runForm.repositoryId,
        projectId: isProjectRunCreate ? selectedProject?.project.id ?? null : null,
        projectTeamId: isProjectRunCreate ? runForm.projectTeamId || null : null,
        goal: runForm.goal.trim(),
        branchName: runForm.branchName.trim() || null,
        concurrencyCap: Math.max(1, Number.parseInt(runForm.concurrencyCap, 10) || 1),
        handoff: {
          mode: 'manual',
          provider: null,
          baseBranch: null,
          autoPublishBranch: false,
          autoCreatePullRequest: false,
          titleTemplate: null,
          bodyTemplate: null,
        },
      })
      await refresh()
      setRunForm({ repositoryId: '', projectTeamId: '', goal: '', branchName: 'main', concurrencyCap: '1' })
      flash('Run created')
      navigate(`/runs/${run.id}/overview`)
    } finally {
      setBusy(false)
    }
  }

  async function handleStartRun() {
    if (!selectedRun) {
      return
    }
    const runId = selectedRun.id
    if (selectedRun.status !== 'pending' || pendingRunStarts.includes(runId)) {
      return
    }
    setPendingRunStarts((current) => current.includes(runId) ? current : [...current, runId])
    try {
      await startRun(runId)
      await refresh()
      flash('Run started')
    } catch (error) {
      setPendingRunStarts((current) => current.filter((pendingRunId) => pendingRunId !== runId))
      flash(error instanceof Error ? error.message : 'Unable to start run')
    }
  }

  async function handleCreateTask(event: FormEvent) {
    event.preventDefault()
    if (!selectedRun || !boardDraft.title.trim()) {
      return
    }
    setBusy(true)
    try {
      await createTask({
        runId: selectedRun.id,
        title: boardDraft.title.trim(),
        description: boardDraft.description.trim(),
        role: boardDraft.role.trim(),
      })
      setBoardDraft({ title: '', description: '', role: 'implementer' })
      await refresh()
      flash('Backlog item added')
    } finally {
      setBusy(false)
    }
  }

  async function handleApproval(status: ApprovalStatus) {
    if (!selectedApprovalId) {
      return
    }
    setBusy(true)
    try {
      await updateApprovalDecision(selectedApprovalId, status, reviewNotes)
      await refresh()
      flash(status === 'approved' ? 'Approval recorded' : 'Feedback recorded')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateDefinition(input: RepeatableRunDefinitionCreateInput) {
    setBusy(true)
    try {
      await createRepeatableRunDefinition(input)
      await refresh()
      flash('Repeatable run saved')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateDefinition(definitionId: string, input: Partial<RepeatableRunDefinitionCreateInput>) {
    setBusy(true)
    try {
      await updateRepeatableRunDefinition(definitionId, input)
      await refresh()
      flash('Repeatable run updated')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteDefinition(definition: RepeatableRunDefinition) {
    setBusy(true)
    try {
      await deleteRepeatableRunDefinition(definition.id)
      await refresh()
      flash(`Deleted ${definition.name}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateTrigger(input: RepeatableRunTriggerCreateInput) {
    setBusy(true)
    try {
      await createRepeatableRunTrigger(input)
      await refresh()
      flash('Webhook trigger saved')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateTrigger(
    triggerId: string,
    input: RepeatableRunTriggerUpdateInput,
  ) {
    setBusy(true)
    try {
      await updateRepeatableRunTrigger(triggerId, input)
      await refresh()
      flash('Webhook trigger updated')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteTrigger(trigger: RepeatableRunTrigger) {
    setBusy(true)
    try {
      await deleteRepeatableRunTrigger(trigger.id)
      await refresh()
      flash(`Deleted ${trigger.name}`)
    } finally {
      setBusy(false)
    }
  }

  const filteredProjects = projectSummaries.filter((summary) => {
    const haystack = `${summary.project.name} ${summary.project.summary}`.toLowerCase()
    if (!haystack.includes(projectQuery.toLowerCase())) {
      return false
    }
    if (projectView === 'recent') {
      return summary.lastRun !== null
    }
    if (projectView === 'needs-setup') {
      return summary.repositories.length === 0 || summary.runs.length === 0
    }
    return true
  })

  const filteredAdHocRunsFull = data.runs.filter((run) => {
    if (!adHocWorkspace.repositories.some((repository) => repository.id === run.repositoryId)) {
      return false
    }
    const repository = data.repositories.find((item) => item.id === run.repositoryId)
    const haystack = `${run.goal} ${repository?.name ?? ''} ${run.status}`.toLowerCase()
    return haystack.includes(runQuery.toLowerCase())
  })

  const filteredProjectRepos = selectedProjectRepositories.filter((repository) => {
    const haystack = `${repository.name} ${repository.url} ${repository.provider}`.toLowerCase()
    return haystack.includes(repoQuery.toLowerCase())
  })

  const filteredProjectRuns = selectedProjectRunsFull.filter((run) => {
    const repository = data.repositories.find((item) => item.id === run.repositoryId)
    const haystack = `${run.goal} ${repository?.name ?? ''} ${run.status}`.toLowerCase()
    return haystack.includes(runQuery.toLowerCase())
  })

  const activeTasks = runTasks.filter((task) => task.status !== 'completed')
  const completedTasks = runTasks.filter((task) => {
    const presentation = runTaskPresentations.get(task.id)
    return presentation?.verificationState === 'verified_complete' || (task.status === 'completed' && presentation?.isLegacy)
  })
  const waitingTasks = activeTasks.filter((task) => {
    const presentation = runTaskPresentations.get(task.id)
    return presentation?.verificationState === 'awaiting_verification' || presentation?.verificationState === 'verification_running'
  })
  const blockedTasks = activeTasks.filter((task) => {
    const presentation = runTaskPresentations.get(task.id)
    return task.status === 'blocked'
      || presentation?.verificationState === 'verification_failed'
      || presentation?.verificationState === 'rework_requested'
      || presentation?.verificationState === 'verification_blocked'
  })
  const inFlightTasks = activeTasks.filter((task) => {
    const presentation = runTaskPresentations.get(task.id)
    return task.status === 'pending' || task.status === 'in_progress' || presentation?.verificationState === 'not_requested'
  })
  const verificationTasks = runTasks
    .filter((task) => {
      const presentation = runTaskPresentations.get(task.id)
      return Boolean(
        presentation
        && (
          presentation.hasDefinitionOfDone
          || task.verificationStatus !== 'not_required'
          || task.latestVerificationSummary
          || task.latestVerificationChangeRequests.length > 0
          || task.latestVerificationFindings.length > 0
        ),
      )
    })
    .sort(compareTasks)
  const filteredVerificationTasks = verificationTasks.filter((task) => {
    const presentation = runTaskPresentations.get(task.id)
    return presentation ? matchesReviewFilter(presentation, reviewFilter) : false
  })
  const selectedTask = runTasks.find((task) => task.id === selectedTaskId) ?? runTasks[0] ?? null
  const selectedVerificationTask = filteredVerificationTasks.find((task) => task.id === selectedTaskId) ?? filteredVerificationTasks[0] ?? null

  return (
    <div className="app-shell">
      <header className="primary-header">
        <div className="brand-block">
          <span className="brand-mark">CS</span>
          <div>
            <p className="eyebrow">Codex Swarm</p>
            <strong>Operator Console</strong>
          </div>
        </div>

        <nav className="primary-nav" aria-label="Global">
          <button type="button" className={route.kind === 'projects' || route.kind === 'project' || route.kind === 'project-new' ? 'is-active' : ''} onClick={() => navigate('/projects')}>
            Projects
          </button>
          <button type="button" className={route.kind === 'adhoc-runs' ? 'is-active' : ''} onClick={() => navigate('/adhoc-runs')}>
            Ad-Hoc Runs
          </button>
          <button type="button" className={route.kind === 'settings' ? 'is-active' : ''} onClick={() => navigate('/settings')}>
            Settings
          </button>
        </nav>

        <div className="header-meta">
          <span className="status-chip">{data.workerNodes.filter((node) => node.status === 'online').length} Online Nodes</span>
          <span className="status-chip">{data.source === 'api' ? 'Live API' : 'Mock API'}</span>
          <label className="theme-picker">
            <span>Appearance</span>
            <select value={activeTheme} onChange={(event) => setActiveTheme(event.target.value as typeof activeTheme)}>
              {themes.map((theme) => (
                <option key={theme.value} value={theme.value}>{theme.label}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {route.kind === 'project' && selectedProject ? (
        <section className="context-header">
          <div>
            <p className="eyebrow">Projects / {selectedProject.project.name}</p>
            <h1>{selectedProject.project.name}</h1>
            <p>{selectedProject.project.summary || 'Project context for teams, repositories, runs, automation, and policy defaults.'}</p>
          </div>
          <nav className="context-tabs" aria-label="Project sections">
            {[
              ['Overview', `/projects/${selectedProject.project.id}`],
              ['Teams', `/projects/${selectedProject.project.id}/teams`],
              ['Repositories', `/projects/${selectedProject.project.id}/repositories`],
              ['Runs', `/projects/${selectedProject.project.id}/runs`],
              ['Automation', `/projects/${selectedProject.project.id}/automation`],
              ['Settings', `/projects/${selectedProject.project.id}/settings`],
            ].map(([label, href]) => (
              <button key={href} type="button" className={window.location.pathname === href ? 'is-active' : ''} onClick={() => navigate(href)}>
                {label}
              </button>
            ))}
          </nav>
        </section>
      ) : null}

      {route.kind === 'run' && selectedRun ? (
        <section className="context-header run-context">
          <div>
            <p className="eyebrow">{selectedRunProject ? `Projects / ${selectedRunProject.project.name}` : 'Operations'} / {selectedRepository?.name ?? 'Run'}</p>
            <div className="run-title-row">
              <span className="run-id-badge">run {shortRunId(selectedRun.id)}</span>
              <h1 className="run-title-preview" title={selectedRun.goal}>{selectedRun.goal}</h1>
            </div>
            <div className="inline-facts">
              <span>{selectedRepository?.name ?? 'No repository'}</span>
              <span>{selectedRun.branchName ?? 'No branch'}</span>
              <span className={`tone-chip tone-${toneForStatus(selectedRun.status)}`}>{formatLabel(selectedRun.status)}</span>
              <span>{selectedRun.pullRequestNumber ? `PR #${selectedRun.pullRequestNumber}` : formatLabel(selectedRun.handoffStatus)}</span>
              <span>Updated {formatDate(selectedRun.updatedAt)}</span>
            </div>
            <div className="run-goal-prose">
              <p>{selectedRun.goal}</p>
            </div>
          </div>
          <nav className="context-tabs" aria-label="Run sections">
            {[
              ['Overview', `/runs/${selectedRun.id}/overview`],
              ['Board', `/runs/${selectedRun.id}/board`],
              ['Lifecycle', `/runs/${selectedRun.id}/lifecycle`],
              ['Review', `/runs/${selectedRun.id}/review`],
            ].map(([label, href]) => (
              <button key={href} type="button" className={window.location.pathname === href ? 'is-active' : ''} onClick={() => navigate(href)}>
                {label}
              </button>
            ))}
          </nav>
        </section>
      ) : null}

      <div className="workspace" style={{ gridTemplateColumns: `${sidebarWidth}px 10px minmax(0, 1fr)` }}>
        <aside className="sidebar">
          {route.kind === 'projects' && (
            <>
              <div className="sidebar-section">
                <h2>Project views</h2>
                <label className="field">
                  <span>Search</span>
                  <input value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} placeholder="Search projects" />
                </label>
                <div className="saved-views">
                  <button type="button" className={sidebarPillClassName(projectView === 'all')} onClick={() => setProjectView('all')}>All projects</button>
                  <button type="button" className={sidebarPillClassName(projectView === 'recent')} onClick={() => setProjectView('recent')}>Recently active</button>
                  <button type="button" className={sidebarPillClassName(projectView === 'needs-setup')} onClick={() => setProjectView('needs-setup')}>Needs setup</button>
                </div>
              </div>
              <div className="sidebar-section">
                <button type="button" className="action-button" onClick={() => navigate('/projects/new')}>New Project</button>
              </div>
            </>
          )}

          {route.kind === 'project' && selectedProject && route.section === 'repositories' && (
            <>
              <div className="sidebar-section">
                <h2>Repository filters</h2>
                <label className="field">
                  <span>Search</span>
                  <input value={repoQuery} onChange={(event) => setRepoQuery(event.target.value)} placeholder="Search repositories" />
                </label>
              </div>
              <div className="sidebar-section">
                <button type="button" className="action-button" onClick={() => navigate(`/projects/${selectedProject.project.id}/repositories/new`)}>New Repo</button>
              </div>
            </>
          )}

          {route.kind === 'project' && selectedProject && route.section === 'teams' && (
            <>
              <div className="sidebar-section">
                <h2>Team shortcuts</h2>
                <div className="sidebar-button-stack">
                  <button type="button" className={sidebarPillClassName(route.mode === 'new-team')} onClick={() => navigate(`/projects/${selectedProject.project.id}/teams/new`)}>New team</button>
                  <button type="button" className={sidebarPillClassName(route.mode === 'import-team')} onClick={() => navigate(`/projects/${selectedProject.project.id}/teams/import`)}>Import blueprint</button>
                </div>
              </div>
            </>
          )}

          {route.kind === 'project' && selectedProject && route.section === 'runs' && (
            <>
              <div className="sidebar-section">
                <h2>Run filters</h2>
                <label className="field">
                  <span>Search</span>
                  <input value={runQuery} onChange={(event) => setRunQuery(event.target.value)} placeholder="Search runs" />
                </label>
              </div>
              <div className="sidebar-section">
                <div className="sidebar-button-stack">
                  <button type="button" className="sidebar-primary-action" onClick={() => navigate(`/projects/${selectedProject.project.id}/runs/new`)}>New Run</button>
                </div>
              </div>
            </>
          )}

          {route.kind === 'project' && selectedProject && route.section === 'automation' && (
            <>
              <div className="sidebar-section">
                <h2>Automation shortcuts</h2>
                <div className="sidebar-button-stack">
                  <button type="button" className={sidebarPillClassName(route.mode === 'new-repeatable-run')} onClick={() => navigate(`/projects/${selectedProject.project.id}/automation/repeatable-runs/new`)}>New repeatable run</button>
                  <button type="button" className={sidebarPillClassName(route.mode === 'new-webhook')} onClick={() => navigate(`/projects/${selectedProject.project.id}/automation/webhooks/new`)}>New webhook trigger</button>
                </div>
              </div>
              <div className="sidebar-section">
                <label className="field">
                  <span>Repository</span>
                  <select value={automationRepositoryId} onChange={(event) => setAutomationRepositoryId(event.target.value)}>
                    <option value="">All linked repositories</option>
                    {selectedProjectRepositories.map((repository) => (
                      <option key={repository.id} value={repository.id}>{repository.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}

          {route.kind === 'adhoc-runs' && (
            <>
              <div className="sidebar-section">
                <h2>Run filters</h2>
                <label className="field">
                  <span>Search</span>
                  <input value={runQuery} onChange={(event) => setRunQuery(event.target.value)} placeholder="Search ad-hoc runs" />
                </label>
              </div>
              <div className="sidebar-section">
                <div className="sidebar-button-stack">
                  <button type="button" className="sidebar-primary-action" onClick={() => navigate('/adhoc-runs/new')}>New Ad-Hoc Run</button>
                </div>
              </div>
            </>
          )}

          {route.kind === 'run' && selectedRun && (
            <>
              <div className="sidebar-section">
                <h2>Run controls</h2>
                <div className="sidebar-button-stack">
                  <button
                    type="button"
                    className="sidebar-primary-action"
                    onClick={() => void handleStartRun()}
                    disabled={busy || isSelectedRunStartPending || selectedRun.status !== 'pending'}
                  >
                    {isSelectedRunStartPending ? 'Starting soon…' : 'Start Run'}
                  </button>
                  {isSelectedRunStartPending ? (
                    <span className="sidebar-action-note">Start requested. Waiting for the scheduler.</span>
                  ) : null}
                  <button type="button" className={sidebarPillClassName(route.section === 'overview')} onClick={() => navigate(`/runs/${selectedRun.id}/overview`)}>Overview</button>
                  <button type="button" className={sidebarPillClassName(route.section === 'board')} onClick={() => navigate(`/runs/${selectedRun.id}/board`)}>Board</button>
                  <button type="button" className={sidebarPillClassName(route.section === 'lifecycle')} onClick={() => navigate(`/runs/${selectedRun.id}/lifecycle`)}>Lifecycle</button>
                  <button type="button" className={sidebarPillClassName(route.section === 'review')} onClick={() => navigate(`/runs/${selectedRun.id}/review`)}>Review</button>
                </div>
              </div>
              <div className="sidebar-section">
                <h2>Quick links</h2>
                {selectedRun.pullRequestUrl ? (
                  <a className="inline-link" href={selectedRun.pullRequestUrl} target="_blank" rel="noreferrer">Open pull request</a>
                ) : null}
                {selectedRun.planArtifactPath ? (
                  <span className="muted-line">{selectedRun.planArtifactPath}</span>
                ) : (
                  <span className="muted-line">No plan artifact published yet.</span>
                )}
              </div>
            </>
          )}

          {route.kind === 'settings' && (
            <>
              <div className="sidebar-section">
                <h2>Settings scope</h2>
                <div className="saved-views">
                  <button type="button" className={sidebarPillClassName(settingsScope === 'workspace')} onClick={() => setSettingsScope('workspace')}>Workspace</button>
                  <button type="button" className={sidebarPillClassName(settingsScope === 'policy')} onClick={() => setSettingsScope('policy')}>Policy</button>
                  <button type="button" className={sidebarPillClassName(settingsScope === 'provider')} onClick={() => setSettingsScope('provider')}>Provider</button>
                </div>
              </div>
              <div className="sidebar-section">
                <button type="button" className="action-button" onClick={() => navigate('/projects/new')}>New Project</button>
              </div>
            </>
          )}
        </aside>
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          onPointerDown={handleSidebarResizeStart}
        />

        <main className="content">
          {loading ? <section className="panel"><div className="compact-empty">Loading workspace…</div></section> : null}
          {refreshError ? <section className="panel"><div className="compact-empty">{refreshError}</div></section> : null}
          {message ? <div className="toast">{message}</div> : null}

          {!loading && route.kind === 'projects' && (
            <>
              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Projects</p>
                    <h2>Configured workspaces</h2>
                  </div>
                </div>
                <div className="stats-row">
                  <article className="stat-card"><span>Projects</span><strong>{projectSummaries.length}</strong></article>
                  <article className="stat-card"><span>Repositories</span><strong>{data.repositories.length}</strong></article>
                  <article className="stat-card"><span>Active runs</span><strong>{data.runs.filter((run) => run.status === 'in_progress' || run.status === 'awaiting_approval').length}</strong></article>
                  <article className="stat-card"><span>Last activity</span><strong>{projectSummaries[0]?.lastRun ? formatDate(projectSummaries[0].lastRun.updatedAt) : 'n/a'}</strong></article>
                </div>
              </section>

              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Project inventory</p>
                    <h2>All projects</h2>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Repositories</th>
                      <th>Runs</th>
                      <th>Status</th>
                      <th>Last run</th>
                      <th>Last activity</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((summary) => (
                      <tr key={summary.project.id}>
                        <td>
                          <strong>{summary.project.name}</strong>
                          <div className="cell-subtitle">{summary.project.summary || 'No summary provided.'}</div>
                        </td>
                        <td>{summary.repositories.length}</td>
                        <td>{summary.runs.length}</td>
                        <td>{summary.activeRuns.length > 0 ? 'Active' : 'Quiet'}</td>
                        <td>{summary.lastRun?.goal ?? 'No runs yet'}</td>
                        <td>{formatDate(summary.lastRun?.updatedAt ?? summary.project.updatedAt)}</td>
                        <td><button type="button" className="table-action" onClick={() => navigate(`/projects/${summary.project.id}`)}>Open</button></td>
                      </tr>
                    ))}
                    {filteredProjects.length === 0 ? (
                      <tr><td colSpan={7}><div className="compact-empty">No projects match the current filter.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {!loading && route.kind === 'project-new' && (
            <section className="panel form-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Projects</p>
                  <h2>New project</h2>
                </div>
              </div>
              <form className="stack-form" onSubmit={(event) => void handleCreateProject(event)}>
                <label className="field">
                  <span>Name</span>
                  <input value={projectForm.name} onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Summary</span>
                  <textarea rows={3} value={projectForm.summary} onChange={(event) => setProjectForm((current) => ({ ...current, summary: event.target.value }))} />
                </label>
                <fieldset className="repo-picker">
                  <legend>Linked repositories</legend>
                  {data.repositories.map((repository) => (
                    <label key={repository.id} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={projectForm.repositoryIds.includes(repository.id)}
                        onChange={() => setProjectForm((current) => ({
                          ...current,
                          repositoryIds: current.repositoryIds.includes(repository.id)
                            ? current.repositoryIds.filter((id) => id !== repository.id)
                            : [...current.repositoryIds, repository.id],
                        }))}
                      />
                      <span>{repository.name}</span>
                    </label>
                  ))}
                </fieldset>
                <div className="action-row">
                  <button type="submit" className="action-button">Create Project</button>
                </div>
              </form>
            </section>
          )}

          {!loading && route.kind === 'project' && selectedProject && route.section === 'overview' && (
            <>
              <section className="panel">
                <div className="stats-row">
                  <article className="stat-card"><span>Teams</span><strong>{selectedProjectTeams.length}</strong></article>
                  <article className="stat-card"><span>Repositories</span><strong>{selectedProject.repositories.length}</strong></article>
                  <article className="stat-card"><span>Runs</span><strong>{selectedProject.runs.length}</strong></article>
                  <article className="stat-card"><span>Active runs</span><strong>{selectedProject.activeRuns.length}</strong></article>
                </div>
              </section>
              <section className="panel split-panel">
                <article className="surface-card">
                  <p className="eyebrow">Summary</p>
                  <h3>{selectedProject.project.name}</h3>
                  <p>{selectedProject.project.summary || 'This project groups teams, repositories, run history, and automation rules.'}</p>
                </article>
                <article className="surface-card">
                  <p className="eyebrow">Team ownership</p>
                  <h3>{selectedProjectTeams[0]?.name ?? 'No teams yet'}</h3>
                  <p>{selectedProjectTeams.length > 0 ? `${selectedProjectTeams.length} project team${selectedProjectTeams.length === 1 ? '' : 's'} are available for runs and automation.` : 'Create or import a project team before planning project runs.'}</p>
                </article>
              </section>
            </>
          )}

          {!loading && route.kind === 'project' && selectedProject && route.section === 'teams' && (
            <>
              {(route.mode === 'new-team' || editingProjectTeamId) ? (
                <section className="panel form-panel">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Project teams</p>
                      <h2>{editingProjectTeamId ? 'Edit team' : 'New team'}</h2>
                    </div>
                  </div>
                  <form className="stack-form" onSubmit={(event) => void handleSubmitProjectTeam(event)}>
                    <label className="field">
                      <span>Name</span>
                      <input value={projectTeamForm.name} onChange={(event) => setProjectTeamForm((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label className="field">
                      <span>Description</span>
                      <textarea rows={3} value={projectTeamForm.description} onChange={(event) => setProjectTeamForm((current) => ({ ...current, description: event.target.value }))} />
                    </label>
                    <label className="field">
                      <span>Concurrency cap</span>
                      <input type="number" min={1} value={projectTeamForm.concurrencyCap} onChange={(event) => setProjectTeamForm((current) => ({ ...current, concurrencyCap: event.target.value }))} />
                    </label>
                    <fieldset className="repo-picker">
                      <legend>Members</legend>
                      {projectTeamForm.members.map((member, index) => (
                        <div key={`${member.role}-${index}`} className="stack-form">
                          <div className="two-column">
                            <label className="field">
                              <span>Name</span>
                              <input value={member.name} onChange={(event) => patchProjectTeamMember(index, { name: event.target.value })} />
                            </label>
                            <label className="field">
                              <span>Role</span>
                              <input value={member.role} onChange={(event) => patchProjectTeamMember(index, { role: event.target.value })} />
                            </label>
                          </div>
                          <div className="two-column">
                            <label className="field">
                              <span>Profile</span>
                              <input value={member.profile} onChange={(event) => patchProjectTeamMember(index, { profile: event.target.value })} />
                            </label>
                            <label className="field">
                              <span>Responsibility</span>
                              <input value={member.responsibility} onChange={(event) => patchProjectTeamMember(index, { responsibility: event.target.value })} />
                            </label>
                          </div>
                          <div className="action-row">
                            <button
                              type="button"
                              className="table-action table-action-danger"
                              onClick={() => setProjectTeamForm((current) => ({
                                ...current,
                                members: current.members.filter((_, memberIndex) => memberIndex !== index),
                              }))}
                              disabled={projectTeamForm.members.length <= 1}
                            >
                              Remove member
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="action-row">
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => setProjectTeamForm((current) => ({
                            ...current,
                            members: [...current.members, { name: '', role: 'implementer', profile: 'implementer', responsibility: '' }],
                          }))}
                        >
                          Add member
                        </button>
                      </div>
                    </fieldset>
                    <div className="action-row">
                      <button type="submit" className="action-button" disabled={busy}>{editingProjectTeamId ? 'Save team' : 'Create team'}</button>
                      {editingProjectTeamId ? <button type="button" className="table-action" onClick={resetProjectTeamForm}>Cancel</button> : null}
                    </div>
                  </form>
                </section>
              ) : null}

              {route.mode === 'import-team' ? (
                <section className="panel form-panel">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Project teams</p>
                      <h2>Import team blueprint</h2>
                    </div>
                  </div>
                  <form className="stack-form" onSubmit={(event) => void handleImportProjectTeam(event)}>
                    <label className="field">
                      <span>Blueprint</span>
                      <select value={projectTeamImportForm.blueprintId} onChange={(event) => setProjectTeamImportForm((current) => ({ ...current, blueprintId: event.target.value }))}>
                        <option value="">Select blueprint</option>
                        {teamBlueprints.map((blueprint) => (
                          <option key={blueprint.id} value={blueprint.id}>{blueprint.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Name override</span>
                      <input value={projectTeamImportForm.name} onChange={(event) => setProjectTeamImportForm((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label className="field">
                      <span>Description override</span>
                      <textarea rows={3} value={projectTeamImportForm.description} onChange={(event) => setProjectTeamImportForm((current) => ({ ...current, description: event.target.value }))} />
                    </label>
                    <div className="action-row">
                      <button type="submit" className="action-button" disabled={busy || !projectTeamImportForm.blueprintId}>Import team</button>
                    </div>
                  </form>
                </section>
              ) : null}

              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Team inventory</p>
                    <h2>Project teams</h2>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Members</th>
                      <th>Concurrency</th>
                      <th>Blueprint source</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProjectTeams.map((projectTeam) => (
                      <tr key={projectTeam.id}>
                        <td>
                          <strong>{projectTeam.name}</strong>
                          <div className="cell-subtitle">{projectTeam.description ?? 'No description provided.'}</div>
                        </td>
                        <td>{projectTeam.members.map((member) => member.name).join(', ') || 'No members'}</td>
                        <td>{projectTeam.concurrencyCap}</td>
                        <td>{projectTeam.sourceBlueprintId ?? projectTeam.sourceTemplateId ?? 'Manual'}</td>
                        <td>
                          <div className="action-row">
                            <button
                              type="button"
                              className="table-action"
                              onClick={() => {
                                setEditingProjectTeamId(projectTeam.id)
                                setProjectTeamForm({
                                  name: projectTeam.name,
                                  description: projectTeam.description ?? '',
                                  concurrencyCap: String(projectTeam.concurrencyCap),
                                  members: projectTeam.members.map((member) => ({
                                    name: member.name,
                                    role: member.role,
                                    profile: member.profile,
                                    responsibility: member.responsibility ?? '',
                                  })),
                                })
                                navigate(`/projects/${selectedProject.project.id}/teams/new`)
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" className="table-action table-action-danger" onClick={() => void handleDeleteProjectTeam(projectTeam.id)} disabled={busy}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {selectedProjectTeams.length === 0 ? (
                      <tr><td colSpan={5}><div className="compact-empty">No project teams configured yet.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {!loading && route.kind === 'project' && selectedProject && route.section === 'repositories' && (
            <>
              {route.mode === 'new-repository' ? (
                <section className="panel form-panel">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Project repositories</p>
                      <h2>New repository</h2>
                    </div>
                  </div>
                  <form className="stack-form" onSubmit={(event) => void handleCreateRepository(event)}>
                    <label className="field"><span>Name</span><input value={repoForm.name} onChange={(event) => setRepoForm((current) => ({ ...current, name: event.target.value }))} /></label>
                    <label className="field"><span>URL</span><input value={repoForm.url} onChange={(event) => setRepoForm((current) => ({ ...current, url: event.target.value }))} /></label>
                    <div className="two-column">
                      <label className="field">
                        <span>Provider</span>
                        <select value={repoForm.provider} onChange={(event) => setRepoForm((current) => ({ ...current, provider: event.target.value as RepositoryProvider }))}>
                          <option value="github">GitHub</option>
                          <option value="gitlab">GitLab</option>
                          <option value="local">Local</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label className="field"><span>Local path</span><input value={repoForm.localPath} onChange={(event) => setRepoForm((current) => ({ ...current, localPath: event.target.value }))} /></label>
                    </div>
                    <div className="action-row"><button type="submit" className="action-button" disabled={busy}>Create Repository</button></div>
                  </form>
                </section>
              ) : null}

              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Repositories</p>
                    <h2>Project repositories</h2>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Provider</th>
                      <th>Default branch</th>
                      <th>Trust</th>
                      <th>Path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjectRepos.map((repository) => (
                      <tr key={repository.id}>
                        <td><strong>{repository.name}</strong><div className="cell-subtitle">{repository.url}</div></td>
                        <td>{repository.provider}</td>
                        <td>{repository.defaultBranch}</td>
                        <td>{repository.trustLevel}</td>
                        <td>{repository.localPath ?? 'n/a'}</td>
                      </tr>
                    ))}
                    {filteredProjectRepos.length === 0 ? (
                      <tr><td colSpan={5}><div className="compact-empty">No repositories linked to this project.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {!loading && route.kind === 'project' && selectedProject && route.section === 'runs' && (
            <>
              {route.mode === 'new-run' ? (
                newRunRepositories.length === 0 ? (
                  <section className="panel form-panel">
                    <div className="section-header">
                      <div>
                        <p className="eyebrow">Project Runs</p>
                        <h2>New project run</h2>
                      </div>
                    </div>
                    <div className="compact-empty">
                      Link a repository to this project before planning a run.
                      {' '}
                      <button type="button" className="table-action" onClick={() => navigate(`/projects/${selectedProject.project.id}/repositories/new`)}>
                        Add repository
                      </button>
                    </div>
                  </section>
                ) : selectedProjectTeams.length === 0 ? (
                  <section className="panel form-panel">
                    <div className="section-header">
                      <div>
                        <p className="eyebrow">Project Runs</p>
                        <h2>New project run</h2>
                      </div>
                    </div>
                    <div className="compact-empty">
                      Create or import a project team before planning a project run.
                      {' '}
                      <button type="button" className="table-action" onClick={() => navigate(`/projects/${selectedProject.project.id}/teams/import`)}>
                        Import team
                      </button>
                    </div>
                  </section>
                ) : (
                  <section className="panel form-panel">
                    <div className="section-header">
                      <div>
                        <p className="eyebrow">Project Runs</p>
                        <h2>New project run</h2>
                      </div>
                    </div>
                    <form className="stack-form" onSubmit={(event) => void handleCreateRun(event)}>
                      {shouldShowRunRepositoryPicker ? (
                        <label className="field">
                          <span>Repository</span>
                          <select value={runForm.repositoryId} onChange={(event) => setRunForm((current) => ({ ...current, repositoryId: event.target.value }))}>
                            <option value="">Select repository</option>
                            {newRunRepositories.map((repository) => (
                              <option key={repository.id} value={repository.id}>{repository.name}</option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div className="field">
                          <span>Repository</span>
                          <strong>{newRunRepositories[0]?.name ?? 'n/a'}</strong>
                        </div>
                      )}
                      <label className="field">
                        <span>Goal</span>
                        <textarea rows={4} value={runForm.goal} onChange={(event) => setRunForm((current) => ({ ...current, goal: event.target.value }))} />
                      </label>
                      <div className="two-column">
                        <label className="field"><span>Branch</span><input value={runForm.branchName} onChange={(event) => setRunForm((current) => ({ ...current, branchName: event.target.value }))} /></label>
                        <label className="field"><span>Concurrency</span><input type="number" min={1} value={runForm.concurrencyCap} onChange={(event) => setRunForm((current) => ({ ...current, concurrencyCap: event.target.value }))} /></label>
                      </div>
                      <label className="field">
                        <span>Project team</span>
                        <select value={runForm.projectTeamId} onChange={(event) => setRunForm((current) => ({ ...current, projectTeamId: event.target.value }))}>
                          <option value="">Select team</option>
                          {selectedProjectTeams.map((projectTeam) => (
                            <option key={projectTeam.id} value={projectTeam.id}>{projectTeam.name}</option>
                          ))}
                        </select>
                      </label>
                      <div className="action-row"><button type="submit" className="action-button" disabled={busy}>Create Run</button></div>
                    </form>
                  </section>
                )
              ) : null}

              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Runs</p>
                    <h2>Project run list</h2>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Goal</th>
                      <th>Repository</th>
                      <th>Status</th>
                      <th>Stage</th>
                      <th>Last activity</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjectRuns.map((run) => {
                      const repository = data.repositories.find((item) => item.id === run.repositoryId)
                      return (
                        <tr key={run.id}>
                          <td><strong>{run.goal}</strong></td>
                          <td>{repository?.name ?? 'Unknown'}</td>
                          <td><span className={`tone-chip tone-${toneForStatus(run.status)}`}>{formatLabel(run.status)}</span></td>
                          <td>{formatLabel(run.handoffStatus)}</td>
                          <td>{formatDate(run.updatedAt)}</td>
                          <td className="table-actions">
                            <button type="button" className="table-action" onClick={() => navigate(`/runs/${run.id}/overview`)}>Overview</button>
                            <button type="button" className="table-action" onClick={() => navigate(`/runs/${run.id}/board`)}>Board</button>
                            <button type="button" className="table-action" onClick={() => navigate(`/runs/${run.id}/review`)}>Review</button>
                          </td>
                        </tr>
                      )
                    })}
                    {filteredProjectRuns.length === 0 ? (
                      <tr><td colSpan={6}><div className="compact-empty">No runs linked to this project yet.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {!loading && route.kind === 'project' && selectedProject && route.section === 'automation' && (
            <section className="panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Automation</p>
                  <h2>Repeatable runs and webhooks</h2>
                </div>
              </div>
              <RepeatableRunsPanel
                repositories={selectedProjectRepositories.map((repository) => ({ id: repository.id, name: repository.name, provider: repository.provider }))}
                projectTeams={selectedProjectTeams}
                selectedRepositoryId={automationRepositoryId}
                onSelectedRepositoryIdChange={setAutomationRepositoryId}
                definitions={data.repeatableRunDefinitions.filter((definition) => selectedProject.project.repositoryIds.includes(definition.repositoryId))}
                triggers={data.repeatableRunTriggers}
                receipts={data.externalEventReceipts}
                actionPending={busy}
                errorText=""
                onCreateDefinition={handleCreateDefinition}
                onUpdateDefinition={handleUpdateDefinition}
                onDeleteDefinition={handleDeleteDefinition}
                onCreateTrigger={handleCreateTrigger}
                onUpdateTrigger={handleUpdateTrigger}
                onDeleteTrigger={handleDeleteTrigger}
              />
            </section>
          )}

          {!loading && route.kind === 'project' && selectedProject && route.section === 'settings' && (
            <section className="panel split-panel">
              <article className="surface-card">
                <p className="eyebrow">Policy defaults</p>
                <h3>Project-level settings</h3>
                <p>Use this area for project-owned branch defaults, provider mapping, and policy profile decisions.</p>
                <ul className="plain-list">
                  <li>Repositories linked: {selectedProject.repositories.length}</li>
                  <li>Latest run: {selectedProject.lastRun?.goal ?? 'n/a'}</li>
                  <li>Suggested default branch: {selectedProjectRepositories[0]?.defaultBranch ?? 'main'}</li>
                </ul>
              </article>
              <article className="surface-card">
                <p className="eyebrow">Ownership</p>
                <h3>Boundary</h3>
                <p>Global governance is handled in Settings. This page is reserved for project-scoped configuration only.</p>
              </article>
            </section>
          )}

          {!loading && route.kind === 'adhoc-runs' && (
            <>
              {route.mode === 'new' ? (
                newRunRepositories.length === 0 ? (
                  <section className="panel form-panel">
                    <div className="section-header">
                      <div>
                        <p className="eyebrow">Ad-Hoc Runs</p>
                        <h2>New ad-hoc run</h2>
                      </div>
                    </div>
                    <div className="compact-empty">No unassigned repositories are available for ad-hoc runs.</div>
                  </section>
                ) : (
                  <section className="panel form-panel">
                    <div className="section-header">
                      <div>
                        <p className="eyebrow">Ad-Hoc Runs</p>
                        <h2>New ad-hoc run</h2>
                      </div>
                    </div>
                    <form className="stack-form" onSubmit={(event) => void handleCreateRun(event)}>
                      {shouldShowRunRepositoryPicker ? (
                        <label className="field">
                          <span>Repository</span>
                          <select value={runForm.repositoryId} onChange={(event) => setRunForm((current) => ({ ...current, repositoryId: event.target.value }))}>
                            <option value="">Select repository</option>
                            {newRunRepositories.map((repository) => (
                              <option key={repository.id} value={repository.id}>{repository.name}</option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div className="field">
                          <span>Repository</span>
                          <strong>{newRunRepositories[0]?.name ?? 'n/a'}</strong>
                        </div>
                      )}
                      <label className="field">
                        <span>Goal</span>
                        <textarea rows={4} value={runForm.goal} onChange={(event) => setRunForm((current) => ({ ...current, goal: event.target.value }))} />
                      </label>
                      <div className="two-column">
                        <label className="field"><span>Branch</span><input value={runForm.branchName} onChange={(event) => setRunForm((current) => ({ ...current, branchName: event.target.value }))} /></label>
                        <label className="field"><span>Concurrency</span><input type="number" min={1} value={runForm.concurrencyCap} onChange={(event) => setRunForm((current) => ({ ...current, concurrencyCap: event.target.value }))} /></label>
                      </div>
                      <div className="action-row"><button type="submit" className="action-button" disabled={busy}>Create Run</button></div>
                    </form>
                  </section>
                )
              ) : null}

              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Ad-Hoc Runs</p>
                    <h2>Runs without project ownership</h2>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Goal</th>
                      <th>Repository</th>
                      <th>Status</th>
                      <th>Stage</th>
                      <th>Last activity</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdHocRunsFull.map((run) => {
                      const repository = data.repositories.find((item) => item.id === run.repositoryId)
                      return (
                        <tr key={run.id}>
                          <td><strong>{run.goal}</strong></td>
                          <td>{repository?.name ?? 'Unknown'}</td>
                          <td><span className={`tone-chip tone-${toneForStatus(run.status)}`}>{formatLabel(run.status)}</span></td>
                          <td>{formatLabel(run.handoffStatus)}</td>
                          <td>{formatDate(run.updatedAt)}</td>
                          <td className="table-actions">
                            <button type="button" className="table-action" onClick={() => navigate(`/runs/${run.id}/overview`)}>Overview</button>
                            <button type="button" className="table-action" onClick={() => navigate(`/runs/${run.id}/board`)}>Board</button>
                          </td>
                        </tr>
                      )
                    })}
                    {filteredAdHocRunsFull.length === 0 ? (
                      <tr><td colSpan={6}><div className="compact-empty">No ad-hoc runs match the current filter.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {!loading && route.kind === 'settings' && (
            <>
              <section className="panel">
                <div className="stats-row">
                  <article className="stat-card"><span>Workspace</span><strong>{data.identity?.workspace.name ?? 'Unavailable'}</strong></article>
                  <article className="stat-card"><span>Team</span><strong>{data.identity?.team.name ?? 'Unavailable'}</strong></article>
                  <article className="stat-card"><span>Pending approvals</span><strong>{data.governance?.approvals.pending ?? 0}</strong></article>
                  <article className="stat-card"><span>Repositories</span><strong>{data.repositories.length}</strong></article>
                </div>
              </section>
              <section className="panel split-panel">
                <article className="surface-card">
                  <p className="eyebrow">Identity</p>
                  <h3>{data.identity?.subject ?? 'No identity returned'}</h3>
                  <ul className="plain-list">
                    <li>Principal: {data.identity?.principal ?? 'n/a'}</li>
                    <li>Roles: {data.identity?.roles.join(', ') || 'n/a'}</li>
                    <li>Actor type: {data.identity?.actorType ?? 'n/a'}</li>
                  </ul>
                </article>
                <article className="surface-card">
                  <p className="eyebrow">Governance</p>
                  <h3>Workspace policy surfaces</h3>
                  <ul className="plain-list">
                    <li>Approval totals: {data.governance?.approvals.total ?? 0}</li>
                    <li>Secret source: {data.governance?.secrets.sourceMode ?? 'n/a'}</li>
                    <li>Allowed trust levels: {data.governance?.secrets.allowedRepositoryTrustLevels.join(', ') || 'n/a'}</li>
                  </ul>
                </article>
              </section>
              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Repository profiles</p>
                    <h2>Policy inventory</h2>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Profile</th>
                      <th>Repositories</th>
                      <th>Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.governance?.policies.repositoryProfiles.map((profile) => (
                      <tr key={profile.profile}>
                        <td>{profile.profile}</td>
                        <td>{profile.repositoryCount}</td>
                        <td>{profile.runCount}</td>
                      </tr>
                    )) ?? (
                      <tr><td colSpan={3}><div className="compact-empty">No governance policy data available.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {!loading && route.kind === 'run' && !selectedRun && (
            <section className="panel"><div className="compact-empty">Run not found.</div></section>
          )}

          {!loading && route.kind === 'run' && selectedRun && route.section === 'overview' && (
            <>
              <section className="panel">
                <div className="stats-row">
                  <article className="stat-card"><span>Status</span><strong>{formatLabel(selectedRun.status)}</strong></article>
                  <article className="stat-card"><span>PR / handoff</span><strong>{selectedRun.pullRequestNumber ? `#${selectedRun.pullRequestNumber}` : formatLabel(selectedRun.handoffStatus)}</strong></article>
                  <article className="stat-card"><span>Tasks</span><strong>{runTasks.length}</strong></article>
                  <article className="stat-card"><span>Updated</span><strong>{formatDate(selectedRun.updatedAt)}</strong></article>
                </div>
              </section>
              <section className="panel split-panel">
                <article className="surface-card">
                  <p className="eyebrow">Run details</p>
                  <h3>{selectedRepository?.name ?? 'Repository unavailable'}</h3>
                  <ul className="plain-list">
                    <li>Run: {shortRunId(selectedRun.id)}</li>
                    <li>Branch: {selectedRun.branchName ?? 'Unassigned'}</li>
                    <li>Published branch: {selectedRun.publishedBranch ?? 'Not published'}</li>
                    <li>Plan artifact: {selectedRun.planArtifactPath ?? 'Not published'}</li>
                    <li>Run kind: {runKindLabel(selectedRunProject?.project.id ?? null)}</li>
                  </ul>
                </article>
                <article className="surface-card">
                  <p className="eyebrow">Artifacts</p>
                  <h3>Published outputs</h3>
                  <div className="compact-list">
                    {runArtifacts.slice(0, 6).map((artifact) => (
                      <div key={artifact.id} className="compact-list-row">
                        <span>{artifact.kind}</span>
                        <strong>{artifact.path}</strong>
                      </div>
                    ))}
                    {runArtifacts.length === 0 ? <div className="compact-empty">No artifacts published yet.</div> : null}
                  </div>
                </article>
              </section>
            </>
          )}

          {!loading && route.kind === 'run' && selectedRun && route.section === 'board' && (
            <>
              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Task board</p>
                    <h2>Primary work surface</h2>
                  </div>
                </div>
                <form className="toolbar-form" onSubmit={(event) => void handleCreateTask(event)}>
                  <input placeholder="Add backlog item" value={boardDraft.title} onChange={(event) => setBoardDraft((current) => ({ ...current, title: event.target.value }))} />
                  <input placeholder="Description" value={boardDraft.description} onChange={(event) => setBoardDraft((current) => ({ ...current, description: event.target.value }))} />
                  <input placeholder="Role" value={boardDraft.role} onChange={(event) => setBoardDraft((current) => ({ ...current, role: event.target.value }))} />
                  <button type="submit" className="action-button" disabled={busy}>Add</button>
                </form>
                <div className="board-grid">
                  <BoardColumn title="In flight" tasks={inFlightTasks} selectedTaskId={selectedTaskId} onSelectTask={handleTaskSelection} presentations={runTaskPresentations} />
                  <BoardColumn title="Blocked" tasks={blockedTasks} selectedTaskId={selectedTaskId} onSelectTask={handleTaskSelection} presentations={runTaskPresentations} />
                  <BoardColumn title="Waiting" tasks={waitingTasks} selectedTaskId={selectedTaskId} onSelectTask={handleTaskSelection} presentations={runTaskPresentations} />
                </div>
                <details className="secondary-panel" open={showCompletedTasks} onToggle={(event) => setShowCompletedTasks((event.currentTarget as HTMLDetailsElement).open)}>
                  <summary>Completed ({completedTasks.length})</summary>
                  <BoardTaskList tasks={completedTasks} selectedTaskId={selectedTaskId} onSelectTask={handleTaskSelection} presentations={runTaskPresentations} />
                </details>
              </section>
              <TaskDagGraphPanel
                tasks={runTasks}
                taskDag={selectedRunTaskDag}
                selectedTaskId={selectedTaskId}
                onSelectTask={handleDagTaskSelection}
                toneByTaskId={dagToneByTaskId}
              />
              <section className="panel split-panel">
                <TaskDetailPanel
                  task={selectedTask}
                  presentations={runTaskPresentations}
                  validations={runValidations}
                  artifacts={runArtifacts}
                  events={runEvents}
                />
                <article className="surface-card">
                  <p className="eyebrow">Board signals</p>
                  <h3>Queue health</h3>
                  <div className="compact-list">
                    {[
                      ['In execution', inFlightTasks.length],
                      ['Awaiting verification', waitingTasks.length],
                      ['Failed / rework', blockedTasks.length],
                      ['Verified', completedTasks.length],
                    ].map(([label, count]) => (
                      <div key={label} className="compact-list-row">
                        <span>{label}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                    {runApprovals.slice(0, 2).map((approval) => (
                      <div key={approval.id} className="compact-list-row">
                        <span>{approval.kind}</span>
                        <strong>{approval.status === 'pending' ? String(approval.requestedPayload?.summary ?? 'Awaiting decision') : String(approval.resolutionPayload?.feedback ?? 'Resolved')}</strong>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="surface-card">
                  <p className="eyebrow">Diagnostics</p>
                  <h3>Secondary panels</h3>
                  <details className="secondary-panel">
                    <summary>Fleet and sessions</summary>
                    <div className="compact-list">
                      {runSessions.map((session) => {
                        const node = data.workerNodes.find((item) => item.id === session.workerNodeId)
                        return <div key={session.id} className="compact-list-row"><span>{session.status}</span><strong>{node?.name ?? 'Unplaced'} · {formatDate(session.updatedAt)}</strong></div>
                      })}
                    </div>
                  </details>
                  <details className="secondary-panel">
                    <summary>Validation history</summary>
                    <div className="compact-list">
                      {runValidations.map((validation) => (
                        <div key={validation.id} className="compact-list-row">
                          <span>{validation.status}</span>
                          <strong>{validation.name}</strong>
                        </div>
                      ))}
                      {runValidations.length === 0 ? <div className="compact-empty">No validation evidence published yet.</div> : null}
                    </div>
                  </details>
                </article>
              </section>
            </>
          )}

          {!loading && route.kind === 'run' && selectedRun && route.section === 'lifecycle' && (
            <>
              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Lifecycle</p>
                    <h2>Task verification history</h2>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Owner</th>
                      <th>Verifier</th>
                      <th>Task status</th>
                      <th>Verification</th>
                      <th>Change requests</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runTasks.slice().sort(compareTasks).map((task) => {
                      const presentation = runTaskPresentations.get(task.id)
                      if (!presentation) {
                        return null
                      }

                      return (
                        <tr key={task.id} className={task.id === selectedTask?.id ? 'task-row is-selected' : 'task-row'} onClick={() => handleTaskSelection(task.id)}>
                          <td>
                            <strong>{task.title}</strong>
                            <div className="cell-subtitle">{task.role}</div>
                          </td>
                          <td>{presentation.ownerLabel}</td>
                          <td>{presentation.verifierLabel}</td>
                          <td><span className={`tone-chip tone-${presentation.primaryStatusTone}`}>{formatLabel(task.status)}</span></td>
                          <td><span className={`tone-chip tone-${presentation.verificationTone}`}>{presentation.verificationLabel}</span></td>
                          <td>{task.latestVerificationChangeRequests.length}</td>
                          <td>{formatDate(task.updatedAt)}</td>
                        </tr>
                      )
                    })}
                    {runTasks.length === 0 ? <tr><td colSpan={7}><div className="compact-empty">No tasks recorded for this run yet.</div></td></tr> : null}
                  </tbody>
                </table>
              </section>
              <section className="panel split-panel">
                <TaskDetailPanel
                  task={selectedTask}
                  presentations={runTaskPresentations}
                  validations={runValidations}
                  artifacts={runArtifacts}
                  events={runEvents}
                />
                <article className="surface-card">
                  <p className="eyebrow">Recent events</p>
                  <div className="compact-list">
                    {runEvents.slice(0, 8).map((event) => (
                      <div key={event.id} className="compact-list-row">
                        <span>{formatLabel(event.eventType)}</span>
                        <strong>{event.summary}</strong>
                      </div>
                    ))}
                    {runEvents.length === 0 ? <div className="compact-empty">No event stream available.</div> : null}
                  </div>
                </article>
                <article className="surface-card">
                  <p className="eyebrow">Transcript</p>
                  <label className="field">
                    <span>Session</span>
                    <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)}>
                      <option value="">Select session</option>
                      {runSessions.map((session) => (
                        <option key={session.id} value={session.id}>{session.id.slice(0, 8)}</option>
                      ))}
                    </select>
                  </label>
                  <div className="compact-list">
                    {transcript.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="compact-list-row">
                        <span>{entry.kind}</span>
                        <strong>{entry.text}</strong>
                      </div>
                    ))}
                    {selectedSessionId && transcript.length === 0 ? <div className="compact-empty">No transcript entries available.</div> : null}
                  </div>
                </article>
              </section>
            </>
          )}

          {!loading && route.kind === 'run' && selectedRun && route.section === 'review' && (
            <>
              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Review</p>
                    <h2>Verification queue and approvals</h2>
                  </div>
                </div>
                <div className="filter-row">
                  {([
                    ['awaiting', 'Awaiting verification'],
                    ['running', 'Verification running'],
                    ['failed', 'Failed / rework'],
                    ['verified', 'Verified'],
                    ['all', 'All tasks'],
                  ] as const).map(([value, label]) => (
                    <button key={value} type="button" className={sidebarPillClassName(reviewFilter === value)} onClick={() => setReviewFilter(value)}>
                      {label}
                    </button>
                  ))}
                </div>
                {filteredVerificationTasks.length === 0 ? (
                  <div className="compact-empty">No tasks currently match this verification filter.</div>
                ) : (
                  <div className="review-layout">
                    <div className="review-list">
                      {filteredVerificationTasks.map((task) => {
                        const presentation = runTaskPresentations.get(task.id)
                        if (!presentation) {
                          return null
                        }

                        return (
                          <button key={task.id} type="button" className={`review-item ${task.id === selectedVerificationTask?.id ? 'is-selected' : ''}`} onClick={() => handleTaskSelection(task.id)}>
                            <strong>{task.title}</strong>
                            <span className={`tone-chip tone-${presentation.verificationTone}`}>{presentation.verificationLabel}</span>
                            <p>{presentation.latestSummary}</p>
                            <div className="review-item-meta">
                              <span>{presentation.verifierLabel}</span>
                              <span>{task.latestVerificationChangeRequests.length} change requests</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    <div className="review-detail">
                      <TaskDetailPanel
                        task={selectedVerificationTask}
                        presentations={runTaskPresentations}
                        validations={runValidations}
                        artifacts={runArtifacts}
                        events={runEvents}
                      />
                    </div>
                  </div>
                )}
              </section>
              <section className="panel split-panel">
                <article className="surface-card">
                  <p className="eyebrow">Approvals</p>
                  <h3>Pending decisions</h3>
                  {runApprovals.length === 0 ? (
                    <div className="compact-empty">No approvals returned for this run.</div>
                  ) : (
                    <div className="review-layout">
                      <div className="review-list">
                        {runApprovals.map((approval) => (
                          <button key={approval.id} type="button" className={`review-item ${approval.id === selectedApprovalId ? 'is-selected' : ''}`} onClick={() => setSelectedApprovalId(approval.id)}>
                            <strong>{approval.kind}</strong>
                            <span className={`tone-chip tone-${toneForStatus(approval.status)}`}>{formatLabel(approval.status)}</span>
                            <p>{approval.status === 'pending' ? String(approval.requestedPayload?.summary ?? 'Awaiting decision') : String(approval.resolutionPayload?.feedback ?? 'Resolved')}</p>
                          </button>
                        ))}
                      </div>
                      <div className="review-detail">
                        <div className="surface-card">
                          <p className="eyebrow">Decision</p>
                          <h3>{approvalDetail?.kind ?? 'Approval detail'}</h3>
                          <p>{String(approvalDetail?.requestedPayload?.summary ?? 'No structured request summary attached.')}</p>
                          <label className="field">
                            <span>Notes</span>
                            <textarea rows={6} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} />
                          </label>
                          <div className="action-row">
                            <button type="button" className="action-button" onClick={() => void handleApproval('approved')} disabled={busy}>Approve</button>
                            <button type="button" className="action-button secondary" onClick={() => void handleApproval('rejected')} disabled={busy}>Reject</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              </section>
              <section className="panel split-panel">
                <article className="surface-card">
                  <p className="eyebrow">Checks</p>
                  <div className="compact-list">
                    {runValidations.map((validation) => (
                      <div key={validation.id} className="compact-list-row">
                        <span>{validation.status}</span>
                        <strong>{validation.name}</strong>
                      </div>
                    ))}
                    {runValidations.length === 0 ? <div className="compact-empty">No checks published yet.</div> : null}
                  </div>
                </article>
                <article className="surface-card">
                  <p className="eyebrow">Artifacts</p>
                  {runArtifacts.length === 0 ? (
                    <div className="compact-empty">No artifacts published yet.</div>
                  ) : (
                    <>
                      <label className="field">
                        <span>Artifact</span>
                        <select value={selectedArtifactId} onChange={(event) => setSelectedArtifactId(event.target.value)}>
                          {runArtifacts.map((artifact) => (
                            <option key={artifact.id} value={artifact.id}>{artifact.path}</option>
                          ))}
                        </select>
                      </label>
                      <div className="compact-list">
                        {artifactDetail?.diffSummary?.fileSummaries.slice(0, 6).map((fileSummary) => (
                          <div key={`${fileSummary.path}-${fileSummary.changeType}`} className="compact-list-row">
                            <span>{formatLabel(fileSummary.changeType)}</span>
                            <strong>{fileSummary.path}</strong>
                          </div>
                        ))}
                        {!artifactDetail?.diffSummary?.fileSummaries.length ? (
                          <div className="compact-empty">No per-file diff summary available for this artifact.</div>
                        ) : null}
                      </div>
                    </>
                  )}
                </article>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function BoardColumn({
  title,
  tasks,
  selectedTaskId,
  onSelectTask,
  presentations,
}: {
  title: string
  tasks: Task[]
  selectedTaskId: string
  onSelectTask: (taskId: string) => void
  presentations: Map<string, TaskPresentation>
}) {
  return (
    <section className="board-column">
      <header className="board-column-header">
        <h3>{title}</h3>
        <span>{tasks.length}</span>
      </header>
      <BoardTaskList tasks={tasks} selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} presentations={presentations} />
    </section>
  )
}

function BoardTaskList({
  tasks,
  selectedTaskId,
  onSelectTask,
  presentations,
}: {
  tasks: Task[]
  selectedTaskId: string
  onSelectTask: (taskId: string) => void
  presentations: Map<string, TaskPresentation>
}) {
  if (tasks.length === 0) {
    return <div className="compact-empty">No tasks in this lane.</div>
  }

  return (
    <div className="task-list">
      {tasks
        .slice()
        .sort(compareTasks)
        .map((task) => {
          const presentation = presentations.get(task.id)
          if (!presentation) {
            return null
          }

          return (
            <button key={task.id} type="button" className={`task-card ${task.id === selectedTaskId ? 'is-selected' : ''}`} onClick={() => onSelectTask(task.id)}>
            <div className="task-card-topline">
              <span className={`tone-chip tone-${presentation.primaryStatusTone}`}>{formatLabel(task.status)}</span>
              <span className={`tone-chip tone-${presentation.verificationTone}`}>{presentation.verificationLabel}</span>
              <span>P{task.priority}</span>
            </div>
            <strong>{task.title}</strong>
            <p>{task.description}</p>
            <div className="task-card-checklist">
              {presentation.hasDefinitionOfDone ? (
                <>
                  {task.definitionOfDone.slice(0, 2).map((criterion) => (
                    <span key={criterion}>{criterion}</span>
                  ))}
                  {task.definitionOfDone.length > 2 ? <span>+{task.definitionOfDone.length - 2} more DoD items</span> : null}
                </>
              ) : (
                <span>No stored definition of done</span>
              )}
            </div>
            <div className="task-card-summary">{presentation.latestSummary}</div>
            <div className="inline-facts">
              <span>{task.role}</span>
              <span>Owner: {presentation.ownerLabel}</span>
              <span>Verifier: {presentation.verifierLabel}</span>
              <span>{task.dependencyIds.length} deps</span>
              {task.latestVerificationChangeRequests.length > 0 ? <span>{task.latestVerificationChangeRequests.length} change requests</span> : null}
            </div>
          </button>
          )
        })}
    </div>
  )
}

function TaskDetailPanel({
  task,
  presentations,
  validations,
  artifacts,
  events,
}: {
  task: Task | null
  presentations: Map<string, TaskPresentation>
  validations: Validation[]
  artifacts: Artifact[]
  events: ControlPlaneEvent[]
}) {
  if (!task) {
    return (
      <article id="task-detail-panel" className="surface-card task-detail-card">
        <p className="eyebrow">Task detail</p>
        <div className="compact-empty">Select a task to inspect its definition of done and verification state.</div>
      </article>
    )
  }

  const presentation = presentations.get(task.id)
  if (!presentation) {
    return null
  }

  const relatedArtifacts = artifacts.filter((artifact) => artifact.runId === task.runId).slice(0, 5)
  const relatedEvents = events.filter((event) =>
    event.eventType.startsWith('task.')
    || event.summary.toLowerCase().includes(task.title.toLowerCase()),
  ).slice(0, 5)
  const openChangeRequests = task.latestVerificationChangeRequests
  const findings = task.latestVerificationFindings

  return (
    <article id="task-detail-panel" className="surface-card task-detail-card">
      <p className="eyebrow">Task detail</p>
      <div className="task-detail-header">
        <div>
          <h3>{task.title}</h3>
          <p className="task-detail-copy">{task.description}</p>
        </div>
        <div className="task-detail-chips">
          <span className={`tone-chip tone-${presentation.primaryStatusTone}`}>{formatLabel(task.status)}</span>
          <span className={`tone-chip tone-${presentation.verificationTone}`}>{presentation.verificationLabel}</span>
        </div>
      </div>
      <div className="inline-facts">
        <span>{task.role}</span>
        <span>P{task.priority}</span>
        <span>{task.dependencyIds.length} deps</span>
        <span>Owner: {presentation.ownerLabel}</span>
      </div>
      <div className="detail-stack">
        <section className="detail-block">
          <p className="eyebrow">Verification</p>
          <p className="detail-copy">{presentation.verificationSubtitle}</p>
          <ul className="plain-list">
            <li>Verifier: {presentation.verifierLabel}</li>
            <li>Latest summary: {presentation.latestSummary}</li>
            <li>Updated: {formatDate(task.updatedAt)}</li>
          </ul>
        </section>
        <section className="detail-block">
          <p className="eyebrow">Definition of done</p>
          {presentation.hasDefinitionOfDone ? (
            <ol className="detail-list">
              {task.definitionOfDone.map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ol>
          ) : (
            <div className="compact-empty">No definition of done was stored for this task.</div>
          )}
        </section>
        <details className="secondary-panel" open={!presentation.hasDefinitionOfDone}>
          <summary>Acceptance criteria (summary / compatibility)</summary>
          {task.acceptanceCriteria.length > 0 ? (
            <ol className="detail-list">
              {task.acceptanceCriteria.map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ol>
          ) : (
            <div className="compact-empty">No acceptance criteria were published for this task.</div>
          )}
        </details>
        {(findings.length > 0 || openChangeRequests.length > 0 || presentation.reworkTasks.length > 0) ? (
          <section className="detail-block">
            <p className="eyebrow">Change requests</p>
            {findings.length > 0 ? (
              <>
                <strong>Findings</strong>
                <ol className="detail-list">
                  {findings.map((finding) => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ol>
              </>
            ) : null}
            {openChangeRequests.length > 0 ? (
              <>
                <strong>Open change requests</strong>
                <ol className="detail-list">
                  {openChangeRequests.map((request) => (
                    <li key={request}>{request}</li>
                  ))}
                </ol>
              </>
            ) : null}
            {presentation.reworkTasks.length > 0 ? (
              <>
                <strong>Rework follow-ups</strong>
                <ul className="plain-list">
                  {presentation.reworkTasks.map((reworkTask) => (
                    <li key={reworkTask.id}>{reworkTask.title} ({formatLabel(reworkTask.status)})</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}
        <section className="detail-block">
          <p className="eyebrow">Evidence</p>
          <ul className="plain-list">
            <li>{presentation.verificationSummary}</li>
            {task.validationTemplates.length > 0 ? <li>{task.validationTemplates.length} validation templates attached.</li> : null}
            {task.latestVerificationEvidence.length > 0 ? <li>{task.latestVerificationEvidence.length} verification evidence references attached.</li> : null}
            {validations.length > 0 ? <li>{validations.length} run validations available.</li> : null}
            {relatedArtifacts.length > 0 ? <li>{relatedArtifacts.length} recent artifacts available.</li> : null}
          </ul>
        </section>
        <section className="detail-block">
          <p className="eyebrow">Lifecycle</p>
          <div className="compact-list">
            {relatedEvents.map((event) => (
              <div key={event.id} className="compact-list-row">
                <span>{formatLabel(event.eventType)}</span>
                <strong>{event.summary}</strong>
              </div>
            ))}
            {relatedEvents.length === 0 ? <div className="compact-empty">No verification events have been published for this task yet.</div> : null}
          </div>
        </section>
      </div>
    </article>
  )
}

export default App
