import type { TaskDagGraph } from '../../packages/contracts/src/index.ts'

export type TaskDagTask = {
  id: string
  title: string
  role: string
  status: string
  dependencyIds: string[]
}

export type TaskDagNodeRecord = {
  taskId: string
  title: string
  role: string
  status: string
  dependencyIds: string[]
  dependentTaskIds: string[]
  blockedByTaskIds: string[]
}

export type TaskDagEdgeRecord = {
  id: string
  sourceTaskId: string
  targetTaskId: string
  relatedToSelection: boolean
  activelyBlocking: boolean
  path: string
}

export type TaskDagRenderModel =
  | {
      state: 'loading'
      taskCount: number
      edgeCount: number
      blockedCount: number
    }
  | {
      state: 'error'
      taskCount: number
      edgeCount: number
      blockedCount: number
      message: string
    }
  | {
      state: 'ready'
      taskCount: number
      edgeCount: number
      blockedCount: number
      helperText: string
      emptyDependencies: boolean
      width: number
      height: number
      selectedTaskId: string | null
      relatedTaskIds: Set<string>
      nodes: Array<TaskDagNodeRecord & {
        x: number
        y: number
        width: number
        height: number
        isRoot: boolean
        isBlocked: boolean
        isSelected: boolean
        isRelated: boolean
      }>
      edges: TaskDagEdgeRecord[]
    }

type BuildTaskDagRenderModelArgs = {
  tasks: TaskDagTask[]
  taskDag?: TaskDagGraph | null
  selectedTaskId?: string | null
  isLoading?: boolean
}

const NODE_WIDTH = 280
const NODE_HEIGHT = 136
const HORIZONTAL_GAP = 64
const VERTICAL_GAP = 24
const CANVAS_PADDING = 24

function uniqueEdgeId(sourceTaskId: string, targetTaskId: string) {
  return `${sourceTaskId}->${targetTaskId}`
}

function titleSort(left: TaskDagNodeRecord, right: TaskDagNodeRecord) {
  return left.title.localeCompare(right.title)
}

function taskSort(left: TaskDagTask, right: TaskDagTask) {
  return left.title.localeCompare(right.title)
}

