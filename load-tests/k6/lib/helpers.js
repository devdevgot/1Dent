import { check, fail } from "k6";
import http from "k6/http";
import { BASE_URL } from "./config.js";

export function url(path) {
  if (path.startsWith("http")) return path;
  return `${BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function authHeaders(token, { json = true } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

export function jsonOrNull(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

export function assertOk(res, name, opts = {}) {
  const maxStatus = opts.maxStatus || 299;
  const ok = check(res, {
    [`${name} status < ${maxStatus + 1}`]: (r) => r.status >= 200 && r.status <= maxStatus,
    [`${name} not 5xx`]: (r) => r.status < 500,
  });
  return ok;
}

export function requireOk(res, name) {
  if (res.status < 200 || res.status >= 300) {
    fail(`${name} failed: status=${res.status} body=${String(res.body).slice(0, 300)}`);
  }
}

export function todayRange() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const day = `${y}-${m}-${d}`;
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 30);
  const fy = from.getUTCFullYear();
  const fm = String(from.getUTCMonth() + 1).padStart(2, "0");
  const fd = String(from.getUTCDate()).padStart(2, "0");
  return {
    dateFrom: `${fy}-${fm}-${fd}`,
    dateTo: day,
  };
}

export function randomPhone() {
  // Kazakhstan-looking mobile for uniqueness under load
  const n = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  return `+7701${n.slice(0, 7)}`;
}

export function randomName(prefix = "Load") {
  return `${prefix} Patient ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Batch GET helper with shared token. */
export function get(path, token, tags = {}) {
  return http.get(url(path), {
    headers: authHeaders(token),
    tags,
  });
}

export function post(path, body, token, tags = {}) {
  return http.post(url(path), JSON.stringify(body), {
    headers: authHeaders(token),
    tags,
  });
}

export function patch(path, body, token, tags = {}) {
  return http.patch(url(path), JSON.stringify(body), {
    headers: authHeaders(token),
    tags,
  });
}
