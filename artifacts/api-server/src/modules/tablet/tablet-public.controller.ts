import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { TabletService } from "./tablet.service";
import { ValidationError } from "../../shared/errors";
import {
  TabletPinSetupRequiredError,
  TabletPinRequiredError,
} from "../../shared/errors";

const router: IRouter = Router();
const service = new TabletService();

const createSessionSchema = z.object({
  cabinetId: z.string().min(1),
});

const verifyCabinetPinSchema = z.object({
  pin: z.string().length(4),
});

router.post("/sessions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const data = await service.createSession(parsed.data.cabinetId);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/sessions/:sessionId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getSessionStatus(String(req.params.sessionId));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/cabinets/:cabinetId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getCabinetPublic(String(req.params.cabinetId));
    res.json({ success: true, data: { cabinet: data } });
  } catch (err) {
    next(err);
  }
});

router.post("/cabinets/:cabinetId/verify-pin", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = verifyCabinetPinSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const data = await service.verifyCabinetPin(String(req.params.cabinetId), parsed.data.pin);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;

export { service as tabletService };
