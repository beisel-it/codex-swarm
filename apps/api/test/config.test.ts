import { afterEach, describe, expect, it } from "vitest";

import { getConfig } from "../src/config.js";

describe("getConfig", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
      return;
    }

    process.env.NODE_ENV = originalNodeEnv;
  });

  it("applies documented defaults", () => {
    delete process.env.NODE_ENV;

    const config = getConfig({
      NODE_ENV: undefined,
      PORT: undefined,
      HOST: undefined,
      DATABASE_URL: undefined,
      ARTIFACT_STORAGE_ROOT: undefined,
      ARTIFACT_BASE_URL: undefined,
      CONTROL_PLANE_SCHEMA_VERSION: undefined,
      CONTROL_PLANE_CONFIG_VERSION: undefined,
      DEV_AUTH_TOKEN: undefined,
      DEV_AUTH_PRINCIPAL: undefined,
      DEV_AUTH_ACTOR_ID: undefined,
      DEV_AUTH_EMAIL: undefined,
      DEV_AUTH_ROLE: undefined,
      DEV_AUTH_ROLES: undefined,
      DEV_AUTH_WORKSPACE_ID: undefined,
      DEV_AUTH_WORKSPACE_NAME: undefined,
      DEV_AUTH_TEAM_ID: undefined,
      DEV_AUTH_TEAM_NAME: undefined,
      DEV_AUTH_POLICY_PROFILE: undefined,
      RETENTION_RUN_DAYS: undefined,
      RETENTION_ARTIFACT_DAYS: undefined,
      RETENTION_EVENT_DAYS: undefined,
      SECRET_SOURCE_MODE: undefined,
      SECRET_PROVIDER: undefined,
      REMOTE_SECRET_ENV_NAMES: undefined,
      SECRET_ALLOWED_TRUST_LEVELS: undefined,
      SENSITIVE_POLICY_PROFILES: undefined,
      SECRET_DISTRIBUTION_BOUNDARY: undefined,
      POLICY_DRIVEN_SECRET_ACCESS: undefined,
      SLO_PENDING_APPROVAL_MAX_MINUTES: undefined,
      SLO_ACTIVE_RUN_MAX_MINUTES: undefined,
      SLO_TASK_QUEUE_MAX: undefined,
      SLO_SUPPORT_RESPONSE_HOURS: undefined,
      SUPPORT_HOURS_UTC: undefined,
      SUPPORT_ESCALATION: undefined,
      OPENAI_TRACING_DISABLED: undefined,
      OPENAI_TRACING_EXPORT_API_KEY: undefined
    });

    expect(config).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      HOST: "0.0.0.0",
      ARTIFACT_STORAGE_ROOT: ".swarm/artifacts",
      ARTIFACT_BASE_URL: "http://localhost:3000",
      CONTROL_PLANE_SCHEMA_VERSION: "2026-03-30",
      CONTROL_PLANE_CONFIG_VERSION: "1",
      DEV_AUTH_TOKEN: "codex-swarm-dev-token",
      DEV_AUTH_ROLE: "platform-admin",
      DEV_AUTH_ROLES: ["workspace_admin"],
      DEV_AUTH_WORKSPACE_ID: "default-workspace",
      DEV_AUTH_TEAM_NAME: "Codex Swarm",
      RETENTION_RUN_DAYS: 30,
      SECRET_SOURCE_MODE: "environment",
      SLO_PENDING_APPROVAL_MAX_MINUTES: 60,
      SLO_ACTIVE_RUN_MAX_MINUTES: 240,
      SLO_TASK_QUEUE_MAX: 100,
      SLO_SUPPORT_RESPONSE_HOURS: 8,
      SUPPORT_HOURS_UTC: "Mon-Fri 08:00-18:00 UTC"
    });
    expect(config.DATABASE_URL).toContain("codex_swarm");
  });

  it("parses environment overrides", () => {
    const config = getConfig({
      NODE_ENV: "test",
      PORT: "4010",
      HOST: "127.0.0.1",
      DATABASE_URL: "postgres://example/test",
      ARTIFACT_STORAGE_ROOT: "/var/lib/codex-swarm/artifacts",
      ARTIFACT_BASE_URL: "https://swarm.example.com",
      GIT_COMMAND: "git",
      GITHUB_CLI_COMMAND: "gh",
      CORS_ALLOWED_ORIGINS: [],
      CONTROL_PLANE_SCHEMA_VERSION: "2026-03-30",
      CONTROL_PLANE_CONFIG_VERSION: "2",
      DEV_AUTH_TOKEN: "secret-token",
      DEV_AUTH_PRINCIPAL: "alice",
      DEV_AUTH_ACTOR_ID: "user-1",
      DEV_AUTH_EMAIL: "alice@example.com",
      DEV_AUTH_ROLE: "admin",
      DEV_AUTH_ROLES: "workspace_admin,reviewer",
      DEV_AUTH_WORKSPACE_ID: "workspace-a",
      DEV_AUTH_WORKSPACE_NAME: "Workspace A",
      DEV_AUTH_TEAM_ID: "team-a",
      DEV_AUTH_TEAM_NAME: "Team A",
      DEV_AUTH_POLICY_PROFILE: "sensitive",
      RETENTION_RUN_DAYS: "14",
      RETENTION_ARTIFACT_DAYS: "21",
      RETENTION_EVENT_DAYS: "7",
      SECRET_SOURCE_MODE: "external_manager",
      SECRET_PROVIDER: "vault",
      REMOTE_SECRET_ENV_NAMES: "OPENAI_API_KEY,GITHUB_TOKEN",
      SECRET_ALLOWED_TRUST_LEVELS: "trusted,restricted",
      SENSITIVE_POLICY_PROFILES: "sensitive,breakglass",
      SECRET_DISTRIBUTION_BOUNDARY: "api brokers credentials,workers get task-scoped env",
      POLICY_DRIVEN_SECRET_ACCESS: "true",
      SLO_PENDING_APPROVAL_MAX_MINUTES: "45",
      SLO_ACTIVE_RUN_MAX_MINUTES: "180",
      SLO_TASK_QUEUE_MAX: "50",
      SLO_SUPPORT_RESPONSE_HOURS: "4",
      SUPPORT_HOURS_UTC: "Mon-Fri 09:00-17:00 UTC",
      SUPPORT_ESCALATION: "page platform admin,open DR bridge",
      OPENAI_TRACING_DISABLED: "false",
      OPENAI_TRACING_EXPORT_API_KEY: undefined
    });

    expect(config).toEqual({
      NODE_ENV: "test",
      PORT: 4010,
      HOST: "127.0.0.1",
      DATABASE_URL: "postgres://example/test",
      ARTIFACT_STORAGE_ROOT: "/var/lib/codex-swarm/artifacts",
      ARTIFACT_BASE_URL: "https://swarm.example.com",
      GIT_COMMAND: "git",
      GITHUB_CLI_COMMAND: "gh",
      CORS_ALLOWED_ORIGINS: [],
      CONTROL_PLANE_SCHEMA_VERSION: "2026-03-30",
      CONTROL_PLANE_CONFIG_VERSION: "2",
      DEV_AUTH_TOKEN: "secret-token",
      DEV_AUTH_PRINCIPAL: "alice",
      DEV_AUTH_ACTOR_ID: "user-1",
      DEV_AUTH_EMAIL: "alice@example.com",
      DEV_AUTH_ROLE: "admin",
      DEV_AUTH_ROLES: ["workspace_admin", "reviewer"],
      DEV_AUTH_WORKSPACE_ID: "workspace-a",
      DEV_AUTH_WORKSPACE_NAME: "Workspace A",
      DEV_AUTH_TEAM_ID: "team-a",
      DEV_AUTH_TEAM_NAME: "Team A",
      DEV_AUTH_POLICY_PROFILE: "sensitive",
      RETENTION_RUN_DAYS: 14,
      RETENTION_ARTIFACT_DAYS: 21,
      RETENTION_EVENT_DAYS: 7,
      SECRET_SOURCE_MODE: "external_manager",
      SECRET_PROVIDER: "vault",
      REMOTE_SECRET_ENV_NAMES: ["OPENAI_API_KEY", "GITHUB_TOKEN"],
      SECRET_ALLOWED_TRUST_LEVELS: ["trusted", "restricted"],
      SENSITIVE_POLICY_PROFILES: ["sensitive", "breakglass"],
      SECRET_DISTRIBUTION_BOUNDARY: ["api brokers credentials", "workers get task-scoped env"],
      POLICY_DRIVEN_SECRET_ACCESS: true,
      SLO_PENDING_APPROVAL_MAX_MINUTES: 45,
      SLO_ACTIVE_RUN_MAX_MINUTES: 180,
      SLO_TASK_QUEUE_MAX: 50,
      SLO_SUPPORT_RESPONSE_HOURS: 4,
      SUPPORT_HOURS_UTC: "Mon-Fri 09:00-17:00 UTC",
      SUPPORT_ESCALATION: ["page platform admin", "open DR bridge"],
      OPENAI_TRACING_DISABLED: false,
      OPENAI_TRACING_EXPORT_API_KEY: undefined
    });
  });
});
