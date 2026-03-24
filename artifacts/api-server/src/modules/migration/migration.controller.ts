import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { migrationService } from "./migration.service";

const router: IRouter = Router();

router.use(authMiddleware);
router.use(roleGuard("owner", "admin"));

// POST /migration/excel/preview
// Accepts base64-encoded Excel file + column mapping detection
const excelPreviewSchema = z.object({
  fileBase64: z.string().min(10, "fileBase64 is required"),
});

router.post(
  "/excel/preview",
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = excelPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    try {
      const preview = migrationService.parseExcel(parsed.data.fileBase64);
      res.json({ success: true, data: preview });
    } catch (err) {
      next(new ValidationError((err as Error).message));
    }
  },
);

// POST /migration/excel/confirm
const excelConfirmSchema = z.object({
  rows: z.array(
    z.object({
      index: z.number(),
      cells: z.record(z.string()),
    }),
  ).min(1).max(5000),
  mapping: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    age: z.string().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
  }),
});

router.post(
  "/excel/confirm",
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = excelConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const job = await migrationService
      .startExcelImport(req.user!.clinicId, parsed.data.rows, parsed.data.mapping)
      .catch(next);
    if (!job) return;
    res.json({ success: true, data: { job } });
  },
);

// POST /migration/trello/connect
const trelloConnectSchema = z.object({
  apiKey: z.string().min(1, "Trello API key is required"),
  token: z.string().min(1, "Trello token is required"),
});

router.post(
  "/trello/connect",
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = trelloConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const result = await migrationService.connectTrello(parsed.data.apiKey, parsed.data.token).catch(next);
    if (!result) return;
    res.json({ success: true, data: result });
  },
);

// POST /migration/trello/import
const trelloImportSchema = z.object({
  apiKey: z.string().min(1),
  token: z.string().min(1),
  boardId: z.string().min(1, "boardId is required"),
});

router.post(
  "/trello/import",
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = trelloImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const job = await migrationService
      .startTrelloImport(req.user!.clinicId, parsed.data.apiKey, parsed.data.token, parsed.data.boardId)
      .catch(next);
    if (!job) return;
    res.json({ success: true, data: { job } });
  },
);

// GET /migration/jobs
router.get(
  "/jobs",
  async (req: Request, res: Response, next: NextFunction) => {
    const jobs = await migrationService.listJobs(req.user!.clinicId).catch(next);
    if (!jobs) return;
    res.json({ success: true, data: { jobs } });
  },
);

// GET /migration/:jobId/status
router.get(
  "/:jobId/status",
  async (req: Request, res: Response, next: NextFunction) => {
    const jobId = String(req.params["jobId"]);
    const job = await migrationService.getJobStatus(req.user!.clinicId, jobId).catch((err: Error) => {
      if (err.message.includes("not found")) return next(new NotFoundError("Migration job not found"));
      return next(err);
    });
    if (!job) return;
    res.json({ success: true, data: { job } });
  },
);

export default router;
