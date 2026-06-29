#!/usr/bin/env bash
# First-time Railway project bootstrap for 1Dent.
# Run from repo root: bash scripts/railway-setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVICE_NAME="${RAILWAY_SERVICE_NAME:-1dent}"
PROJECT_NAME="${RAILWAY_PROJECT_NAME:-1dent}"

ensure_railway_cli() {
  if command -v railway >/dev/null; then
    return
  fi
  if [[ -x "$HOME/.railway/bin/railway" ]]; then
    export PATH="$HOME/.railway/bin:$PATH"
    return
  fi
  echo "→ Installing Railway CLI..."
  bash <(curl -fsSL railway.com/install.sh)
  export PATH="$HOME/.railway/bin:$PATH"
}

ensure_railway_cli

echo "=== 1Dent — Railway setup ==="
echo ""

if ! railway whoami >/dev/null 2>&1; then
  echo "→ Log in to Railway (browser or device code)"
  railway login
fi

echo "→ Railway account: $(railway whoami)"
echo ""

if [[ ! -f .railway/config.json ]]; then
  echo "→ Creating project: ${PROJECT_NAME}"
  railway init -n "$PROJECT_NAME"
else
  echo "→ Project already linked ($(railway status 2>/dev/null | head -3 || echo 'linked'))"
fi

echo ""
echo "→ Adding PostgreSQL (skip if already exists)"
railway add -d postgres -y 2>/dev/null || echo "   (postgres may already exist)"

echo ""
echo "→ Creating web service: ${SERVICE_NAME}"
railway add -s "$SERVICE_NAME" -y 2>/dev/null || echo "   (service may already exist)"

echo ""
echo "→ Linking CLI to service ${SERVICE_NAME}"
railway service "$SERVICE_NAME" 2>/dev/null || true

echo ""
echo "→ Setting core environment variables"
railway variable set \
  NODE_ENV=production \
  NODE_VERSION=22 \
  NODE_OPTIONS=--enable-source-maps \
  CI=true \
  FRONTEND_URL=https://1dent.kz \
  PUBLIC_URL=https://1dent.kz \
  --service "$SERVICE_NAME"

link_postgres_url() {
  local postgres_service="$1"
  railway variable set \
    "DATABASE_URL=\${{${postgres_service}.DATABASE_URL}}" \
    --service "$SERVICE_NAME" 2>/dev/null
}

echo ""
echo "→ Linking Postgres DATABASE_URL to ${SERVICE_NAME}"
LINKED=0
for candidate in Postgres postgres PostgreSQL postgresql; do
  if link_postgres_url "$candidate"; then
    echo "   ✓ DATABASE_URL=\${{${candidate}.DATABASE_URL}}"
    LINKED=1
    break
  fi
done

if [[ "$LINKED" -eq 0 ]]; then
  echo "   ⚠ Could not auto-link Postgres. In Railway Dashboard:"
  echo "     ${SERVICE_NAME} → Variables → Reference → <Postgres service> → DATABASE_URL"
  echo "   Or run (replace <db-service> with the actual name from railway status):"
  echo "     railway variable set 'DATABASE_URL=\${{<db-service>.DATABASE_URL}}' --service ${SERVICE_NAME}"
fi

echo ""
echo "→ Generating Railway public domain (for webhooks until 1dent.kz is attached)"
railway domain --service "$SERVICE_NAME" || true
echo "   Then set: railway variable set WEBHOOK_BASE_URL=https://<your-domain>.up.railway.app --service ${SERVICE_NAME}"

cat <<EOF

=== Setup complete ===

Next steps:

1. Add secrets (copy from Replit / production):
   railway variable set JWT_SECRET="<random-64-chars>" --service ${SERVICE_NAME}
   railway variable set OPENROUTER_API_KEY="..." --service ${SERVICE_NAME}
   railway variable set RESEND_API_KEY="..." --service ${SERVICE_NAME}
   railway variable set RESEND_FROM_EMAIL="1Dent <noreply@1dent.kz>" --service ${SERVICE_NAME}
   railway variable set WHATSAPP_TOKEN="..." --service ${SERVICE_NAME}
   railway variable set WHATSAPP_PHONE_ID="..." --service ${SERVICE_NAME}
   railway variable set WHATSAPP_APP_SECRET="..." --service ${SERVICE_NAME}
   railway variable set PLATFORM_TG_BOT_TOKEN="..." --service ${SERVICE_NAME}
   railway variable set PLATFORM_SUPERADMIN_TG_ID="..." --service ${SERVICE_NAME}

2. Optional Redis for BullMQ queues:
   railway add -d redis -y
   railway variable set 'REDIS_URL=\${{Redis.REDIS_URL}}' --service ${SERVICE_NAME}

3. Deploy:
   bash scripts/railway-deploy.sh

4. After custom domain 1dent.kz is attached:
   railway domain 1dent.kz --service ${SERVICE_NAME}
   railway variable set WEBHOOK_BASE_URL=https://1dent.kz --service ${SERVICE_NAME}
   railway variable set FRONTEND_URL=https://1dent.kz --service ${SERVICE_NAME}
   railway variable set PUBLIC_URL=https://1dent.kz --service ${SERVICE_NAME}

Useful commands:
  railway status
  railway logs
  railway open
  railway connect postgres

EOF
