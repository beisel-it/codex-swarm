import { z } from "zod";

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
  OPENAI_TRACING_DISABLED: envBooleanSchema,
  OPENAI_TRACING_EXPORT_API_KEY: z.string().min(1).optional()
});

export type AppConfig = z.infer<typeof configSchema>;

export function getConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): AppConfig {
  return configSchema.parse({
    ...process.env,
    ...overrides
  });
}
