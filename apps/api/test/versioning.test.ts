import { describe, expect, it } from "vitest";

import {
  CONTROL_PLANE_METADATA_ID,
  ensureControlPlaneCompatibility,
  type ControlPlaneMetadata,
  validateControlPlaneMetadata
} from "../src/db/versioning.js";

class FakePool {
  constructor(
    private readonly tableExists: boolean,
    private readonly metadata: ControlPlaneMetadata | null
  ) {}

  async query<T extends Record<string, unknown>>(_text: string, values?: unknown[]) {
    if (Array.isArray(values) && values[0] === CONTROL_PLANE_METADATA_ID) {
      if (!this.metadata) {
        return { rows: [] as T[] };
      }

      return {
        rows: [{
          schema_version: this.metadata.schemaVersion,
          config_version: this.metadata.configVersion,
          upgraded_at: this.metadata.upgradedAt,
          notes: this.metadata.notes
        }] as unknown as T[]
      };
    }

    return {
      rows: [{
        metadata_table: this.tableExists ? "control_plane_metadata" : null
      }] as unknown as T[]
    };
  }
}

describe("validateControlPlaneMetadata", () => {
  it("accepts matching schema and config versions", () => {
    const metadata = validateControlPlaneMetadata({
      schemaVersion: "2026-03-29-project-job-scope",
      configVersion: "1",
      upgradedAt: new Date("2026-03-29T00:00:00.000Z"),
      notes: "upgrade complete"
    }, "2026-03-29-project-job-scope", "1");

    expect(metadata.schemaVersion).toBe("2026-03-29-project-job-scope");
  });

  it("rejects missing metadata with an upgrade hint", () => {
    expect(() => validateControlPlaneMetadata(null, "2026-03-29-project-job-scope", "1"))
      .toThrow(/db:migrate/);
  });

  it("rejects version mismatches deterministically", () => {
    expect(() => validateControlPlaneMetadata({
      schemaVersion: "2026-03-28",
      configVersion: "1",
      upgradedAt: new Date("2026-03-29T00:00:00.000Z"),
      notes: null
    }, "2026-03-29-project-job-scope", "1")).toThrow(/schema version mismatch/);

    expect(() => validateControlPlaneMetadata({
      schemaVersion: "2026-03-29-project-job-scope",
      configVersion: "0",
      upgradedAt: new Date("2026-03-29T00:00:00.000Z"),
      notes: null
    }, "2026-03-29-project-job-scope", "1")).toThrow(/config version mismatch/);
  });
});

describe("ensureControlPlaneCompatibility", () => {
  it("reads metadata from the database compatibility row", async () => {
    const metadata = await ensureControlPlaneCompatibility(
      new FakePool(true, {
        schemaVersion: "2026-03-29-project-job-scope",
        configVersion: "1",
        upgradedAt: new Date("2026-03-29T01:00:00.000Z"),
        notes: "upgrade complete"
      }) as never,
      "2026-03-29-project-job-scope",
      "1"
    );

    expect(metadata.notes).toBe("upgrade complete");
  });

  it("fails when the metadata table does not exist yet", async () => {
    await expect(ensureControlPlaneCompatibility(
      new FakePool(false, null) as never,
      "2026-03-29-project-job-scope",
      "1"
    )).rejects.toThrow(/db:migrate/);
  });
});
