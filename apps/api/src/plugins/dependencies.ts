import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

import { createDb, createPool } from "../db/client.js";
import { systemClock } from "../lib/clock.js";
import { ControlPlaneService } from "../services/control-plane-service.js";

declare module "fastify" {
  interface FastifyInstance {
    db: ReturnType<typeof createDb>;
    dbPool: ReturnType<typeof createPool>;
    controlPlane: ControlPlaneService;
    config: ReturnType<typeof import("../config.js").getConfig>;
  }
}

export const dependenciesPlugin = fp(async (app: FastifyInstance) => {
  const pool = createPool(app.config.DATABASE_URL);
  const db = createDb(pool);

  app.decorate("dbPool", pool);
  app.decorate("db", db);
  app.decorate("controlPlane", new ControlPlaneService(db, systemClock));

  app.addHook("onClose", async () => {
    await pool.end();
  });
});
