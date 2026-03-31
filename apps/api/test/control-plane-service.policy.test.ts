import { beforeEach, describe, expect, it, vi } from "vitest";

import { repositories, runs, teams } from "../src/db/schema.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

vi.mock("../src/lib/repository-provider.js", () => ({
  inspectRepositoryProvider: vi.fn(async (repository: { url: string }) => ({
    connectivityStatus: "validated",
    validatedAt: new Date("2026-03-28T12:00:00.000Z"),
    defaultBranch: "main",
    branches: ["main"],
    providerRepoUrl: repository.url,
    lastError: null,
  })),
}));

class FakePolicyDb {
  repositoryValues: Array<Record<string, unknown>> = [];
  runValues: Array<Record<string, unknown>> = [];
  teamRecord = {
    id: "platform",
    workspaceId: "acme",
    name: "Platform",
    policyProfile: "standard",
    createdAt: new Date("2026-03-28T12:00:00.000Z"),
    updatedAt: new Date("2026-03-28T12:00:00.000Z"),
  };

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table === repositories) {
            this.repositoryValues.push(values);
            return [values];
          }

          if (table === runs) {
            this.runValues.push(values);
            return [values];
          }

          throw new Error("unexpected insert table");
        },
      }),
    };
  }

  select() {
    return {
      from: (table: unknown) => ({
        where: async () => {
          if (table === teams) {
            return [this.teamRecord];
          }

          throw new Error("unexpected select table");
        },
      }),
    };
  }

  update(table: unknown) {
    return {
      set: (values: Partial<typeof this.teamRecord>) => ({
        where: () => ({
          returning: async () => {
            if (table !== teams) {
              throw new Error("unexpected update table");
            }

            this.teamRecord = {
              ...this.teamRecord,
              ...values,
            };

            return [this.teamRecord];
          },
        }),
      }),
    };
  }

  execute() {
    return Promise.resolve();
  }
}

describe("ControlPlaneService policy inheritance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inherits the team policy profile for repositories without explicit overrides", async () => {
    const db = new FakePolicyDb();
    db.teamRecord.policyProfile = "breakglass";
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-28T12:00:00.000Z"),
    });

    const repository = await service.createRepository(
      {
        name: "codex-swarm",
        url: "https://github.com/example/codex-swarm",
        defaultBranch: "main",
        trustLevel: "trusted",
      },
      {
        workspaceId: "acme",
        workspaceName: "Acme",
        teamId: "platform",
        teamName: "Platform",
        policyProfile: "breakglass",
      },
    );

    expect(repository.approvalProfile).toBe("breakglass");
    expect(db.repositoryValues.at(-1)?.approvalProfile).toBe("breakglass");
  });

  it("elevates restricted repositories to a sensitive profile by default", async () => {
    const db = new FakePolicyDb();
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-28T12:00:00.000Z"),
    });

    const repository = await service.createRepository(
      {
        name: "sensitive-repo",
        url: "https://github.com/example/sensitive-repo",
        defaultBranch: "main",
        trustLevel: "restricted",
      },
      {
        workspaceId: "acme",
        workspaceName: "Acme",
        teamId: "platform",
        teamName: "Platform",
        policyProfile: "standard",
      },
    );

    expect(repository.approvalProfile).toBe("sensitive");
    expect(db.repositoryValues.at(-1)?.approvalProfile).toBe("sensitive");
  });

  it("caps concurrency for sensitive runs while preserving standard repo overrides", async () => {
    const db = new FakePolicyDb();
    const service = new ControlPlaneService(db as never, {
      now: () => new Date("2026-03-28T12:00:00.000Z"),
    });

    (service as any).assertRepositoryExists = async () => ({
      id: "repo-sensitive",
      workspaceId: "acme",
      teamId: "platform",
      trustLevel: "restricted",
      approvalProfile: "sensitive",
    });

    const sensitiveRun = await service.createRun(
      {
        repositoryId: "repo-sensitive",
        goal: "Handle sensitive repo",
        concurrencyCap: 4,
        metadata: {},
      },
      "tech-lead",
      {
        workspaceId: "acme",
        workspaceName: "Acme",
        teamId: "platform",
        teamName: "Platform",
        policyProfile: "standard",
      },
    );

    expect(sensitiveRun.policyProfile).toBe("sensitive");
    expect(sensitiveRun.concurrencyCap).toBe(1);

    (service as any).assertRepositoryExists = async () => ({
      id: "repo-standard",
      workspaceId: "acme",
      teamId: "platform",
      trustLevel: "trusted",
      approvalProfile: "standard",
    });

    const standardRun = await service.createRun(
      {
        repositoryId: "repo-standard",
        goal: "Handle standard repo",
        concurrencyCap: 4,
        metadata: {},
      },
      "tech-lead",
      {
        workspaceId: "acme",
        workspaceName: "Acme",
        teamId: "platform",
        teamName: "Platform",
        policyProfile: "standard",
      },
    );

    expect(standardRun.policyProfile).toBe("standard");
    expect(standardRun.concurrencyCap).toBe(4);
  });
});
