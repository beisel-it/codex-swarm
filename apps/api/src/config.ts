import { z } from "zod";

function createCsvSchema<T extends z.ZodTypeAny>(itemSchema: T, defaultValues: z.infer<T>[]) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return defaultValues;
    }

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value !== "string") {
      return value;
    }

    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }, z.array(itemSchema).default(defaultValues));
}

const envBooleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off", ""].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean().default(false));

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5432/codex_swarm"),
  DEV_AUTH_TOKEN: z.string().min(1).default("codex-swarm-dev-token"),
  DEV_AUTH_PRINCIPAL: z.string().min(1).default("dev-user"),
  DEV_AUTH_ACTOR_ID: z.string().min(1).default("dev-user"),
  DEV_AUTH_EMAIL: z.string().email().optional(),
  DEV_AUTH_ROLE: z.string().min(1).default("platform-admin"),
  DEV_AUTH_WORKSPACE_ID: z.string().min(1).default("default-workspace"),
  DEV_AUTH_WORKSPACE_NAME: z.string().min(1).default("Default Workspace"),
  DEV_AUTH_TEAM_ID: z.string().min(1).default("codex-swarm"),
  DEV_AUTH_TEAM_NAME: z.string().min(1).default("Codex Swarm"),
  DEV_AUTH_POLICY_PROFILE: z.string().min(1).default("standard"),
  RETENTION_RUN_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_ARTIFACT_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_EVENT_DAYS: z.coerce.number().int().positive().default(30),
  SECRET_SOURCE_MODE: z.enum(["environment", "external_manager"]).default("environment"),
  SECRET_PROVIDER: z.enum(["vault"]).nullable().default(null),
  REMOTE_SECRET_ENV_NAMES: createCsvSchema(z.string().min(1), []),
  SECRET_ALLOWED_TRUST_LEVELS: createCsvSchema(z.enum(["trusted", "sandboxed", "restricted"]), ["trusted"]),
  SENSITIVE_POLICY_PROFILES: createCsvSchema(z.string().min(1), []),
  SECRET_DISTRIBUTION_BOUNDARY: createCsvSchema(z.string().min(1), [
    "control-plane issues short-lived credentials",
    "workers receive only task-scoped environment variables",
    "sensitive repositories require policy-driven secret access"
  ]),
  POLICY_DRIVEN_SECRET_ACCESS: envBooleanSchema,
  OPENAI_TRACING_DISABLED: envBooleanSchema,
  OPENAI_TRACING_EXPORT_API_KEY: z.string().min(1).optional()
});

export type AppConfig = z.infer<typeof configSchema>;

export function getConfig(overrides: Record<string, unknown> = {}): AppConfig {
  return configSchema.parse({
    ...process.env,
    ...overrides
  });
}
