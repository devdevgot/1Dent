/**
 * Auth login — concurrent login pressure (rate-limit sensitive when Redis is on).
 *
 * With Redis, authRateLimit = 10 req / 60s / IP. This scenario intentionally
 * exceeds that to verify protection trips (429 RATE_LIMIT_EXCEEDED).
 * Capacity of bcrypt itself is a secondary signal (latency of 200 responses).
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { Rate } from "k6/metrics";
import { AUTH, thresholds } from "../lib/config.js";
import { url, jsonOrNull } from "../lib/helpers.js";

const rateLimited = new Rate("auth_rate_limited");
const loginSuccess = new Rate("auth_login_success");

export const options = {
  scenarios: {
    auth_login: {
      executor: "constant-arrival-rate",
      rate: 20,
      timeUnit: "1s",
      duration: "90s",
      preAllocatedVUs: 20,
      maxVUs: 60,
      tags: { scenario: "auth_login" },
    },
  },
  thresholds: {
    ...thresholds,
    // 429 is an expected outcome when Redis rate-limit is armed
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
    // At least some logins succeed before the window fills
    auth_login_success: ["rate>0.0"],
    // Majority should be rate-limited at 20 RPS with 10/min limit
    auth_rate_limited: ["rate>0.5"],
  },
};

export default function () {
  const res = http.post(
    url("/api/auth/login"),
    JSON.stringify({ email: AUTH.email, password: AUTH.password }),
    {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      tags: { endpoint: "auth_login" },
      // Treat 429 as non-failed HTTP (protection working as designed)
      responseCallback: http.expectedStatuses(200, 429),
    },
  );
  const body = jsonOrNull(res);
  const is200 = res.status === 200;
  const is429 = res.status === 429;
  loginSuccess.add(is200);
  rateLimited.add(is429);
  check(res, {
    "login 200 or rate-limited 429": (r) => r.status === 200 || r.status === 429,
    "200 has token": () => !is200 || Boolean(body?.data?.token),
    "429 is RATE_LIMIT_EXCEEDED": () => !is429 || body?.code === "RATE_LIMIT_EXCEEDED",
  });
  sleep(0.1);
}

export function handleSummary(data) {
  return {
    "/workspace/load-tests/reports/raw/auth-login-summary.json": JSON.stringify(data, null, 2),
  };
}
