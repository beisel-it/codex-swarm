import type { FastifyPluginAsync } from "fastify";

import { idParamSchema, projectCreateSchema, projectUpdateSchema } from "../http/schemas.js";

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects", async (request) => app.controlPlane.listProjects(request.authContext));

  app.get("/projects/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return app.controlPlane.getProject(id, request.authContext);
  });

  app.post("/projects", async (request, reply) => {
    const input = projectCreateSchema.parse(request.body);
    const project = await app.controlPlane.createProject(input, request.authContext);
    return reply.code(201).send(project);
  });

  app.patch("/projects/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = projectUpdateSchema.parse(request.body);
    return app.controlPlane.updateProject(id, input, request.authContext);
  });

  app.delete("/projects/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await app.controlPlane.deleteProject(id, request.authContext);
    return reply.code(204).send();
  });
};
