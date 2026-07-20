import http from "k6/http";
import { check } from "k6";
import { AUTH } from "./config.js";
import { url, authHeaders, jsonOrNull, requireOk } from "./helpers.js";

/**
 * Obtain a JWT for this VU.
 * Prefer AUTH_TOKEN env; otherwise login; as last resort register (setup only).
 */
export function login(email = AUTH.email, password = AUTH.password) {
  if (AUTH.token) {
    return { token: AUTH.token, user: null, clinic: null };
  }

  const res = http.post(
    url("/api/auth/login"),
    JSON.stringify({ email, password }),
    {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      tags: { endpoint: "auth_login" },
    },
  );

  const body = jsonOrNull(res);
  const ok = check(res, {
    "login status 200": (r) => r.status === 200,
    "login has token": () => Boolean(body?.data?.token),
  });

  if (!ok) {
    return { token: null, error: `login failed ${res.status}`, body };
  }

  return {
    token: body.data.token,
    user: body.data.user,
    clinic: body.data.clinic,
  };
}

export function registerClinic(payload) {
  const res = http.post(url("/api/auth/register"), JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    tags: { endpoint: "auth_register" },
  });
  const body = jsonOrNull(res);
  requireOk(res, "register");
  return {
    token: body.data.token,
    user: body.data.user,
    clinic: body.data.clinic,
  };
}

export function startTrial(token) {
  const res = http.post(url("/api/auth/start-trial"), null, {
    headers: authHeaders(token),
    tags: { endpoint: "auth_start_trial" },
  });
  // 200 or already has plan — both fine for load tests
  check(res, {
    "start-trial ok or already active": (r) => r.status === 200 || r.status === 400 || r.status === 409,
  });
  return res;
}

export function me(token) {
  return http.get(url("/api/auth/me"), {
    headers: authHeaders(token),
    tags: { endpoint: "auth_me" },
  });
}
