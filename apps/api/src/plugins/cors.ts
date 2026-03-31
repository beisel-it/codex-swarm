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

function applyCorsHeaders(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedOrigins: string[],
) {
  const origin = request.headers.origin;

  if (!isOriginAllowed(origin, allowedOrigins)) {
    return false;
  }

  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Origin", origin as string);
  reply.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  );
  reply.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Codex-Role, X-Codex-Roles, X-Codex-Principal, X-Codex-Actor-Id, X-Codex-Actor-Type, X-Codex-Email, X-Codex-Workspace-Id, X-Codex-Workspace-Name, X-Codex-Team-Id, X-Codex-Team-Name, X-Codex-Policy-Profile",
  );
  reply.header("Access-Control-Allow-Credentials", "true");

  return true;
}

export const corsPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "OPTIONS") {
      return;
    }

    const allowed = applyCorsHeaders(
      request,
      reply,
      app.config.CORS_ALLOWED_ORIGINS,
    );

    if (!allowed) {
      reply.status(403).send();
      return reply;
    }

    reply.status(204).send();
    return reply;
  });

  app.addHook("onSend", async (request, reply, payload) => {
    applyCorsHeaders(request, reply, app.config.CORS_ALLOWED_ORIGINS);
    return payload;
  });
});
