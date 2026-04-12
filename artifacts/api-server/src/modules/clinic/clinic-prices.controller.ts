import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { ClinicPricesRepository } from "./clinic-prices.repository";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";

const router: IRouter = Router();
const repo = new ClinicPricesRepository();

router.use(authMiddleware);

const readRoles = roleGuard("owner", "admin", "doctor", "accountant", "warehouse");
const writeRoles = roleGuard("owner", "admin");

const updatePricesSchema = z.object({
  prices: z.record(z.string(), z.number().min(0)),
});

router.get("/", readRoles, async (req: Request, res: Response, next: NextFunction) => {
  const prices = await repo.getConditionPrices(req.user!.clinicId).catch(next);
  if (!prices) return;
  res.json({ success: true, data: { prices } });
});

router.put("/", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = updatePricesSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }
  const prices = await repo
    .updateConditionPrices(req.user!.clinicId, parsed.data.prices)
    .catch(next);
  if (!prices) return;
  res.json({ success: true, data: { prices } });
});

export default router;
