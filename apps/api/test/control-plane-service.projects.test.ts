import { describe, expect, it } from "vitest";

import { projects, repositories, runs } from "../src/db/schema.js";
import { ControlPlaneService } from "../src/services/control-plane-service.js";

function result<T>(rows: T[]) {
  return {
    orderBy: async () => rows,
    then<TResult1 = T[], TResult2 = never>(
      onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(rows).then(onfulfilled, onrejected);
    }
  };
}

class FakeProjectDb {
  projectStore: any[] = [];
  repositoryStore: any[] = [];
  runStore: any[] = [];

  select() {
    return {
      from: (table: unknown) => ({
        where: () => {
          if (table === projects) {
            return result(this.projectStore);
          }

          if (table === repositories) {
            return result(this.repositoryStore);
          }

          if (table === runs) {
            return result(this.runStore);
          }

          throw new Error("unexpected select table");
        },
        orderBy: async () => {
          if (table === projects) {
            return this.projectStore;
          }

          if (table === repositories) {
            return this.repositoryStore;
          }

          if (table === runs) {
            return this.runStore;
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
          if (table === projects) {
            this.projectStore.push(values);
            return [values];
          }

          if (table === runs) {
            this.runStore.push(values);
            return [values];
          }

          throw new Error("unexpected insert table");
        }
      })
    };
  }

  update(table: unknown) {
    const store = this;

    return {
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (table === projects) {
              store.projectStore[0] = {
                ...store.projectStore[0],
                ...values
              };
              return [store.projectStore[0]];
            }

            if (table === runs) {
              store.runStore[0] = {
                ...store.runStore[0],
                ...values
              };
              return [store.runStore[0]];
            }

            if (table === repositories) {
              store.repositoryStore = store.repositoryStore.map((record) => record.projectId
                ? { ...record, ...values }
                : record);
              return store.repositoryStore;
            }

            throw new Error("unexpected update table");
          },
          then<TResult1 = unknown, TResult2 = never>(
            onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
          ) {
            if (table === repositories) {
              store.repositoryStore = store.repositoryStore.map((record) => record.projectId
                ? { ...record, ...values }
                : record);
              return Promise.resolve(store.repositoryStore).then(onfulfilled, onrejected);
            }

            if (table === runs) {
              store.runStore = store.runStore.map((record) => record.projectId
                ? { ...record, ...values }
                : record);
              return Promise.resolve(store.runStore).then(onfulfilled, onrejected);
            }

            return Promise.resolve([]).then(onfulfilled, onrejected);
          }
        })
      })
    };
  }

  delete(table: unknown) {
    return {
      where: async () => {
        if (table === projects) {
          this.projectStore = [];
          return;
        }

        throw new Error("unexpected delete table");
      }
    };
  }

  async transaction<T>(callback: (tx: FakeProjectDb) => Promise<T>) {
    return callback(this);
  }
}

