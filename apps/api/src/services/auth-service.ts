import crypto from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import type { GovernanceRole, IdentityEntrypoint } from "@codex-swarm/contracts";

import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import {
  browserSessions,
  passwordCredentials,
  teams,
  users,
  workspaces
} from "../db/schema.js";
import type { Clock } from "../lib/clock.js";
import { HttpError } from "../lib/http-error.js";
import { hashPassword, verifyPassword } from "../lib/passwords.js";

type DbUserIdentity = {
  userId: string;
  email: string;
  displayName: string;
  isActive: boolean;
  primaryRole: GovernanceRole;
  workspaceId: string;
  workspaceName: string;
  teamId: string;
  teamName: string;
  policyProfile: string;
  passwordHash: string | null;
};

export type AuthenticatedSession = {
  actor: {
    principal: string;
    actorId: string;
    actorType: "user";
    email: string;
    role: GovernanceRole;
    roles: GovernanceRole[];
    workspaceId: string;
    workspaceName: string;
    teamId: string;
    teamName: string;
    policyProfile: string;
  };
  identity: IdentityEntrypoint;
  sessionId: string;
  expiresAt: Date;
  userId: string;
};

export class AuthService {
  constructor(
    private readonly db: AppDb,
    private readonly clock: Clock,
    private readonly config: AppConfig
  ) {}

  async authenticateWithPassword(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);
    const record = await this.findUserByEmail(normalizedEmail);

    if (!record?.passwordHash || !record.isActive) {
      return null;
    }

    const matches = await verifyPassword(password, record.passwordHash);

    if (!matches) {
      return null;
    }

