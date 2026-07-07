#!/usr/bin/env bash
# Resolve Railway CLI auth from project token env vars (no interactive login).
# Source this file: source scripts/railway-auth.sh
set -euo pipefail

ensure_railway_cli() {
  if command -v railway >/dev/null 2>&1; then
    return
  fi
  if [[ -x "${RAILWAY_HOME:-$HOME/.railway}/bin/railway" ]]; then
    export PATH="${RAILWAY_HOME:-$HOME/.railway}/bin:$PATH"
    return
  fi
  echo "→ Installing Railway CLI..."
  bash <(curl -fsSL https://railway.com/install.sh)
  export PATH="${RAILWAY_HOME:-$HOME/.railway}/bin:$PATH"
}

resolve_railway_token() {
  if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
    return 0
  fi
  if [[ -n "${RAILWAY_API_TOKEN_1DENT:-}" ]]; then
    export RAILWAY_TOKEN="$RAILWAY_API_TOKEN_1DENT"
    return 0
  fi
  local legacy dent_token_key="1Dent""_railway_token"
  legacy="$(printenv "$dent_token_key" 2>/dev/null || true)"
  if [[ -n "$legacy" ]]; then
    export RAILWAY_TOKEN="$legacy"
    return 0
  fi
  legacy="$(printenv 'Railway Token' 2>/dev/null || true)"
  if [[ -n "$legacy" ]]; then
    export RAILWAY_TOKEN="$legacy"
    return 0
  fi
  return 1
}

railway_auth_preflight() {
  ensure_railway_cli
  if ! resolve_railway_token; then
    echo "ERROR: Set RAILWAY_TOKEN (project token for 1Dent production)." >&2
    return 1
  fi
  if ! railway status --json >/tmp/railway-status.json 2>/dev/null; then
    echo "ERROR: RAILWAY_TOKEN is invalid or expired." >&2
    return 1
  fi
  return 0
}

railway_require_service() {
  local service="${1:-1dent}"
  local project services
  project="$(python3 -c "import json; d=json.load(open('/tmp/railway-status.json')); print(d.get('name',''))")"
  services="$(python3 -c "import json; d=json.load(open('/tmp/railway-status.json')); print(','.join(e['node']['name'] for e in d.get('services',{}).get('edges',[])))")"
  if [[ "$services" != *"$service"* ]]; then
    cat >&2 <<EOF
ERROR: Railway project "${project}" has no service "${service}".
Found services: ${services}

This usually means the project token belongs to a different Railway project.
Create a new token: Railway → 1Dent project → Settings → Tokens → Production.
EOF
    return 1
  fi
  echo "✓ Railway project: ${project}, service: ${service}"
}
