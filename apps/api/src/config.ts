import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5432/codex_swarm"),
  DEV_AUTH_TOKEN: z.string().min(1).default("codex-swarm-dev-token")
});

export type AppConfig = z.infer<typeof configSchema>;

export function getConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): AppConfig {
  return configSchema.parse({
    ...process.env,
    ...overrides
  });
}
