const RAILWAY_HINT =
  "On Railway: add PostgreSQL to the project, then on this service set " +
  "DATABASE_URL=${{Postgres.DATABASE_URL}} (use your Postgres service name). " +
  "Or run: bash scripts/railway-setup.sh";

function buildUrlFromPgEnv(): string | undefined {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (!PGHOST || !PGUSER || !PGPASSWORD || !PGDATABASE) {
    return undefined;
  }

  const user = encodeURIComponent(PGUSER);
  const password = encodeURIComponent(PGPASSWORD);
  const port = PGPORT || "5432";
  return `postgresql://${user}:${password}@${PGHOST}:${port}/${PGDATABASE}`;
}

/** Resolve Postgres URL from common env vars (Railway, Render, Heroku, etc.). */
export function resolveDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.DATABASE_PRIVATE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRESQL_URL ??
    buildUrlFromPgEnv();

  if (!url) {
    throw new Error(
      `DATABASE_URL must be set. Did you forget to provision a database? ${RAILWAY_HINT}`,
    );
  }

  // Normalize so JWT bootstrap and migrations see the same value.
  process.env.DATABASE_URL = url;
  return url;
}
