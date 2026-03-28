import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import pg from "pg";

const { Pool } = pg;

export const CONTROL_PLANE_TABLES = [
  "workspaces",
  "teams",
  "repositories",
  "runs",
  "tasks",
  "agents",
  "worker_nodes",
  "sessions",
  "worker_dispatch_assignments",
  "messages",
  "approvals",
  "validations",
  "artifacts",
  "control_plane_events"
];

const TABLE_ORDER_BY = {
  workspaces: "id",
  teams: "id",
  repositories: "id",
  runs: "id",
  tasks: "id",
  agents: "id",
  worker_nodes: "id",
  sessions: "id",
  worker_dispatch_assignments: "id",
  messages: "id",
  approvals: "id",
  validations: "id",
  artifacts: "id",
  control_plane_events: "id"
};

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function getTableOrderBy(tableName) {
  const orderBy = TABLE_ORDER_BY[tableName];

  if (!orderBy) {
    throw new Error(`missing order clause for ${tableName}`);
  }

  return orderBy
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => quoteIdentifier(entry))
    .join(", ");
}

export function createPool(connectionString) {
  return new Pool({
    connectionString
  });
}

export function applySchemaMigrations(connectionString) {
  const apiDirectory = resolve(dirname(new URL(import.meta.url).pathname), "../..");
  const result = spawnSync("corepack", ["pnpm", "db:migrate"], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      DATABASE_URL: connectionString
    },
    stdio: "pipe",
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "schema migration failed");
  }
}

export async function createControlPlaneSnapshot(connectionString) {
  const pool = createPool(connectionString);
  const capturedAt = new Date();

  try {
    const tables = {};

    for (const tableName of CONTROL_PLANE_TABLES) {
      const result = await pool.query(
        `select coalesce(json_agg(to_jsonb(snapshot_row) order by ${getTableOrderBy(tableName)}), '[]'::json) as rows
         from (select * from ${quoteIdentifier(tableName)} order by ${getTableOrderBy(tableName)}) as snapshot_row`
      );
      const rows = result.rows[0]?.rows ?? [];
      tables[tableName] = rows;
    }

    return {
      metadata: {
        capturedAt: capturedAt.toISOString(),
        tableCount: CONTROL_PLANE_TABLES.length,
        schema: "codex-swarm-control-plane-v1"
      },
      tables
    };
  } finally {
    await pool.end();
  }
}

export async function restoreControlPlaneSnapshot(connectionString, snapshot) {
  const pool = createPool(connectionString);

  try {
    await pool.query("begin");
    await pool.query(`truncate table ${CONTROL_PLANE_TABLES.map(quoteIdentifier).join(", ")} restart identity cascade`);

    for (const tableName of CONTROL_PLANE_TABLES) {
      const rows = snapshot.tables?.[tableName] ?? [];

      if (rows.length === 0) {
        continue;
      }

      await pool.query(
        `insert into ${quoteIdentifier(tableName)}
         select * from json_populate_recordset(null::${quoteIdentifier(tableName)}, $1::json)`,
        [JSON.stringify(rows)]
      );
    }

    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  } finally {
    await pool.end();
  }
}

export function summarizeSnapshot(snapshot) {
  return Object.fromEntries(
    CONTROL_PLANE_TABLES.map((tableName) => [tableName, snapshot.tables?.[tableName]?.length ?? 0])
  );
}

export async function writeSnapshotFile(filePath, snapshot) {
  const resolvedPath = resolve(filePath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return resolvedPath;
}

export async function readSnapshotFile(filePath) {
  const raw = await readFile(resolve(filePath), "utf8");
  return JSON.parse(raw);
}
