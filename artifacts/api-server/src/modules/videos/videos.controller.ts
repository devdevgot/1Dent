import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq, and, or, isNull, asc } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { db } from "@workspace/db";
import { treatmentVideosTable } from "@workspace/db";
import { ObjectStorageService } from "../../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

const TOOTH_CONDITIONS = [
  "healthy",
  "cavity",
  "treated",
  "crown",
  "root_canal",
  "implant",
  "missing",
  "extraction_needed",
] as const;

const VIDEO_CATEGORIES = [
  "Эндодонтия",
  "Терапия",
  "Хирургия",
  "Ортопедия",
  "Профилактика",
  "Ортодонтия",
  "Имплантация",
] as const;

function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function serializeVideo(
  row: typeof treatmentVideosTable.$inferSelect,
  storageSvc: ObjectStorageService,
) {
  const playbackUrl =
    storageSvc.buildPublicUrl(row.storageKey) ?? storageSvc.buildPlaybackUrl(row.storageKey);
  const thumbnailUrl = row.thumbnailKey
    ? storageSvc.buildPublicUrl(row.thumbnailKey) ?? storageSvc.buildPlaybackUrl(row.thumbnailKey)
    : null;

  return {
    id: row.id,
    clinicId: row.clinicId,
    title: row.title,
    category: row.category,
    storageKey: row.storageKey,
    thumbnailKey: row.thumbnailKey,
    duration: formatDuration(row.durationSec),
    durationSec: row.durationSec,
    relatedConditions: row.relatedConditions ?? [],
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    playbackUrl,
    thumbnailUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.use(authMiddleware);

// GET /api/videos — tablet + CRM: global library + clinic videos
router.get("/videos", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user!.clinicId;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const condition = typeof req.query.condition === "string" ? req.query.condition : undefined;
    const includeInactive = req.query.includeInactive === "true";

    const rows = await db
      .select()
      .from(treatmentVideosTable)
      .where(
        and(
          or(isNull(treatmentVideosTable.clinicId), eq(treatmentVideosTable.clinicId, clinicId)),
          includeInactive ? undefined : eq(treatmentVideosTable.isActive, true),
          category ? eq(treatmentVideosTable.category, category) : undefined,
        ),
      )
      .orderBy(asc(treatmentVideosTable.sortOrder), asc(treatmentVideosTable.title));

    let videos = rows.map((row) => serializeVideo(row, storage));

    if (condition) {
      videos = videos.filter((v) => v.relatedConditions.includes(condition));
    }

    res.json({ success: true, data: { videos } });
  } catch (err) {
    next(err);
  }
});

const ownerAdmin = roleGuard("owner", "admin");

const createSchema = z.object({
  objectPath: z.string().min(1),
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  relatedConditions: z.array(z.enum(TOOTH_CONDITIONS)).default([]),
  durationSec: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
  isGlobal: z.boolean().optional(),
  visibility: z.enum(["public", "private"]).default("private"),
});

// POST /api/videos — register video after R2 upload
router.post("/videos", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));
    }

    const {
      objectPath,
      title,
      category,
      relatedConditions,
      durationSec,
      sortOrder,
      isGlobal,
      visibility,
    } = parsed.data;

    const normalizedPath = storage.normalizeObjectEntityPath(objectPath);
    const id = randomUUID();
    const clinicId = isGlobal ? null : req.user!.clinicId;

    await storage.trySetObjectEntityAclPolicy(normalizedPath, {
      owner: clinicId ?? "platform",
      visibility: isGlobal ? "public" : visibility,
    });

    await db.insert(treatmentVideosTable).values({
      id,
      clinicId,
      title,
      category,
      storageKey: normalizedPath,
      durationSec: durationSec ?? null,
      relatedConditions,
      sortOrder: sortOrder ?? 0,
      isActive: true,
    });

    const [row] = await db
      .select()
      .from(treatmentVideosTable)
      .where(eq(treatmentVideosTable.id, id))
      .limit(1);

    res.status(201).json({ success: true, data: { video: serializeVideo(row!, storage) } });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(100).optional(),
  relatedConditions: z.array(z.enum(TOOTH_CONDITIONS)).optional(),
  durationSec: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/videos/:id/play-url — short-lived signed URL for <video> playback
router.get("/videos/:id/play-url", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const [row] = await db
      .select()
      .from(treatmentVideosTable)
      .where(eq(treatmentVideosTable.id, id))
      .limit(1);

    if (!row || !row.isActive) return next(new NotFoundError("Video not found"));
    if (row.clinicId && row.clinicId !== req.user!.clinicId) {
      return next(new NotFoundError("Video not found"));
    }

    const publicUrl = storage.buildPublicUrl(row.storageKey);
    if (publicUrl) {
      res.json({ success: true, data: { url: publicUrl, expiresIn: null } });
      return;
    }

    const url = await storage.getSignedReadUrl(row.storageKey);
    res.json({ success: true, data: { url, expiresIn: 3600 } });
  } catch (err) {
    next(err);
  }
});

router.patch("/videos/:id", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));
    }

    const id = String(req.params.id);
    const [existing] = await db
      .select()
      .from(treatmentVideosTable)
      .where(eq(treatmentVideosTable.id, id))
      .limit(1);

    if (!existing) return next(new NotFoundError("Video not found"));
    if (existing.clinicId && existing.clinicId !== req.user!.clinicId) {
      return next(new NotFoundError("Video not found"));
    }

    const patch = parsed.data;
    await db
      .update(treatmentVideosTable)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(treatmentVideosTable.id, id));

    const [row] = await db
      .select()
      .from(treatmentVideosTable)
      .where(eq(treatmentVideosTable.id, id))
      .limit(1);

    res.json({ success: true, data: { video: serializeVideo(row!, storage) } });
  } catch (err) {
    next(err);
  }
});

router.delete("/videos/:id", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const [existing] = await db
      .select()
      .from(treatmentVideosTable)
      .where(eq(treatmentVideosTable.id, id))
      .limit(1);

    if (!existing) return next(new NotFoundError("Video not found"));
    if (existing.clinicId && existing.clinicId !== req.user!.clinicId) {
      return next(new NotFoundError("Video not found"));
    }

    await db.delete(treatmentVideosTable).where(eq(treatmentVideosTable.id, id));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { VIDEO_CATEGORIES, TOOTH_CONDITIONS };
export default router;
