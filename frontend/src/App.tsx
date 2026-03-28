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
type ApprovalStatus = 'pending' | 'approved' | 'rejected'
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
  branchName: string
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
  ownerAgentId?: string
  acceptanceCriteria: string[]
}

type Agent = {
  id: string
  runId: string
  name: string
  role: string
  status: AgentStatus
  branchName: string
  worktreePath: string
}

type Approval = {
  id: string
  runId: string
  taskId?: string
  kind: string
  requestedBy: string
  reviewer?: string
  notes?: string
  status: ApprovalStatus
}

type Validation = {
  id: string
  runId: string
  taskId?: string
  name: string
  command: string
  summary?: string
  status: ValidationStatus
}

type Artifact = {
  id: string
  runId: string
  taskId?: string
  kind: ArtifactKind
  path: string
  contentType: string
}

type SwarmData = {
  repositories: Repository[]
  runs: Run[]
  tasks: Task[]
  agents: Agent[]
  approvals: Approval[]
  validations: Validation[]
  artifacts: Artifact[]
  source: 'mock' | 'api'
}

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
      title: 'Replace the starter app with the board shell',
      description: 'Show run overview, task lanes, blocked work, and review placeholders against stable shared shapes.',
      role: 'frontend',
      status: 'in_progress',
      priority: 4,
      ownerAgentId: 'agent-frontend',
      acceptanceCriteria: ['Starter removed', 'Responsive board shell added', 'Mock data path exists'],
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
      branchName: 'feature/board-shell',
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
  approvals: [
    {
      id: 'approval-plan',
      runId: 'run-beta',
      taskId: 'task-review',
      kind: 'plan',
      requestedBy: 'tech-lead',
      reviewer: 'principal-eng',
      notes: 'Approve the board shell before live event streaming and richer review actions land.',
      status: 'pending',
    },
    {
      id: 'approval-exception',
      runId: 'run-alpha',
      kind: 'policy_exception',
      requestedBy: 'backend-dev',
      reviewer: 'security',
      notes: 'Remote provider smoke tests remain blocked until policy defaults are documented.',
      status: 'rejected',
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
      name: 'Board shell build',
      command: 'pnpm --dir frontend build',
      summary: 'Pending until the starter app is replaced by the real board shell.',
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
      taskId: 'task-plan',
      kind: 'plan',
      path: '.swarm/plan.md',
      contentType: 'text/markdown',
    },
    {
      id: 'artifact-ui',
      runId: 'run-alpha',
      taskId: 'task-ui',
      kind: 'report',
      path: 'artifacts/ui/board-shell-preview.html',
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

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

async function loadSwarmData(): Promise<SwarmData> {
  try {
    const repositories = await requestJson<Repository[]>('/api/v1/repositories')
    const runs = await requestJson<Run[]>('/api/v1/runs')
    const tasks = await requestJson<Task[]>('/api/v1/tasks')

    if (repositories.length === 0 || runs.length === 0) {
      return mockData
    }

    const agents = await requestJson<Agent[]>('/api/v1/agents').catch(() => mockData.agents)
    const approvals = await requestJson<Approval[]>('/api/v1/approvals').catch(() => mockData.approvals)
    const artifacts = await requestJson<Artifact[]>('/api/v1/artifacts').catch(() => mockData.artifacts)

    const validations: Validation[] = []
    for (const run of runs) {
      const runValidations = await requestJson<Validation[]>(
        `/api/v1/validations?runId=${encodeURIComponent(run.id)}`,
      ).catch(() => [])
      validations.push(...runValidations)
    }

    return {
      repositories,
      runs,
      tasks,
      agents,
      approvals,
      validations: validations.length > 0 ? validations : mockData.validations,
      artifacts,
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
  const runApprovals = data.approvals.filter((approval) => approval.runId === selectedRun?.id)
  const runValidations = data.validations.filter((validation) => validation.runId === selectedRun?.id)
  const runArtifacts = data.artifacts.filter((artifact) => artifact.runId === selectedRun?.id)

  return (
    <div className="app-shell">
      <div className="backdrop-grid" aria-hidden="true" />

      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Codex Swarm Board Shell</p>
          <h1>Track runs, blocked work, and review gates in one durable view.</h1>
          <p className="lede">
            This frontend replaces the starter app with the first orchestration board shell:
            run overview, task lanes, blocked-state rendering, and review placeholders built
            against shared resource shapes.
          </p>
        </div>

        <div className="hero-metrics">
          <MetricCard
            label="Runs on board"
            value={String(data.runs.length)}
            hint="Foundation plus review-loop tracks"
          />
          <MetricCard
            label="Busy workers"
            value={String(data.agents.filter((agent) => agent.status === 'busy').length)}
            hint="Agents executing against isolated lanes"
          />
          <MetricCard
            label="Pending approvals"
            value={String(data.approvals.filter((approval) => approval.status === 'pending').length)}
            hint="Review gates still waiting on a decision"
          />
        </div>
      </header>

      <main className="board-layout">
        <aside className="panel panel-runs">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Run ledger</p>
              <h2>Execution tracks</h2>
            </div>
            <span className="data-pill">{data.source === 'api' ? 'Live API' : 'Mock data'}</span>
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
                <p>{run.branchName}</p>
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
                <InfoCard label="Branch" value={selectedRun.branchName} />
                <InfoCard label="Repository" value={selectedRepository?.url ?? 'No URL available'} />
                <InfoCard label="Default branch" value={selectedRepository?.defaultBranch ?? 'main'} />
              </div>

              <div className="signal-band">
                <div>
                  <p className="signal-label">Milestone</p>
                  <strong>{String(selectedRun.metadata?.phase ?? 'M1')}</strong>
                </div>
                <div>
                  <p className="signal-label">Concurrency</p>
                  <strong>{String(selectedRun.metadata?.concurrency ?? 1)} workers</strong>
                </div>
                <div>
                  <p className="signal-label">Hydration</p>
                  <strong>{loading ? 'Refreshing' : 'Current snapshot'}</strong>
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
                        <dd>{agent.branchName}</dd>
                      </div>
                      <div>
                        <dt>Worktree</dt>
                        <dd>{agent.worktreePath}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel panel-approvals">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Review placeholders</p>
                  <h2>Approvals and gates</h2>
                </div>
              </div>

              <div className="approval-list">
                {runApprovals.map((approval) => (
                  <article key={approval.id} className="approval-card">
                    <div className="approval-title">
                      <strong>{approval.kind}</strong>
                      <span className={`tone-chip tone-${approvalStatusTone[approval.status]}`}>
                        {approval.status}
                      </span>
                    </div>
                    <p>{approval.notes ?? 'No reviewer notes captured yet.'}</p>
                    <div className="approval-meta">
                      <span>Requested by {approval.requestedBy}</span>
                      <span>{approval.reviewer ? `Reviewer: ${approval.reviewer}` : 'Reviewer unassigned'}</span>
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
              </div>
            </section>

            <section className="panel panel-artifacts">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Artifacts</p>
                  <h2>Handoff placeholders</h2>
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
              </div>
            </section>
          </>
        ) : null}
      </main>

      <footer className="footer-bar">
        <span>{loading ? 'Refreshing board state…' : 'Board shell ready.'}</span>
        <span>Current slice uses mocked/shared-contract data when live endpoints are unavailable.</span>
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
