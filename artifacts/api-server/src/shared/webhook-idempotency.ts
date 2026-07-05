import { randomUUID } from "crypto";
import { db, processedWebhookMessagesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getRedisClient } from "./redis";
import { logger } from "../lib/logger";

const REDIS_PREFIX = "webhook:processed:";
const TTL_SECONDS = 86400;

/** Returns true if this message was already processed (duplicate webhook). */
export async function isWebhookMessageProcessed(
  clinicId: string,
  whatsappMessageId: string,
): Promise<boolean> {
  if (!whatsappMessageId) return false;

  const redis = getRedisClient();
  const key = `${REDIS_PREFIX}${clinicId}:${whatsappMessageId}`;

  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit) return true;
    } catch (err) {
      logger.warn({ err }, "[WebhookIdempotency] Redis get failed");
    }
  }

  const [row] = await db
    .select({ id: processedWebhookMessagesTable.id })
    .from(processedWebhookMessagesTable)
    .where(
      and(
        eq(processedWebhookMessagesTable.clinicId, clinicId),
        eq(processedWebhookMessagesTable.whatsappMessageId, whatsappMessageId),
      ),
    )
    .limit(1);

  return !!row;
}

/** Mark message as processed. Returns false if already marked (race). */
export async function markWebhookMessageProcessed(
  clinicId: string,
  whatsappMessageId: string,
): Promise<boolean> {
  if (!whatsappMessageId) return true;

  const redis = getRedisClient();
  const key = `${REDIS_PREFIX}${clinicId}:${whatsappMessageId}`;

  if (redis) {
    try {
      const result = await redis.set(key, "1", "EX", TTL_SECONDS, "NX");
      if (result === null) return false;
    } catch (err) {
      logger.warn({ err }, "[WebhookIdempotency] Redis set failed");
    }
  }

  try {
    await db.insert(processedWebhookMessagesTable).values({
      id: randomUUID(),
      clinicId,
      whatsappMessageId,
    });
    return true;
  } catch {
    return false;
  }
}
