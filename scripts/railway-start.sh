#!/usr/bin/env bash
# Railway start wrapper: normalize DB env vars and fail fast with setup hints.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -n "${DATABASE_PRIVATE_URL:-}" ]]; then
    export DATABASE_URL="$DATABASE_PRIVATE_URL"
  elif [[ -n "${POSTGRES_URL:-}" ]]; then
    export DATABASE_URL="$POSTGRES_URL"
  elif [[ -n "${PGHOST:-}" && -n "${PGUSER:-}" && -n "${PGPASSWORD:-}" && -n "${PGDATABASE:-}" ]]; then
    export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE}"
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  cat <<'EOF' >&2
ERROR: DATABASE_URL is not set — api-server cannot start.

Railway fix (Dashboard):
  1. Project → Add PostgreSQL (if missing)
  2. Open your web service → Variables → New Variable → Reference
  3. Select the Postgres service → DATABASE_URL
  4. Redeploy

Railway fix (CLI, from repo root):
  bash scripts/railway-setup.sh

Manual reference (replace Postgres with your DB service name):
  railway variable set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --service <web-service>
EOF
  exit 1
fi

exec pnpm --filter @workspace/api-server run start
