import { randomBytes, createHmac } from "crypto";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { db, pool } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { startAlertWorker } from "./shared/alert-queue";
import { startDentalBroadcastScheduler } from "./modules/dental-broadcast/dental-broadcast.scheduler";
import { startChatbotInactivityScheduler } from "./modules/chatbot/chatbot-inactivity.scheduler";
import { errorEventsService } from "./modules/error-events/error-events.service";
import { getServerBaseUrl } from "./shared/green-api";
import { registerPlatformBot } from "./shared/platform-bot";
import { setDatabaseReady } from "./shared/db-ready";
import { seedAllClinics } from "./seeds/procedure-templates.seed";
import { seedAllClinicsContractTemplates } from "./seeds/contract-templates.seed";
import { platformConfigService } from "./modules/platform-config/platform-config.service";

const isProd = process.env["NODE_ENV"] === "production";

if (!process.env["JWT_SECRET"]) {
  if (isProd) {
    // Derive a stable secret from DATABASE_URL so deployment works without manual setup.
    // Stable across restarts because DATABASE_URL is fixed per deployment.
    const seed = process.env["DATABASE_URL"] ?? randomBytes(32).toString("hex");
    const derived = createHmac("sha256", "dental-crm-jwt-v1").update(seed).digest("hex");
    process.env["JWT_SECRET"] = derived;
    logger.info("JWT_SECRET auto-derived from DATABASE_URL (stable across restarts). Set JWT_SECRET secret to override.");
  } else {
    const devSecret = randomBytes(64).toString("hex");
    process.env["JWT_SECRET"] = devSecret;
    logger.warn(
      "JWT_SECRET is not set. A temporary random secret has been generated for this session. " +
      "Tokens will be invalidated on restart. Set JWT_SECRET as a secret for persistent tokens.",
    );
  }
}

const port = parseInt(process.env["PORT"] ?? "8080", 10);

function isIgnorableMigrationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";

  if (msg.includes("already exists")) return true;
  // duplicate_column / duplicate_object / duplicate_table
  if (code === "42701" || code === "42710" || code === "42P07") return true;
  return false;
}

// Resilient migration runner — handles "already exists" errors per-statement
// so a db:push-bootstrapped production DB (empty __drizzle_migrations) never
// breaks on CREATE TYPE / CREATE TABLE that the schema already has.
async function runMigrations(migrationsFolder: string): Promise<void> {
  // Ensure the tracking table exists (matches Drizzle's own schema)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  // Read journal to get ordered list of migrations
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(await fs.readFile(journalPath, "utf8")) as {
    entries: Array<{ idx: number; tag: string; when: number }>;
  };

  // Find already-applied migrations
  const { rows: applied } = await pool.query<{ hash: string }>(
    `SELECT hash FROM "__drizzle_migrations"`
  );
  const appliedTags = new Set(applied.map((r) => r.hash));

  let applied_count = 0;
  for (const entry of journal.entries) {
    if (appliedTags.has(entry.tag)) continue;

    const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const sql = await fs.readFile(sqlPath, "utf8");

    // Split on Drizzle's statement-breakpoint marker and run each statement
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        await pool.query(stmt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isIgnorableMigrationError(err)) {
          logger.debug({ tag: entry.tag, msg }, "[Migration] Skipping idempotent statement");
        } else {
          throw err;
        }
      }
    }

    // Record migration as applied
    await pool.query(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [entry.tag, entry.when]
    );
    applied_count++;
    logger.info({ tag: entry.tag }, "[Migration] Applied");
  }

  if (applied_count === 0) {
    logger.info("[Migration] All migrations already up-to-date");
  } else {
    logger.info({ applied_count }, "[Migration] Migrations complete");
  }
}

async function resolveMigrationsFolder(): Promise<string> {
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(baseDir, "drizzle"),
    path.resolve(baseDir, "../../../lib/db/drizzle"),
  ];

  for (const folder of candidates) {
    try {
      await fs.access(path.join(folder, "meta", "_journal.json"));
      return folder;
    } catch {
      // try next candidate
    }
  }

  throw new Error(`Migrations folder not found. Checked: ${candidates.join(", ")}`);
}

