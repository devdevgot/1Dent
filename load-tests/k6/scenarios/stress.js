/**
 * Stress / breakpoint — ramp VUs until error rate or latency collapses.
 * Designed to find the breaking point, not to pass thresholds.
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

export const options = {
  scenarios: {
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "45s", target: 50 },
        { duration: "45s", target: 100 },
        { duration: "45s", target: 150 },
        { duration: "45s", target: 200 },
        { duration: "30s", target: 250 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
      tags: { scenario: "stress" },
    },
  },
  // Soft thresholds — report always generated; CI can ignore exit code with --no-thresholds
  thresholds: {
    ...thresholds,
    http_req_failed: ["rate<0.50"],
    http_req_duration: ["p(95)<15000"],
  },
};

export function setup() {
  const auth = login();
  if (!auth.token) throw new Error("stress: login failed");
  return { token: auth.token };
}

export default function (data) {
  const roll = Math.random();
  if (roll < 0.3) browseDashboard(data.token);
  else if (roll < 0.55) browsePatients(data.token);
  else if (roll < 0.75) browseCalendar(data.token);
  else if (roll < 0.9) browseAnalytics(data.token);
  else writePatientFlow(data.token);
  sleep(0.1 + Math.random() * 0.4);
}

export function handleSummary(data) {
  return {
    "/workspace/load-tests/reports/raw/stress-summary.json": JSON.stringify(data, null, 2),
  };
}
