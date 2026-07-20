#!/usr/bin/env node
/**
 * Aggregate k6 JSON summaries into a detailed Markdown report (RU).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const rawDir = resolve(root, "reports/raw");
const outPath = resolve(root, "reports/LOAD_TEST_REPORT.md");
const artifactsOut = resolve("/opt/cursor/artifacts/load-test-report.md");

const SCENARIO_META = {
  smoke: {
    title: "Smoke (дымовой)",
    goal: "Проверить, что ядро API отвечает и аутентифицированные CRM-эндпоинты живы.",
    profile: "1 VU × 30s",
  },
  "public-health": {
    title: "Public / Health",
    goal: "Оценить ёмкость неаутентифицированных health/SPA поверхностей.",
    profile: "Ramping RPS до ~300/s",
  },
  "auth-login": {
    title: "Auth Login",
    goal: "Нагрузка на POST /api/auth/login (bcrypt + JWT + rate-limit).",
    profile: "20 RPS constant × 90s",
  },
  "crm-browse": {
    title: "CRM Browse (чтение)",
    goal: "Типичный трафик клиники: dashboard, patients, calendar, analytics.",
    profile: "Ramp 0→50 VU, ~5 мин",
  },
  "write-ops": {
    title: "Write Ops (запись)",
    goal: "Создание пациентов, interactions, procedures под конкуренцией.",
    profile: "Ramp 0→30 VU writers",
  },
  spike: {
    title: "Spike (всплеск)",
    goal: "Резкий скачок 10→100 VU — поведение при flash crowd.",
    profile: "Spike to 100 VU",
  },
  stress: {
    title: "Stress / Breakpoint",
    goal: "Найти точку поломки: ramp до 250 VU.",
    profile: "Ramp to 250 VU",
  },
  soak: {
    title: "Soak (выдержка)",
    goal: "Длительная умеренная нагрузка — утечки, pool exhaustion.",
    profile: "25 VU sustained",
  },
  mixed: {
    title: "Mixed (реалистичный микс)",
    goal: "Параллельно: health + CRM read + write + auth.",
    profile: "Multi-scenario ~3 мин",
  },
};

function safeNum(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return typeof v === "number" ? v.toFixed(digits) : String(v);
}

function pct(v) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

function ms(v) {
  if (v == null) return "—";
  return `${Math.round(v)} ms`;
}

function loadSummaries() {
  if (!existsSync(rawDir)) return [];
  return readdirSync(rawDir)
    .filter((f) => f.endsWith("-summary.json"))
    .map((f) => {
      const name = f.replace(/-summary\.json$/, "");
      const raw = JSON.parse(readFileSync(join(rawDir, f), "utf8"));
      return { name, file: f, raw, meta: SCENARIO_META[name] || { title: name, goal: "", profile: "" } };
    })
    .sort((a, b) => {
      const order = Object.keys(SCENARIO_META);
      return (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99);
    });
}

function metric(raw, key) {
  return raw.metrics?.[key]?.values || null;
}

function thresholdFails(raw) {
  const fails = [];
  const metrics = raw.metrics || {};
  for (const [name, m] of Object.entries(metrics)) {
    if (!m.thresholds) continue;
    for (const [ thr, info] of Object.entries(m.thresholds)) {
      if (info.ok === false) fails.push(`${name}: ${thr}`);
    }
  }
  return fails;
}

function classifyHealth(summary) {
  const failRate = metric(summary.raw, "http_req_failed")?.rate ?? 0;
  const p95 = metric(summary.raw, "http_req_duration")?.["p(95)"] ?? 0;
  const thrFails = thresholdFails(summary.raw);
  if (failRate >= 0.2 || p95 >= 8000 || thrFails.length >= 3) return "🔴 BREAK";
  if (failRate >= 0.05 || p95 >= 2500 || thrFails.length > 0) return "🟡 DEGRADED";
  return "🟢 OK";
}

function endpointBreakdown(raw) {
  // k6 tagged metrics live under http_req_duration{endpoint:...} only if group by tag —
  // we rely on checks + custom trends. Extract any tagged metrics if present.
  const rows = [];
  for (const [key, m] of Object.entries(raw.metrics || {})) {
    if (!key.includes("endpoint:")) continue;
    const base = key.split("{")[0];
    if (base !== "http_req_duration" && base !== "http_reqs" && base !== "http_req_failed") continue;
    rows.push({ key, values: m.values || {} });
  }
  return rows;
}

function hostInfo() {
  try {
    const mem = readFileSync("/proc/meminfo", "utf8");
    const total = mem.match(/MemTotal:\s+(\d+)/)?.[1];
    const cpus = execSync("nproc", { encoding: "utf8" }).trim();
    return {
      cpus,
      memMb: total ? Math.round(Number(total) / 1024) : "?",
      node: process.version,
      k6: (() => {
        try {
          return execSync("k6 version", { encoding: "utf8" }).trim();
        } catch {
          return "k6";
        }
      })(),
    };
  } catch {
    return { cpus: "?", memMb: "?", node: process.version, k6: "k6" };
  }
}

function loadCreds() {
  const p = resolve(root, "reports/loadtest-credentials.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function scenarioSection(s) {
  const m = s.raw.metrics || {};
  const dur = m.http_req_duration?.values || {};
  const fails = m.http_req_failed?.values || {};
  const reqs = m.http_reqs?.values || {};
  const vus = m.vus_max?.values || m.vus?.values || {};
  const checks = m.checks?.values || {};
  const thrFails = thresholdFails(s.raw);
  const health = classifyHealth(s);

  const custom = [
    ["dashboard_batch_duration", "Dashboard batch"],
    ["patients_list_duration", "Patients batch"],
    ["calendar_batch_duration", "Calendar batch"],
    ["analytics_batch_duration", "Analytics batch"],
    ["write_ops_duration", "Write flow"],
  ]
    .map(([key, label]) => {
      const v = m[key]?.values;
      if (!v) return null;
      return `| ${label} | ${ms(v.avg)} | ${ms(v["p(95)"])} | ${ms(v["p(99)"])} | ${ms(v.max)} |`;
    })
    .filter(Boolean);

  let md = `### ${s.meta.title} — ${health}\n\n`;
  md += `**Цель:** ${s.meta.goal}\n\n`;
  md += `**Профиль:** ${s.meta.profile}\n\n`;
  md += `| Метрика | Значение |\n|---|---|\n`;
  md += `| HTTP запросов | ${safeNum(reqs.count, 0)} |\n`;
  md += `| RPS (avg) | ${safeNum(reqs.rate)} |\n`;
  md += `| Error rate | ${pct(fails.rate)} |\n`;
  md += `| Latency avg | ${ms(dur.avg)} |\n`;
  md += `| Latency p50 | ${ms(dur.med)} |\n`;
  md += `| Latency p95 | ${ms(dur["p(95)"])} |\n`;
  md += `| Latency p99 | ${ms(dur["p(99)"])} |\n`;
  md += `| Latency max | ${ms(dur.max)} |\n`;
  md += `| Checks pass | ${pct(checks.rate)} |\n`;
  md += `| Max VUs | ${safeNum(vus.max ?? vus.value, 0)} |\n`;
  md += `| Iteration duration p95 | ${ms(m.iteration_duration?.values?.["p(95)"])} |\n\n`;

  if (custom.length) {
    md += `**Батч-метрики CRM**\n\n`;
    md += `| Поток | avg | p95 | p99 | max |\n|---|---|---|---|---|\n`;
    md += custom.join("\n") + "\n\n";
  }

  if (thrFails.length) {
    md += `**Проваленные thresholds:**\n`;
    for (const t of thrFails) md += `- \`${t}\`\n`;
    md += `\n`;
  } else {
    md += `Thresholds: все пройдены (или не заданы / soft).\n\n`;
  }

  // Breaking analysis hints
  md += `**Интерпретация:** `;
  if (fails.rate >= 0.2) {
    md += `Высокий error rate (${pct(fails.rate)}) — система не держит этот профиль. `;
  } else if (fails.rate >= 0.05) {
    md += `Заметная доля ошибок (${pct(fails.rate)}) — деградация началась. `;
  } else {
    md += `Ошибки в норме (${pct(fails.rate)}). `;
  }
  if (dur["p(95)"] >= 5000) {
    md += `p95 latency ${ms(dur["p(95)"])} — UX неприемлем для CRM. `;
  } else if (dur["p(95)"] >= 2000) {
    md += `p95 ${ms(dur["p(95)"])} — заметные задержки. `;
  } else {
    md += `p95 ${ms(dur["p(95)"])} — приемлемо. `;
  }
  md += `\n\n`;
  md += `<details><summary>Сырой файл</summary>\n\n\`${s.file}\`\n\n</details>\n\n`;
  return md;
}

function findBreakpoint(summaries) {
  const stress = summaries.find((s) => s.name === "stress");
  const spike = summaries.find((s) => s.name === "spike");
  const browse = summaries.find((s) => s.name === "crm-browse");
  const lines = [];

  const assess = (s, label) => {
    if (!s) return;
    const fail = metric(s.raw, "http_req_failed")?.rate ?? 0;
    const p95 = metric(s.raw, "http_req_duration")?.["p(95)"] ?? 0;
    const rps = metric(s.raw, "http_reqs")?.rate ?? 0;
    const vus = metric(s.raw, "vus_max")?.max ?? metric(s.raw, "vus_max")?.value;
    lines.push(
      `- **${label}:** max≈${safeNum(vus, 0)} VU, ~${safeNum(rps)} RPS, error ${pct(fail)}, p95 ${ms(p95)} → ${classifyHealth(s)}`,
    );
  };

  assess(browse, "CRM browse (рабочий профиль)");
  assess(spike, "Spike");
  assess(stress, "Stress (поиск поломки)");

  // Capacity recommendation
  let capacity = "недостаточно данных";
  if (browse) {
    const fail = metric(browse.raw, "http_req_failed")?.rate ?? 1;
    const p95 = metric(browse.raw, "http_req_duration")?.["p(95)"] ?? 99999;
    if (fail < 0.05 && p95 < 2500) {
      capacity = "локальный инстанс уверенно держит ~50 concurrent CRM users (browse)";
    } else if (fail < 0.15) {
      capacity = "локальный инстанс на грани при ~50 VU — рекомендуется горизонтальный scale / pool tuning";
    } else {
      capacity = "локальный инстанс не держит целевые 50 VU CRM browse";
    }
  }

  return { lines, capacity };
}

function weakestEndpoints(summaries) {
  // Use custom trends + high latency scenarios
  const suspects = [];
  for (const s of summaries) {
    for (const [key, label] of [
      ["dashboard_batch_duration", "Dashboard fan-out (analytics+notifications+kpi)"],
      ["analytics_batch_duration", "Analytics deep pages"],
      ["patients_list_duration", "Patients/kanban batch"],
      ["calendar_batch_duration", "Calendar/procedures batch"],
      ["write_ops_duration", "Write: patient+interaction+procedure"],
    ]) {
      const v = s.raw.metrics?.[key]?.values;
      if (!v) continue;
      suspects.push({
        scenario: s.name,
        label,
        p95: v["p(95)"] ?? 0,
        max: v.max ?? 0,
        avg: v.avg ?? 0,
      });
    }
  }
  suspects.sort((a, b) => b.p95 - a.p95);
  return suspects.slice(0, 8);
}

function main() {
  mkdirSync(resolve(root, "reports"), { recursive: true });
  const summaries = loadSummaries();
  const host = hostInfo();
  const creds = loadCreds();
  const bp = findBreakpoint(summaries);
  const weak = weakestEndpoints(summaries);
  const runAt = new Date().toISOString();

  let md = `# Отчёт нагрузочного тестирования 1Dent (k6)\n\n`;
  md += `> Сгенерировано: ${runAt}\n\n`;
  md += `## 1. Резюме (Executive Summary)\n\n`;

  if (!summaries.length) {
    md += `_Нет данных: не найдены файлы в \`load-tests/reports/raw/*-summary.json\`. Запустите \`./load-tests/scripts/run-all.sh\`._\n`;
    writeFileSync(outPath, md);
    console.log("No summaries found, wrote stub to", outPath);
    return;
  }

  const healthCounts = { ok: 0, degraded: 0, break: 0 };
  for (const s of summaries) {
    const h = classifyHealth(s);
    if (h.includes("OK")) healthCounts.ok++;
    else if (h.includes("DEGRADED")) healthCounts.degraded++;
    else healthCounts.break++;
  }

  md += `Прогнано **${summaries.length}** сценариев k6 против локального API-сервера 1Dent.\n\n`;
  md += `| Статус | Кол-во |\n|---|---|\n`;
  md += `| 🟢 OK | ${healthCounts.ok} |\n`;
  md += `| 🟡 DEGRADED | ${healthCounts.degraded} |\n`;
  md += `| 🔴 BREAK | ${healthCounts.break} |\n\n`;
  md += `**Оценка ёмкости:** ${bp.capacity}\n\n`;
  md += `### Ключевые выводы\n\n`;
  for (const line of bp.lines) md += `${line}\n`;
  md += `\n`;

  if (weak.length) {
    md += `### Где ломается / самые тяжёлые потоки\n\n`;
    md += `| Поток | Сценарий | p95 | max | avg |\n|---|---|---|---|---|\n`;
    for (const w of weak) {
      md += `| ${w.label} | ${w.scenario} | ${ms(w.p95)} | ${ms(w.max)} | ${ms(w.avg)} |\n`;
    }
    md += `\n`;
  }

  md += `## 2. Окружение теста\n\n`;
  md += `| Параметр | Значение |\n|---|---|\n`;
  md += `| Target | \`${creds?.baseUrl || process.env.BASE_URL || "http://127.0.0.1:8080"}\` |\n`;
  md += `| DB | PostgreSQL 16 (local) |\n`;
  md += `| Redis | local (опционально включён) |\n`;
  md += `| SKIP_PLAN_GATE | true |\n`;
  md += `| CPU | ${host.cpus} |\n`;
  md += `| RAM | ${host.memMb} MB |\n`;
  md += `| Node | ${host.node} |\n`;
  md += `| k6 | ${host.k6} |\n`;
  if (creds) {
    md += `| Seed patients | ${creds.patientCount} |\n`;
    md += `| Clinic | ${creds.clinicId || "—"} |\n`;
  }
  md += `\n`;
  md += `> Тест выполнен **локально**, не против production (\`www.1dent.kz\`), чтобы не создавать риск для живых клиник.\n\n`;

  md += `## 3. Сценарии и результаты\n\n`;
  for (const s of summaries) {
    md += scenarioSection(s);
  }

  md += `## 4. Карта узких мест (по коду)\n\n`;
  md += `На основе метрик батчей и архитектуры 1Dent:\n\n`;
  md += `| Зона | Почему рискованно | Эндпоинты |\n|---|---|---|\n`;
  md += `| Owner dashboard fan-out | FE дергает 5–6 API на mount | \`/api/analytics/owner/summary\`, \`/api/analytics\`, \`/api/kpi/doctors\`, \`/api/channels/stats\`, notifications |\n`;
  md += `| Analytics | Тяжёлые SQL агрегации по clinic | \`/api/analytics/*\`, \`/api/analytics/patient-metrics\` |\n`;
  md += `| Patients list + detail | N+1 при открытии карточек | \`GET /api/patients\`, \`/patients/:id\`, treatment-plans, messages |\n`;
  md += `| Auth login | bcrypt CPU-bound | \`POST /api/auth/login\` |\n`;
  md += `| Write path | INSERT + stage transitions + cache invalidate | \`POST /api/patients\`, interactions, procedures |\n`;
  md += `| Chatbot analytics | Доп. агрегации / Redis fallback | \`/api/chatbot/analytics/funnel\` |\n\n`;

  md += `## 5. Рекомендации\n\n`;
  md += `1. **Не считать healthz = ready** — для readiness использовать DB-backed probe (login/me).\n`;
  md += `2. **Dashboard:** схлопнуть fan-out в один BFF/aggregate endpoint или HTTP/2 + server-side batch.\n`;
  md += `3. **Postgres pool:** при росте VU следить за \`max_connections\` (default 100) и pool size Node \`pg\`.\n`;
  md += `4. **Analytics cache:** держать Redis в prod; без Redis кэш in-memory не шарится между инстансами.\n`;
  md += `5. **Auth:** при всплесках логинов опираться на Redis rate-limit; рассмотреть argon2/bcrypt cost tuning.\n`;
  md += `6. **Horizontal scale:** API stateless (JWT) — можно масштабировать web service; DB станет bottleneck раньше CPU.\n`;
  md += `7. **Повторять stress на staging** с prod-like data volume (тысячи пациентов / процедур).\n\n`;

  md += `## 6. Как воспроизвести\n\n`;
  md += "```bash\n";
  md += "# зависимости: postgres, redis, k6, pnpm\n";
  md += "export DATABASE_URL=postgresql://onedent:onedent@127.0.0.1:5432/onedent\n";
  md += "export JWT_SECRET=k6-load-test-secret REDIS_URL=redis://127.0.0.1:6379\n";
  md += "export SKIP_PLAN_GATE=true NODE_ENV=development PORT=8080\n";
  md += "pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/api-server run start &\n";
  md += "./load-tests/scripts/run-all.sh\n";
  md += "```\n\n";
  md += `Сырые JSON: \`load-tests/reports/raw/\`.\n`;

  writeFileSync(outPath, md);
  console.log("Wrote", outPath);

  try {
    mkdirSync(dirname(artifactsOut), { recursive: true });
    writeFileSync(artifactsOut, md);
    console.log("Copied to", artifactsOut);
  } catch (e) {
    console.warn("Could not write artifacts copy:", e.message);
  }

  // Also copy raw summaries to artifacts
  try {
    const artRaw = "/opt/cursor/artifacts/k6-raw";
    mkdirSync(artRaw, { recursive: true });
    for (const s of summaries) {
      writeFileSync(join(artRaw, s.file), JSON.stringify(s.raw, null, 2));
    }
  } catch {
    /* optional */
  }
}

main();
