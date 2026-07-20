/**
 * Public / health — unauthenticated surfaces: healthz, SPA shell, TMA health.
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { url } from "../lib/helpers.js";
import { thresholds } from "../lib/config.js";

export const options = {
  scenarios: {
    public_health: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 100,
      stages: [
        { duration: "20s", target: 50 },
        { duration: "40s", target: 150 },
        { duration: "40s", target: 300 },
        { duration: "20s", target: 0 },
      ],
      tags: { scenario: "public_health" },
    },
  },
  thresholds: {
    ...thresholds,
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<500", "p(99)<1500"],
    checks: ["rate>0.98"],
  },
};

export default function () {
  const roll = Math.random();
  if (roll < 0.7) {
    const res = http.get(url("/api/healthz"), { tags: { endpoint: "healthz" } });
    check(res, {
      "healthz 200": (r) => r.status === 200,
      "healthz body ok": (r) => String(r.body).includes("ok"),
    });
  } else if (roll < 0.9) {
    const res = http.get(url("/api/healthz/tma"), { tags: { endpoint: "healthz_tma" } });
    check(res, { "healthz/tma 200": (r) => r.status === 200 });
  } else {
    const res = http.get(url("/"), { tags: { endpoint: "spa_root" } });
    check(res, {
      "spa responds": (r) => r.status === 200 || r.status === 404 || r.status === 304,
    });
  }
  sleep(0.05);
}

export function handleSummary(data) {
  return {
    "/workspace/load-tests/reports/raw/public-health-summary.json": JSON.stringify(data, null, 2),
  };
}
