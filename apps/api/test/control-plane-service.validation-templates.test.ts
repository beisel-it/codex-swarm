import { describe, expect, it } from "vitest";

import { tasks, validations } from "../src/db/schema.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

class FakeValidationTemplateDb {
  readonly taskRecord = {
    id: "11111111-1111-4111-8111-111111111111",
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    parentTaskId: null,
    title: "Validate API slice",
    description: "Run the API validation template",
    role: "backend-dev",
    status: "pending",
    priority: 3,
    ownerAgentId: null,
    dependencyIds: [],
    acceptanceCriteria: [],
    validationTemplates: [
      {
        name: "unit",
        command: "pnpm test --filter api",
        summary: "Run the API test slice",
        artifactPath: ".swarm/validations/unit.json"
      }
    ],
    createdAt: new Date("2026-03-28T12:00:00.000Z"),
    updatedAt: new Date("2026-03-28T12:00:00.000Z")
  };

  validationValues: Array<Record<string, unknown>> = [];

  select() {
    return {
      from: (table: unknown) => ({
        where: async () => {
          if (table === tasks) {
            return [this.taskRecord];
          }

          throw new Error("unexpected select table");
        },
        orderBy: async () => {
          if (table === validations) {
            return [];
          }

          throw new Error("unexpected ordered select table");
        }
      })
    };
  }

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table !== validations) {
            throw new Error("unexpected insert table");
          }

          this.validationValues.push(values);
          return [values];
        }
      })
    };
  }
}

describe("ControlPlaneService validation templates", () => {
  it("materializes a validation from a named task template", async () => {
    const db = new FakeValidationTemplateDb();
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-28T12:05:00.000Z")
    });

    (service as any).assertRunExists = async () => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workspaceId: "acme",
      teamId: "platform"
    });

    const validation = await service.createValidation({
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      taskId: "11111111-1111-4111-8111-111111111111",
      templateName: "unit",
      status: "pending",
      artifactIds: []
    });

    expect(validation).toMatchObject({
      name: "unit",
      command: "pnpm test --filter api",
      summary: "Run the API test slice",
      artifactPath: ".swarm/validations/unit.json",
      artifacts: []
    });
    expect(db.validationValues.at(-1)).toMatchObject({
      name: "unit",
      command: "pnpm test --filter api",
      summary: "Run the API test slice",
      artifactPath: ".swarm/validations/unit.json"
    });
  });

  it("allows explicit validation fields to override the task template", async () => {
    const db = new FakeValidationTemplateDb();
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-28T12:05:00.000Z")
    });

    (service as any).assertRunExists = async () => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workspaceId: "acme",
      teamId: "platform"
    });

    const validation = await service.createValidation({
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      taskId: "11111111-1111-4111-8111-111111111111",
      templateName: "unit",
      name: "unit-override",
      command: "pnpm vitest run",
      summary: "Use the override path",
      status: "passed",
      artifactIds: []
    });

    expect(validation).toMatchObject({
      name: "unit-override",
      command: "pnpm vitest run",
      summary: "Use the override path"
    });
    expect(db.validationValues.at(-1)).toMatchObject({
      name: "unit-override",
      command: "pnpm vitest run",
      summary: "Use the override path"
    });
  });
});
