/**
 * Shared k6 config for 1Dent load tests.
 * Override with env: BASE_URL, AUTH_EMAIL, AUTH_PASSWORD, AUTH_TOKEN
 */
export const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8080";

export const AUTH = {
  email: __ENV.AUTH_EMAIL || "loadtest@1dent.local",
  password: __ENV.AUTH_PASSWORD || "LoadTest1!",
  token: __ENV.AUTH_TOKEN || "",
};

/** Thresholds used across scenarios (can be overridden per scenario). */
export const thresholds = {
  http_req_failed: ["rate<0.05"],
  http_req_duration: ["p(95)<2000", "p(99)<5000"],
};

export const tags = {
  system: "1dent",
  env: __ENV.TEST_ENV || "local",
};
