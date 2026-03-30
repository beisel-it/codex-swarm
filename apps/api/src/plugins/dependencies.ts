import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

import { createDb, createPool } from "../db/client.js";
import { ensureControlPlaneCompatibility } from "../db/versioning.js";
import { systemClock } from "../lib/clock.js";
import { ObservabilityService } from "../lib/observability.js";
import { createShellProviderHandoffAdapter } from "../lib/provider-handoff.js";
import { ControlPlaneService } from "../services/control-plane-service.js";

declare module "fastify" {
  interface FastifyInstance {
    db: ReturnType<typeof createDb>;
    dbPool: ReturnType<typeof createPool>;
    controlPlane: ControlPlaneService;
    config: ReturnType<typeof import("../config.js").getConfig>;
    observability: ObservabilityService;
  }
}

export const dependenciesPlugin = fp(async (app: FastifyInstance) => {
  const pool = createPool(app.config.DATABASE_URL);
  await ensureControlPlaneCompatibility(
    pool,
    app.config.CONTROL_PLANE_SCHEMA_VERSION,
    app.config.CONTROL_PLANE_CONFIG_VERSION
  );
  const db = createDb(pool);
  const observability = new ObservabilityService(db, systemClock, app.config);

  app.decorate("dbPool", pool);
  app.decorate("db", db);
  app.decorate("observability", observability);
  app.decorate("controlPlane", new ControlPlaneService(db, systemClock, {
    providerHandoff: createShellProviderHandoffAdapter({
      gitCommand: app.config.GIT_COMMAND,
      ghCommand: app.config.GITHUB_CLI_COMMAND
    })
  }));

  app.addHook("onRequest", async (request, reply) => {
    observability.beginRequest(request, reply);
  });

  app.addHook("onError", async (_request, _reply, error) => {
    observability.recordRequestFailure(error);
  });

  app.addHook("onClose", async () => {
    await pool.end();
  });
});
