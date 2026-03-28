import type { FastifyPluginAsync } from "fastify";

import type { IdentityEntrypoint } from "@codex-swarm/contracts";

export const identityRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (request): Promise<IdentityEntrypoint> => ({
    principal: request.authContext.principal,
    subject: request.authContext.actorId,
    email: request.authContext.email,
    roles: [request.authContext.role],
    workspace: {
      id: request.authContext.workspaceId ?? "unknown-workspace",
      name: request.authContext.workspaceName ?? request.authContext.workspaceId ?? "Unknown Workspace"
    },
    team: {
      id: request.authContext.teamId ?? "unknown-team",
      workspaceId: request.authContext.workspaceId ?? "unknown-workspace",
      name: request.authContext.teamName ?? request.authContext.teamId ?? "Unknown Team"
    },
    actorType: request.authContext.actorType
  }));
};
