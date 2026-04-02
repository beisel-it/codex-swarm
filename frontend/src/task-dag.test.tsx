import { describe, expect, it, vi } from 'vitest'
import type { TaskDagGraph } from '../../packages/contracts/src/index.ts'
import { TaskDagGraphPanel } from './task-dag'
import { buildTaskDagRenderModel, type TaskDagTask } from './task-dag-model'

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

const branchingTasks: TaskDagTask[] = [
  {
    id: 'task-root-a',
    title: 'Root A',
    role: 'leader',
    status: 'in_progress',
    dependencyIds: [],
  },
  {
    id: 'task-mid-a',
    title: 'Mid A',
    role: 'implementer',
    status: 'blocked',
    dependencyIds: ['task-root-a'],
  },
  {
    id: 'task-root-b',
    title: 'Root B',
    role: 'reviewer',
    status: 'completed',
    dependencyIds: [],
  },
  {
    id: 'task-blocked',
    title: 'Blocked leaf',
    role: 'implementer',
    status: 'blocked',
    dependencyIds: ['task-mid-a', 'task-root-b'],
  },
  {
    id: 'task-dependent',
    title: 'Dependent follower',
    role: 'reviewer',
    status: 'pending',
    dependencyIds: ['task-blocked'],
  },
]

const branchingTaskDag: TaskDagGraph = {
  nodes: [
    {
      taskId: 'task-root-a',
      title: 'Root A',
      role: 'leader',
      status: 'in_progress',
      parentTaskId: null,
      dependencyIds: [],
      dependentTaskIds: ['task-mid-a'],
      blockedByTaskIds: [],
      isRoot: true,
      isBlocked: false,
    },
    {
      taskId: 'task-mid-a',
      title: 'Mid A',
      role: 'implementer',
      status: 'blocked',
      parentTaskId: null,
      dependencyIds: ['task-root-a'],
      dependentTaskIds: ['task-blocked'],
      blockedByTaskIds: ['task-root-a'],
      isRoot: false,
      isBlocked: true,
    },
    {
      taskId: 'task-root-b',
      title: 'Root B',
      role: 'reviewer',
      status: 'completed',
      parentTaskId: null,
      dependencyIds: [],
      dependentTaskIds: ['task-blocked'],
      blockedByTaskIds: [],
      isRoot: true,
      isBlocked: false,
    },
    {
      taskId: 'task-blocked',
      title: 'Blocked leaf',
      role: 'implementer',
      status: 'blocked',
      parentTaskId: null,
      dependencyIds: ['task-mid-a', 'task-root-b'],
      dependentTaskIds: ['task-dependent'],
      blockedByTaskIds: ['task-mid-a'],
      isRoot: false,
      isBlocked: true,
    },
    {
      taskId: 'task-dependent',
      title: 'Dependent follower',
      role: 'reviewer',
      status: 'pending',
      parentTaskId: null,
      dependencyIds: ['task-blocked'],
      dependentTaskIds: [],
      blockedByTaskIds: [],
      isRoot: false,
      isBlocked: false,
    },
  ],
  edges: [
    {
      id: 'task-root-a->task-mid-a',
      sourceTaskId: 'task-root-a',
      targetTaskId: 'task-mid-a',
      kind: 'dependency',
      isSatisfied: false,
      isBlocking: true,
    },
    {
      id: 'task-mid-a->task-blocked',
      sourceTaskId: 'task-mid-a',
      targetTaskId: 'task-blocked',
      kind: 'dependency',
      isSatisfied: false,
      isBlocking: true,
    },
    {
      id: 'task-root-b->task-blocked',
      sourceTaskId: 'task-root-b',
      targetTaskId: 'task-blocked',
      kind: 'dependency',
      isSatisfied: true,
      isBlocking: false,
    },
    {
      id: 'task-blocked->task-dependent',
      sourceTaskId: 'task-blocked',
      targetTaskId: 'task-dependent',
      kind: 'dependency',
      isSatisfied: false,
      isBlocking: false,
    },
  ],
  rootTaskIds: ['task-root-a', 'task-root-b'],
  blockedTaskIds: ['task-mid-a', 'task-blocked'],
  unblockPaths: [
    {
      taskId: 'task-mid-a',
      blockingTaskIds: ['task-root-a'],
      pathTaskIds: ['task-root-a', 'task-mid-a'],
      pathEdgeIds: ['task-root-a->task-mid-a'],
    },
    {
      taskId: 'task-blocked',
      blockingTaskIds: ['task-mid-a'],
      pathTaskIds: ['task-root-a', 'task-mid-a', 'task-blocked'],
      pathEdgeIds: ['task-root-a->task-mid-a', 'task-mid-a->task-blocked'],
    },
  ],
  hasIncompleteDependencies: false,
  missingDependencies: [],
}