export function buildTaskDagRenderModel({
  tasks,
  taskDag,
  selectedTaskId,
  isLoading = false,
}: BuildTaskDagRenderModelArgs): TaskDagRenderModel {
  if (isLoading) {
    return {
      state: 'loading',
      taskCount: tasks.length,
      edgeCount: taskDag?.edges.length ?? 0,
      blockedCount: taskDag?.blockedTaskIds.length ?? 0,
    }
  }

  const taskMap = new Map(tasks.map((task) => [task.id, task] as const))
  if (taskMap.size !== tasks.length) {
    return {
      state: 'error',
      taskCount: tasks.length,
      edgeCount: taskDag?.edges.length ?? 0,
      blockedCount: taskDag?.blockedTaskIds.length ?? 0,
      message: 'Duplicate task identifiers prevent dependency graph rendering.',
    }
  }

  const nodeMap = new Map<string, TaskDagNodeRecord>()
  const inputNodes = taskDag?.nodes.length
    ? taskDag.nodes
    : tasks.slice().sort(taskSort).map((task) => ({
        taskId: task.id,
        title: task.title,
        role: task.role,
        status: task.status,
        parentTaskId: null,
        dependencyIds: task.dependencyIds,
        dependentTaskIds: [],
        blockedByTaskIds: [],
      }))

  for (const node of inputNodes) {
    nodeMap.set(node.taskId, {
      taskId: node.taskId,
      title: node.title,
      role: node.role,
      status: node.status,
      dependencyIds: [...node.dependencyIds],
      dependentTaskIds: [...node.dependentTaskIds],
      blockedByTaskIds: [...node.blockedByTaskIds],
    })
  }

  for (const task of tasks) {
    const existing = nodeMap.get(task.id)
    if (existing) {
      existing.title = task.title
      existing.role = task.role
      existing.status = task.status
      if (existing.dependencyIds.length === 0 && task.dependencyIds.length > 0) {
        existing.dependencyIds = [...task.dependencyIds]
      }
      continue
    }

    nodeMap.set(task.id, {
      taskId: task.id,
      title: task.title,
      role: task.role,
      status: task.status,
      dependencyIds: [...task.dependencyIds],
      dependentTaskIds: [],
      blockedByTaskIds: [],
    })
  }

  if (nodeMap.size === 0) {
    return {
      state: 'error',
      taskCount: 0,
      edgeCount: 0,
      blockedCount: 0,
      message: 'No task data is available for this graph.',
    }
  }

  const edgeIds = new Set<string>()
  const rawEdges = taskDag?.edges.length
    ? taskDag.edges
    : tasks.flatMap((task) => task.dependencyIds.map((dependencyId) => ({
        id: uniqueEdgeId(dependencyId, task.id),
        sourceTaskId: dependencyId,
        targetTaskId: task.id,
        kind: 'dependency' as const,
      })))

  for (const edge of rawEdges) {
    if (!nodeMap.has(edge.sourceTaskId) || !nodeMap.has(edge.targetTaskId)) {
      continue
    }
    edgeIds.add(uniqueEdgeId(edge.sourceTaskId, edge.targetTaskId))
    const source = nodeMap.get(edge.sourceTaskId)
    const target = nodeMap.get(edge.targetTaskId)
    if (source && !source.dependentTaskIds.includes(edge.targetTaskId)) {
      source.dependentTaskIds.push(edge.targetTaskId)
    }
    if (target && !target.dependencyIds.includes(edge.sourceTaskId)) {
      target.dependencyIds.push(edge.sourceTaskId)
    }
  }

  for (const node of nodeMap.values()) {
    if (node.blockedByTaskIds.length === 0 && node.status === 'blocked') {
      node.blockedByTaskIds = node.dependencyIds.slice()
    }
    node.dependentTaskIds = [...new Set(node.dependentTaskIds)]
    node.dependencyIds = [...new Set(node.dependencyIds.filter((dependencyId) => nodeMap.has(dependencyId)))]
  }

  const nodes = [...nodeMap.values()].sort(titleSort)
  const indegree = new Map(nodes.map((node) => [node.taskId, node.dependencyIds.length] as const))
  const dependentsById = new Map(nodes.map((node) => [node.taskId, [...node.dependentTaskIds].sort()] as const))
  const rootTaskIds = (taskDag?.rootTaskIds.length ? taskDag.rootTaskIds : nodes.filter((node) => node.dependencyIds.length === 0).map((node) => node.taskId))
    .filter((taskId, index, all) => nodeMap.has(taskId) && all.indexOf(taskId) === index)
  const blockedTaskIds = new Set(
    (taskDag?.blockedTaskIds.length ? taskDag.blockedTaskIds : nodes.filter((node) => node.blockedByTaskIds.length > 0).map((node) => node.taskId))
      .filter((taskId) => nodeMap.has(taskId)),
  )

  const queue = rootTaskIds.slice().sort()
  const seen = new Set<string>()
  const orderedTaskIds: string[] = []
  while (queue.length > 0) {
    const taskId = queue.shift()
    if (!taskId || seen.has(taskId)) {
      continue
    }
    seen.add(taskId)
    orderedTaskIds.push(taskId)
    for (const dependentTaskId of dependentsById.get(taskId) ?? []) {
      const nextDegree = (indegree.get(dependentTaskId) ?? 0) - 1
      indegree.set(dependentTaskId, nextDegree)
      if (nextDegree <= 0) {
        queue.push(dependentTaskId)
      }
    }
    queue.sort()
  }

  for (const node of nodes) {
    if (!seen.has(node.taskId)) {
      orderedTaskIds.push(node.taskId)
    }
  }

  const levels = new Map<string, number>()
  for (const taskId of orderedTaskIds) {
    const node = nodeMap.get(taskId)
    if (!node) {
      continue
    }
    const level = node.dependencyIds.reduce((max, dependencyId) => (
      Math.max(max, (levels.get(dependencyId) ?? 0) + 1)
    ), 0)
    levels.set(taskId, level)
  }

  const columns = new Map<number, TaskDagNodeRecord[]>()
  for (const node of nodes) {
    const level = levels.get(node.taskId) ?? 0
    const column = columns.get(level) ?? []
    column.push(node)
    column.sort(titleSort)
    columns.set(level, column)
  }

  const maxColumn = Math.max(...columns.keys(), 0)
  const maxRows = Math.max(...[...columns.values()].map((column) => column.length), 1)
  const width = CANVAS_PADDING * 2 + ((maxColumn + 1) * NODE_WIDTH) + (maxColumn * HORIZONTAL_GAP)
  const height = CANVAS_PADDING * 2 + (maxRows * NODE_HEIGHT) + (Math.max(maxRows - 1, 0) * VERTICAL_GAP)

  const selectedId = selectedTaskId && nodeMap.has(selectedTaskId) ? selectedTaskId : nodes[0]?.taskId ?? null
  const relatedTaskIds = new Set<string>()
  if (selectedId) {
    relatedTaskIds.add(selectedId)
    const selectedNode = nodeMap.get(selectedId)
    for (const dependencyId of selectedNode?.dependencyIds ?? []) {
      relatedTaskIds.add(dependencyId)
    }
    for (const dependentId of selectedNode?.dependentTaskIds ?? []) {
      relatedTaskIds.add(dependentId)
    }
  }

  const positionedNodes = [...columns.entries()]
    .sort(([leftLevel], [rightLevel]) => leftLevel - rightLevel)
    .flatMap(([level, column]) => column.map((node, rowIndex) => ({
      ...node,
      x: CANVAS_PADDING + (level * (NODE_WIDTH + HORIZONTAL_GAP)),
      y: CANVAS_PADDING + (rowIndex * (NODE_HEIGHT + VERTICAL_GAP)),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      isRoot: rootTaskIds.includes(node.taskId),
      isBlocked: blockedTaskIds.has(node.taskId),
      isSelected: node.taskId === selectedId,
      isRelated: selectedId ? relatedTaskIds.has(node.taskId) : false,
    })))

  const positions = new Map(positionedNodes.map((node) => [node.taskId, node] as const))
  const edges = [...edgeIds]
    .map((edgeId) => {
      const [sourceTaskId, targetTaskId] = edgeId.split('->')
      const source = positions.get(sourceTaskId)
      const target = positions.get(targetTaskId)
      if (!source || !target) {
        return null
      }
      const startX = source.x + source.width
      const startY = source.y + (source.height / 2)
      const endX = target.x
      const endY = target.y + (target.height / 2)
      const delta = Math.max((endX - startX) / 2, 24)
      const path = `M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}`
      return {
        id: edgeId,
        sourceTaskId,
        targetTaskId,
        relatedToSelection: Boolean(selectedId && (sourceTaskId === selectedId || targetTaskId === selectedId)),
        activelyBlocking: blockedTaskIds.has(targetTaskId) && (nodeMap.get(targetTaskId)?.blockedByTaskIds.includes(sourceTaskId) ?? false),
        path,
      } satisfies TaskDagEdgeRecord
    })
    .filter((edge): edge is TaskDagEdgeRecord => edge !== null)

  const edgeCount = edges.length
  const blockedCount = blockedTaskIds.size
  const helperText = edgeCount === 0
    ? 'No dependencies yet. All tasks are independent.'
    : blockedCount > 0
      ? 'Execution order and unblock path. Select a task to inspect what is holding it back.'
      : 'Execution order and dependency flow across this run.'

  return {
    state: 'ready',
    taskCount: positionedNodes.length,
    edgeCount,
    blockedCount,
    helperText,
    emptyDependencies: edgeCount === 0,
    width,
    height,
    selectedTaskId: selectedId,
    relatedTaskIds,
    nodes: positionedNodes,
    edges,
  }
}
