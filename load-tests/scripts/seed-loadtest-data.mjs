#!/usr/bin/env node
/**
 * Bootstrap a clinic + sample patients for k6 load tests.
 * Idempotent: reuses existing loadtest@1dent.local if login works.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const EMAIL = process.env.AUTH_EMAIL || "loadtest@1dent.local";
const PASSWORD = process.env.AUTH_PASSWORD || "LoadTest1!";
const PATIENT_COUNT = Number(process.env.SEED_PATIENTS || 40);

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../reports");
const credsPath = resolve(outDir, "loadtest-credentials.json");

async function req(method, path, body, token) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function phone(i) {
  return `+7701${String(1000000 + i).padStart(7, "0")}`;
}

async function waitForApi(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const health = await req("GET", "/api/healthz");
      if (health.status !== 200) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      // Probe a DB-backed path via register/login readiness: try login with nonsense
      const probe = await req("POST", "/api/auth/login", {
        email: "probe-not-exists@example.com",
        password: "x",
      });
      // 401/400 means API+DB ready; 503 means DB_NOT_READY
      if (probe.status !== 503) return;
    } catch {
      // connection refused
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("API not ready within timeout");
}

async function ensureAuth() {
  const login = await req("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  if (login.status === 200 && login.json?.data?.token) {
    console.log("Reusing existing load-test clinic:", EMAIL);
    return login.json.data;
  }

  console.log("Registering load-test clinic:", EMAIL);
  const reg = await req("POST", "/api/auth/register", {
    clinicName: "K6 Load Test Clinic",
    name: "Load Test Owner",
    email: EMAIL,
    password: PASSWORD,
    useCases: ["crm", "schedule", "analytics"],
  });
  if (reg.status !== 201 && reg.status !== 200) {
    throw new Error(`Register failed: ${reg.status} ${JSON.stringify(reg.json)}`);
  }
  const data = reg.json.data;
  const trial = await req("POST", "/api/auth/start-trial", null, data.token);
  console.log("start-trial:", trial.status, trial.json?.error || "ok");
  return data;
}

async function seedPatients(token, count) {
  const list = await req("GET", "/api/patients", null, token);
  const existing = list.json?.data?.patients?.length || 0;
  if (existing >= count) {
    console.log(`Already have ${existing} patients (>= ${count}), skipping seed.`);
    return existing;
  }
  const toCreate = count - existing;
  console.log(`Creating ${toCreate} patients (have ${existing})...`);
  let created = 0;
  for (let i = existing; i < count; i++) {
    const res = await req(
      "POST",
      "/api/patients",
      {
        name: `Seed Patient ${i + 1}`,
        phone: phone(i),
        source: ["instagram", "whatsapp", "walk_in", "website"][i % 4],
        notes: "seeded for k6",
      },
      token,
    );
    if (res.status === 201 || res.status === 200) created++;
    else if (i === existing) {
      console.warn("First patient create failed:", res.status, res.json);
    }
  }
  console.log(`Created ${created} patients.`);
  return existing + created;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  console.log("Waiting for API at", BASE_URL);
  await waitForApi();
  const auth = await ensureAuth();
  const patientCount = await seedPatients(auth.token, PATIENT_COUNT);

  // Warm key endpoints
  const warmPaths = [
    "/api/auth/me",
    "/api/analytics/owner/summary",
    "/api/analytics",
    "/api/patients",
    "/api/procedures/templates",
    "/api/contracts/templates",
    "/api/tablet/cabinets",
    "/api/chatbot/settings",
    "/api/users",
  ];
  for (const p of warmPaths) {
    const r = await req("GET", p, null, auth.token);
    console.log(`warm ${p} -> ${r.status}`);
  }

  const creds = {
    baseUrl: BASE_URL,
    email: EMAIL,
    password: PASSWORD,
    token: auth.token,
    userId: auth.user?.id,
    clinicId: auth.clinic?.id || auth.user?.clinicId,
    patientCount,
    seededAt: new Date().toISOString(),
  };
  writeFileSync(credsPath, JSON.stringify(creds, null, 2));
  console.log("Wrote credentials to", credsPath);
  console.log("Export for k6:");
  console.log(`  export BASE_URL=${BASE_URL}`);
  console.log(`  export AUTH_EMAIL=${EMAIL}`);
  console.log(`  export AUTH_PASSWORD=${PASSWORD}`);
  console.log(`  export AUTH_TOKEN=${auth.token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
