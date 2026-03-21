import { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../shared/redis";
import { AppError } from "../shared/errors";

interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix?: string;
}

function getClientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
  return ip;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowSeconds, maxRequests, keyPrefix = "rl" } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const redis = getRedisClient();

    if (!redis) {
      return next();
    }

    const clientKey = getClientKey(req);
    const redisKey = `${keyPrefix}:${clientKey}`;

    try {
      const multi = redis.multi();
      multi.incr(redisKey);
      multi.expire(redisKey, windowSeconds);
      const [count] = await multi.exec() as [number | null, number | null][];

      const current = count ?? 0;

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - current));
      res.setHeader("X-RateLimit-Reset", Math.floor(Date.now() / 1000) + windowSeconds);

      if (current > maxRequests) {
        res.setHeader("Retry-After", windowSeconds);
        return next(
          new AppError("Too many requests. Please try again later.", 429, "RATE_LIMIT_EXCEEDED"),
        );
      }

      next();
    } catch {
      next();
    }
  };
}

export const authRateLimit = rateLimit({
  windowSeconds: 60,
  maxRequests: 10,
  keyPrefix: "rl:auth",
});
