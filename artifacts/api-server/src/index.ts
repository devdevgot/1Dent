import { randomBytes, createHmac } from "crypto";
import path from "path";
import fs from "fs/promises";
import { db, pool } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { startAlertWorker } from "./shared/alert-queue";
import { startDentalBroadcastScheduler } from "./modules/dental-broadcast/dental-broadcast.scheduler";
import { getServerBaseUrl } from "./shared/green-api";
import { seedAllClinics } from "./seeds/procedure-templates.seed";

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
        // Treat "already exists" errors as no-ops — the schema is already there
        if (msg.includes("already exists")) {
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

// Run DB migrations before starting the server
if (process.env["DATABASE_URL"]) {
  try {
    const migrationsFolder = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../../../lib/db/drizzle"
    );
    await runMigrations(migrationsFolder);
    logger.info("Database migrations applied successfully");
  } catch (err) {
    logger.warn({ err }, "Database migration error — continuing server startup");
  }

  // Seed initial price catalog for all clinics that have no templates yet
  try {
    await seedAllClinics();
    logger.info("Procedure template seed completed");
  } catch (err) {
    logger.warn({ err }, "Procedure template seed failed — continuing server startup");
  }

  // One-time fix: reset chatbot sessions stuck in human_takeover state due to
  // OPERATOR_NEEDED from dental_qa permanently locking patients out of the chatbot.
  // After this fix the chatbot no longer sets humanTakeover on OPERATOR_NEEDED,
  // so these sessions can safely be reset to let patients interact again.
  try {
    const resetResult = await pool.query(
      `UPDATE chatbot_sessions SET state = 'greeting', human_takeover = false, data = '{}', updated_at = NOW()
       WHERE human_takeover = true AND state = 'human_takeover'`
    );
    if ((resetResult.rowCount ?? 0) > 0) {
      logger.info({ count: resetResult.rowCount }, "[ChatbotFix] Reset stuck human_takeover sessions");
    }
  } catch (err) {
    logger.warn({ err }, "[ChatbotFix] Could not reset stuck sessions — continuing");
  }
} else {
  logger.warn("DATABASE_URL not set — skipping migrations");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Register platform Telegram bot webhook
  const platformTgToken = process.env["PLATFORM_TG_BOT_TOKEN"];
  const webhookBase = getServerBaseUrl();
  if (platformTgToken && webhookBase) {
    const webhookUrl = `${webhookBase}/api/webhook/telegram/platform`;
    fetch(`https://api.telegram.org/bot${platformTgToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    })
      .then((r) => r.json())
      .then((r) => logger.info({ result: r }, "[PlatformBot] Webhook registered"))
      .catch((err) => logger.warn({ err }, "[PlatformBot] Failed to register webhook"));
  } else {
    if (!platformTgToken) logger.warn("[PlatformBot] PLATFORM_TG_BOT_TOKEN not set — platform bot disabled");
    if (!webhookBase) logger.warn("[PlatformBot] webhookBase not resolved — cannot register Telegram webhook");
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
});
