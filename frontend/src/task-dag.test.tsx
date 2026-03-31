import { describe, expect, it, vi } from 'vitest'
import { TaskDagGraphPanel, buildTaskDagRenderModel, type TaskDagTask } from './task-dag'

const tasks: TaskDagTask[] = [
  {
    id: 'task-root',
    title: 'Root task',
    role: 'leader',
    status: 'in_progress',
    dependencyIds: [],
  },
  {
    id: 'task-branch',
    title: 'Branch task',
    role: 'implementer',
    status: 'blocked',
    dependencyIds: ['task-root'],
  },
  {
    id: 'task-leaf',
    title: 'Leaf task',
    role: 'reviewer',
    status: 'pending',
    dependencyIds: ['task-branch'],
  },
]

type ReactNodeLike =
  | null
  | undefined
  | string
  | number
  | boolean
  | {
      type: unknown
      props: Record<string, unknown>
    }
  | ReactNodeLike[]

function toArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
  }
  if (value === null || value === undefined || typeof value === 'boolean') {
    return []
  }
  return [value]
}

function resolveTree(node: ReactNodeLike): ReactNodeLike {
  if (!node || typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return node
  }
  if (Array.isArray(node)) {
    return node.map((child) => resolveTree(child))
  }
  if (typeof node.type === 'function') {
    return resolveTree(node.type(node.props))
  }
  return {
    ...node,
    props: {
      ...node.props,
      children: toArray(node.props.children).map((child) => resolveTree(child as ReactNodeLike)),
    },
  }
}

function collectButtons(node: ReactNodeLike, found: Array<{ props: Record<string, unknown> }> = []) {
  if (!node || typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return found
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectButtons(child, found)
    }
    return found
  }
  if (node.type === 'button') {
    found.push(node)
  }
  for (const child of toArray(node.props.children)) {
    collectButtons(child as ReactNodeLike, found)
  }
  return found
}

describe('buildTaskDagRenderModel', () => {
  it('derives a directional layout and selection relationships from task dependencies', () => {
    const model = buildTaskDagRenderModel({
      tasks,
      selectedTaskId: 'task-branch',
    })

    expect(model.state).toBe('ready')
    if (model.state !== 'ready') {
      return
    }

    expect(model.taskCount).toBe(3)
    expect(model.edgeCount).toBe(2)
    expect(model.blockedCount).toBe(1)
    expect(model.emptyDependencies).toBe(false)
    expect(model.selectedTaskId).toBe('task-branch')

    const rootNode = model.nodes.find((node) => node.taskId === 'task-root')
    const branchNode = model.nodes.find((node) => node.taskId === 'task-branch')
    const leafNode = model.nodes.find((node) => node.taskId === 'task-leaf')

    expect(rootNode?.isRoot).toBe(true)
    expect(branchNode?.isBlocked).toBe(true)
    expect(branchNode?.isSelected).toBe(true)
    expect(rootNode?.isRelated).toBe(true)
    expect(leafNode?.isRelated).toBe(true)
    expect(rootNode && branchNode && leafNode ? rootNode.x < branchNode.x && branchNode.x < leafNode.x : false).toBe(true)
    expect(model.edges.some((edge) => edge.activelyBlocking && edge.sourceTaskId === 'task-root' && edge.targetTaskId === 'task-branch')).toBe(true)
  })

  it('returns an inline error model when duplicate task ids make the graph ambiguous', () => {
    const model = buildTaskDagRenderModel({
      tasks: [...tasks, { ...tasks[0] }],
    })

    expect(model.state).toBe('error')
    if (model.state !== 'error') {
      return
    }
    expect(model.message).toContain('Duplicate task identifiers')
  })
})

describe('TaskDagGraphPanel', () => {
  it('wires node buttons to the shared task selection callback', () => {
    const onSelectTask = vi.fn()
    const tree = resolveTree(TaskDagGraphPanel({
      tasks,
      selectedTaskId: 'task-root',
      onSelectTask,
      toneByTaskId: new Map([
        ['task-root', 'active'],
        ['task-branch', 'warning'],
        ['task-leaf', 'warning'],
      ]),
    }) as ReactNodeLike)
    const buttons = collectButtons(tree)
    const nodeButton = buttons.find((button) => button.props.title === 'Branch task')

    expect(nodeButton).toBeDefined()
    expect(nodeButton?.props['aria-pressed']).toBe(false)

    const onClick = nodeButton?.props.onClick
    expect(typeof onClick).toBe('function')
    if (typeof onClick === 'function') {
      onClick()
    }

    expect(onSelectTask).toHaveBeenCalledWith('task-branch')
  })

  it('renders an explicit independent-task message when no dependency links exist', () => {
    const tree = resolveTree(TaskDagGraphPanel({
      tasks: [
        {
          id: 'solo-task',
          title: 'Solo task',
          role: 'implementer',
          status: 'pending',
          dependencyIds: [],
        },
      ],
      onSelectTask: vi.fn(),
      toneByTaskId: new Map([['solo-task', 'warning']]),
    }) as ReactNodeLike)

    expect(JSON.stringify(tree)).toContain('No dependencies yet. All tasks are independent.')
  })
})
