import { applySchemaMigrations, readSnapshotFile, restoreControlPlaneSnapshot, summarizeSnapshot } from "./control-plane-snapshot.mjs";

const connectionString = process.env.RESTORE_DATABASE_URL ?? process.env.DATABASE_URL;
const snapshotFile = process.env.BACKUP_FILE;

if (!connectionString) {
  console.error("RESTORE_DATABASE_URL or DATABASE_URL is required");
  process.exit(1);
}

if (!snapshotFile) {
  console.error("BACKUP_FILE is required");
  process.exit(1);
}

const startedAt = Date.now();
const snapshot = await readSnapshotFile(snapshotFile);
applySchemaMigrations(connectionString);
await restoreControlPlaneSnapshot(connectionString, snapshot);

console.log(JSON.stringify({
  backupFile: snapshotFile,
  restoredAt: new Date().toISOString(),
  durationMs: Date.now() - startedAt,
  counts: summarizeSnapshot(snapshot)
}, null, 2));
