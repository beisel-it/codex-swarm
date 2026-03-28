import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { ActorIdentity } from "@codex-swarm/contracts";
import { HttpError } from "../lib/http-error.js";

declare module "fastify" {
  interface FastifyRequest {
    authContext: ActorIdentity;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request: FastifyRequest) => {
    app.observability.clearActorContext();

    if (request.url === "/health") {
      request.authContext = {
        principal: "system",
        actorId: "system",
        actorType: "system",
        email: null,
        role: "system",
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

    request.authContext = {
      principal: request.headers["x-codex-principal"]?.toString() ?? app.config.DEV_AUTH_PRINCIPAL,
      actorId: request.headers["x-codex-actor-id"]?.toString() ?? app.config.DEV_AUTH_ACTOR_ID,
      actorType:
        request.headers["x-codex-actor-type"]?.toString() === "service"
        || request.headers["x-codex-actor-type"]?.toString() === "system"
          ? request.headers["x-codex-actor-type"]?.toString() as "service" | "system"
          : "user",
      email: request.headers["x-codex-email"]?.toString() ?? app.config.DEV_AUTH_EMAIL ?? null,
      role: request.headers["x-codex-role"]?.toString() ?? app.config.DEV_AUTH_ROLE,
      workspaceId: request.headers["x-codex-workspace-id"]?.toString() ?? app.config.DEV_AUTH_WORKSPACE_ID,
      workspaceName: request.headers["x-codex-workspace-name"]?.toString() ?? app.config.DEV_AUTH_WORKSPACE_NAME,
      teamId: request.headers["x-codex-team-id"]?.toString() ?? app.config.DEV_AUTH_TEAM_ID,
      teamName: request.headers["x-codex-team-name"]?.toString() ?? app.config.DEV_AUTH_TEAM_NAME,
      policyProfile: request.headers["x-codex-policy-profile"]?.toString() ?? app.config.DEV_AUTH_POLICY_PROFILE
    };
    app.observability.setActorContext(request.authContext);
  });
});
