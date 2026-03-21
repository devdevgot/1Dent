import Redis from "ioredis";
import { logger } from "../logger";

const REDIS_URL = process.env["REDIS_URL"];

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!REDIS_URL) {
    return null;
  }
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    redisClient.on("error", (err) => {
      logger.error({ err }, "Redis connection error");
    });
  }
  return redisClient;
}