describe("ControlPlaneService projects", () => {
  it("supports project CRUD plus repository and run assignment detail", async () => {
    const now = new Date("2026-03-30T10:00:00.000Z");
    const db = new FakeProjectDb();
    const service = new ControlPlaneService(db as never, {
      now: () => now
    });
    (service as any).ensureOwnershipBoundary = async () => ({
      id: "team-1",
      workspaceId: "workspace-1",
      name: "Team 1",
      policyProfile: "standard",
      createdAt: now,
      updatedAt: now
    });

    const project = await service.createProject({
      name: "Platform Refresh",
      description: "Main delivery stream"
    }, {
      workspaceId: "workspace-1",
      workspaceName: "Workspace 1",
      teamId: "team-1",
      teamName: "Team 1"
    });

    db.repositoryStore.push({
      id: "repo-1",
      workspaceId: "workspace-1",
      teamId: "team-1",
      name: "codex-swarm",
      url: "https://example.com/repo.git",
      provider: "github",
      defaultBranch: "main",
      localPath: null,
      projectId: project.id,
      trustLevel: "trusted",
      approvalProfile: "standard",
      providerSync: {
        connectivityStatus: "validated",
        validatedAt: now.toISOString(),
        defaultBranch: "main",
        branches: ["main"],
        providerRepoUrl: "https://example.com/repo.git",
        lastError: null
      },
      createdAt: now,
      updatedAt: now
    });
    db.runStore.push({
      id: "run-1",
      repositoryId: "repo-1",
      workspaceId: "workspace-1",
      teamId: "team-1",
      projectId: project.id,
      goal: "Ship projects",
      status: "pending",
      branchName: null,
      planArtifactPath: null,
      budgetTokens: null,
      budgetCostUsd: null,
      concurrencyCap: 1,
      policyProfile: null,
      publishedBranch: null,
      branchPublishedAt: null,
      branchPublishApprovalId: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      pullRequestApprovalId: null,
      handoffStatus: "pending",
      completedAt: null,
      metadata: {},
      createdBy: "leader",
      createdAt: now,
      updatedAt: now
    });

    const projectsList = await service.listProjects({
      workspaceId: "workspace-1",
      workspaceName: "Workspace 1",
      teamId: "team-1",
      teamName: "Team 1"
    });
    expect(projectsList).toHaveLength(1);
    expect(projectsList[0]).toMatchObject({
      id: project.id,
      repositoryCount: 1,
      runCount: 1
    });

    const detail = await service.getProject(project.id, {
      workspaceId: "workspace-1",
      workspaceName: "Workspace 1",
      teamId: "team-1",
      teamName: "Team 1"
    });
    expect(detail.repositoryAssignments).toHaveLength(1);
    expect(detail.runAssignments).toHaveLength(1);

    const updated = await service.updateProject(project.id, {
      description: "Updated stream"
    }, {
      workspaceId: "workspace-1",
      workspaceName: "Workspace 1",
      teamId: "team-1",
      teamName: "Team 1"
    });
    expect(updated.description).toBe("Updated stream");

    await service.deleteProject(project.id, {
      workspaceId: "workspace-1",
      workspaceName: "Workspace 1",
      teamId: "team-1",
      teamName: "Team 1"
    });
    expect(db.projectStore).toEqual([]);
    expect(db.repositoryStore[0].projectId).toBeNull();
    expect(db.runStore[0].projectId).toBeNull();
  });

  it("inherits repository project assignment for new runs and allows explicit ad hoc runs", async () => {
    const now = new Date("2026-03-30T11:00:00.000Z");
    const db = new FakeProjectDb();
    const service = new ControlPlaneService(db as never, {
      now: () => now
    });
    const repository = {
      id: "repo-1",
      workspaceId: "workspace-1",
      teamId: "team-1",
      projectId: "project-1",
      trustLevel: "trusted",
      approvalProfile: "standard"
    };

    (service as any).assertRepositoryExists = async () => repository;
    (service as any).assertProjectExists = async () => ({
      id: "project-1",
      workspaceId: "workspace-1",
      teamId: "team-1"
    });

    const inheritedRun = await service.createRun({
      repositoryId: "repo-1",
      goal: "Inherited project",
      concurrencyCap: 1,
      metadata: {}
    }, "leader", {
      workspaceId: "workspace-1",
      workspaceName: "Workspace 1",
      teamId: "team-1",
      teamName: "Team 1"
    });

    expect(inheritedRun.projectId).toBe("project-1");

    const adHocRun = await service.createRun({
      repositoryId: "repo-1",
      projectId: null,
      goal: "Stay ad hoc",
      concurrencyCap: 1,
      metadata: {}
    }, "leader", {
      workspaceId: "workspace-1",
      workspaceName: "Workspace 1",
      teamId: "team-1",
      teamName: "Team 1"
    });

    expect(adHocRun.projectId).toBeNull();
  });

  it("updates run project assignments explicitly", async () => {
    const now = new Date("2026-03-30T12:00:00.000Z");
    const db = new FakeProjectDb();
    db.runStore.push({
      id: "run-1",
      repositoryId: "repo-1",
      workspaceId: "workspace-1",
      teamId: "team-1",
      projectId: null,
      goal: "Move into project",
      status: "pending",
      branchName: null,
      planArtifactPath: null,
      budgetTokens: null,
      budgetCostUsd: null,
      concurrencyCap: 1,
      policyProfile: null,
      publishedBranch: null,
      branchPublishedAt: null,
      branchPublishApprovalId: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      pullRequestStatus: null,
      pullRequestApprovalId: null,
      handoffStatus: "pending",
      completedAt: null,
      metadata: {},
      createdBy: "leader",
      createdAt: now,
      updatedAt: now
    });

    const service = new ControlPlaneService(db as never, {
      now: () => now
    });
    (service as any).assertRunExists = async () => db.runStore[0];
    (service as any).assertProjectExists = async () => ({
      id: "project-1",
      workspaceId: "workspace-1",
      teamId: "team-1"
    });

    const updatedRun = await service.updateRun("run-1", {
      projectId: "project-1"
    }, {
      workspaceId: "workspace-1",
      workspaceName: "Workspace 1",
      teamId: "team-1",
      teamName: "Team 1"
    });

    expect(updatedRun.projectId).toBe("project-1");
  });
});
