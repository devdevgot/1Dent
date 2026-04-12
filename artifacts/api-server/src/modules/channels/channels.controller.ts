import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { ChannelsRepository } from "./channels.repository";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { db, clinicsTable, channelTypes } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();
const repo = new ChannelsRepository();

const ownerAdminRoles = roleGuard("owner", "admin");

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(channelTypes),
});

router.use(authMiddleware);

router.get(
  "/channels",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const channels = await repo.list(req.user!.clinicId).catch(next);
    if (channels === undefined) return;
    res.json({ success: true, data: { channels } });
  },
);

router.post(
  "/channels",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = createChannelSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));
    const { name, type } = parsed.data;
    const channel = await repo.create(req.user!.clinicId, name, type).catch(next);
    if (channel === undefined) return;
    res.status(201).json({ success: true, data: { channel } });
  },
);

router.delete(
  "/channels/:id",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const deleted = await repo.delete(id!, req.user!.clinicId).catch(next);
    if (deleted === undefined) return;
    if (!deleted) return next(new NotFoundError("Channel not found"));
    res.json({ success: true });
  },
);

router.get(
  "/channels/stats",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { dateFrom, dateTo } = req.query;
    let from: Date | undefined;
    let to: Date | undefined;
    if (typeof dateFrom === "string" && dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) from = d;
    }
    if (typeof dateTo === "string" && dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); to = d; }
    }
    const stats = await repo.getChannelStats(req.user!.clinicId, from, to).catch(next);
    if (stats === undefined) return;
    res.json({ success: true, data: { stats } });
  },
);

const updateClinicSchema = z.object({
  whatsappPhone: z.string().min(5).max(20),
});

router.patch(
  "/clinic/whatsapp-phone",
  roleGuard("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = updateClinicSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));
    const { whatsappPhone } = parsed.data;
    const [clinic] = await db
      .update(clinicsTable)
      .set({ whatsappPhone })
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .returning()
      .catch(next) ?? [];
    if (!clinic) return;
    res.json({ success: true, data: { clinic } });
  },
);

export const channelsRepo = repo;
export default router;
