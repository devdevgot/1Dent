import { defineConfig } from "drizzle-kit";
import { resolveDatabaseUrl } from "./src/resolve-database-url";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
