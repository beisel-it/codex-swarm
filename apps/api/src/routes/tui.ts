import type { FastifyPluginAsync } from "fastify";

import { idParamSchema } from "../http/schemas.js";

export const tuiRoutes: FastifyPluginAsync = async (app) => {
  app.get("/tui/overview", async (request) => {
    return app.controlPlane.getTuiOverview(request.authContext);
  });

  app.get("/tui/runs/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return app.controlPlane.getTuiRunDrilldown(id, request.authContext);
  });
};
