export type ProjectRecord = {
  id: string
  name: string
  summary: string
  repositoryIds: string[]
  createdAt: string
  updatedAt: string
}

export type ProjectRepository = {
  id: string
  name: string
  provider: string
  url: string
  localPath: string | null
}

export type ProjectRun = {
  id: string
  repositoryId: string
  projectId?: string | null
  goal: string
  status: string
  createdAt: string
  updatedAt: string
}

export type ProjectSummary = {
  project: ProjectRecord
  repositories: ProjectRepository[]
  runs: ProjectRun[]
  activeRuns: ProjectRun[]
  completedRuns: number
  lastRun: ProjectRun | null
}

export type AdHocWorkspaceSummary = {
  repositories: ProjectRepository[]
  runs: ProjectRun[]
}

export function normalizeProjects(projects: ProjectRecord[]): ProjectRecord[] {
  return projects.map((project) => ({
    ...project,
    name: project.name.trim(),
    summary: project.summary.trim(),
    repositoryIds: [...new Set(project.repositoryIds.filter(Boolean))],
  }))
}

export function deriveProjectSummaries(
  projects: ProjectRecord[],
  repositories: ProjectRepository[],
  runs: ProjectRun[],
): ProjectSummary[] {
  const repositoryById = new Map(repositories.map((repository) => [repository.id, repository] as const))

  return normalizeProjects(projects)
    .map((project) => {
      const projectRepositories = project.repositoryIds
        .map((repositoryId) => repositoryById.get(repositoryId))
        .filter((repository): repository is ProjectRepository => repository !== undefined)
      const repositoryIdSet = new Set(projectRepositories.map((repository) => repository.id))
      const projectRuns = runs
        .filter((run) => run.projectId === project.id || (!run.projectId && repositoryIdSet.has(run.repositoryId)))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

      return {
        project,
        repositories: projectRepositories,
        runs: projectRuns,
        activeRuns: projectRuns.filter((run) =>
          run.status === 'pending'
          || run.status === 'planning'
          || run.status === 'in_progress'
          || run.status === 'awaiting_approval',
        ),
        completedRuns: projectRuns.filter((run) => run.status === 'completed').length,
        lastRun: projectRuns[0] ?? null,
      }
    })
    .sort((left, right) => {
      const leftTimestamp = left.lastRun?.updatedAt ?? left.project.updatedAt
      const rightTimestamp = right.lastRun?.updatedAt ?? right.project.updatedAt
      return rightTimestamp.localeCompare(leftTimestamp) || left.project.name.localeCompare(right.project.name)
    })
}

export function deriveAdHocWorkspace(
  projects: ProjectRecord[],
  repositories: ProjectRepository[],
  runs: ProjectRun[],
): AdHocWorkspaceSummary {
  const assignedRepositoryIds = new Set(normalizeProjects(projects).flatMap((project) => project.repositoryIds))
  const adHocRepositories = repositories
    .filter((repository) => !assignedRepositoryIds.has(repository.id))
    .sort((left, right) => left.name.localeCompare(right.name))
  const adHocRepositoryIds = new Set(adHocRepositories.map((repository) => repository.id))
  const adHocRuns = runs
    .filter((run) => !run.projectId && adHocRepositoryIds.has(run.repositoryId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  return {
    repositories: adHocRepositories,
    runs: adHocRuns,
  }
}

export function buildSeedProjects(repositories: ProjectRepository[]): ProjectRecord[] {
  const seedRepository = repositories[0]
  if (!seedRepository) {
    return []
  }

  const timestamp = new Date().toISOString()
  return [
    {
      id: `project-${seedRepository.id}`,
      name: `${seedRepository.name} Project`,
      summary: 'Primary workspace for linked repos, active runs, and historical job context.',
      repositoryIds: [seedRepository.id],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]
}
