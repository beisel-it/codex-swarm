import { describe, expect, it, vi } from "vitest";

import { getConfig } from "../src/config.js";
import { hashPassword, verifyPassword } from "../src/lib/passwords.js";
import { AuthService } from "../src/services/auth-service.js";

describe("password hashing", () => {
  it("hashes and verifies passwords with scrypt", async () => {
    const config = getConfig({
      NODE_ENV: "test"
    });
    const hash = await hashPassword("correct-horse-battery-staple", config);

    expect(hash.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});

describe("bootstrapFirstAdmin", () => {
  it("creates the initial admin boundary on first run", async () => {
    const insertedUsers: Array<Record<string, unknown>> = [];
    const insertedCredentials: Array<Record<string, unknown>> = [];
    const executedStatements: string[] = [];
    let insertCallCount = 0;
    const fakeDb = {
      select(selection?: Record<string, unknown>) {
        if (selection && "count" in selection) {
          return {
            from: () => [{ count: 0 }]
          };
        }

        return {
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                leftJoin: () => ({
                  where: async () => [{
                    userId: "user-1",
                    email: "admin@example.com",
                    displayName: "Admin User",
                    isActive: true,
                    primaryRole: "workspace_admin",
                    workspaceId: "default-workspace",
                    workspaceName: "Default Workspace",
                    teamId: "codex-swarm",
                    teamName: "Codex Swarm",
                    policyProfile: "standard",
                    passwordHash: insertedCredentials[0]?.passwordHash ?? null
                  }]
                })
              })
            })
          })
        };
      },
      async transaction(callback: (tx: any) => Promise<void>) {
        const tx = {
          execute: vi.fn(async (statement: { queryChunks?: unknown[] }) => {
            executedStatements.push(String(statement));
          }),
          insert: () => ({
            values: async (value: Record<string, unknown>) => {
              if (insertCallCount === 0) {
                insertedUsers.push(value);
              } else {
                insertedCredentials.push(value);
              }

              insertCallCount += 1;
            }
          })
        };

        await callback(tx);
      }
    };
    const authService = new AuthService(
      fakeDb as never,
      { now: () => new Date("2026-04-02T12:00:00.000Z") },
      getConfig({ NODE_ENV: "test" })
    );
    (authService as any).findUserById = vi.fn().mockResolvedValue({
      userId: "user-1",
      email: "admin@example.com",
      displayName: "Admin User",
      isActive: true,
      primaryRole: "workspace_admin",
      workspaceId: "default-workspace",
      workspaceName: "Default Workspace",
      teamId: "codex-swarm",
      teamName: "Codex Swarm",
      policyProfile: "standard",
      passwordHash: insertedCredentials[0]?.passwordHash as string | null
    });

    const result = await authService.bootstrapFirstAdmin({
      email: "admin@example.com",
      password: "correct-horse-battery-staple",
      displayName: "Admin User",
      workspaceId: "default-workspace",
      workspaceName: "Default Workspace",
      teamId: "codex-swarm",
      teamName: "Codex Swarm"
    });

    expect(insertedUsers).toHaveLength(1);
    expect(insertedUsers[0]?.primaryRole).toBe("workspace_admin");
    expect(insertedCredentials).toHaveLength(1);
    expect(String(insertedCredentials[0]?.passwordHash ?? "")).toContain("scrypt$");
    expect(executedStatements).toHaveLength(2);
    expect(result).toMatchObject({
      email: "admin@example.com",
      role: "workspace_admin",
      workspaceId: "default-workspace",
      teamId: "codex-swarm"
    });
  });

  it("fails cleanly when bootstrap has already been completed", async () => {
    const authService = new AuthService(
      {
        select: () => ({
          from: async () => [{ count: 1 }]
        })
      } as never,
      { now: () => new Date("2026-04-02T12:00:00.000Z") },
      getConfig({ NODE_ENV: "test" })
    );

    await expect(authService.bootstrapFirstAdmin({
      email: "admin@example.com",
      password: "correct-horse-battery-staple",
      displayName: "Admin User",
      workspaceId: "default-workspace",
      workspaceName: "Default Workspace",
      teamId: "codex-swarm",
      teamName: "Codex Swarm"
    })).rejects.toThrow(/bootstrap-admin already completed/);
  });
});
