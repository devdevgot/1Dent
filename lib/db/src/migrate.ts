import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDatabaseUrl } from "./resolve-database-url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl() });
const db = drizzle(pool);

console.log("[migrate] Applying database migrations...");

await migrate(db, {
  migrationsFolder: path.join(__dirname, "../drizzle"),
});

console.log("[migrate] Migrations applied successfully.");
await pool.end();
