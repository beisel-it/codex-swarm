import { createControlPlaneSnapshot, summarizeSnapshot, writeSnapshotFile } from "./control-plane-snapshot.mjs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const timestamp = new Date().toISOString().replaceAll(":", "-");
const filePath = process.env.BACKUP_FILE ?? `.ops/backups/control-plane-${timestamp}.json`;
const startedAt = Date.now();

const snapshot = await createControlPlaneSnapshot(connectionString);
const resolvedPath = await writeSnapshotFile(filePath, snapshot);
const counts = summarizeSnapshot(snapshot);

console.log(JSON.stringify({
  backupFile: resolvedPath,
  capturedAt: snapshot.metadata.capturedAt,
  durationMs: Date.now() - startedAt,
  counts
}, null, 2));
