import { createHmac } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, platformAdminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";

export interface TmaUser {
  telegramUserId: string;
  name: string;
  isAdmin: boolean;
}

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

export async function requireTmaAdmin(req: Request, res: Response, next: NextFunction) {
  const botToken = process.env["PLATFORM_TG_BOT_TOKEN"];
  if (!botToken) {
    return res.status(503).json({ success: false, error: "Platform bot not configured" });
  }

  const initData = req.headers["x-telegram-init-data"] as string | undefined;
  if (!initData) {
    return res.status(401).json({ success: false, error: "Missing Telegram initData" });
  }

  // In dev mode allow bypassing auth with env var (never active in production)
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
      return res.status(401).json({ success: false, error: "Invalid Telegram initData signature" });
    }

    // Check freshness (5 minutes)
    const authDate = parseInt(parsed["auth_date"] ?? "0", 10);
    if (Date.now() / 1000 - authDate > 5 * 60) {
      return res.status(401).json({ success: false, error: "Telegram initData expired" });
    }

    let userObj: { id?: number; first_name?: string } = {};
    try {
      userObj = JSON.parse(parsed["user"] ?? "{}") as { id?: number; first_name?: string };
    } catch {
      return res.status(401).json({ success: false, error: "Invalid user data in initData" });
    }

    telegramUserId = String(userObj.id ?? "");
    firstName = userObj.first_name ?? "Unknown";
    if (!telegramUserId) {
      return res.status(401).json({ success: false, error: "Missing user ID in initData" });
    }
  }

  try {
    const { isAdmin, name } = await checkIsAdmin(telegramUserId);
    if (!isAdmin) {
      logger.warn({ telegramUserId }, "[TMA] Unauthorized access attempt");
      return res.status(403).json({ success: false, error: "Access denied. You are not a platform admin." });
    }

    req.tmaUser = {
      telegramUserId,
      name: name || firstName,
      isAdmin: true,
    };
    next();
  } catch (err) {
    logger.error({ err }, "[TMA] Error checking admin status");
    next(err);
  }
}
