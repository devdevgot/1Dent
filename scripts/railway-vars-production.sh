#!/usr/bin/env bash
# Apply production environment variables to the 1dent Railway service.
# Requires RAILWAY_TOKEN (project-scoped, Production environment).
#
# Usage:
#   export RAILWAY_TOKEN="<project-token>"
#   export JWT_SECRET="..." OPENROUTER_API_KEY="..."  # optional if already on Railway
#   bash scripts/railway-vars-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/railway-auth.sh
source "$ROOT/scripts/railway-auth.sh"

SERVICE_NAME="${RAILWAY_SERVICE_NAME:-1dent}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"

railway_auth_preflight
railway_require_service "$SERVICE_NAME"

set_var() {
  local key="$1"
  local value="$2"
  railway variable set "${key}=${value}" \
    --service "$SERVICE_NAME" \
    --environment "$ENVIRONMENT" \
    --skip-deploys
}

set_var_if_set() {
  local key="$1"
  local value="${!1:-}"
  if [[ -n "$value" ]]; then
    set_var "$key" "$value"
    echo "  ✓ ${key}"
  fi
}

echo "=== 1Dent production variables → ${SERVICE_NAME} (${ENVIRONMENT}) ==="
echo ""

echo "→ Core"
set_var NODE_ENV production
set_var NODE_VERSION 22
set_var NODE_OPTIONS --enable-source-maps
set_var CI true
set_var FRONTEND_URL "${FRONTEND_URL:-https://www.1dent.kz}"
set_var PUBLIC_URL "${PUBLIC_URL:-https://www.1dent.kz}"
set_var WEBHOOK_BASE_URL "${WEBHOOK_BASE_URL:-https://www.1dent.kz}"
echo "  ✓ NODE_ENV, FRONTEND_URL, PUBLIC_URL, WEBHOOK_BASE_URL"

echo ""
echo "→ Database reference"
if railway variable set \
  "DATABASE_URL=\${{Postgres.DATABASE_URL}}" \
  --service "$SERVICE_NAME" \
  --environment "$ENVIRONMENT" \
  --skip-deploys 2>/dev/null; then
  echo "  ✓ DATABASE_URL=\${{Postgres.DATABASE_URL}}"
else
  echo "  ⚠ Could not link Postgres — add DATABASE_URL reference manually in Railway dashboard"
fi

echo ""
echo "→ Secrets (from env, skip if unset)"
for key in \
  JWT_SECRET \
  OPENROUTER_API_KEY \
  RESEND_API_KEY \
  RESEND_FROM_EMAIL \
  WHATSAPP_TOKEN \
  WHATSAPP_PHONE_ID \
  WHATSAPP_APP_SECRET \
  WHATSAPP_WEBHOOK_SECRET \
  PLATFORM_TG_BOT_TOKEN \
  PLATFORM_SUPERADMIN_TG_ID \
  TRACKING_TG_BOT_TOKEN \
  VAPID_PUBLIC_KEY \
  VAPID_PRIVATE_KEY \
  VAPID_SUBJECT \
  GREEN_API_PARTNER_TOKEN \
  TWOGIS_API_KEY \
  REDIS_URL \
  R2_ACCOUNT_ID \
  R2_BUCKET_NAME \
  R2_ENDPOINT \
  R2_ACCESS_KEY_ID \
  R2_SECRET_ACCESS_KEY \
  R2_PUBLIC_URL \
  PRIVATE_OBJECT_DIR \
  PUBLIC_OBJECT_SEARCH_PATHS; do
  set_var_if_set "$key"
done

# Defaults for R2 layout when keys are provided
if [[ -n "${R2_ACCESS_KEY_ID:-}" ]]; then
  set_var R2_ACCOUNT_ID "${R2_ACCOUNT_ID:-81fb0846943c98f6dabf2881deccb7f4}"
  set_var R2_BUCKET_NAME "${R2_BUCKET_NAME:-onedent}"
  set_var R2_ENDPOINT "${R2_ENDPOINT:-https://81fb0846943c98f6dabf2881deccb7f4.r2.cloudflarestorage.com}"
  set_var PRIVATE_OBJECT_DIR "${PRIVATE_OBJECT_DIR:-private}"
  set_var PUBLIC_OBJECT_SEARCH_PATHS "${PUBLIC_OBJECT_SEARCH_PATHS:-public}"
  echo "  ✓ R2 defaults applied"
fi

if [[ -z "${JWT_SECRET:-}" ]]; then
  echo ""
  echo "⚠ JWT_SECRET not set in env — ensure it exists on Railway before deploy."
fi

echo ""
echo "→ Redeploy to apply changes"
railway redeploy --service "$SERVICE_NAME" --environment "$ENVIRONMENT" -y
echo ""
echo "✓ Done. Health check: https://www.1dent.kz/api/healthz"
