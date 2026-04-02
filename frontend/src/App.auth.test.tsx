// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MockResponseFactory = (request: {
  method: string
  url: URL
  bodyText: string
}) => Response | Promise<Response>

const identity = {
  principal: 'admin@example.com',
  subject: 'Ada Admin',
  email: 'admin@example.com',
  roles: ['workspace_admin'],
  workspace: {
    id: 'workspace-1',
    name: 'Default Workspace',
  },
  team: {
    id: 'team-1',
    workspaceId: 'workspace-1',
    name: 'Codex Swarm',
  },
  actorType: 'user' as const,
}

const governance = {
  generatedAt: '2026-04-02T10:00:00.000Z',
  approvals: {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  },
  policies: {
    repositoryProfiles: [],
  },
  secrets: {
    sourceMode: 'environment' as const,
    provider: null,
    allowedRepositoryTrustLevels: ['trusted', 'sandboxed'],
  },
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
    ...init,
  })
}

function noContentResponse() {
  return new Response(null, { status: 204 })
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.trim().includes(label),
  ) as HTMLButtonElement | undefined
}

function findInput(container: HTMLElement, name: string) {
  return container.querySelector(`input[name="${name}"]`) as HTMLInputElement | null
}

function dispatchInput(element: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

async function mountApp(options: {
  handlers: Record<string, MockResponseFactory>
  pathname?: string
}) {
  vi.resetModules()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
  window.history.replaceState({}, '', options.pathname ?? '/')
  document.body.innerHTML = '<div id="root"></div>'
  window.__CODEX_SWARM_CONFIG__ = {
    apiBaseUrl: 'http://api.test',
    apiToken: 'release-token-should-not-be-used',
    enableLegacyDevBearer: false,
  }

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const bodyText = typeof init?.body === 'string' ? init.body : ''
    const fullKey = `${method} ${requestUrl.pathname}${requestUrl.search}`
    const shortKey = `${method} ${requestUrl.pathname}`
    const handler = options.handlers[fullKey] ?? options.handlers[shortKey]

    if (!handler) {
      throw new Error(`Unhandled fetch: ${fullKey}`)
    }

    return handler({
      method,
      url: requestUrl,
      bodyText,
    })
  })

  vi.stubGlobal('fetch', fetchMock)

  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ThemeProvider } = await import('./theme-provider.tsx')
  const { default: App } = await import('./App.tsx')

  const container = document.getElementById('root') as HTMLElement
  const root = createRoot(container)

  await React.act(async () => {
    root.render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    )
    await flushPromises()
  })

  return {
    container,
    fetchMock,
    root,
    act: React.act,
  }
}

