import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { parseCookies, serializeCookie } from "../lib/http-cookies.js";
import { HttpError } from "../lib/http-error.js";

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function buildCookie(app: Parameters<FastifyPluginAsync>[0], value: string, maxAge: number) {
  return serializeCookie(app.config.AUTH_SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: app.config.AUTH_SESSION_COOKIE_SAME_SITE,
    ...(typeof app.config.AUTH_SESSION_COOKIE_SECURE === "boolean"
      ? { secure: app.config.AUTH_SESSION_COOKIE_SECURE }
      : {})
  });
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/auth/session", async (request) => {
    if (!app.hasDecorator("authService") || !request.authSessionId) {
      return {
        authenticated: false,
        identity: null,
        session: null
      };
    }

    const authenticatedSession = await app.authService.getAuthenticatedSession(request.authSessionId);

    if (!authenticatedSession) {
      return {
        authenticated: false,
        identity: null,
        session: null
      };
    }

    return {
      authenticated: true,
      identity: authenticatedSession.identity,
      session: {
        id: authenticatedSession.sessionId,
        expiresAt: authenticatedSession.expiresAt.toISOString()
      }
    };
  });

  app.post("/auth/login", async (request, reply) => {
    if (!app.hasDecorator("authService")) {
      throw new HttpError(503, "auth service unavailable");
    }

    const body = loginBodySchema.parse(request.body);
    const authenticatedSession = await app.authService.authenticateWithPassword(body.email, body.password);

    if (!authenticatedSession) {
      throw new HttpError(401, "invalid email or password");
    }

    reply.header("set-cookie", buildCookie(app, authenticatedSession.sessionId, app.config.AUTH_SESSION_TTL_SECONDS));

    return {
      authenticated: true,
      identity: authenticatedSession.identity,
      session: {
        id: authenticatedSession.sessionId,
        expiresAt: authenticatedSession.expiresAt.toISOString()
      }
    };
  });

  app.post("/auth/logout", async (request, reply) => {
    if (app.hasDecorator("authService")) {
      const sessionId = request.authSessionId
        ?? parseCookies(request.headers.cookie)?.[app.config.AUTH_SESSION_COOKIE_NAME]
        ?? null;
      await app.authService.revokeSession(sessionId);
    }

    reply.header("set-cookie", buildCookie(app, "", 0));
    return reply.code(204).send();
  });
};
