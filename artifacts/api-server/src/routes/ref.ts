import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { ChannelsRepository } from "../modules/channels/channels.repository";
import { db, clinicsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();
const channelsRepo = new ChannelsRepository();

async function handleRefCode(code: string, res: Response, next: NextFunction, phoneOverride?: string) {
  try {
    const channel = await channelsRepo.findByRefCode(code);

    if (!channel) {
      return res.status(404).send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ссылка недействительна</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f2f2f7;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px;box-sizing:border-box}div{background:#fff;border-radius:20px;padding:32px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08)}h2{font-size:20px;font-weight:700;color:#1c1c1e;margin:16px 0 8px}p{font-size:14px;color:#6e6e73;line-height:1.5;margin:0}</style></head><body><div><svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="56" height="56" rx="16" fill="#f2f2f7"/><path d="M28 20v10M28 34v2" stroke="#8e8e93" stroke-width="2.5" stroke-linecap="round"/></svg><h2>Ссылка недействительна</h2><p>Эта реферальная ссылка не найдена или устарела. Попросите клинику прислать актуальную ссылку.</p></div></body></html>`
      );
    }

    const text = encodeURIComponent(
      `Здравствуйте, хочу записаться на приём 👋 (ref:${code})`,
    );

    // Use phone from the URL if provided (most reliable — embedded by the CRM at link-generation time)
    if (phoneOverride) {
      const phone = phoneOverride.replace(/\D/g, "");
      if (phone) {
        const waUrl = `https://wa.me/${phone}?text=${text}`;
        return res.redirect(302, waUrl);
      }
    }

    // Fallback: look up whatsappPhone from the clinic record
    const [clinic] = await db
      .select({ whatsappPhone: clinicsTable.whatsappPhone })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, channel.clinicId))
      .limit(1);

    const whatsappPhone = clinic?.whatsappPhone ?? "";

    if (!whatsappPhone) {
      return res.status(200).send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Запись на приём</title></head><body><p>WhatsApp не настроен. Код канала: <b>ref:${code}</b></p></body></html>`,
      );
    }

    const phone = whatsappPhone.replace(/\D/g, "");
    const waUrl = `https://wa.me/${phone}?text=${text}`;

    return res.redirect(302, waUrl);
  } catch (err) {
    next(err);
  }
}

router.get(
  "/ref/:code",
  (req: Request, res: Response, next: NextFunction) => {
    return handleRefCode(req.params.code!, res, next);
  },
);

router.get(
  "/wa/:phone/ref/:code",
  (req: Request, res: Response, next: NextFunction) => {
    return handleRefCode(req.params.code!, res, next, req.params.phone);
  },
);

export default router;
