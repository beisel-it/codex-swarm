import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]) {
  if (!origin) {
    return false;
  }

  if (allowedOrigins.length === 0) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function getCorsHeaders(
  request: FastifyRequest,
  allowedOrigins: string[],
): Record<string, string> | null {
  const origin = request.headers.origin;

  if (!isOriginAllowed(origin, allowedOrigins)) {
    return null;
  }

  return {
    Vary: "Origin",
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Codex-Role, X-Codex-Roles, X-Codex-Principal, X-Codex-Actor-Id, X-Codex-Actor-Type, X-Codex-Email, X-Codex-Workspace-Id, X-Codex-Workspace-Name, X-Codex-Team-Id, X-Codex-Team-Name, X-Codex-Policy-Profile",
    "Access-Control-Allow-Credentials": "true"
  };
}

function applyCorsHeaders(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedOrigins: string[],
) {
  const headers = getCorsHeaders(request, allowedOrigins);

  if (!headers) {
    return false;
  }

  for (const [name, value] of Object.entries(headers)) {
    reply.header(name, value);
  }

  return true;
}

export const corsPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "OPTIONS") {
      applyCorsHeaders(request, reply, app.config.CORS_ALLOWED_ORIGINS);
      return;
    }

    const allowed = applyCorsHeaders(request, reply, app.config.CORS_ALLOWED_ORIGINS);

    if (!allowed) {
      reply.status(403).send();
      return reply;
    }

    reply.status(204).send();
    return reply;
  });
});
