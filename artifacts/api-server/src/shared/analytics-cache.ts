import { Redis } from "ioredis";

const TTL_SECONDS = 300;

interface InMemoryEntry {
  data: string;
  expiresAt: number;
}

const memStore = new Map<string, InMemoryEntry>();

let redisClient: Redis | null = null;
let redisAvailable = false;

if (process.env["REDIS_URL"]) {
  try {
    redisClient = new Redis(process.env["REDIS_URL"], {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redisClient.connect().then(() => {
      redisAvailable = true;
    }).catch(() => {
      redisAvailable = false;
      redisClient = null;
    });
    redisClient.on("error", () => {
      redisAvailable = false;
    });
  } catch {
    redisClient = null;
    redisAvailable = false;
  }
}

class AnalyticsCache {
  async get<T>(key: string): Promise<T | null> {
    if (redisAvailable && redisClient) {
      try {
        const raw = await redisClient.get(key);
        if (raw) return JSON.parse(raw) as T;
        return null;
      } catch {
        redisAvailable = false;
      }
    }
    const entry = memStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memStore.delete(key);
      return null;
    }
    return JSON.parse(entry.data) as T;
  }

  async set<T>(key: string, data: T): Promise<void> {
    const serialized = JSON.stringify(data);
    if (redisAvailable && redisClient) {
      try {
        await redisClient.setex(key, TTL_SECONDS, serialized);
        return;
      } catch {
        redisAvailable = false;
      }
    }
    memStore.set(key, { data: serialized, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  }

  async invalidate(pattern: string): Promise<void> {
    if (redisAvailable && redisClient) {
      try {
        const keys = await redisClient.keys(`${pattern}*`);
        if (keys.length > 0) await redisClient.del(...keys);
        return;
      } catch {
        redisAvailable = false;
      }
    }
    for (const key of memStore.keys()) {
      if (key.startsWith(pattern)) memStore.delete(key);
    }
  }

  key(...parts: string[]): string {
    return `analytics:${parts.join(":")}`;
  }
}

export const analyticsCache = new AnalyticsCache();
