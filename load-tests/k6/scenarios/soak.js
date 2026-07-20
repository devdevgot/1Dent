/**
 * Soak — sustained moderate load to surface leaks / connection pool exhaustion.
 * Duration configurable via SOAK_DURATION (default 5m for CI-friendly runs; use 30m+ for real soak).
 */
import { sleep } from "k6";
import { login } from "../lib/auth.js";
import {
  browseDashboard,
  browsePatients,
  browseCalendar,
  browseAnalytics,
  writePatientFlow,
} from "../lib/crm-flows.js";
import { thresholds } from "../lib/config.js";

const soakDuration = __ENV.SOAK_DURATION || "5m";

export const options = {
  scenarios: {
    soak: {
      executor: "constant-vus",
      vus: Number(__ENV.SOAK_VUS || 25),
      duration: soakDuration,
      tags: { scenario: "soak" },
    },
  },
  thresholds: {
    ...thresholds,
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000", "p(99)<8000"],
    checks: ["rate>0.90"],
  },
};

export function setup() {
  const auth = login();
  if (!auth.token) throw new Error("soak: login failed");
  return { token: auth.token };
}

export default function (data) {
  const roll = Math.random();
  if (roll < 0.3) browseDashboard(data.token);
  else if (roll < 0.55) browsePatients(data.token);
  else if (roll < 0.75) browseCalendar(data.token);
  else if (roll < 0.9) browseAnalytics(data.token);
  else writePatientFlow(data.token);
  sleep(1 + Math.random() * 2);
}

export function handleSummary(data) {
  return {
    "/workspace/load-tests/reports/raw/soak-summary.json": JSON.stringify(data, null, 2),
  };
}
