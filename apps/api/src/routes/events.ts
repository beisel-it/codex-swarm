import type { FastifyPluginAsync } from "fastify";

import { eventsListQuerySchema } from "../http/schemas.js";

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get("/events", async (request) => {
    const { runId, limit } = eventsListQuerySchema.parse(request.query);
    return app.observability.listEvents(runId, limit);
  });
};
