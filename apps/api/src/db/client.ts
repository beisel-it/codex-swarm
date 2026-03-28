import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getConfig } from "../config.js";
import * as schema from "./schema.js";

export function createPool(connectionString = getConfig().DATABASE_URL): Pool {
  return new Pool({
    connectionString
  });
}

export function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export type AppDb = ReturnType<typeof createDb>;
