import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ControlPlaneService } from "../src/services/control-plane-service.js";
import { buildApp } from "../src/app.js";
import { getConfig } from "../src/config.js";

const observability = {
  beginRequest: vi.fn(),
  clearActorContext: vi.fn(),
  getMetrics: vi.fn(),
  listEvents: vi.fn(),
  recordRecoverableDatabaseFallback: vi.fn(),
  recordRequestFailure: vi.fn(),
  recordTimelineEvent: vi.fn(),
  setActorContext: vi.fn(),
  subscribeToRunEvents: vi.fn(() => () => undefined),
  withTrace: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
};

const actor = {
  principal: "admin@example.com",
  actorId: "user-1",
  actorType: "user" as const,
  email: "admin@example.com",
  role: "workspace_admin" as const,
  roles: ["workspace_admin"] as ["workspace_admin"],
  workspaceId: "default-workspace",
  workspaceName: "Default Workspace",
  teamId: "codex-swarm",
  teamName: "Codex Swarm",
  policyProfile: "standard"
};

const identity = {
  principal: "admin@example.com",
  subject: "user-1",
  email: "admin@example.com",
  roles: ["workspace_admin"],
  workspace: {
    id: "default-workspace",
    name: "Default Workspace"
  },
  team: {
    id: "codex-swarm",
    workspaceId: "default-workspace",
    name: "Codex Swarm"
  },
  actorType: "user" as const
};

const REAL_FRONTEND_DIST_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist");
const BUILT_LANDING_ASSET_PATTERN = /<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"'?#]+)(?:[?#][^"']*)?["']/g;

