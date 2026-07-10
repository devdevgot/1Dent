import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "https://www.1dent.kz";

// Progressive breakpoint test — find where the system starts failing
export const options = {
  scenarios: {
    breakpoint: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { duration: "30s", target: 20 },   // 20 req/s
        { duration: "30s", target: 50 },   // 50 req/s
        { duration: "30s", target: 100 },  // 100 req/s
        { duration: "30s", target: 150 },  // 150 req/s
        { duration: "30s", target: 200 },  // 200 req/s
        { duration: "30s", target: 0 },
      ],
    },
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/healthz`);
  check(res, {
    "status is 200": (r) => r.status === 200,
    "response < 1s": (r) => r.timings.duration < 1000,
  });
}
