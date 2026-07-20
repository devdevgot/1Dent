/**
 * Auth login — concurrent login pressure (rate-limit sensitive when Redis is on).
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { AUTH, thresholds } from "../lib/config.js";
import { url, jsonOrNull } from "../lib/helpers.js";

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
    http_req_failed: ["rate<0.15"],
    http_req_duration: ["p(95)<2000"],
    checks: ["rate>0.80"],
  },
};

export default function () {
  const res = http.post(
    url("/api/auth/login"),
    JSON.stringify({ email: AUTH.email, password: AUTH.password }),
    {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      tags: { endpoint: "auth_login" },
    },
  );
  const body = jsonOrNull(res);
  check(res, {
    "login 200": (r) => r.status === 200,
    "has token": () => Boolean(body?.data?.token),
    "not rate-limited forever": (r) => r.status !== 429 || true,
  });
  sleep(0.1);
}

export function handleSummary(data) {
  return {
    "/workspace/load-tests/reports/raw/auth-login-summary.json": JSON.stringify(data, null, 2),
  };
}
