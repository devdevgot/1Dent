#!/usr/bin/env bash
set -euo pipefail

corepack enable
pnpm --version

pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server --filter @workspace/dental-crm --filter @workspace/tg-admin-app run build
mkdir -p artifacts/api-server/dist/drizzle
cp -R lib/db/drizzle/. artifacts/api-server/dist/drizzle/

# Bundle pdfmake Roboto fonts next to the server build (production-safe font paths).
PDFMAKE_FONTS="$(pnpm --filter @workspace/api-server exec node -e "const p=require('path');console.log(p.join(p.dirname(require.resolve('pdfmake/package.json')),'fonts','Roboto'))")"
mkdir -p artifacts/api-server/dist/fonts/Roboto
cp -R "${PDFMAKE_FONTS}/." artifacts/api-server/dist/fonts/Roboto/

# Smoke test export builders (no DB required).
DATABASE_URL="${DATABASE_URL:-postgresql://smoke:smoke@127.0.0.1:5432/smoke}" \
  pnpm --filter @workspace/api-server exec node --import tsx scripts/smoke-financial-export.mjs
