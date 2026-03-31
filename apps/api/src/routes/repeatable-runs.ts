import type { FastifyPluginAsync } from "fastify";

import {
  externalEventReceiptListQuerySchema,
  idParamSchema,
  repeatableRunDefinitionCreateSchema,
  repeatableRunDefinitionUpdateSchema,
  repeatableRunListQuerySchema,
  repeatableRunTriggerCreateSchema,
  repeatableRunTriggerListQuerySchema,
  repeatableRunTriggerUpdateSchema,
} from "../http/schemas.js";

export const repeatableRunRoutes: FastifyPluginAsync = async (app) => {
  app.get("/repeatable-runs", async (request) => {
    const query = repeatableRunListQuerySchema.parse(request.query ?? {});
    return app.controlPlane.listRepeatableRunDefinitions(
      query.repositoryId,
      request.authContext,
    );
  });

  app.post("/repeatable-runs", async (request, reply) => {
    const input = repeatableRunDefinitionCreateSchema.parse(request.body);
    const definition = await app.controlPlane.createRepeatableRunDefinition(
      input,
      request.authContext,
    );
    return reply.code(201).send(definition);
  });

  app.patch("/repeatable-runs/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = repeatableRunDefinitionUpdateSchema.parse(request.body);
    return app.controlPlane.updateRepeatableRunDefinition(
      id,
      input,
      request.authContext,
    );
  });

  app.delete("/repeatable-runs/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await app.controlPlane.deleteRepeatableRunDefinition(
      id,
      request.authContext,
    );
    return reply.code(204).send();
  });

  app.get("/repeatable-run-triggers", async (request) => {
    const query = repeatableRunTriggerListQuerySchema.parse(
      request.query ?? {},
    );
    return app.controlPlane.listRepeatableRunTriggers(
      query,
      request.authContext,
    );
  });

  app.post("/repeatable-run-triggers", async (request, reply) => {
    const input = repeatableRunTriggerCreateSchema.parse(request.body);
    const trigger = await app.controlPlane.createRepeatableRunTrigger(
      input,
      request.authContext,
    );
    return reply.code(201).send(trigger);
  });

  app.patch("/repeatable-run-triggers/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = repeatableRunTriggerUpdateSchema.parse(request.body);
    return app.controlPlane.updateRepeatableRunTrigger(
      id,
      input,
      request.authContext,
    );
  });

  app.delete("/repeatable-run-triggers/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await app.controlPlane.deleteRepeatableRunTrigger(id, request.authContext);
    return reply.code(204).send();
  });

  app.get("/external-event-receipts", async (request) => {
    const query = externalEventReceiptListQuerySchema.parse(
      request.query ?? {},
    );
    return app.controlPlane.listExternalEventReceipts(
      query,
      request.authContext,
    );
  });
};
