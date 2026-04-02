import { readFile } from "node:fs/promises";
import path from "node:path";

import { createDb, createPool } from "../db/client.js";
import { ensureControlPlaneCompatibility } from "../db/versioning.js";
import { getConfig } from "../config.js";
import { systemClock } from "../lib/clock.js";
import { AuthService } from "../services/auth-service.js";

type Options = {
  displayName: string;
  email: string;
  envFile: string | null;
  password: string;
  teamId: string;
  teamName: string;
  workspaceId: string;
  workspaceName: string;
  yes: boolean;
};

function requireValue(flag: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

async function loadEnvFile(envFile: string | null) {
  if (!envFile) {
    return;
  }

  const raw = await readFile(envFile, "utf8");

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv: string[]): Options {
  let email: string | null = null;
  let password: string | null = null;
  let displayName: string | null = null;
  let workspaceId = "default-workspace";
  let workspaceName = "Default Workspace";
  let teamId = "codex-swarm";
  let teamName = "Codex Swarm";
  let envFile: string | null = null;
  let yes = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--email") {
      email = requireValue(token, argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--password") {
      password = requireValue(token, argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--display-name") {
      displayName = requireValue(token, argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--workspace-id") {
      workspaceId = requireValue(token, argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--workspace-name") {
      workspaceName = requireValue(token, argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--team-id") {
      teamId = requireValue(token, argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--team-name") {
      teamName = requireValue(token, argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--env-file") {
      envFile = path.resolve(requireValue(token, argv[index + 1]));
      index += 1;
      continue;
    }

    if (token === "--yes") {
      yes = true;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  if (!yes) {
    throw new Error("bootstrap-admin requires --yes for non-interactive execution");
  }

  return {
    email: requireValue("--email", email ?? undefined),
    password: requireValue("--password", password ?? undefined),
    displayName: requireValue("--display-name", displayName ?? undefined),
    workspaceId,
    workspaceName,
    teamId,
    teamName,
    envFile,
    yes
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadEnvFile(options.envFile);
  const config = getConfig();
  const pool = createPool(config.DATABASE_URL);

  try {
    await ensureControlPlaneCompatibility(
      pool,
      config.CONTROL_PLANE_SCHEMA_VERSION,
      config.CONTROL_PLANE_CONFIG_VERSION
    );
    const authService = new AuthService(createDb(pool), systemClock, config);
    const result = await authService.bootstrapFirstAdmin({
      email: options.email,
      password: options.password,
      displayName: options.displayName,
      workspaceId: options.workspaceId,
      workspaceName: options.workspaceName,
      teamId: options.teamId,
      teamName: options.teamName
    });

    console.log(JSON.stringify({
      status: "created",
      userId: result.userId,
      email: result.email,
      role: result.role,
      workspaceId: result.workspaceId,
      teamId: result.teamId
    }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
