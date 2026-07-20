#!/usr/bin/env bash
# Run full k6 suite against a running 1Dent API and generate the report.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
K6_DIR="$ROOT/load-tests/k6"
REPORT_DIR="$ROOT/load-tests/reports"
RAW_DIR="$REPORT_DIR/raw"
LOG_DIR="$REPORT_DIR/logs"

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
export BASE_URL
export AUTH_EMAIL="${AUTH_EMAIL:-loadtest@1dent.local}"
export AUTH_PASSWORD="${AUTH_PASSWORD:-LoadTest1!}"
export SOAK_DURATION="${SOAK_DURATION:-5m}"
export SOAK_VUS="${SOAK_VUS:-25}"

mkdir -p "$RAW_DIR" "$LOG_DIR"

echo "==> Seeding load-test data at $BASE_URL"
node "$ROOT/load-tests/scripts/seed-loadtest-data.mjs"

if [[ -f "$REPORT_DIR/loadtest-credentials.json" ]]; then
  TOKEN="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$REPORT_DIR/loadtest-credentials.json','utf8')).token)")"
  export AUTH_TOKEN="$TOKEN"
fi

run_scenario() {
  local name="$1"
  local file="$2"
  shift 2
  local extra_args=("$@")
  echo ""
  echo "========================================"
  echo "==> k6 scenario: $name"
  echo "========================================"
  # Always keep going to collect full report; capture exit code
  set +e
  k6 run \
    --summary-trend-stats="avg,min,med,max,p(90),p(95),p(99)" \
    "${extra_args[@]}" \
    "$K6_DIR/scenarios/$file" \
    2>&1 | tee "$LOG_DIR/${name}.log"
  local code=${PIPESTATUS[0]}
  set -e
  echo "==> $name finished with exit code $code"
  echo "$code" > "$LOG_DIR/${name}.exit"
}

# Order: smoke first (fail-fast optional), then capacity ladder
run_scenario smoke smoke.js
run_scenario public-health public-health.js
run_scenario auth-login auth-login.js
run_scenario crm-browse crm-browse.js
run_scenario write-ops write-ops.js
run_scenario spike spike.js
run_scenario stress stress.js --no-thresholds
run_scenario soak soak.js
run_scenario mixed mixed.js

echo ""
echo "==> Generating Markdown report"
node "$ROOT/load-tests/scripts/generate-report.mjs"

echo ""
echo "Done. Report: $REPORT_DIR/LOAD_TEST_REPORT.md"
ls -la "$RAW_DIR" || true
