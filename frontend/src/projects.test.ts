import { describe, expect, it } from 'vitest'
import { buildSeedProjects, deriveAdHocWorkspace, deriveProjectSummaries, normalizeProjects, type ProjectRecord, type ProjectRepository, type ProjectRun } from './projects'

const repositories: ProjectRepository[] = [
  {
    id: 'repo-app',
    name: 'app',
    provider: 'github',
    url: 'https://example.com/app',
    localPath: '/tmp/app',
  },
  {
    id: 'repo-docs',
    name: 'docs',
    provider: 'gitlab',
    url: 'https://example.com/docs',
    localPath: null,
  },
]

const runs: ProjectRun[] = [
  {
    id: 'run-latest',
    repositoryId: 'repo-app',
    goal: 'Latest app run',
    status: 'in_progress',
    createdAt: '2026-03-29T09:00:00.000Z',
    updatedAt: '2026-03-30T09:00:00.000Z',
  },
  {
    id: 'run-complete',
    repositoryId: 'repo-app',
    goal: 'Completed app run',
    status: 'completed',
    createdAt: '2026-03-28T09:00:00.000Z',
    updatedAt: '2026-03-28T11:00:00.000Z',
  },
  {
    id: 'run-adhoc',
    repositoryId: 'repo-docs',
    goal: 'Docs run',
    status: 'awaiting_approval',
    createdAt: '2026-03-30T10:00:00.000Z',
    updatedAt: '2026-03-30T10:15:00.000Z',
  },
]

describe('project helpers', () => {
  it('normalizes duplicate repository links', () => {
    const normalized = normalizeProjects([
      {
        id: 'project-app',
        name: ' App ',
        summary: ' Summary ',
        repositoryIds: ['repo-app', 'repo-app', ''],
        createdAt: '2026-03-30T08:00:00.000Z',
        updatedAt: '2026-03-30T08:00:00.000Z',
      },
    ])

    expect(normalized[0]).toMatchObject({
      name: 'App',
      summary: 'Summary',
      repositoryIds: ['repo-app'],
    })
  })

  it('derives project and ad hoc groupings from repository ownership', () => {
    const projects: ProjectRecord[] = [
      {
        id: 'project-app',
        name: 'App',
        summary: 'Core delivery workspace',
        repositoryIds: ['repo-app'],
        createdAt: '2026-03-30T08:00:00.000Z',
        updatedAt: '2026-03-30T08:00:00.000Z',
      },
    ]

    const summaries = deriveProjectSummaries(projects, repositories, runs)
    const adHoc = deriveAdHocWorkspace(projects, repositories, runs)

    expect(summaries).toHaveLength(1)
    expect(summaries[0].repositories.map((repository) => repository.id)).toEqual(['repo-app'])
    expect(summaries[0].runs.map((run) => run.id)).toEqual(['run-latest', 'run-complete'])
    expect(summaries[0].activeRuns.map((run) => run.id)).toEqual(['run-latest'])
    expect(summaries[0].completedRuns).toBe(1)
    expect(summaries[0].lastRun?.id).toBe('run-latest')

    expect(adHoc.repositories.map((repository) => repository.id)).toEqual(['repo-docs'])
    expect(adHoc.runs.map((run) => run.id)).toEqual(['run-adhoc'])
  })

  it('builds a default seed project from the first repository', () => {
    const seeded = buildSeedProjects(repositories)

    expect(seeded).toHaveLength(1)
    expect(seeded[0].repositoryIds).toEqual(['repo-app'])
    expect(seeded[0].name).toBe('app Project')
  })
})
