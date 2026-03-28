import type { FastifyPluginAsync } from "fastify";

export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/metrics", async () => app.observability.getMetrics());
};
