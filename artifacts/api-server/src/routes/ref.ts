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
      return res.status(404).send("Channel not found");
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