    return this.createSession(record.userId);
  }

  async createSession(userId: string): Promise<AuthenticatedSession> {
    const record = await this.findUserById(userId);

    if (!record || !record.isActive) {
      throw new HttpError(404, "user not found");
    }

    const now = this.clock.now();
    const sessionId = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + (this.config.AUTH_SESSION_TTL_SECONDS * 1000));

    await this.db.insert(browserSessions).values({
      id: sessionId,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now
    });

    return mapAuthenticatedSession(record, sessionId, expiresAt);
  }

  async getAuthenticatedSession(sessionId: string | null | undefined): Promise<AuthenticatedSession | null> {
    if (!sessionId) {
      return null;
    }

    const [row] = await this.db
      .select({
        sessionId: browserSessions.id,
        expiresAt: browserSessions.expiresAt,
        revokedAt: browserSessions.revokedAt,
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        isActive: users.isActive,
        primaryRole: users.primaryRole,
        workspaceId: users.workspaceId,
        workspaceName: workspaces.name,
        teamId: users.teamId,
        teamName: teams.name,
        policyProfile: teams.policyProfile
      })
      .from(browserSessions)
      .innerJoin(users, eq(browserSessions.userId, users.id))
      .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
      .innerJoin(teams, eq(users.teamId, teams.id))
      .where(eq(browserSessions.id, sessionId));

    if (!row || row.revokedAt || !row.isActive || row.expiresAt <= this.clock.now()) {
      if (row && !row.revokedAt && row.expiresAt <= this.clock.now()) {
        await this.revokeSession(sessionId);
      }

      return null;
    }

    const now = this.clock.now();
    await this.db.update(browserSessions).set({
      lastUsedAt: now,
      updatedAt: now
    }).where(eq(browserSessions.id, sessionId));

    return mapAuthenticatedSession({
      userId: row.userId,
      email: row.email,
      displayName: row.displayName,
      isActive: row.isActive,
      primaryRole: row.primaryRole,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      teamId: row.teamId,
      teamName: row.teamName,
      policyProfile: row.policyProfile,
      passwordHash: null
    }, row.sessionId, row.expiresAt);
  }

  async revokeSession(sessionId: string | null | undefined) {
    if (!sessionId) {
      return;
    }

    const now = this.clock.now();
    await this.db.update(browserSessions).set({
      revokedAt: now,
      updatedAt: now
    }).where(and(
      eq(browserSessions.id, sessionId),
      sql`${browserSessions.revokedAt} is null`
    ));
  }

  async bootstrapFirstAdmin(input: {
    displayName: string;
    email: string;
    password: string;
    teamId: string;
    teamName: string;
    workspaceId: string;
    workspaceName: string;
  }) {
    const normalizedEmail = normalizeEmail(input.email);
    const existingUsers = await this.db.select({ count: sql<number>`count(*)::int` }).from(users);

    if ((existingUsers[0]?.count ?? 0) > 0) {
      throw new HttpError(409, "bootstrap-admin already completed");
    }

    const now = this.clock.now();
    const passwordHash = await hashPassword(input.password, this.config);
    const userId = crypto.randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into workspaces (id, name, created_at, updated_at)
        values (${input.workspaceId}, ${input.workspaceName}, ${now}, ${now})
        on conflict (id) do nothing
      `);
      await tx.execute(sql`
        insert into teams (id, workspace_id, name, policy_profile, created_at, updated_at)
        values (${input.teamId}, ${input.workspaceId}, ${input.teamName}, ${"standard"}, ${now}, ${now})
        on conflict (id) do nothing
      `);

      await tx.insert(users).values({
        id: userId,
        email: normalizedEmail,
        displayName: input.displayName,
        isActive: true,
        primaryRole: "workspace_admin",
        workspaceId: input.workspaceId,
        teamId: input.teamId,
        createdAt: now,
        updatedAt: now
      });

      await tx.insert(passwordCredentials).values({
        userId,
        passwordHash,
        createdAt: now,
        updatedAt: now
      });
    });

    const record = await this.findUserById(userId);

    if (!record) {
      throw new HttpError(500, "bootstrap-admin persistence failed");
    }

    return {
      userId,
      email: record.email,
      displayName: record.displayName,
      workspaceId: record.workspaceId,
      workspaceName: record.workspaceName,
      teamId: record.teamId,
      teamName: record.teamName,
      role: record.primaryRole
    };
  }

  private async findUserByEmail(email: string): Promise<DbUserIdentity | null> {
    const [row] = await this.db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        isActive: users.isActive,
        primaryRole: users.primaryRole,
        workspaceId: users.workspaceId,
        workspaceName: workspaces.name,
        teamId: users.teamId,
        teamName: teams.name,
        policyProfile: teams.policyProfile,
        passwordHash: passwordCredentials.passwordHash
      })
      .from(users)
      .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
      .innerJoin(teams, eq(users.teamId, teams.id))
      .leftJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
      .where(eq(users.email, email));

    return row ?? null;
  }

  private async findUserById(userId: string): Promise<DbUserIdentity | null> {
    const [row] = await this.db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        isActive: users.isActive,
        primaryRole: users.primaryRole,
        workspaceId: users.workspaceId,
        workspaceName: workspaces.name,
        teamId: users.teamId,
        teamName: teams.name,
        policyProfile: teams.policyProfile,
        passwordHash: passwordCredentials.passwordHash
      })
      .from(users)
      .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
      .innerJoin(teams, eq(users.teamId, teams.id))
      .leftJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
      .where(eq(users.id, userId));

    return row ?? null;
  }
}

function mapAuthenticatedSession(record: DbUserIdentity, sessionId: string, expiresAt: Date): AuthenticatedSession {
  return {
    sessionId,
    expiresAt,
    userId: record.userId,
    actor: {
      principal: record.email,
      actorId: record.userId,
      actorType: "user",
      email: record.email,
      role: record.primaryRole,
      roles: [record.primaryRole],
      workspaceId: record.workspaceId,
      workspaceName: record.workspaceName,
      teamId: record.teamId,
      teamName: record.teamName,
      policyProfile: record.policyProfile
    },
    identity: {
      principal: record.email,
      subject: record.userId,
      email: record.email,
      roles: [record.primaryRole],
      workspace: {
        id: record.workspaceId,
        name: record.workspaceName
      },
      team: {
        id: record.teamId,
        workspaceId: record.workspaceId,
        name: record.teamName
      },
      actorType: "user"
    }
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
