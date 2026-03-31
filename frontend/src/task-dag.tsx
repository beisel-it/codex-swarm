import type { KeyboardEvent, ReactElement } from 'react'
import type { TaskDagGraph } from '../../packages/contracts/src/index.ts'
import { buildTaskDagRenderModel, type TaskDagTask } from './task-dag-model'

function handleNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>, onSelectTask: (taskId: string) => void, taskId: string) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }
  event.preventDefault()
  onSelectTask(taskId)
}

export function TaskDagGraphPanel({
  tasks,
  taskDag,
  selectedTaskId,
  onSelectTask,
  toneByTaskId,
  isLoading = false,
}: {
  tasks: TaskDagTask[]
  taskDag?: TaskDagGraph | null
  selectedTaskId?: string | null
  onSelectTask: (taskId: string) => void
  toneByTaskId?: Map<string, string>
  isLoading?: boolean
}): ReactElement | null {
  if (tasks.length === 0 && !isLoading) {
    return null
  }

  const model = buildTaskDagRenderModel({
    tasks,
    taskDag,
    selectedTaskId,
    isLoading,
  })

  return (
    <section className="panel task-dag-shell">
      <div className="section-header task-dag-section-header">
        <div>
          <p className="eyebrow">Dependency graph</p>
          <h2>Execution order and unblock path</h2>
          {model.state === 'ready' ? <p className="task-dag-helper">{model.helperText}</p> : null}
        </div>
        <div className="task-dag-chip-row" aria-label="Dependency graph summary">
          <span className="ghost-pill">{model.taskCount} tasks</span>
          <span className="ghost-pill">{model.edgeCount} links</span>
          <span className="ghost-pill">{model.blockedCount} blocked</span>
        </div>
      </div>
      <div className="task-dag-legend" aria-label="Dependency graph legend">
        <span><i className="task-dag-swatch is-root" />Root</span>
        <span><i className="task-dag-swatch is-blocked" />Blocked</span>
        <span><i className="task-dag-swatch is-selected" />Selected</span>
        <span><i className="task-dag-swatch is-related" />Adjacent</span>
      </div>
      {model.state === 'loading' ? (
        <div className="task-dag-loading" aria-live="polite">
          <div className="task-dag-loading-bar" />
          <div className="task-dag-loading-canvas" />
        </div>
      ) : null}
      {model.state === 'error' ? (
        <div className="task-dag-feedback" role="status">
          {model.message}
        </div>
      ) : null}
      {model.state === 'ready' ? (
        <>
          <div className="task-dag-viewport" role="group" aria-label="Task dependency graph">
            <div className="task-dag-canvas" style={{ width: `${model.width}px`, height: `${model.height}px` }}>
              <svg className="task-dag-svg" width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`} aria-hidden="true">
                <defs>
                  <marker id="task-dag-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                  </marker>
                </defs>
                {model.edges.map((edge) => (
                  <path
                    key={edge.id}
                    className={[
                      'task-dag-edge',
                      edge.relatedToSelection ? 'is-related' : '',
                      edge.activelyBlocking ? 'is-blocking' : '',
                    ].filter(Boolean).join(' ')}
                    d={edge.path}
                    markerEnd="url(#task-dag-arrow)"
                  />
                ))}
              </svg>
              {model.nodes.map((node) => (
                <button
                  key={node.taskId}
                  type="button"
                  className={[
                    'task-dag-node',
                    node.isRoot ? 'is-root' : '',
                    node.isBlocked ? 'is-blocked' : '',
                    node.isSelected ? 'is-selected' : '',
                    selectedTaskId && !node.isRelated ? 'is-dimmed' : '',
                    node.isRelated && !node.isSelected ? 'is-related' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    height: `${node.height}px`,
                  }}
                  onClick={() => onSelectTask(node.taskId)}
                  onKeyDown={(event) => handleNodeKeyDown(event, onSelectTask, node.taskId)}
                  aria-pressed={node.isSelected}
                  title={node.title}
                >
                  <div className="task-dag-node-topline">
                    <span className={`tone-chip tone-${toneByTaskId?.get(node.taskId) ?? 'active'}`}>{node.status.replaceAll('_', ' ')}</span>
                    <span>{node.role}</span>
                  </div>
                  <strong>{node.title}</strong>
                  <span className="task-dag-node-meta">
                    {node.blockedByTaskIds.length > 0 ? `blocked by ${node.blockedByTaskIds.length}` : `${node.dependencyIds.length} deps`}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {model.emptyDependencies ? (
            <div className="task-dag-feedback" role="status">
              No dependencies yet. All tasks are independent.
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
