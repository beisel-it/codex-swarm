import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { ActorIdentity, GovernanceRole } from "@codex-swarm/contracts";
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
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request: FastifyRequest) => {
    app.observability.clearActorContext();

    if (request.url === "/health" || request.url.startsWith("/webhooks/") || request.url.startsWith("/api/v1/webhooks/")) {
      request.authContext = {
        principal: request.url === "/health" ? "system" : "webhook-ingress",
        actorId: request.url === "/health" ? "system" : "webhook-ingress",
        actorType: request.url === "/health" ? "system" : "service",
        email: null,
        role: request.url === "/health" ? "system" : "service",
        roles: request.url === "/health" ? ["system"] : ["service"],
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
    const expected = `Bearer ${app.config.DEV_AUTH_TOKEN}`;

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