function authenticatedHandlers(overrides?: Partial<Record<string, MockResponseFactory>>): Record<string, MockResponseFactory> {
  return {
    'GET /api/v1/auth/session': () => jsonResponse({
      authenticated: true,
      identity,
      session: {
        id: 'session-1',
        expiresAt: '2026-04-09T12:00:00.000Z',
      },
    }),
    'GET /api/v1/projects': () => jsonResponse([]),
    'GET /api/v1/project-teams': () => jsonResponse([]),
    'GET /api/v1/repositories': () => jsonResponse([]),
    'GET /api/v1/runs': () => jsonResponse([]),
    'GET /api/v1/worker-nodes': () => jsonResponse([]),
    'GET /api/v1/repeatable-runs': () => jsonResponse([]),
    'GET /api/v1/repeatable-run-triggers': () => jsonResponse([]),
    'GET /api/v1/external-event-receipts': () => jsonResponse([]),
    'GET /api/v1/team-blueprints': () => jsonResponse([]),
    'GET /api/v1/admin/governance-report': () => jsonResponse(governance),
    ...overrides,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('App auth flow', () => {
  it('shows the login screen when no session is present and does not inject the legacy bearer token in release mode', async () => {
    const { container, fetchMock } = await mountApp({
      handlers: {
        'GET /api/v1/auth/session': () => jsonResponse({
          authenticated: false,
          identity: null,
          session: null,
        }),
      },
    })

    expect(container.textContent).toContain('Sign in')
    expect(container.textContent).not.toContain('Operator Console')

    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    expect(firstCall?.[1]?.credentials).toBe('include')
    const headers = new Headers(firstCall?.[1]?.headers)
    expect(headers.has('Authorization')).toBe(false)
  })

  it('hydrates the protected shell from the authenticated session probe', async () => {
    const { container } = await mountApp({
      handlers: authenticatedHandlers(),
    })

    expect(container.textContent).toContain('Operator Console')
    expect(container.textContent).toContain('Ada Admin')
    expect(container.textContent).not.toContain('Sign in')
  })

  it('handles invalid credentials, signs in successfully, and logs out back to the login view', async () => {
    let loginAttempts = 0
    const { act, container } = await mountApp({
      handlers: {
        ...authenticatedHandlers(),
        'GET /api/v1/auth/session': () => jsonResponse({
          authenticated: false,
          identity: null,
          session: null,
        }),
        'POST /api/v1/auth/login': ({ bodyText }) => {
          loginAttempts += 1
          const body = JSON.parse(bodyText) as { email: string; password: string }
          if (body.password !== 'correct-horse-battery-staple') {
            return jsonResponse({
              error: 'invalid email or password',
            }, { status: 401 })
          }

          return jsonResponse({
            authenticated: true,
            identity,
            session: {
              id: 'session-1',
              expiresAt: '2026-04-09T12:00:00.000Z',
            },
          })
        },
        'POST /api/v1/auth/logout': () => noContentResponse(),
      },
    })

    const emailInput = findInput(container, 'email')
    const passwordInput = findInput(container, 'password')
    const signInButton = findButton(container, 'Sign in')
    const loginForm = container.querySelector('form')

    expect(emailInput).not.toBeNull()
    expect(passwordInput).not.toBeNull()
    expect(signInButton).toBeDefined()
    expect(loginForm).not.toBeNull()

    await act(async () => {
      dispatchInput(emailInput!, 'admin@example.com')
      dispatchInput(passwordInput!, 'wrong-password')
      await flushPromises()
    })

    await act(async () => {
      loginForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flushPromises()
    })

    expect(container.textContent).toContain('invalid email or password')

    await act(async () => {
      dispatchInput(passwordInput!, 'correct-horse-battery-staple')
      await flushPromises()
    })

    await act(async () => {
      loginForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flushPromises()
    })

    expect(loginAttempts).toBe(2)
    expect(container.textContent).toContain('Operator Console')

    const logoutButton = findButton(container, 'Log out')
    expect(logoutButton).toBeDefined()

    await act(async () => {
      logoutButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    expect(container.textContent).toContain('Sign in')
    expect(container.textContent).not.toContain('Operator Console')
  })

  it('returns to the login screen when an authenticated run stream encounters an expired session', async () => {
    const run = {
      id: 'run-1',
      repositoryId: 'repo-1',
      projectId: null,
      projectTeamId: null,
      projectTeamName: null,
      goal: 'Inspect release auth',
      status: 'in_progress',
      branchName: 'main',
      planArtifactPath: null,
      publishedBranch: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      handoffStatus: 'pending',
      handoff: {
        mode: 'manual',
        provider: null,
        baseBranch: null,
        autoPublishBranch: false,
        autoCreatePullRequest: false,
        titleTemplate: null,
        bodyTemplate: null,
      },
      createdBy: 'Ada Admin',
      createdAt: '2026-04-02T10:00:00.000Z',
      updatedAt: '2026-04-02T10:05:00.000Z',
      context: {},
      metadata: {},
    }

    const { container } = await mountApp({
      pathname: '/runs/run-1/overview',
      handlers: authenticatedHandlers({
        'GET /api/v1/repositories': () => jsonResponse([{
          id: 'repo-1',
          name: 'codex-swarm',
          url: 'https://example.com/codex-swarm',
          provider: 'github',
          defaultBranch: 'main',
          localPath: '/tmp/codex-swarm',
          trustLevel: 'trusted',
        }]),
        'GET /api/v1/runs': () => jsonResponse([run]),
        'GET /api/v1/runs/run-1': () => jsonResponse({
          ...run,
          tasks: [],
          agents: [],
          sessions: [],
          taskDag: null,
        }),
        'GET /api/v1/approvals?runId=run-1': () => jsonResponse([]),
        'GET /api/v1/validations?runId=run-1': () => jsonResponse([]),
        'GET /api/v1/artifacts?runId=run-1': () => jsonResponse([]),
        'GET /api/v1/messages?runId=run-1': () => jsonResponse([]),
        'GET /api/v1/events?runId=run-1': () => jsonResponse([]),
        'GET /api/v1/runs/run-1/stream': () => jsonResponse({
          error: 'Authentication required',
        }, { status: 401 }),
      }),
    })

    await flushPromises()

    expect(container.textContent).toContain('Sign in')
    expect(container.textContent).toContain('Your session expired. Sign in again.')
  })
})
