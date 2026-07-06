#!/usr/bin/env bash
# Configure Cloudflare R2 object storage variables on Railway (1dent service).
# Usage:
#   export R2_ACCESS_KEY_ID=...
#   export R2_SECRET_ACCESS_KEY=...
#   bash scripts/railway-r2-setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVICE_NAME="${RAILWAY_SERVICE_NAME:-1dent}"

R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-81fb0846943c98f6dabf2881deccb7f4}"
R2_BUCKET_NAME="${R2_BUCKET_NAME:-onedent}"
R2_ENDPOINT="${R2_ENDPOINT:-https://81fb0846943c98f6dabf2881deccb7f4.r2.cloudflarestorage.com}"
PRIVATE_OBJECT_DIR="${PRIVATE_OBJECT_DIR:-private}"
PUBLIC_OBJECT_SEARCH_PATHS="${PUBLIC_OBJECT_SEARCH_PATHS:-public}"

if [[ -z "${R2_ACCESS_KEY_ID:-}" || -z "${R2_SECRET_ACCESS_KEY:-}" ]]; then
  echo "ERROR: Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY before running."
  echo "Create token: Cloudflare Dashboard → R2 → Manage R2 API Tokens"
  exit 1
fi

if ! command -v railway >/dev/null 2>&1; then
  if [[ -x "$HOME/.railway/bin/railway" ]]; then
    export PATH="$HOME/.railway/bin:$PATH"
  else
    echo "→ Installing Railway CLI..."
    bash <(curl -fsSL railway.com/install.sh)
    export PATH="$HOME/.railway/bin:$PATH"
  fi
fi

if [[ -n "${RAILWAY_API_TOKEN_1DENT:-}" ]]; then
  export RAILWAY_TOKEN="$RAILWAY_API_TOKEN_1DENT"
elif [[ -n "${RAILWAY_TOKEN:-}" ]]; then
  :
else
  echo "ERROR: Set RAILWAY_TOKEN or RAILWAY_API_TOKEN_1DENT for Railway API access."
  exit 1
fi

echo "=== Railway R2 setup → service: ${SERVICE_NAME} ==="

railway variable set \
  R2_ACCOUNT_ID="$R2_ACCOUNT_ID" \
  R2_BUCKET_NAME="$R2_BUCKET_NAME" \
  R2_ENDPOINT="$R2_ENDPOINT" \
  R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  PRIVATE_OBJECT_DIR="$PRIVATE_OBJECT_DIR" \
  PUBLIC_OBJECT_SEARCH_PATHS="$PUBLIC_OBJECT_SEARCH_PATHS" \
  --service "$SERVICE_NAME"

if [[ -n "${R2_PUBLIC_URL:-}" ]]; then
  railway variable set "R2_PUBLIC_URL=$R2_PUBLIC_URL" --service "$SERVICE_NAME"
  echo "✓ R2_PUBLIC_URL set"
fi

echo ""
echo "✓ R2 variables applied. Redeploy the service:"
echo "  railway redeploy --service ${SERVICE_NAME}"
echo ""
echo "Optional: attach custom domain to R2 bucket for direct CDN playback,"
echo "then set R2_PUBLIC_URL=https://videos.1dent.kz"
