#!/usr/bin/env bash
set -euo pipefail

corepack enable
pnpm --version

pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server --filter @workspace/dental-crm --filter @workspace/tg-admin-app run build
