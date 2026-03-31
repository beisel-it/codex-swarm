import type { FastifyPluginAsync } from "fastify";

import {
  idParamSchema,
  projectTeamCreateSchema,
  projectTeamImportSchema,
  projectTeamListQuerySchema,
  projectTeamUpdateSchema,
} from "../http/schemas.js";

export const projectTeamRoutes: FastifyPluginAsync = async (app) => {
  app.get("/project-teams", async (request) => {
    const query = projectTeamListQuerySchema.parse(request.query ?? {});
    return app.controlPlane.listProjectTeams(
      query.projectId,
      request.authContext,
    );
  });

  app.get("/project-teams/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return app.controlPlane.getProjectTeam(id, request.authContext);
  });

  app.post("/project-teams", async (request, reply) => {
    const input = projectTeamCreateSchema.parse(request.body);
    const projectTeam = await app.controlPlane.createProjectTeam(
      input,
      request.authContext,
    );
    return reply.code(201).send(projectTeam);
  });

  app.post("/project-teams/import", async (request, reply) => {
    const input = projectTeamImportSchema.parse(request.body);
    const projectTeam = await app.controlPlane.importProjectTeam(
      input,
      request.authContext,
    );
    return reply.code(201).send(projectTeam);
  });

  app.patch("/project-teams/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = projectTeamUpdateSchema.parse(request.body);
    return app.controlPlane.updateProjectTeam(id, input, request.authContext);
  });

  app.delete("/project-teams/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await app.controlPlane.deleteProjectTeam(id, request.authContext);
    return reply.code(204).send();
  });
};