async function readBuiltLandingAssetPaths() {
  const indexHtml = await readFile(join(REAL_FRONTEND_DIST_ROOT, "index.html"), "utf8");
  const assetPaths = new Set<string>();

  for (const match of indexHtml.matchAll(BUILT_LANDING_ASSET_PATTERN)) {
    const assetPath = match[1] ?? "";

    if (assetPath.startsWith("/")) {
      assetPaths.add(assetPath);
    }
  }

  return [...assetPaths];
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("auth routes", () => {
  it("keeps health public while rejecting protected routes without a valid session", async () => {
    const authService = {
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
      authenticateWithPassword: vi.fn(),
      revokeSession: vi.fn()
    };
    const controlPlane = {
      listRepositories: vi.fn().mockResolvedValue([])
    };
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: false
      }),
      controlPlane: controlPlane as unknown as ControlPlaneService,
      authService: authService as never,
      observability: observability as never
    });

    const health = await app.inject({
      method: "GET",
      url: "/health"
    });
    const repositories = await app.inject({
      method: "GET",
      url: "/api/v1/repositories"
    });
    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session"
    });

    expect(health.statusCode).toBe(200);
    expect(repositories.statusCode).toBe(401);
    expect(session.statusCode).toBe(200);
    expect(session.json()).toEqual({
      authenticated: false,
      identity: null,
      session: null
    });

    await app.close();
  });

  it("logs in with valid credentials, sets the session cookie, and hydrates the identity probe", async () => {
    const authService = {
      authenticateWithPassword: vi.fn().mockResolvedValue({
        actor,
        identity,
        sessionId: "session-1",
        expiresAt: new Date("2026-04-09T12:00:00.000Z"),
        userId: "user-1"
      }),
      getAuthenticatedSession: vi.fn().mockImplementation(async (sessionId: string | null | undefined) => {
        if (sessionId !== "session-1") {
          return null;
        }

        return {
          actor,
          identity,
          sessionId: "session-1",
          expiresAt: new Date("2026-04-09T12:00:00.000Z"),
          userId: "user-1"
        };
      }),
      revokeSession: vi.fn()
    };
    const controlPlane = {
      listRepositories: vi.fn().mockResolvedValue([])
    };
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: false
      }),
      controlPlane: controlPlane as unknown as ControlPlaneService,
      authService: authService as never,
      observability: observability as never
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "admin@example.com",
        password: "correct-horse-battery-staple"
      }
    });

    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toContain("codex_swarm_session=session-1");
    expect(login.json()).toEqual({
      authenticated: true,
      identity,
      session: {
        id: "session-1",
        expiresAt: "2026-04-09T12:00:00.000Z"
      }
    });

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: {
        cookie: "codex_swarm_session=session-1"
      }
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual(identity);

    await app.close();
  });

  it("rejects invalid credentials without leaking account existence", async () => {
    const authService = {
      authenticateWithPassword: vi.fn().mockResolvedValue(null),
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
      revokeSession: vi.fn()
    };
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: false
      }),
      controlPlane: {
        listRepositories: vi.fn().mockResolvedValue([])
      } as unknown as ControlPlaneService,
      authService: authService as never,
      observability: observability as never
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "missing@example.com",
        password: "wrong"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "invalid email or password",
      details: null
    });

    await app.close();
  });

  it("revokes the current session and clears the cookie on logout", async () => {
    const authService = {
      authenticateWithPassword: vi.fn(),
      getAuthenticatedSession: vi.fn().mockResolvedValue({
        actor,
        identity,
        sessionId: "session-1",
        expiresAt: new Date("2026-04-09T12:00:00.000Z"),
        userId: "user-1"
      }),
      revokeSession: vi.fn().mockResolvedValue(undefined)
    };
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: false
      }),
      controlPlane: {
        listRepositories: vi.fn().mockResolvedValue([])
      } as unknown as ControlPlaneService,
      authService: authService as never,
      observability: observability as never
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        cookie: "codex_swarm_session=session-1"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(authService.revokeSession).toHaveBeenCalledWith("session-1");
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");

    await app.close();
  });

  it("allows legacy bearer auth only when the explicit dev flag is enabled", async () => {
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: true,
        DEV_AUTH_TOKEN: "test-token"
      }),
      controlPlane: {
        listRepositories: vi.fn().mockResolvedValue([])
      } as unknown as ControlPlaneService,
      observability: observability as never
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: {
        authorization: "Bearer test-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      principal: "dev-user",
      subject: "dev-user",
      email: null,
      roles: ["platform-admin", "workspace_admin"],
      workspace: {
        id: "default-workspace",
        name: "Default Workspace"
      },
      team: {
        id: "codex-swarm",
        workspaceId: "default-workspace",
        name: "Codex Swarm"
      },
      actorType: "user"
    });

    await app.close();
  });

  it("accepts release service credentials on scoped control-plane routes", async () => {
    const updateRun = vi.fn().mockResolvedValue({
      id: "run-1",
      branchName: "feature/service-auth"
    });
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: false,
        AUTH_SERVICE_TOKEN: "service-token"
      }),
      controlPlane: {
        listRepositories: vi.fn().mockResolvedValue([]),
        updateRun
      } as unknown as ControlPlaneService,
      observability: observability as never
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/runs/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer service-token",
        "x-codex-service-name": "worker"
      },
      payload: {
        branchName: "feature/service-auth"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updateRun).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      expect.objectContaining({
        branchName: "feature/service-auth"
      }),
      expect.objectContaining({
        actorType: "service",
        principal: "control-plane-service:worker",
        actorId: "control-plane-service:worker",
        role: "system",
        roles: ["system", "service"]
      })
    );

    await app.close();
  });

  it("rejects release service credentials on non-service routes", async () => {
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: false,
        AUTH_SERVICE_TOKEN: "service-token"
      }),
      controlPlane: {
        listRepositories: vi.fn().mockResolvedValue([])
      } as unknown as ControlPlaneService,
      observability: observability as never
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: {
        authorization: "Bearer service-token",
        "x-codex-service-name": "local-daemon"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "service credential is not permitted for this route",
      details: null
    });

    await app.close();
  });

  it("rejects invalid release service credentials while legacy dev bearer auth stays disabled", async () => {
    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: false,
        AUTH_SERVICE_TOKEN: "service-token",
        DEV_AUTH_TOKEN: "dev-token"
      }),
      controlPlane: {
        listRepositories: vi.fn().mockResolvedValue([])
      } as unknown as ControlPlaneService,
      observability: observability as never
    });

    const invalidService = await app.inject({
      method: "GET",
      url: "/api/v1/repositories",
      headers: {
        authorization: "Bearer wrong-service-token",
        "x-codex-service-name": "worker"
      }
    });

    const missingServiceName = await app.inject({
      method: "GET",
      url: "/api/v1/repositories",
      headers: {
        authorization: "Bearer service-token"
      }
    });

    const legacyBearer = await app.inject({
      method: "GET",
      url: "/api/v1/repositories",
      headers: {
        authorization: "Bearer dev-token"
      }
    });

    expect(invalidService.statusCode).toBe(401);
    expect(invalidService.json()).toEqual({
      error: "missing or invalid session",
      details: null
    });
    expect(missingServiceName.statusCode).toBe(401);
    expect(missingServiceName.json()).toEqual({
      error: "missing or invalid service credential",
      details: null
    });
    expect(legacyBearer.statusCode).toBe(401);
    expect(legacyBearer.json()).toEqual({
      error: "missing or invalid session",
      details: null
    });

    await app.close();
  });

  it("keeps the landing shell public while requiring a session for operational frontend routes", async () => {
    const frontendRoot = await mkdtemp(join(tmpdir(), "codex-swarm-frontend-dist-"));
    await mkdir(join(frontendRoot, "assets"), { recursive: true });
    await writeFile(
      join(frontendRoot, "index.html"),
      "<!doctype html><html><head><script src=\"/runtime-config.js\"></script><script type=\"module\" crossorigin src=\"/assets/index-public.js\"></script><link rel=\"stylesheet\" crossorigin href=\"/assets/index-public.css\"></head><body>swarm-ui</body></html>"
    );
    await writeFile(join(frontendRoot, "runtime-config.js"), "window.__CODEX_SWARM_CONFIG__ = {\"apiBaseUrl\":\"http://127.0.0.1:3000\"};\n");
    await writeFile(join(frontendRoot, "runtime-config.json"), "{\"apiBaseUrl\":\"http://127.0.0.1:3000\"}\n");
    await writeFile(
      join(frontendRoot, "assets", "index-public.js"),
      "import './landing-chunk.js';\nconsole.log('public asset');\n"
    );
    await writeFile(join(frontendRoot, "assets", "landing-chunk.js"), "console.log('landing chunk');\n");
    await writeFile(
      join(frontendRoot, "assets", "index-public.css"),
      "@font-face{font-family:'Fixture';src:url('/assets/index-public.woff2') format('woff2');}body{font-family:'Fixture';}\n"
    );
    await writeFile(join(frontendRoot, "assets", "index-public.woff2"), "fixture-font\n");
    await writeFile(join(frontendRoot, "assets", "private-shell.js"), "console.log('private shell');\n");

    const authService = {
      authenticateWithPassword: vi.fn(),
      getAuthenticatedSession: vi.fn().mockImplementation(async (sessionId: string | null | undefined) => {
        if (sessionId !== "session-1") {
          return null;
        }

        return {
          actor,
          identity,
          sessionId: "session-1",
          expiresAt: new Date("2026-04-09T12:00:00.000Z"),
          userId: "user-1"
        };
      }),
      revokeSession: vi.fn()
    };

    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: false,
        FRONTEND_DIST_ROOT: frontendRoot
      }),
      controlPlane: {
        listRepositories: vi.fn().mockResolvedValue([])
      } as unknown as ControlPlaneService,
      authService: authService as never,
      observability: observability as never
    });

    try {
      const landing = await app.inject({
        method: "GET",
        url: "/"
      });

      const publicStaticAsset = await app.inject({
        method: "GET",
        url: "/runtime-config.json"
      });

      const publicEntryAsset = await app.inject({
        method: "GET",
        url: "/assets/index-public.js"
      });

      const publicStylesheet = await app.inject({
        method: "GET",
        url: "/assets/index-public.css"
      });

      const publicChunk = await app.inject({
        method: "GET",
        url: "/assets/landing-chunk.js"
      });

      const publicFont = await app.inject({
        method: "GET",
        url: "/assets/index-public.woff2"
      });

      const privateAssetDenied = await app.inject({
        method: "GET",
        url: "/assets/private-shell.js"
      });

      const protectedShellDenied = await app.inject({
        method: "GET",
        url: "/settings"
      });

      const protectedShellAllowed = await app.inject({
        method: "GET",
        url: "/settings",
        headers: {
          cookie: "codex_swarm_session=session-1"
        }
      });

      expect(landing.statusCode).toBe(200);
      expect(landing.body).toContain("swarm-ui");
      expect(publicStaticAsset.statusCode).toBe(200);
      expect(publicStaticAsset.body).toContain("apiBaseUrl");
      expect(publicEntryAsset.statusCode).toBe(200);
      expect(publicEntryAsset.body).toContain("public asset");
      expect(publicStylesheet.statusCode).toBe(200);
      expect(publicStylesheet.body).toContain("Fixture");
      expect(publicChunk.statusCode).toBe(200);
      expect(publicChunk.body).toContain("landing chunk");
      expect(publicFont.statusCode).toBe(200);
      expect(publicFont.body).toContain("fixture-font");
      expect(privateAssetDenied.statusCode).toBe(401);
      expect(privateAssetDenied.json()).toEqual({
        error: "missing or invalid session",
        details: null
      });
      expect(protectedShellDenied.statusCode).toBe(401);
      expect(protectedShellDenied.json()).toEqual({
        error: "missing or invalid session",
        details: null
      });
      expect(protectedShellAllowed.statusCode).toBe(200);
      expect(protectedShellAllowed.body).toContain("swarm-ui");
    } finally {
      await app.close();
      await rm(frontendRoot, { recursive: true, force: true });
    }
  });

  it("serves the real built landing assets anonymously while keeping operational routes session-bound", async () => {
    const builtLandingAssets = await readBuiltLandingAssetPaths();
    const builtEntryAsset = builtLandingAssets.find((assetPath) => assetPath.startsWith("/assets/"));

    expect(builtEntryAsset).toBeTruthy();

    const authService = {
      authenticateWithPassword: vi.fn(),
      getAuthenticatedSession: vi.fn().mockImplementation(async (sessionId: string | null | undefined) => {
        if (sessionId !== "session-1") {
          return null;
        }

        return {
          actor,
          identity,
          sessionId: "session-1",
          expiresAt: new Date("2026-04-09T12:00:00.000Z"),
          userId: "user-1"
        };
      }),
      revokeSession: vi.fn()
    };

    const app = await buildApp({
      config: getConfig({
        NODE_ENV: "test",
        AUTH_ENABLE_LEGACY_DEV_BEARER: false,
        FRONTEND_DIST_ROOT: REAL_FRONTEND_DIST_ROOT
      }),
      controlPlane: {
        listRepositories: vi.fn().mockResolvedValue([])
      } as unknown as ControlPlaneService,
      authService: authService as never,
      observability: observability as never
    });

    try {
      const landing = await app.inject({
        method: "GET",
        url: "/"
      });

      const publicAsset = await app.inject({
        method: "GET",
        url: builtEntryAsset!
      });

      const protectedShellDenied = await app.inject({
        method: "GET",
        url: "/settings"
      });

      const protectedShellAllowed = await app.inject({
        method: "GET",
        url: "/settings",
        headers: {
          cookie: "codex_swarm_session=session-1"
        }
      });

      expect(landing.statusCode).toBe(200);
      expect(landing.body).toContain("<div id=\"root\"></div>");
      expect(publicAsset.statusCode).toBe(200);
      expect(publicAsset.body.length).toBeGreaterThan(0);
      expect(protectedShellDenied.statusCode).toBe(401);
      expect(protectedShellDenied.json()).toEqual({
        error: "missing or invalid session",
        details: null
      });
      expect(protectedShellAllowed.statusCode).toBe(200);
      expect(protectedShellAllowed.body).toContain("<div id=\"root\"></div>");
    } finally {
      await app.close();
    }
  });

});
