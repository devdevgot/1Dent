/**
 * Mixed realistic traffic — parallel scenario executors mimicking production mix:
 * health checks, CRM browse, writes, auth.
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { AUTH, thresholds } from "../lib/config.js";
import { login } from "../lib/auth.js";
import { url, jsonOrNull } from "../lib/helpers.js";
import {
  browseDashboard,
  browsePatients,
  browseCalendar,
  browseAnalytics,
  writePatientFlow,
} from "../lib/crm-flows.js";

export const options = {
  scenarios: {
    health_probes: {
      executor: "constant-arrival-rate",
      rate: 5,
      timeUnit: "1s",
      duration: "3m",
      preAllocatedVUs: 5,
      maxVUs: 15,
      exec: "healthProbe",
      tags: { scenario: "mixed_health" },
    },
    crm_readers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 15 },
        { duration: "2m", target: 40 },
        { duration: "30s", target: 0 },
      ],
      exec: "crmReader",
      tags: { scenario: "mixed_crm" },
    },
    crm_writers: {
      executor: "constant-vus",
      vus: 8,
      duration: "3m",
      exec: "crmWriter",
      tags: { scenario: "mixed_write" },
    },
    authers: {
      executor: "constant-arrival-rate",
      rate: 3,
      timeUnit: "1s",
      duration: "3m",
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: "authFlow",
      tags: { scenario: "mixed_auth" },
    },
  },
  thresholds: {
    ...thresholds,
    http_req_failed: ["rate<0.08"],
    http_req_duration: ["p(95)<3500"],
    checks: ["rate>0.88"],
  },
};

export function setup() {
  const auth = login();
  if (!auth.token) throw new Error("mixed: login failed");
  return { token: auth.token };
}

export function healthProbe() {
  const res = http.get(url("/api/healthz"), { tags: { endpoint: "healthz" } });
  check(res, { "healthz 200": (r) => r.status === 200 });
}

export function crmReader(data) {
  const roll = Math.random();
  if (roll < 0.35) browseDashboard(data.token);
  else if (roll < 0.65) browsePatients(data.token);
  else if (roll < 0.85) browseCalendar(data.token);
  else browseAnalytics(data.token);
  sleep(0.5 + Math.random());
}

export function crmWriter(data) {
  writePatientFlow(data.token);
  sleep(1 + Math.random());
}

export function authFlow() {
  const res = http.post(
    url("/api/auth/login"),
    JSON.stringify({ email: AUTH.email, password: AUTH.password }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { endpoint: "auth_login" },
    },
  );
  const body = jsonOrNull(res);
  check(res, {
    "login ok": (r) => r.status === 200,
    "token present": () => Boolean(body?.data?.token),
  });
  sleep(0.2);
}

export function handleSummary(data) {
  return {
    "/workspace/load-tests/reports/raw/mixed-summary.json": JSON.stringify(data, null, 2),
  };
}
