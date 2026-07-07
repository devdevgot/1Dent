#!/usr/bin/env bash
# Deploy 1Dent to Railway from local checkout.
# Run from repo root: bash scripts/railway-deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVICE_NAME="${RAILWAY_SERVICE_NAME:-1dent}"
DETACH="${RAILWAY_DEPLOY_DETACH:-1}"

if [[ -x "$HOME/.railway/bin/railway" ]]; then
  export PATH="$HOME/.railway/bin:$PATH"
fi

# shellcheck source=scripts/railway-auth.sh
source "$ROOT/scripts/railway-auth.sh"

if ! railway_auth_preflight; then
  echo "Not authenticated. Set RAILWAY_TOKEN or run: railway login"
  exit 1
fi

railway_require_service "$SERVICE_NAME"

railway service "$SERVICE_NAME" 2>/dev/null || true

echo "→ Deploying ${SERVICE_NAME} to Railway..."
if [[ "$DETACH" == "1" ]]; then
  railway up -s "$SERVICE_NAME" -y -d
  echo ""
  echo "Deploy started in background. Stream logs: railway logs --service ${SERVICE_NAME}"
else
  railway up -s "$SERVICE_NAME" -y
fi

echo ""
echo "→ Health check: railway open  (then visit /api/healthz)"
