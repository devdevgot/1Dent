import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { ClinicContractSettingsRepository } from "./clinic-contract-settings.repository";

const router: IRouter = Router();
const repo = new ClinicContractSettingsRepository();

router.use(authMiddleware);

const ownerAdmin = roleGuard("owner", "admin");

const contractSettingsSchema = z.object({
  contractLegalName: z.string().max(500).nullable().optional(),
  contractCity: z.string().max(200).nullable().optional(),
  contractAddress: z.string().max(500).nullable().optional(),
  contractLicense: z.string().max(100).nullable().optional(),
  contractDirector: z.string().max(200).nullable().optional(),
});

router.get("/clinic/contract-settings", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await repo.getContractSettings(req.user!.clinicId);
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
});

router.patch("/clinic/contract-settings", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = contractSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const settings = await repo.updateContractSettings(req.user!.clinicId, parsed.data);
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
});

export default router;
