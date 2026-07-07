import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { TabletService } from "./tablet.service";

const router: IRouter = Router();
const service = new TabletService();

const tabletRoles = roleGuard("owner", "doctor", "admin", "assistant", "nurse");
const tabletOwnerRoles = roleGuard("owner");

router.use(authMiddleware);
router.use(tabletRoles);

const pinSchema = z.object({
  pin: z.string().length(4),
  linkToken: z.string().optional(),
});

const linkSchema = z.object({
  token: z.string().min(8),
  pin: z.string().length(4).optional(),
});

const resendPairingSchema = z.object({
  sessionId: z.string().min(1),
});

const confirmPairingSchema = z.object({
  sessionId: z.string().min(1),
  code: z.string().min(6).max(6),
});

router.get("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getMe(req.user!.userId, req.user!.role);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/cabinets/pairing-code", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cabinetId = typeof req.body?.cabinetId === "string" ? req.body.cabinetId : undefined;
    const data = await service.issuePairingCode(req.user!.clinicId, req.user!.role, cabinetId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/pending-pairing", tabletOwnerRoles, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getPendingPairing(
      req.user!.userId,
      req.user!.role,
      req.user!.clinicId,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/cabinets", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cabinets = await service.listCabinets(req.user!.clinicId);
    res.json({ success: true, data: { cabinets } });
  } catch (err) {
    next(err);
  }
});

router.post("/pin", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const data = await service.setPin(
      req.user!.userId,
      req.user!.role,
      parsed.data.pin,
      parsed.data.linkToken,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/link", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));

    const data = await service.redeemLink(
      req.user!.userId,
      req.user!.role,
      parsed.data.token,
      parsed.data.pin,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/link/resend-pairing", tabletOwnerRoles, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = resendPairingSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));

    const data = await service.resendPairingCode(
      req.user!.userId,
      req.user!.role,
      parsed.data.sessionId,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/link/confirm-pairing", tabletOwnerRoles, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = confirmPairingSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));

    const data = await service.confirmPairing(parsed.data.sessionId, parsed.data.code, {
      userId: req.user!.userId,
      role: req.user!.role,
      clinicId: req.user!.clinicId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
