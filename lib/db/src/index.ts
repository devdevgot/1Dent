import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { resolveDatabaseUrl } from "./resolve-database-url";

const { Pool } = pg;

const connectionString = resolveDatabaseUrl();

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