const isolatedTasks: TaskDagTask[] = [
  {
    id: 'solo-task',
    title: 'Solo task',
    role: 'implementer',
    status: 'pending',
    dependencyIds: [],
  },
]

const partialDataTasks: TaskDagTask[] = [
  {
    id: 'task-partial',
    title: 'Partial task',
    role: 'implementer',
    status: 'blocked',
    dependencyIds: ['missing-root'],
  },
]

const partialTaskDag: TaskDagGraph = {
  nodes: [
    {
      taskId: 'task-partial',
      title: 'Partial task',
      role: 'implementer',
      status: 'blocked',
      parentTaskId: null,
      dependencyIds: ['missing-root'],
      dependentTaskIds: [],
      blockedByTaskIds: ['missing-root'],
      isRoot: false,
      isBlocked: true,
    },
  ],
  edges: [],
  rootTaskIds: [],
  blockedTaskIds: ['task-partial'],
  unblockPaths: [],
  hasIncompleteDependencies: true,
  missingDependencies: [
    {
      targetTaskId: 'task-partial',
      missingTaskId: 'missing-root',
      isBlocking: true,
    },
  ],
}

const partialTaskDagWithoutMissingEntries: TaskDagGraph = {
  ...partialTaskDag,
  missingDependencies: [],
}

const partialTaskDagWithoutMissingDependenciesField = {
  ...partialTaskDag,
  missingDependencies: undefined,
} as unknown as TaskDagGraph

const partialFlagOnlyTaskDag: TaskDagGraph = {
  nodes: [
    {
      taskId: 'task-partial',
      title: 'Partial task',
      role: 'implementer',
      status: 'blocked',
      parentTaskId: null,
      dependencyIds: ['missing-root'],
      dependentTaskIds: [],
      blockedByTaskIds: ['missing-root'],
      isRoot: false,
      isBlocked: true,
    },
  ],
  edges: [],
  rootTaskIds: [],
  blockedTaskIds: ['task-partial'],
  unblockPaths: [],
  hasIncompleteDependencies: true,
  missingDependencies: [],
}

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

function collectByType(
  node: ReactNodeLike,
  type: string,
  found: Array<{ props: Record<string, unknown> }> = [],
) {
  if (!node || typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return found
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectByType(child, type, found)
    }
    return found
  }
  if (node.type === type) {
    found.push(node)
  }
  for (const child of toArray(node.props.children)) {
    collectByType(child as ReactNodeLike, type, found)
  }
  return found
}

