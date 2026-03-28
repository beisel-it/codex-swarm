import pg from "pg";

import {
  applySchemaMigrations,
  createControlPlaneSnapshot,
  restoreControlPlaneSnapshot,
  summarizeSnapshot,
  writeSnapshotFile
} from "./control-plane-snapshot.mjs";

const { Client } = pg;

function buildDatabaseUrl(connectionString, databaseName) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createScratchDatabase(sourceConnectionString, databaseName) {
  const maintenanceUrl = buildDatabaseUrl(sourceConnectionString, "postgres");
  const client = new Client({ connectionString: maintenanceUrl });

  try {
    await client.connect();
    await client.query(`drop database if exists "${databaseName}"`);
    await client.query(`create database "${databaseName}" template template0`);
  } finally {
    await client.end();
  }
}

async function dropScratchDatabase(sourceConnectionString, databaseName) {
  const maintenanceUrl = buildDatabaseUrl(sourceConnectionString, "postgres");
  const client = new Client({ connectionString: maintenanceUrl });

  try {
    await client.connect();
    await client.query(`drop database if exists "${databaseName}"`);
  } finally {
    await client.end();
  }
}

const sourceConnectionString = process.env.DATABASE_URL;

if (!sourceConnectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const runId = new Date().toISOString().replaceAll(":", "-");
const scratchDatabaseName = process.env.DRILL_DATABASE_NAME ?? `codex_swarm_drill_${runId.replaceAll("-", "_").replaceAll(".", "_")}`;
const drillOutputFile = process.env.DRILL_OUTPUT_FILE ?? `.ops/drills/dr-exercise-${runId}.json`;
const explicitRestoreConnectionString = process.env.RESTORE_DATABASE_URL;
const scratchConnectionString = explicitRestoreConnectionString ?? buildDatabaseUrl(sourceConnectionString, scratchDatabaseName);
const startedAt = Date.now();

try {
  if (!explicitRestoreConnectionString) {
    await createScratchDatabase(sourceConnectionString, new URL(scratchConnectionString).pathname.slice(1));
  }

  const backupStartedAt = Date.now();
  const snapshot = await createControlPlaneSnapshot(sourceConnectionString);
  const backupDurationMs = Date.now() - backupStartedAt;

  const restoreStartedAt = Date.now();
  applySchemaMigrations(scratchConnectionString);
  await restoreControlPlaneSnapshot(scratchConnectionString, snapshot);
  const restoreDurationMs = Date.now() - restoreStartedAt;

  const validationStartedAt = Date.now();
  const restoredSnapshot = await createControlPlaneSnapshot(scratchConnectionString);
  const validationDurationMs = Date.now() - validationStartedAt;
  const sourceCounts = summarizeSnapshot(snapshot);
  const restoredCounts = summarizeSnapshot(restoredSnapshot);
  const mismatches = Object.entries(sourceCounts)
    .filter(([tableName, count]) => restoredCounts[tableName] !== count)
    .map(([tableName, count]) => ({
      table: tableName,
      source: count,
      restored: restoredCounts[tableName]
    }));

  const report = {
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    sourceDatabase: new URL(sourceConnectionString).pathname.slice(1),
    restoreDatabase: new URL(scratchConnectionString).pathname.slice(1),
    backupDurationMs,
    restoreDurationMs,
    validationDurationMs,
    totalDurationMs: Date.now() - startedAt,
    sourceCounts,
    restoredCounts,
    mismatches,
    success: mismatches.length === 0
  };

  await writeSnapshotFile(drillOutputFile, report);
  console.log(JSON.stringify({
    drillReport: drillOutputFile,
    ...report
  }, null, 2));

  if (mismatches.length > 0) {
    process.exitCode = 1;
  }
} finally {
  if (!explicitRestoreConnectionString) {
    await dropScratchDatabase(sourceConnectionString, new URL(scratchConnectionString).pathname.slice(1));
  }
}
