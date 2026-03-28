import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { HttpError } from "../lib/http-error.js";

declare module "fastify" {
  interface FastifyRequest {
    authContext: {
      principal: string;
    };
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request: FastifyRequest) => {
    if (request.url === "/health") {
      request.authContext = {
        principal: "system"
      };

      return;
    }

    const authorization = request.headers.authorization;
    const expected = `Bearer ${app.config.DEV_AUTH_TOKEN}`;

    if (authorization !== expected) {
      throw new HttpError(401, "missing or invalid bearer token");
    }

    request.authContext = {
      principal: "dev-user"
    };
  });
});
