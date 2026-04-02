import type { Pool } from "pg";

export const CURRENT_CONTROL_PLANE_SCHEMA_VERSION = "2026-04-02-auth-bootstrap";
export const CURRENT_CONTROL_PLANE_CONFIG_VERSION = "1";
export const CONTROL_PLANE_METADATA_ID = "control-plane";

export interface ControlPlaneMetadata {
  schemaVersion: string;
  configVersion: string;
  upgradedAt: Date;
  notes: string | null;
}

type QueryResultRow = {
  schema_version: string;
  config_version: string;
  upgraded_at: Date | string;
  notes: string | null;
};

type Queryable = Pick<Pool, "query">;

export const controlPlaneMetadataTableSql = `create table if not exists control_plane_metadata (
  id text primary key,
  schema_version text not null,
  config_version text not null,
  upgraded_at timestamptz not null default now(),
  notes text
)`;

export function validateControlPlaneMetadata(
  metadata: ControlPlaneMetadata | null,
  expectedSchemaVersion: string,
  expectedConfigVersion: string
) {
  if (!metadata) {
    throw new Error(
      "control-plane metadata is missing; run `corepack pnpm --dir apps/api db:migrate` before starting this build"
    );
  }

  if (metadata.schemaVersion !== expectedSchemaVersion) {
    throw new Error(
      `control-plane schema version mismatch: expected ${expectedSchemaVersion}, found ${metadata.schemaVersion}; run ` +
      "`corepack pnpm --dir apps/api db:migrate` before starting this build"
    );
  }

  if (metadata.configVersion !== expectedConfigVersion) {
    throw new Error(
      `control-plane config version mismatch: expected ${expectedConfigVersion}, found ${metadata.configVersion}; ` +
      "update the runtime configuration to the documented M6 version before starting this build"
    );
  }

  return metadata;
}

export async function readControlPlaneMetadata(queryable: Queryable): Promise<ControlPlaneMetadata | null> {
  const tableResult = await queryable.query<{ metadata_table: string | null }>(
    "select to_regclass('public.control_plane_metadata') as metadata_table"
  );

  if (!tableResult.rows[0]?.metadata_table) {
    return null;
  }

  const result = await queryable.query<QueryResultRow>(
    `select schema_version, config_version, upgraded_at, notes
     from control_plane_metadata
     where id = $1
     limit 1`,
    [CONTROL_PLANE_METADATA_ID]
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    schemaVersion: row.schema_version,
    configVersion: row.config_version,
    upgradedAt: row.upgraded_at instanceof Date ? row.upgraded_at : new Date(row.upgraded_at),
    notes: row.notes ?? null
  };
}

export async function ensureControlPlaneCompatibility(
  queryable: Queryable,
  expectedSchemaVersion: string,
  expectedConfigVersion: string
) {
  const metadata = await readControlPlaneMetadata(queryable);
  return validateControlPlaneMetadata(metadata, expectedSchemaVersion, expectedConfigVersion);
}
