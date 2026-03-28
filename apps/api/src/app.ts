import Fastify from "fastify";
import { ZodError } from "zod";

import { getConfig } from "./config.js";
import { HttpError } from "./lib/http-error.js";
import { authPlugin } from "./plugins/auth.js";
import { dependenciesPlugin } from "./plugins/dependencies.js";
import { agentRoutes } from "./routes/agents.js";
import { approvalRoutes } from "./routes/approvals.js";
import { artifactRoutes } from "./routes/artifacts.js";
import { healthRoutes } from "./routes/health.js";
import { messageRoutes } from "./routes/messages.js";
import { repositoryRoutes } from "./routes/repositories.js";
import { runRoutes } from "./routes/runs.js";
import { taskRoutes } from "./routes/tasks.js";
import { validationRoutes } from "./routes/validations.js";
import type { ControlPlaneService } from "./services/control-plane-service.js";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown_error";
}

interface BuildAppOptions {
  config?: ReturnType<typeof getConfig>;
  controlPlane?: ControlPlaneService;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? getConfig();
  const app = Fastify({
    logger: false
  });

  app.decorate("config", config);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({
        error: error.message,
        details: error.details ?? null
      });

      return;
    }

    if (error instanceof ZodError || (typeof error === "object" && error !== null && "issues" in error)) {
      reply.status(400).send({
        error: "validation_error",
        details: "issues" in error ? error.issues : []
      });

      return;
    }

    if (typeof (error as { statusCode?: number }).statusCode === "number") {
      reply.status((error as { statusCode: number }).statusCode).send({
        error: getErrorMessage(error)
      });

      return;
    }

    reply.status(500).send({
      error: "internal_server_error"
    });
  });

  if (options.controlPlane) {
    app.decorate("controlPlane", options.controlPlane);
  } else {
    await app.register(dependenciesPlugin);
  }

  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(repositoryRoutes, { prefix: "/api/v1" });
  await app.register(runRoutes, { prefix: "/api/v1" });
  await app.register(taskRoutes, { prefix: "/api/v1" });
  await app.register(agentRoutes, { prefix: "/api/v1" });
  await app.register(messageRoutes, { prefix: "/api/v1" });
  await app.register(approvalRoutes, { prefix: "/api/v1" });
  await app.register(validationRoutes, { prefix: "/api/v1" });
  await app.register(artifactRoutes, { prefix: "/api/v1" });

  return app;
}
