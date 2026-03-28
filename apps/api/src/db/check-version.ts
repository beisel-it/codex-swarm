import { createPool } from "./client.js";
import {
  CURRENT_CONTROL_PLANE_CONFIG_VERSION,
  CURRENT_CONTROL_PLANE_SCHEMA_VERSION,
  ensureControlPlaneCompatibility
} from "./versioning.js";

async function main() {
  const pool = createPool();

  try {
    const metadata = await ensureControlPlaneCompatibility(
      pool,
      CURRENT_CONTROL_PLANE_SCHEMA_VERSION,
      CURRENT_CONTROL_PLANE_CONFIG_VERSION
    );

    console.log(JSON.stringify({
      status: "ok",
      schemaVersion: metadata.schemaVersion,
      configVersion: metadata.configVersion,
      upgradedAt: metadata.upgradedAt.toISOString(),
      notes: metadata.notes
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
