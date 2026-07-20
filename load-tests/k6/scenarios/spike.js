/**
 * Spike — sudden traffic surge on CRM reads (flash crowd).
 */
import { sleep } from "k6";
import { login } from "../lib/auth.js";
import { browseDashboard, browsePatients, browseCalendar } from "../lib/crm-flows.js";
import { thresholds } from "../lib/config.js";

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 10 },
        { duration: "10s", target: 100 }, // spike
        { duration: "1m", target: 100 },
        { duration: "20s", target: 10 },
        { duration: "20s", target: 0 },
      ],
      gracefulRampDown: "15s",
      tags: { scenario: "spike" },
    },
  },
  thresholds: {
    ...thresholds,
    // Allow more failures during spike — we record where it breaks
    http_req_failed: ["rate<0.25"],
    http_req_duration: ["p(95)<8000"],
    checks: ["rate>0.70"],
  },
};

export function setup() {
  const auth = login();
  if (!auth.token) throw new Error("spike: login failed");
  return { token: auth.token };
}

export default function (data) {
  const roll = Math.random();
  if (roll < 0.4) browseDashboard(data.token);
  else if (roll < 0.75) browsePatients(data.token);
  else browseCalendar(data.token);
  sleep(0.2 + Math.random() * 0.5);
}

export function handleSummary(data) {
  return {
    "/workspace/load-tests/reports/raw/spike-summary.json": JSON.stringify(data, null, 2),
  };
}
