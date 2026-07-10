import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { ValidationError } from "../../shared/errors";
import { rateLimit } from "../../middlewares/rate-limit.middleware";
import { LandingLeadsRepository } from "./landing-leads.repository";

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
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