describe('buildTaskDagRenderModel', () => {
  it('marks isolated tasks as an empty dependency graph without partial-data warnings', () => {
    const model = buildTaskDagRenderModel({
      tasks: isolatedTasks,
    })

    expect(model.state).toBe('ready')
    if (model.state !== 'ready') {
      return
    }

    expect(model.taskCount).toBe(1)
    expect(model.edgeCount).toBe(0)
    expect(model.emptyDependencies).toBe(true)
    expect(model.hasIncompleteDependencies).toBe(false)
    expect(model.helperText).toContain('All tasks are independent')
  })

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

  it('keeps partial DAG data visible instead of falling back to the all-independent state', () => {
    const model = buildTaskDagRenderModel({
      tasks: partialDataTasks,
      taskDag: partialTaskDag,
      selectedTaskId: 'task-partial',
    })

    expect(model.state).toBe('ready')
    if (model.state !== 'ready') {
      return
    }

    expect(model.edgeCount).toBe(0)
    expect(model.blockedCount).toBe(1)
    expect(model.emptyDependencies).toBe(false)
    expect(model.hasIncompleteDependencies).toBe(true)
    expect(model.missingDependencyCount).toBe(1)
    expect(model.helperText).toContain('Dependency data is incomplete')
    expect(model.incompleteDependencyMessage).toContain('1 dependency is missing')
  })

  it('treats the backend incomplete flag as authoritative even when no missing dependency entries are present', () => {
    const model = buildTaskDagRenderModel({
      tasks: partialDataTasks,
      taskDag: partialTaskDagWithoutMissingEntries,
      selectedTaskId: 'task-partial',
    })

    expect(model.state).toBe('ready')
    if (model.state !== 'ready') {
      return
    }

    expect(model.edgeCount).toBe(0)
    expect(model.emptyDependencies).toBe(false)
    expect(model.hasIncompleteDependencies).toBe(true)
    expect(model.missingDependencyCount).toBe(0)
    expect(model.helperText).toContain('Dependency data is incomplete')
    expect(model.incompleteDependencyMessage).toContain('Graph relationships are partial')
  })

  it('keeps the incomplete warning active when missingDependencies is omitted', () => {
    const model = buildTaskDagRenderModel({
      tasks: partialDataTasks,
      taskDag: partialTaskDagWithoutMissingDependenciesField,
      selectedTaskId: 'task-partial',
    })

    expect(model.state).toBe('ready')
    if (model.state !== 'ready') {
      return
    }

    expect(model.emptyDependencies).toBe(false)
    expect(model.hasIncompleteDependencies).toBe(true)
    expect(model.missingDependencyCount).toBe(0)
    expect(model.incompleteDependencyMessage).toContain('Graph relationships are partial')
  })

  it('honors the backend incomplete-data flag even when no missing dependency entries are attached', () => {
    const model = buildTaskDagRenderModel({
      tasks: partialDataTasks,
      taskDag: partialFlagOnlyTaskDag,
      selectedTaskId: 'task-partial',
    })

    expect(model.state).toBe('ready')
    if (model.state !== 'ready') {
      return
    }

    expect(model.edgeCount).toBe(0)
    expect(model.blockedCount).toBe(1)
    expect(model.emptyDependencies).toBe(false)
    expect(model.hasIncompleteDependencies).toBe(true)
    expect(model.missingDependencyCount).toBe(0)
    expect(model.helperText).toContain('Dependency data is incomplete')
    expect(model.incompleteDependencyMessage).toContain('Graph relationships are partial')
  })

  it('uses backend unblock paths and edge metadata to highlight full branching ancestry for blocked selections', () => {
    const model = buildTaskDagRenderModel({
      tasks: branchingTasks,
      taskDag: branchingTaskDag,
      selectedTaskId: 'task-blocked',
    })

    expect(model.state).toBe('ready')
    if (model.state !== 'ready') {
      return
    }

    const selectedNode = model.nodes.find((node) => node.taskId === 'task-blocked')
    const directDependency = model.nodes.find((node) => node.taskId === 'task-mid-a')
    const multiHopAncestor = model.nodes.find((node) => node.taskId === 'task-root-a')
    const satisfiedDependency = model.nodes.find((node) => node.taskId === 'task-root-b')
    const dependent = model.nodes.find((node) => node.taskId === 'task-dependent')

    expect(selectedNode?.isSelected).toBe(true)
    expect(directDependency?.isDirectDependency).toBe(true)
    expect(directDependency?.isUnblockAncestor).toBe(true)
    expect(multiHopAncestor?.isDirectDependency).toBe(false)
    expect(multiHopAncestor?.isUnblockAncestor).toBe(true)
    expect(satisfiedDependency?.isDirectDependency).toBe(true)
    expect(satisfiedDependency?.isUnblockAncestor).toBe(false)
    expect(dependent?.isDirectDependent).toBe(true)

    expect(model.unblockPathTaskIds).toEqual(new Set(['task-root-a', 'task-mid-a']))
    expect(model.unblockPathEdgeIds).toEqual(new Set(['task-root-a->task-mid-a', 'task-mid-a->task-blocked']))

    const rootToMidEdge = model.edges.find((edge) => edge.id === 'task-root-a->task-mid-a')
    const midToBlockedEdge = model.edges.find((edge) => edge.id === 'task-mid-a->task-blocked')
    const satisfiedEdge = model.edges.find((edge) => edge.id === 'task-root-b->task-blocked')

    expect(rootToMidEdge).toMatchObject({
      relatedToSelection: true,
      isUnblockPath: true,
      activelyBlocking: true,
      isSatisfied: false,
    })
    expect(midToBlockedEdge).toMatchObject({
      relatedToSelection: true,
      isUnblockPath: true,
      activelyBlocking: true,
      isSatisfied: false,
    })
    expect(satisfiedEdge).toMatchObject({
      relatedToSelection: true,
      isUnblockPath: false,
      activelyBlocking: false,
      isSatisfied: true,
    })
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
      tasks: isolatedTasks,
      onSelectTask: vi.fn(),
      toneByTaskId: new Map([['solo-task', 'warning']]),
    }) as ReactNodeLike)

    expect(JSON.stringify(tree)).toContain('No dependencies yet. All tasks are independent.')
  })

  it('renders an explicit incomplete-data warning instead of the independent-task fallback for partial DAGs', () => {
    const tree = resolveTree(TaskDagGraphPanel({
      tasks: partialDataTasks,
      taskDag: partialTaskDag,
      selectedTaskId: 'task-partial',
      onSelectTask: vi.fn(),
      toneByTaskId: new Map([['task-partial', 'warning']]),
    }) as ReactNodeLike)

    const serializedTree = JSON.stringify(tree)
    expect(serializedTree).toContain('Incomplete dependency data.')
    expect(serializedTree).toContain('1 dependency is missing')
    expect(serializedTree).toContain('task-dag-warning-pill')
    expect(serializedTree).not.toContain('No dependencies yet. All tasks are independent.')
  })

  it('renders the incomplete-data warning for backend-signaled partial DAGs without missing dependency entries', () => {
    const tree = resolveTree(TaskDagGraphPanel({
      tasks: partialDataTasks,
      taskDag: partialTaskDagWithoutMissingEntries,
      selectedTaskId: 'task-partial',
      onSelectTask: vi.fn(),
      toneByTaskId: new Map([['task-partial', 'warning']]),
    }) as ReactNodeLike)

    const serializedTree = JSON.stringify(tree)
    expect(serializedTree).toContain('Incomplete dependency data.')
    expect(serializedTree).toContain('Graph relationships are partial')
    expect(serializedTree).toContain('partial data')
    expect(serializedTree).not.toContain('No dependencies yet. All tasks are independent.')
  })

  it('renders the incomplete-data warning when missingDependencies is omitted from a partial DAG', () => {
    const tree = resolveTree(TaskDagGraphPanel({
      tasks: partialDataTasks,
      taskDag: partialTaskDagWithoutMissingDependenciesField,
      selectedTaskId: 'task-partial',
      onSelectTask: vi.fn(),
      toneByTaskId: new Map([['task-partial', 'warning']]),
    }) as ReactNodeLike)

    const serializedTree = JSON.stringify(tree)
    expect(serializedTree).toContain('Incomplete dependency data.')
    expect(serializedTree).toContain('Graph relationships are partial')
    expect(serializedTree).toContain('partial data')
    expect(serializedTree).not.toContain('No dependencies yet. All tasks are independent.')
  })

  it('keeps the incomplete-data warning visible when the backend only sets the partial-data flag', () => {
    const tree = resolveTree(TaskDagGraphPanel({
      tasks: partialDataTasks,
      taskDag: partialFlagOnlyTaskDag,
      selectedTaskId: 'task-partial',
      onSelectTask: vi.fn(),
      toneByTaskId: new Map([['task-partial', 'warning']]),
    }) as ReactNodeLike)

    const serializedTree = JSON.stringify(tree)
    expect(serializedTree).toContain('Incomplete dependency data.')
    expect(serializedTree).toContain('Graph relationships are partial')
    expect(serializedTree).toContain('task-dag-warning-pill')
    expect(serializedTree).not.toContain('No dependencies yet. All tasks are independent.')
  })

  it('renders distinct adjacency and unblock-path classes for blocked task ancestry', () => {
    const tree = resolveTree(TaskDagGraphPanel({
      tasks: branchingTasks,
      taskDag: branchingTaskDag,
      selectedTaskId: 'task-blocked',
      onSelectTask: vi.fn(),
      toneByTaskId: new Map([
        ['task-root-a', 'warning'],
        ['task-mid-a', 'warning'],
        ['task-root-b', 'success'],
        ['task-blocked', 'warning'],
        ['task-dependent', 'active'],
      ]),
    }) as ReactNodeLike)

    const buttons = collectButtons(tree)
    const paths = collectByType(tree, 'path')

    const rootButton = buttons.find((button) => button.props.title === 'Root A')
    const satisfiedDependencyButton = buttons.find((button) => button.props.title === 'Root B')
    const dependentButton = buttons.find((button) => button.props.title === 'Dependent follower')

    expect(String(rootButton?.props.className ?? '')).toContain('is-unblock-ancestor')
    expect(String(satisfiedDependencyButton?.props.className ?? '')).toContain('is-direct-dependency')
    expect(String(satisfiedDependencyButton?.props.className ?? '')).not.toContain('is-unblock-ancestor')
    expect(String(dependentButton?.props.className ?? '')).toContain('is-direct-dependent')

    const pathClassNames = paths.map((path) => String(path.props.className ?? ''))
    expect(pathClassNames.some((className) => className.includes('is-unblock-path') && className.includes('is-blocking'))).toBe(true)
    expect(pathClassNames.some((className) => className.includes('is-satisfied') && !className.includes('is-blocking'))).toBe(true)
  })
})
