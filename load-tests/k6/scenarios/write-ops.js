/**
 * Write ops — create patients, interactions, procedures under concurrent writers.
 */
import { sleep } from "k6";
import { login } from "../lib/auth.js";
import { writePatientFlow, browsePatients } from "../lib/crm-flows.js";
import { thresholds } from "../lib/config.js";

export const options = {
  scenarios: {
    writers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 5 },
        { duration: "1m", target: 15 },
        { duration: "1m", target: 30 },
        { duration: "30s", target: 0 },
      ],
      tags: { scenario: "write_ops" },
    },
  },
  thresholds: {
    ...thresholds,
    http_req_failed: ["rate<0.08"],
    http_req_duration: ["p(95)<3000"],
    write_ops_duration: ["p(95)<8000"],
    checks: ["rate>0.85"],
  },
};

export function setup() {
  const auth = login();
  if (!auth.token) throw new Error("write-ops: login failed");
  return { token: auth.token };
}

export default function (data) {
  writePatientFlow(data.token);
  if (Math.random() < 0.4) browsePatients(data.token);
  sleep(0.5 + Math.random());
}

export function handleSummary(data) {
  return {
    "/workspace/load-tests/reports/raw/write-ops-summary.json": JSON.stringify(data, null, 2),
  };
}