// Bootstrap DB migrations and seeds after the server is listening (healthcheck-friendly).
async function bootstrapDatabase(): Promise<void> {
  if (!process.env["DATABASE_URL"]) {
    logger.warn("DATABASE_URL not set — skipping migrations");
    setDatabaseReady(true);
    return;
  }

  const migrationsFolder = await resolveMigrationsFolder();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runMigrations(migrationsFolder);
      logger.info({ migrationsFolder, attempt }, "Database migrations applied successfully");
      setDatabaseReady(true);
      break;
    } catch (err) {
      logger.error({ err, attempt, maxAttempts }, "Database migration error");
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      logger.error("Database migration failed after retries — API will return 503 until fixed");
      setDatabaseReady(false);
      return;
    }
  }

  try {
    await platformConfigService.warmCache();
    logger.info("Platform config cache warmed");
  } catch (err) {
    logger.warn({ err }, "Platform config cache warm failed — using defaults");
  }

  try {
    await seedAllClinics();
    logger.info("Procedure template seed completed");
  } catch (err) {
    logger.warn({ err }, "Procedure template seed failed — continuing server startup");
  }

  try {
    await seedAllClinicsContractTemplates();
    logger.info("Contract template seed completed");
  } catch (err) {
    logger.warn({ err }, "Contract template seed failed — continuing server startup");
  }

  try {
    // Only reset sessions stuck in human_takeover *state* with stale data (>7 days), not active operator sessions
    const resetResult = await pool.query(
      `UPDATE chatbot_sessions SET state = 'greeting', human_takeover = false, data = '{}', updated_at = NOW()
       WHERE human_takeover = true AND state = 'human_takeover' AND updated_at < NOW() - INTERVAL '7 days'`,
    );
    if ((resetResult.rowCount ?? 0) > 0) {
      logger.info({ count: resetResult.rowCount }, "[ChatbotFix] Reset stale human_takeover sessions (>7d)");
    }
  } catch (err) {
    logger.warn({ err }, "[ChatbotFix] Could not reset stuck sessions — continuing");
  }

  try {
    const { backfillPatientPhoneNormalized } = await import("./shared/patient-phone-resolver");
    const count = await backfillPatientPhoneNormalized();
    if (count > 0) logger.info({ count }, "[Startup] Backfilled patient phone_normalized");
  } catch (err) {
    logger.warn({ err }, "[Startup] phone_normalized backfill failed");
  }
}

function onServerReady(): void {
  const webhookBase = getServerBaseUrl();

  // ── Platform admin bot (TMA superadmin) ─────────────────────────────────────
  const platformTgToken = process.env["PLATFORM_TG_BOT_TOKEN"];
  if (platformTgToken) {
    void registerPlatformBot(platformTgToken);
  } else {
    logger.warn("[PlatformBot] PLATFORM_TG_BOT_TOKEN not set — platform bot disabled");
  }

  // ── Tracking bot (clinic geo-event notifications) ───────────────────────────
  const trackingTgToken = process.env["TRACKING_TG_BOT_TOKEN"];
  if (trackingTgToken && webhookBase) {
    const trackingWebhookUrl = `${webhookBase}/api/webhook/telegram/tracking`;

    // Register webhook
    fetch(`https://api.telegram.org/bot${trackingTgToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trackingWebhookUrl }),
    })
      .then((r) => r.json())
      .then((r) => logger.info({ result: r }, "[TrackingBot] Webhook registered"))
      .catch((err) => logger.warn({ err }, "[TrackingBot] Failed to register webhook"));

    // Set simple commands — no menu button (this is a notification-only bot)
    fetch(`https://api.telegram.org/bot${trackingTgToken}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [{ command: "start", description: "Подключить Telegram-уведомления" }],
      }),
    })
      .then((r) => r.json())
      .then((r) => logger.info({ result: r }, "[TrackingBot] Commands registered"))
      .catch((err) => logger.warn({ err }, "[TrackingBot] Failed to set commands"));
  } else {
    if (!trackingTgToken) logger.warn("[TrackingBot] TRACKING_TG_BOT_TOKEN not set — tracking notifications via platform bot disabled");
  }

  // Log resolved webhook base URL so it's immediately visible in deployment logs
  if (webhookBase) {
    logger.info({ webhookBase }, "Green API webhook base URL resolved — incoming messages will be delivered to this URL");
  } else {
    logger.warn("Green API webhook base URL could not be resolved — set WEBHOOK_BASE_URL env var to enable incoming WhatsApp messages in production");
  }

  // Warn if WhatsApp env vars are absent in production (messages stored but not sent to patients)
  if (isProd && (!process.env["WHATSAPP_TOKEN"] || !process.env["WHATSAPP_PHONE_ID"])) {
    logger.warn(
      "WHATSAPP_TOKEN or WHATSAPP_PHONE_ID not set in production — outbound WhatsApp messages will be stored but NOT delivered to patients",
    );
  }
  if (isProd && !process.env["WHATSAPP_APP_SECRET"]) {
    logger.warn(
      "WHATSAPP_APP_SECRET not set in production — inbound webhook POST requests will be rejected (fail-closed). Set this secret to enable inbound WhatsApp.",
    );
  }

  try {
    startDentalBroadcastScheduler();
  } catch (err) {
    logger.warn({ err }, "Dental broadcast scheduler failed to start");
  }

  try {
    startChatbotInactivityScheduler();
  } catch (err) {
    logger.warn({ err }, "Chatbot inactivity scheduler failed to start");
  }

  // Start BullMQ worker only if Redis is configured
  if (process.env["REDIS_URL"]) {
    try {
      const worker = startAlertWorker();
      if (worker) {
        logger.info("BullMQ Red Alert worker started");
      }
    } catch (err) {
      logger.warn({ err }, "BullMQ worker failed to start");
    }
  } else {
    logger.info("REDIS_URL not set — BullMQ worker disabled; using direct DB writes for Red Alerts");
  }
}

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening");
  onServerReady();
  void bootstrapDatabase();
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
  errorEventsService.captureSafe({
    source: "worker",
    severity: "fatal",
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack ?? null : null,
    code: "UNHANDLED_REJECTION",
  });
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  errorEventsService.captureSafe({
    source: "worker",
    severity: "fatal",
    message: err.message,
    stack: err.stack ?? null,
    code: "UNCAUGHT_EXCEPTION",
  });
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
