import { randomUUID } from "crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { ChannelsRepository } from "../modules/channels/channels.repository";
import { db, clinicsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const channelsRepo = new ChannelsRepository();

function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  return req.socket.remoteAddress ?? null;
}

async function handleRefCode(
  req: Request,
  res: Response,
  next: NextFunction,
  code: string,
  phoneOverride?: string,
) {
  try {
    const channel = await channelsRepo.findByRefCode(code);

    if (!channel) {
      return res.status(404).send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ссылка недействительна</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f2f2f7;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px;box-sizing:border-box}div{background:#fff;border-radius:20px;padding:32px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08)}h2{font-size:20px;font-weight:700;color:#1c1c1e;margin:16px 0 8px}p{font-size:14px;color:#6e6e73;line-height:1.5;margin:0}</style></head><body><div><svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="56" height="56" rx="16" fill="#f2f2f7"/><path d="M28 20v10M28 34v2" stroke="#8e8e93" stroke-width="2.5" stroke-linecap="round"/></svg><h2>Ссылка недействительна</h2><p>Эта реферальная ссылка не найдена или устарела. Попросите клинику прислать актуальную ссылку.</p></div></body></html>`
      );
    }

    // ── Step 1: generate click_id in memory immediately ──────────────────────
    const clickId = randomUUID();

    // ── Step 2: read UTM params from query string ─────────────────────────────
    const q = req.query as Record<string, string | undefined>;
    const utmSource   = q["utm_source"]   ?? null;
    const utmMedium   = q["utm_medium"]   ?? null;
    const utmCampaign = q["utm_campaign"] ?? null;
    const utmContent  = q["utm_content"]  ?? null;
    const utmTerm     = q["utm_term"]     ?? null;

    // ── Step 3: persist click asynchronously — redirect must NOT wait on DB ──
    channelsRepo
      .createClick({
        id: clickId,
        channelId: channel.id,
        clinicId: channel.clinicId,
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"] ?? null,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
      })
      .catch((err) => logger.warn({ err, clickId }, "[ref] Failed to persist click — redirect already sent"));

    // ── Step 4: determine WhatsApp phone number ───────────────────────────────
    // Priority: phone from URL > phone stored in clinic DB record
    // Critical: do NOT call Green API or check WA status — redirect always fires.
    let phone: string | null = null;

    if (phoneOverride) {
      phone = phoneOverride.replace(/\D/g, "") || null;
    }

    if (!phone) {
      const [clinic] = await db
        .select({ whatsappPhone: clinicsTable.whatsappPhone })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, channel.clinicId))
        .limit(1);
      phone = clinic?.whatsappPhone?.replace(/\D/g, "") ?? null;
    }

    // ── Step 5: build text — embed both ref code and click_id ─────────────────
    const messageText = `Здравствуйте, хочу записаться на приём 👋 (ref:${code} cid:${clickId})`;
    const encodedText = encodeURIComponent(messageText);

    if (!phone) {
      // No WhatsApp configured — show fallback page (click already recorded above)
      return res.status(200).send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Запись на приём</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f2f2f7;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px;box-sizing:border-box}div{background:#fff;border-radius:20px;padding:32px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08)}h2{font-size:20px;font-weight:700;color:#1c1c1e;margin:16px 0 8px}p{font-size:14px;color:#6e6e73;line-height:1.5;margin:0}</style></head><body><div><svg width="56" height="56" viewBox="0 0 56 56" fill="none"><rect width="56" height="56" rx="16" fill="#f2f2f7"/><path d="M20 28h16M28 20v16" stroke="#8e8e93" stroke-width="2.5" stroke-linecap="round"/></svg><h2>Клиника скоро откроется</h2><p>Пожалуйста, свяжитесь с клиникой напрямую для записи на приём.</p></div></body></html>`
      );
    }

    // ── Step 6: redirect to wa.me — always immediate, never blocked by WA status
    const waUrl = `https://wa.me/${phone}?text=${encodedText}`;
    logger.info({ clickId, code, phone: phone.slice(0, 5) + "***" }, "[ref] redirect → wa.me");
    return res.redirect(302, waUrl);

  } catch (err) {
    next(err);
  }
}

// Short URL alias — /r/:code (recommended for QR codes and print materials)
router.get(
  "/r/:code",
  (req: Request, res: Response, next: NextFunction) => {
    return handleRefCode(req, res, next, req.params.code!);
  },
);

// Legacy route — /ref/:code
router.get(
  "/ref/:code",
  (req: Request, res: Response, next: NextFunction) => {
    return handleRefCode(req, res, next, req.params.code!);
  },
);

// Legacy route with phone in path — /wa/:phone/ref/:code
router.get(
  "/wa/:phone/ref/:code",
  (req: Request, res: Response, next: NextFunction) => {
    return handleRefCode(req, res, next, req.params.code!, req.params.phone);
  },
);

export default router;
