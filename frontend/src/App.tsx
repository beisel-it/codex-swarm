import { startTransition, useDeferredValue, useEffect, useState } from 'react'

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
type ReviewStatus = 'pending' | 'approved' | 'attention'
type ValidationStatus = 'pending' | 'passed' | 'failed'
type ArtifactKind = 'plan' | 'patch' | 'log' | 'report' | 'diff' | 'screenshot' | 'other'

type Repository = {
  id: string
  name: string
  url: string
  defaultBranch: string
}

type Run = {
  id: string
  repositoryId: string
  goal: string
  status: RunStatus
  branchName: string | null
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

type Task = {
  id: string
  runId: string
  title: string
  description: string
  role: string
  status: TaskStatus
  priority: number
  ownerAgentId?: string | null
  acceptanceCriteria: string[]
}

type Agent = {
  id: string
  runId: string
  name: string
  role: string
  status: AgentStatus
  branchName: string | null
  worktreePath: string | null
}

type Validation = {
  id: string
  runId: string
  taskId?: string | null
  name: string
  command: string
  summary?: string | null
  status: ValidationStatus
}

type Artifact = {
  id: string
  runId: string
  taskId?: string | null
  kind: ArtifactKind
  path: string
  contentType: string
}

type RunDetail = Run & {
  tasks: Task[]
  agents: Agent[]
}

type ReviewItem = {
  id: string
  title: string
  status: ReviewStatus
  notes: string
  meta: string
}

type SwarmData = {
  repositories: Repository[]
  runs: Run[]
  tasks: Task[]
  agents: Agent[]
  validations: Validation[]
  artifacts: Artifact[]
  source: 'mock' | 'api'
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? 'codex-swarm-dev-token'

const mockData: SwarmData = {
  source: 'mock',
  repositories: [
    {
      id: 'repo-codex-swarm',
      name: 'codex-swarm',
      url: 'github.com/example/codex-swarm',
      defaultBranch: 'main',
    },
  ],
  runs: [
    {
      id: 'run-alpha',
      repositoryId: 'repo-codex-swarm',
      goal: 'Create the first durable control-plane slice with planning, task orchestration, and a board shell.',
      status: 'in_progress',
      branchName: 'runs/m1-foundation',
      createdAt: '2026-03-28T08:15:00.000Z',
      updatedAt: '2026-03-28T11:42:00.000Z',
      metadata: { phase: 'M1', concurrency: 3 },
    },
    {
      id: 'run-beta',
      repositoryId: 'repo-codex-swarm',
      goal: 'Prepare the review loop for approvals, validations, and blocked-task recovery in beta.',
      status: 'awaiting_approval',
      branchName: 'runs/m2-review-loop',
      createdAt: '2026-03-27T14:10:00.000Z',
      updatedAt: '2026-03-28T09:05:00.000Z',
      metadata: { phase: 'M2', concurrency: 2 },
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
      acceptanceCriteria: ['Plan artifact published', 'Dependencies linked', 'Milestone scope captured'],
    },
    {
      id: 'task-api',
      runId: 'run-alpha',
      title: 'Implement control-plane resource routes',
      description: 'Expose repository, run, task, validation, and artifact routes for the first orchestration slice.',
      role: 'backend',
      status: 'in_progress',
      priority: 5,
      ownerAgentId: 'agent-backend',
      acceptanceCriteria: ['CRUD routes available', 'Typecheck passes', 'Data model aligned'],
    },
    {
      id: 'task-ui',
      runId: 'run-alpha',
      title: 'Wire the board shell to live API data',
      description: 'Replace mocked-only hydration with backend-backed run details and live review signals.',
      role: 'frontend',
      status: 'in_progress',
      priority: 4,
      ownerAgentId: 'agent-frontend',
      acceptanceCriteria: ['Runs hydrate from API', 'Review states derive from live status', 'Fallback remains safe'],
    },
    {
      id: 'task-runtime',
      runId: 'run-alpha',
      title: 'Provision worker worktrees and session recovery',
      description: 'Attach durable Codex sessions to isolated Git lanes and expose blocked-state recovery.',
      role: 'infrastructure',
      status: 'blocked',
      priority: 4,
      acceptanceCriteria: ['Worktree lane naming agreed', 'Recovery actions defined', 'Session metadata stored'],
    },
    {
      id: 'task-review',
      runId: 'run-beta',
      title: 'Hold the beta approval gate',
      description: 'Reviewers inspect the board, validations, and artifacts before opening the merge path.',
      role: 'reviewer',
      status: 'awaiting_review',
      priority: 3,
      ownerAgentId: 'agent-reviewer',
      acceptanceCriteria: ['Pending approvals visible', 'Validation summary shown', 'Review placeholders rendered'],
    },
  ],
  agents: [
    {
      id: 'agent-leader',
      runId: 'run-alpha',
      name: 'tech-lead',
      role: 'leader',
      status: 'busy',
      branchName: 'runs/m1-foundation',
      worktreePath: '/worktrees/run-alpha/leader',
    },
    {
      id: 'agent-backend',
      runId: 'run-alpha',
      name: 'backend-dev',
      role: 'backend',
      status: 'busy',
      branchName: 'feature/control-plane-routes',
      worktreePath: '/worktrees/run-alpha/backend',
    },
    {
      id: 'agent-frontend',
      runId: 'run-alpha',
      name: 'frontend-dev',
      role: 'frontend',
      status: 'busy',
      branchName: 'feature/live-board-data',
      worktreePath: '/worktrees/run-alpha/frontend',
    },
    {
      id: 'agent-reviewer',
      runId: 'run-beta',
      name: 'reviewer',
      role: 'reviewer',
      status: 'paused',
      branchName: 'review/beta-handoff',
      worktreePath: '/worktrees/run-beta/reviewer',
    },
  ],
  validations: [
    {
      id: 'validation-api',
      runId: 'run-alpha',
      taskId: 'task-api',
      name: 'API typecheck',
      command: 'pnpm --dir apps/api typecheck',
      summary: 'Shared contracts compile against the current backend slice.',
      status: 'passed',
    },
    {
      id: 'validation-ui',
      runId: 'run-alpha',
      taskId: 'task-ui',
      name: 'Board live data build',
      command: 'npm --prefix frontend run build',
      summary: 'Live hydration is ready to validate once the API process is running.',
      status: 'pending',
    },
    {
      id: 'validation-recovery',
      runId: 'run-beta',
      taskId: 'task-review',
      name: 'Blocked-state recovery smoke',
      command: 'pnpm test -- recovery',
      summary: 'Waiting on worktree/session lifecycle implementation.',
      status: 'failed',
    },
  ],
  artifacts: [
    {
      id: 'artifact-plan',
      runId: 'run-alpha',
      taskId: 'task-api',
      kind: 'plan',
      path: '.swarm/plan.md',
      contentType: 'text/markdown',
    },
    {
      id: 'artifact-ui',
      runId: 'run-alpha',
      taskId: 'task-ui',
      kind: 'report',
      path: 'artifacts/ui/live-board-preview.html',
      contentType: 'text/html',
    },
    {
      id: 'artifact-review',
      runId: 'run-beta',
      taskId: 'task-review',
      kind: 'log',
      path: 'artifacts/review/pending-approval.log',
      contentType: 'text/plain',
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

const reviewStatusTone: Record<ReviewStatus, string> = {
  pending: 'warning',
  approved: 'success',
  attention: 'danger',
}

const validationStatusTone: Record<ValidationStatus, string> = {
  pending: 'warning',
  passed: 'success',
  failed: 'danger',
}

function buildApiUrl(path: string) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

async function loadSwarmData(): Promise<SwarmData> {
  try {
    const repositories = await requestJson<Repository[]>('/api/v1/repositories')
    const runs = await requestJson<Run[]>('/api/v1/runs')

    if (repositories.length === 0 || runs.length === 0) {
      return mockData
    }

    const details = await Promise.all(
      runs.map((run) =>
        requestJson<RunDetail>(`/api/v1/runs/${encodeURIComponent(run.id)}`),
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

    return {
      repositories,
      runs,
      tasks: details.flatMap((detail) => detail.tasks),
      agents: details.flatMap((detail) => detail.agents),
      validations: validationsPerRun.flat(),
      artifacts: artifactsPerRun.flat(),
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

function deriveReviewItems(run: Run, tasks: Task[], validations: Validation[]): ReviewItem[] {
  const items: ReviewItem[] = []

  if (run.status === 'awaiting_approval') {
    items.push({
      id: `${run.id}-approval`,
      title: 'Run approval required',
      status: 'pending',
      notes: 'The backend marks this run as awaiting approval. Human review is required before execution continues.',
      meta: `Run ${run.id}`,
    })
  }

  tasks
    .filter((task) => task.status === 'awaiting_review')
    .forEach((task) => {
      items.push({
        id: `${task.id}-review`,
        title: task.title,
        status: 'pending',
        notes: 'Task is waiting on reviewer sign-off before it can be considered complete.',
        meta: `${task.role} task`,
      })
    })

  validations
    .filter((validation) => validation.status === 'failed')
    .forEach((validation) => {
      items.push({
        id: `${validation.id}-failed`,
        title: validation.name,
        status: 'attention',
        notes: validation.summary ?? 'A validation failed and requires attention before merge.',
        meta: validation.command,
      })
    })

  if (items.length === 0) {
    items.push({
      id: `${run.id}-clear`,
      title: 'No active review blockers',
      status: 'approved',
      notes: 'No pending review tasks or failed validations are active for this run.',
      meta: `Run ${run.id}`,
    })
  }

  return items
}

function App() {
  const [data, setData] = useState<SwarmData>(mockData)
  const [selectedRunId, setSelectedRunId] = useState(mockData.runs[0]?.id ?? '')
  const [taskQuery, setTaskQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const deferredTaskQuery = useDeferredValue(taskQuery)

  useEffect(() => {
    let active = true

    async function hydrate() {
      const nextData = await loadSwarmData()

      if (!active) {
        return
      }

      setData(nextData)
      setSelectedRunId((current) => current || nextData.runs[0]?.id || '')
      setLoading(false)
    }

    void hydrate()

    return () => {
      active = false
    }
  }, [])

  const selectedRun =
    data.runs.find((run) => run.id === selectedRunId) ??
    data.runs[0] ??
    null

  const selectedRepository = data.repositories.find(
    (repository) => repository.id === selectedRun?.repositoryId,
  )

  const visibleTasks = data.tasks
    .filter((task) => task.runId === selectedRun?.id)
    .filter((task) => {
      if (!deferredTaskQuery.trim()) {
        return true
      }

      const query = deferredTaskQuery.trim().toLowerCase()
      return `${task.title} ${task.description} ${task.role}`.toLowerCase().includes(query)
    })

  const runAgents = data.agents.filter((agent) => agent.runId === selectedRun?.id)
  const runValidations = data.validations.filter((validation) => validation.runId === selectedRun?.id)
  const runArtifacts = data.artifacts.filter((artifact) => artifact.runId === selectedRun?.id)
  const reviewItems = selectedRun ? deriveReviewItems(selectedRun, visibleTasks, runValidations) : []

  return (
    <div className="app-shell">
      <div className="backdrop-grid" aria-hidden="true" />

      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Codex Swarm Live Board</p>
          <h1>Track runs, blocked work, and review gates in one durable view.</h1>
          <p className="lede">
            The board now hydrates from live backend endpoints when they are available, and it
            falls back to seeded workspace data when the API is unavailable or still empty.
          </p>
        </div>

        <div className="hero-metrics">
          <MetricCard label="Runs on board" value={String(data.runs.length)} hint="Hydrated from the control plane" />
          <MetricCard label="Busy workers" value={String(data.agents.filter((agent) => agent.status === 'busy').length)} hint="Live agents with active lanes" />
          <MetricCard label="Review signals" value={String(reviewItems.filter((item) => item.status !== 'approved').length)} hint="Derived from run, task, and validation state" />
        </div>
      </header>

      <main className="board-layout">
        <aside className="panel panel-runs">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Run ledger</p>
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
                    {run.status.replace('_', ' ')}
                  </span>
                  <span className="run-timestamp">{formatDate(run.updatedAt)}</span>
                </div>
                <h3>{run.goal}</h3>
                <p>{run.branchName ?? 'Branch not assigned yet'}</p>
              </button>
            ))}
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
                  {selectedRun.status.replace('_', ' ')}
                </span>
              </div>

              <div className="overview-grid">
                <InfoCard label="Goal" value={selectedRun.goal} />
                <InfoCard label="Branch" value={selectedRun.branchName ?? 'Pending branch assignment'} />
                <InfoCard label="Repository" value={selectedRepository?.url ?? 'No URL available'} />
                <InfoCard label="Default branch" value={selectedRepository?.defaultBranch ?? 'main'} />
              </div>

              <div className="signal-band">
                <div>
                  <p className="signal-label">Milestone</p>
                  <strong>{String(selectedRun.metadata?.phase ?? 'Unspecified')}</strong>
                </div>
                <div>
                  <p className="signal-label">Concurrency</p>
                  <strong>{String(selectedRun.metadata?.concurrency ?? 1)} workers</strong>
                </div>
                <div>
                  <p className="signal-label">Hydration</p>
                  <strong>{loading ? 'Refreshing' : data.source === 'api' ? 'Live control plane' : 'Fallback snapshot'}</strong>
                </div>
              </div>
            </section>

            <section className="panel panel-board">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Task board</p>
                  <h2>Role-driven lanes</h2>
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
                        <h3>{status.replace('_', ' ')}</h3>
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

            <section className="panel panel-agents">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Worker lanes</p>
                  <h2>Current assignments</h2>
                </div>
              </div>

              <div className="agent-list">
                {runAgents.map((agent) => (
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
                        <dt>Branch</dt>
                        <dd>{agent.branchName ?? 'Branch pending'}</dd>
                      </div>
                      <div>
                        <dt>Worktree</dt>
                        <dd>{agent.worktreePath ?? 'Worktree pending'}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel panel-approvals">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Review states</p>
                  <h2>Approvals and gates</h2>
                </div>
              </div>

              <div className="approval-list">
                {reviewItems.map((item) => (
                  <article key={item.id} className="approval-card">
                    <div className="approval-title">
                      <strong>{item.title}</strong>
                      <span className={`tone-chip tone-${reviewStatusTone[item.status]}`}>
                        {item.status}
                      </span>
                    </div>
                    <p>{item.notes}</p>
                    <div className="approval-meta">
                      <span>{item.meta}</span>
                      <span>Derived from live run/task/validation state</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel panel-validation">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Validation</p>
                  <h2>Checks before merge</h2>
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
                  <p className="panel-kicker">Artifacts</p>
                  <h2>Live handoff payloads</h2>
                </div>
              </div>

              <div className="artifact-list">
                {runArtifacts.map((artifact) => (
                  <article key={artifact.id} className="artifact-card">
                    <span className="role-chip">{artifact.kind}</span>
                    <strong>{artifact.path}</strong>
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
      </main>

      <footer className="footer-bar">
        <span>{loading ? 'Refreshing board state…' : 'Board data ready.'}</span>
        <span>
          {data.source === 'api'
            ? 'Hydrating from live API detail and list endpoints.'
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

export default App
