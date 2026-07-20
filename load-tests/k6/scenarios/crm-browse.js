/**
 * CRM browse — typical authenticated read traffic (dashboard, patients, calendar, analytics).
 * Ramp to moderate concurrency to measure steady-state capacity.
 */
import { sleep } from "k6";
import { login } from "../lib/auth.js";
import {
  browseDashboard,
  browsePatients,
  browseCalendar,
  browseAnalytics,
  browseContractsAndTablet,
} from "../lib/crm-flows.js";
import { thresholds } from "../lib/config.js";

export const options = {
  scenarios: {
    crm_browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 25 },
        { duration: "2m", target: 50 },
        { duration: "1m", target: 50 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "20s",
      tags: { scenario: "crm_browse" },
    },
  },
  thresholds: {
    ...thresholds,
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2500", "p(99)<6000"],
    dashboard_batch_duration: ["p(95)<5000"],
    patients_list_duration: ["p(95)<4000"],
    checks: ["rate>0.90"],
  },
};

export function setup() {
  const auth = login();
  if (!auth.token) throw new Error("crm-browse: login failed");
  return { token: auth.token };
}

export default function (data) {
  const roll = Math.random();
  if (roll < 0.35) browseDashboard(data.token);
  else if (roll < 0.6) browsePatients(data.token);
  else if (roll < 0.8) browseCalendar(data.token);
  else if (roll < 0.93) browseAnalytics(data.token);
  else browseContractsAndTablet(data.token);
  sleep(Math.random() * 1.5 + 0.5);
}

export function handleSummary(data) {
  return {
    "/workspace/load-tests/reports/raw/crm-browse-summary.json": JSON.stringify(data, null, 2),
  };
}
