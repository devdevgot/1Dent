import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { SyncService, type SyncOpInput } from "./sync.service";

const router: IRouter = Router();
const service = new SyncService();

const syncOpSchema = z.object({
  clientOpId: z.string().min(1).max(128),
  type: z.enum([
    "update_patient",
    "update_patient_status",
    "update_tooth",
    "add_interaction",
  ]),
  resourceId: z.string().min(1),
  toothFdi: z.number().int().min(11).max(48).optional(),
  baseUpdatedAt: z.string().min(1).optional().nullable(),
  payload: z.record(z.unknown()),
  clientTimestamp: z.string().optional(),
});

const pushSchema = z.object({
  ops: z.array(syncOpSchema).min(1).max(100),
});

router.use(authMiddleware);

const syncRoles = roleGuard(
  "owner",
  "admin",
  "doctor",
  "assistant",
  "nurse",
);

/**
 * POST /sync/push — apply a batch of offline mutations with per-op conflict results.
 * Used by the PWA outbox flusher after reconnect.
 */
router.post(
  "/push",
  syncRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = pushSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new ValidationError(
          parsed.error.errors[0]?.message ?? "Validation failed",
        ),
      );
    }

    const results = await service
      .push(
        req.user!.clinicId,
        req.user!.role,
        req.user!.userId,
        parsed.data.ops as SyncOpInput[],
      )
      .catch(next);
    if (!results) return;

    res.json({ success: true, data: { results } });
  },
);

export default router;
