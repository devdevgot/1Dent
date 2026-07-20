import { createHmac } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, platformAdminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import {
  issueTmaSessionToken,
  verifyTmaSessionToken,
  TMA_SESSION_TTL_SEC,
} from "./tma-session";
import type { TmaUser } from "./tma.types";

export type { TmaUser };
export { issueTmaSessionToken, TMA_SESSION_TTL_SEC };

/** initData is only used to bootstrap a session (Telegram freezes it at launch). */
const INIT_DATA_MAX_AGE_SEC = 5 * 60;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tmaUser?: TmaUser;
    }
  }
}

function validateTelegramInitData(initData: string, botToken: string): Record<string, string> | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (expectedHash !== hash) return null;

  const result: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    result[k] = v;
  }
  result["hash"] = hash;
  return result;
}

// Cache admins for 60s to avoid DB on every request
const adminCache = new Map<string, { isAdmin: boolean; name: string; expiresAt: number }>();

async function checkIsAdmin(telegramUserId: string): Promise<{ isAdmin: boolean; name: string }> {
  const cached = adminCache.get(telegramUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return { isAdmin: cached.isAdmin, name: cached.name };
  }

  // Check bootstrap superadmin
  const superAdminId = process.env["PLATFORM_SUPERADMIN_TG_ID"];
  if (superAdminId && telegramUserId === superAdminId) {
    const result = { isAdmin: true, name: "Superadmin" };
    adminCache.set(telegramUserId, { ...result, expiresAt: Date.now() + 60_000 });
    return result;
  }

  const [row] = await db
    .select({ name: platformAdminsTable.name })
    .from(platformAdminsTable)
    .where(eq(platformAdminsTable.telegramUserId, telegramUserId))
    .limit(1);

  const result = row ? { isAdmin: true, name: row.name } : { isAdmin: false, name: "" };
  adminCache.set(telegramUserId, { ...result, expiresAt: Date.now() + 60_000 });
  return result;
}

export function invalidateAdminCache(telegramUserId: string) {
  adminCache.delete(telegramUserId);
}

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}

type ResolveResult =
  | { ok: true; user: TmaUser }
  | { ok: false; status: number; error: string };

async function resolveTmaUserFromInitData(initData: string): Promise<ResolveResult> {
  const botToken = process.env["PLATFORM_TG_BOT_TOKEN"];
  if (!botToken) {
    return { ok: false, status: 503, error: "Platform bot not configured" };
  }

  const devBypass =
    process.env["NODE_ENV"] !== "production"
      ? process.env["TMA_DEV_BYPASS_TG_ID"]
      : undefined;

  let telegramUserId: string;
  let firstName = "Dev";

  if (devBypass && initData === "dev") {
    telegramUserId = devBypass;
  } else {
    const parsed = validateTelegramInitData(initData, botToken);
    if (!parsed) {
      return { ok: false, status: 401, error: "Invalid Telegram initData signature" };
    }

    const authDate = parseInt(parsed["auth_date"] ?? "0", 10);
    if (Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SEC) {
      return { ok: false, status: 401, error: "Telegram initData expired" };
    }

    let userObj: { id?: number; first_name?: string } = {};
    try {
      userObj = JSON.parse(parsed["user"] ?? "{}") as { id?: number; first_name?: string };
    } catch {
      return { ok: false, status: 401, error: "Invalid user data in initData" };
    }

    telegramUserId = String(userObj.id ?? "");
    firstName = userObj.first_name ?? "Unknown";
    if (!telegramUserId) {
      return { ok: false, status: 401, error: "Missing user ID in initData" };
    }
  }

  try {
    const { isAdmin, name } = await checkIsAdmin(telegramUserId);
    if (!isAdmin) {
      logger.warn({ telegramUserId }, "[TMA] Unauthorized access attempt");
      return { ok: false, status: 403, error: "Access denied. You are not a platform admin." };
    }

    return {
      ok: true,
      user: {
        telegramUserId,
        name: name || firstName,
        isAdmin: true,
      },
    };
  } catch (err) {
    logger.error({ err }, "[TMA] Error checking admin status");
    throw err;
  }
}

async function resolveTmaUserFromSession(token: string): Promise<ResolveResult> {
  const payload = verifyTmaSessionToken(token);
  if (!payload) {
    return { ok: false, status: 401, error: "TMA session expired" };
  }

  try {
    const { isAdmin, name } = await checkIsAdmin(payload.telegramUserId);
    if (!isAdmin) {
      logger.warn({ telegramUserId: payload.telegramUserId }, "[TMA] Session for revoked admin");
      return { ok: false, status: 403, error: "Access denied. You are not a platform admin." };
    }

    return {
      ok: true,
      user: {
        telegramUserId: payload.telegramUserId,
        name: name || payload.name || "Admin",
        isAdmin: true,
      },
    };
  } catch (err) {
    logger.error({ err }, "[TMA] Error checking admin status");
    throw err;
  }
}

/** Exchange Telegram initData for a 6h TMA admin session JWT. */
export async function createTmaSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const initData = req.headers["x-telegram-init-data"] as string | undefined;
    if (!initData) {
      res.status(401).json({ success: false, error: "Missing Telegram initData" });
      return;
    }

    const resolved = await resolveTmaUserFromInitData(initData);
    if (!resolved.ok) {
      res.status(resolved.status).json({ success: false, error: resolved.error });
      return;
    }

    const token = issueTmaSessionToken(resolved.user);
    res.json({
      success: true,
      data: {
        token,
        expiresIn: TMA_SESSION_TTL_SEC,
        user: resolved.user,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function requireTmaAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const bearer = extractBearerToken(req);
    if (bearer) {
      const resolved = await resolveTmaUserFromSession(bearer);
      if (!resolved.ok) {
        res.status(resolved.status).json({ success: false, error: resolved.error });
        return;
      }
      req.tmaUser = resolved.user;
      next();
      return;
    }

    const initData = req.headers["x-telegram-init-data"] as string | undefined;
    if (!initData) {
      res.status(401).json({ success: false, error: "Missing Telegram initData" });
      return;
    }

    const resolved = await resolveTmaUserFromInitData(initData);
    if (!resolved.ok) {
      res.status(resolved.status).json({ success: false, error: resolved.error });
      return;
    }

    req.tmaUser = resolved.user;
    next();
  } catch (err) {
    next(err);
  }
}
