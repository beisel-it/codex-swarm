import type { FastifyPluginAsync } from "fastify";

import { agentTeamBlueprints } from "../lib/team-templates.js";

export const teamBlueprintRoutes: FastifyPluginAsync = async (app) => {
  app.get("/team-blueprints", async () => {
    return agentTeamBlueprints;
  });

  app.get("/team-templates", async () => {
    return agentTeamBlueprints;
  });
};
