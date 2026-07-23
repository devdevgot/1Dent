import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://www.1dent.kz";

const errorRate = new Rate("errors");
const healthDuration = new Trend("health_duration", true);
const spaDuration = new Trend("spa_duration", true);
const api401Duration = new Trend("api_401_duration", true);

export const options = {
  scenarios: {
    // Scenario 1: sustained concurrent users (realistic CRM browsing)
    sustained_users: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 25 },
        { duration: "1m", target: 50 },
        { duration: "1m", target: 75 },
        { duration: "1m", target: 100 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "15s",
      exec: "crmSession",
    },
    // Scenario 2: spike — many users open app at once (morning rush)
    morning_spike: {
      executor: "ramping-vus",
      startTime: "6m30s",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 50 },
        { duration: "30s", target: 150 },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
      exec: "crmSession",
    },
    // Scenario 3: health-only baseline (no DB)
    health_baseline: {
      executor: "constant-vus",
      startTime: "9m30s",
      vus: 50,
      duration: "1m",
      exec: "healthOnly",
    },
  },
  thresholds: {
    errors: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
    health_duration: ["p(95)<500"],
  },
};

export function crmSession() {
  const healthRes = http.get(`${BASE_URL}/api/healthz`, {
    tags: { name: "healthz" },
  });
  healthDuration.add(healthRes.timings.duration);
  check(healthRes, {
    "health status 200": (r) => r.status === 200,
    "health body ok": (r) => r.json("status") === "ok",
  }) || errorRate.add(1);

  const spaRes = http.get(`${BASE_URL}/`, {
    tags: { name: "spa_index" },
  });
  spaDuration.add(spaRes.timings.duration);
  check(spaRes, {
    "spa status 200": (r) => r.status === 200,
    "spa has html": (r) => r.body && r.body.includes("<!DOCTYPE html"),
  }) || errorRate.add(1);

  // Simulates API calls that fail auth (middleware only, no DB on 401)
  const apiRes = http.get(`${BASE_URL}/api/auth/me`, {
    tags: { name: "auth_me_unauth" },
    responseCallback: http.expectedStatuses(401),
  });
  api401Duration.add(apiRes.timings.duration);
  check(apiRes, {
    "auth me returns 401": (r) => r.status === 401,
  }) || errorRate.add(1);

  // Think time between actions — typical user pauses 2-5s
  sleep(Math.random() * 3 + 2);
}

export function healthOnly() {
  const res = http.get(`${BASE_URL}/api/healthz`, {
    tags: { name: "healthz_only" },
  });
  healthDuration.add(res.timings.duration);
  check(res, { "health 200": (r) => r.status === 200 }) || errorRate.add(1);
  sleep(0.1);
}
