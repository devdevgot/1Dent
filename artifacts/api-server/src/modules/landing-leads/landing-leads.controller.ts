import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, clinicsTable } from "@workspace/db";
import { ilike } from "drizzle-orm";
import { ValidationError } from "../../shared/errors";
import { rateLimit } from "../../middlewares/rate-limit.middleware";
import { LandingLeadsRepository } from "./landing-leads.repository";
import { notifyClinicStaff, NOTIFY_KINDS } from "../../shared/clinic-notify";
import { logger } from "../../lib/logger";

const router: IRouter = Router();
const repo = new LandingLeadsRepository();

const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(30),
  clinicName: z.string().trim().min(1).max(200),
});

const landingLeadRateLimit = rateLimit({
  windowSeconds: 3600,
  maxRequests: 5,
  keyPrefix: "rl:landing-lead",
});

router.post("/", landingLeadRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));

    const result = await repo.create(parsed.data);

    // Soft-match existing clinic by name → notify that clinic's owners (platform leads stay in TMA).
    void (async () => {
      try {
        const [clinic] = await db
          .select({ id: clinicsTable.id, name: clinicsTable.name })
          .from(clinicsTable)
          .where(ilike(clinicsTable.name, parsed.data.clinicName.trim()))
          .limit(1);
        if (!clinic) return;
        await notifyClinicStaff({
          clinicId: clinic.id,
          kind: NOTIFY_KINDS.landing_lead,
          message: `🌐 Заявка с сайта: ${parsed.data.name}, ${parsed.data.phone}`,
          payload: {
            leadId: result.id,
            name: parsed.data.name,
            phone: parsed.data.phone,
            clinicName: parsed.data.clinicName,
          },
          dedupKey: `landing_lead:${result.id}`,
        });
      } catch (err) {
        logger.warn({ err }, "[landing-leads] Failed to notify matched clinic");
      }
    })();

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
