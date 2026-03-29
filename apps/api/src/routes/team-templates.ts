import type { FastifyPluginAsync } from "fastify";

import { agentTeamTemplates } from "../lib/team-templates.js";

export const teamTemplateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/team-templates", async () => {
    return agentTeamTemplates;
  });
};
