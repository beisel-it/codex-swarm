import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { ActorIdentity, GovernanceRole } from "@codex-swarm/contracts";
import { normalizeFrontendPath } from "../lib/frontend-route-access.js";
import { parseCookies } from "../lib/http-cookies.js";
import { HttpError } from "../lib/http-error.js";

function parseRoles(
  explicitRole: string | undefined,
  headerValue: string | undefined,
  fallbackRoles: string[],
  fallbackRole: string
): { primaryRole: GovernanceRole; roles: GovernanceRole[] } {
  const headerRoles = (headerValue ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const primaryRole = (explicitRole ?? headerRoles[0] ?? fallbackRole) as GovernanceRole;
  const seededRoles = explicitRole
    ? headerRoles.length > 0
      ? [primaryRole, ...headerRoles]
      : [primaryRole]
    : headerRoles.length > 0
      ? [primaryRole, ...headerRoles]
      : [primaryRole, ...fallbackRoles];

  return {
    primaryRole,
    roles: [...new Set(seededRoles)] as GovernanceRole[]
  };
}

declare module "fastify" {
  interface FastifyRequest {
    authContext: ActorIdentity;
    authSessionId?: string | null;
  }
}

const anonymousActor: ActorIdentity = {
  principal: "anonymous",
  actorId: "anonymous",
  actorType: "service",
  email: null,
  role: "service",
  roles: ["service"],
  workspaceId: null,
  workspaceName: null,
  teamId: null,
  teamName: null,
  policyProfile: null
};

function isPublicRoute(request: FastifyRequest) {
  const pathname = normalizeFrontendPath(request.url);
  const isPublicFrontendRoute =
    (request.method === "GET" || request.method === "HEAD")
    && !pathname.startsWith("/api/")
    && !pathname.startsWith("/metrics")
    && request.server.frontendRouteAccess.isPublicPath(pathname);

  return isPublicFrontendRoute
    || pathname === "/health"
    || pathname.startsWith("/api/v1/webhooks/")
    || pathname.startsWith("/webhooks/");
}

function isPublicAuthRoute(request: FastifyRequest) {
  const pathname = normalizeFrontendPath(request.url);

  return pathname === "/api/v1/auth/login"
    || pathname === "/api/v1/auth/logout"
    || pathname === "/api/v1/auth/session";
}

function isServiceRoute(request: FastifyRequest) {
  const pathname = normalizeFrontendPath(request.url);

  if (pathname === "/api/v1/repositories" && request.method === "GET") {
    return true;
  }

  if (pathname === "/api/v1/runs" && request.method === "GET") {
    return true;
  }

  if (pathname.startsWith("/api/v1/runs/") && request.method === "GET") {
    return true;
  }

  if (pathname.startsWith("/api/v1/runs/") && request.method === "PATCH") {
    return true;
  }

  if (pathname.startsWith("/api/v1/runs/") && request.method === "POST") {
    return pathname.endsWith("/budget-checkpoints")
      || pathname.endsWith("/publish-branch")
      || pathname.endsWith("/pull-request-handoff");
  }

  if (pathname === "/api/v1/messages" && request.method === "GET") {
    return true;
  }

  if (pathname === "/api/v1/messages" && request.method === "POST") {
    return true;
  }

  if (pathname === "/api/v1/validations" && request.method === "GET") {
    return true;
  }

  if (pathname === "/api/v1/validations" && request.method === "POST") {
    return true;
  }

  if (pathname === "/api/v1/artifacts" && request.method === "GET") {
    return true;
  }

  if (pathname === "/api/v1/artifacts" && request.method === "POST") {
    return true;
  }

  if (pathname === "/api/v1/agents" && request.method === "POST") {
    return true;
  }

  if (pathname.startsWith("/api/v1/agents/") && request.method === "POST" && pathname.endsWith("/session")) {
    return true;
  }

  if (pathname === "/api/v1/tasks" && request.method === "POST") {
    return true;
  }

  if (pathname.startsWith("/api/v1/tasks/") && request.method === "PATCH" && pathname.endsWith("/status")) {
    return true;
  }

  if (pathname.startsWith("/api/v1/sessions/") && request.method === "POST" && pathname.endsWith("/transcript")) {
    return true;
  }

  if (pathname === "/api/v1/worker-nodes" && (request.method === "GET" || request.method === "POST")) {
    return true;
  }

  if (pathname.startsWith("/api/v1/worker-nodes/") && (request.method === "PATCH" || request.method === "POST")) {
    return true;
  }

  if (pathname === "/api/v1/worker-dispatch-assignments" && request.method === "GET") {
    return true;
  }

  if (pathname.startsWith("/api/v1/worker-dispatch-assignments/") && (request.method === "PATCH" || request.method === "POST")) {
    return true;
  }

  return false;
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request: FastifyRequest) => {
    app.observability.clearActorContext();
    const pathname = normalizeFrontendPath(request.url);

    if (isPublicRoute(request)) {
      request.authContext = {
        principal: pathname === "/health" ? "system" : pathname.startsWith("/webhooks/") || pathname.startsWith("/api/v1/webhooks/") ? "webhook-ingress" : "frontend-public",
        actorId: pathname === "/health" ? "system" : pathname.startsWith("/webhooks/") || pathname.startsWith("/api/v1/webhooks/") ? "webhook-ingress" : "frontend-public",
        actorType: pathname === "/health" ? "system" : "service",
        email: null,
        role: pathname === "/health" ? "system" : "service",
        roles: pathname === "/health" ? ["system"] : ["service"],
        workspaceId: null,
        workspaceName: null,
        teamId: null,
        teamName: null,
        policyProfile: null
      };
      app.observability.setActorContext(request.authContext);

      return;
    }

    const authorization = request.headers.authorization;
    const serviceToken = app.config.AUTH_SERVICE_TOKEN;
    const expectedServiceAuthorization = serviceToken ? `Bearer ${serviceToken}` : null;

    if (expectedServiceAuthorization && authorization === expectedServiceAuthorization) {
      const serviceName = request.headers["x-codex-service-name"]?.toString().trim();

      if (!serviceName) {
        throw new HttpError(401, "missing or invalid service credential");
      }

      if (!isServiceRoute(request)) {
        throw new HttpError(403, "service credential is not permitted for this route");
      }

      request.authContext = {
        principal: `${app.config.AUTH_SERVICE_PRINCIPAL}:${serviceName}`,
        actorId: `${app.config.AUTH_SERVICE_ACTOR_ID}:${serviceName}`,
        actorType: "service",
        email: null,
        role: "system",
        roles: ["system", "service"],
        workspaceId: app.config.AUTH_SERVICE_WORKSPACE_ID,
        workspaceName: app.config.AUTH_SERVICE_WORKSPACE_NAME,
        teamId: app.config.AUTH_SERVICE_TEAM_ID,
        teamName: app.config.AUTH_SERVICE_TEAM_NAME,
        policyProfile: app.config.AUTH_SERVICE_POLICY_PROFILE
      };
      request.authSessionId = null;
      app.observability.setActorContext(request.authContext);
      return;
    }

    const resolvedSession = app.hasDecorator("authService")
      ? await app.authService.getAuthenticatedSession(
        parseCookies(request.headers.cookie)?.[app.config.AUTH_SESSION_COOKIE_NAME]
      )
      : null;

    if (resolvedSession) {
      request.authContext = resolvedSession.actor;
      request.authSessionId = resolvedSession.sessionId;
      app.observability.setActorContext(request.authContext);
      return;
    }

    if (isPublicAuthRoute(request)) {
      request.authContext = anonymousActor;
      request.authSessionId = null;
      app.observability.setActorContext(request.authContext);
      return;
    }

    const expected = `Bearer ${app.config.DEV_AUTH_TOKEN}`;

    if (!app.config.AUTH_ENABLE_LEGACY_DEV_BEARER) {
      throw new HttpError(401, "missing or invalid session");
    }

    if (authorization !== expected) {
      throw new HttpError(401, "missing or invalid bearer token");
    }

    const { primaryRole, roles } = parseRoles(
      request.headers["x-codex-role"]?.toString(),
      request.headers["x-codex-roles"]?.toString(),
      app.config.DEV_AUTH_ROLES,
      app.config.DEV_AUTH_ROLE
    );

    request.authContext = {
      principal: request.headers["x-codex-principal"]?.toString() ?? app.config.DEV_AUTH_PRINCIPAL,
      actorId: request.headers["x-codex-actor-id"]?.toString() ?? app.config.DEV_AUTH_ACTOR_ID,
      actorType:
        request.headers["x-codex-actor-type"]?.toString() === "service"
        || request.headers["x-codex-actor-type"]?.toString() === "system"
          ? request.headers["x-codex-actor-type"]?.toString() as "service" | "system"
          : "user",
      email: request.headers["x-codex-email"]?.toString() ?? app.config.DEV_AUTH_EMAIL ?? null,
      role: primaryRole,
      roles,
      workspaceId: request.headers["x-codex-workspace-id"]?.toString() ?? app.config.DEV_AUTH_WORKSPACE_ID,
      workspaceName: request.headers["x-codex-workspace-name"]?.toString() ?? app.config.DEV_AUTH_WORKSPACE_NAME,
      teamId: request.headers["x-codex-team-id"]?.toString() ?? app.config.DEV_AUTH_TEAM_ID,
      teamName: request.headers["x-codex-team-name"]?.toString() ?? app.config.DEV_AUTH_TEAM_NAME,
      policyProfile: request.headers["x-codex-policy-profile"]?.toString() ?? app.config.DEV_AUTH_POLICY_PROFILE
    };
    app.observability.setActorContext(request.authContext);
  });
});
