import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { PlanRequestsRepository } from "./plan-requests.repository";

const router: IRouter = Router();
const repo = new PlanRequestsRepository();

router.use(authMiddleware);

const createPlanRequestSchema = z.object({
  plan: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(5),
  contactEmail: z.string().email().optional(),
  message: z.string().optional(),
});

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createPlanRequestSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));

    const result = await repo.create(req.user!.clinicId, parsed.data);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
