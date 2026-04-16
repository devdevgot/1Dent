import { randomBytes, createHmac } from "crypto";
import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { startAlertWorker } from "./shared/alert-queue";

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

// Run DB migrations before starting the server
if (process.env["DATABASE_URL"]) {
  try {
    const migrationsFolder = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../../../lib/db/drizzle"
    );
    await migrate(db, { migrationsFolder });
    logger.info("Database migrations applied successfully");
  } catch (err) {
    logger.warn({ err }, "Database migration error — continuing server startup");
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
