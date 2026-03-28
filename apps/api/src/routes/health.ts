import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    status: "ok",
    versions: {
      schema: app.config.CONTROL_PLANE_SCHEMA_VERSION,
      config: app.config.CONTROL_PLANE_CONFIG_VERSION
    }
  }));
};
