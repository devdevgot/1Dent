import { getRedisClient } from "./redis";
import { logger } from "../lib/logger";

const LOCK_PREFIX = "chatbot:lock:";
const LOCK_TTL_MS = 30_000;

export async function withSessionLock<T>(
  clinicId: string,
  phone: string,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = getRedisClient();
  const key = `${LOCK_PREFIX}${clinicId}:${phone}`;

  if (!redis) {
    return fn();
  }

  const token = `${Date.now()}-${Math.random()}`;
  const acquired = await redis.set(key, token, "PX", LOCK_TTL_MS, "NX").catch((err) => {
    logger.warn({ err }, "[SessionLock] Redis lock failed — proceeding without lock");
    return null;
  });

  if (acquired === null && redis.status === "ready") {
    // Another turn in progress — wait briefly and retry once
    await new Promise((r) => setTimeout(r, 500));
    const retry = await redis.set(key, token, "PX", LOCK_TTL_MS, "NX").catch(() => null);
    if (retry === null) {
      logger.warn({ clinicId, phone }, "[SessionLock] Could not acquire lock — running anyway");
    }
  }

  try {
    return await fn();
  } finally {
    if (redis.status === "ready") {
      const current = await redis.get(key).catch(() => null);
      if (current === token) {
        await redis.del(key).catch(() => {});
      }
    }
  }
}
