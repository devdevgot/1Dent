/**
 * Smoke — sanity check that core endpoints respond.
 * ~1 VU, short duration. Exit non-zero if thresholds fail.
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";
import { thresholds } from "../lib/config.js";
import { login } from "../lib/auth.js";
import { browseDashboard, browsePatients, browseCalendar } from "../lib/crm-flows.js";
import { url } from "../lib/helpers.js";

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: 1,
      duration: "30s",
      tags: { scenario: "smoke" },
    },
  },
  thresholds: {
    ...thresholds,
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
    checks: ["rate>0.95"],
  },
};

export function setup() {
  const health = http.get(url("/api/healthz"));
  check(health, { "healthz ok": (r) => r.status === 200 });
  const auth = login();
  if (!auth.token) {
    throw new Error(`Smoke setup login failed: ${JSON.stringify(auth)}`);
  }
  return { token: auth.token };
}

export default function (data) {
  const health = http.get(url("/api/healthz"), { tags: { endpoint: "healthz" } });
  check(health, { "healthz 200": (r) => r.status === 200 });

  browseDashboard(data.token);
  browsePatients(data.token);
  browseCalendar(data.token);
  sleep(1);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: false }),
    "/workspace/load-tests/reports/raw/smoke-summary.json": JSON.stringify(data, null, 2),
  };
}
