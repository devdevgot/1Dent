import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { ChatbotService } from "./chatbot.service";

const router: IRouter = Router();
const service = new ChatbotService();

router.use(authMiddleware);

const stepInstructionsSchema = z.object({
  general: z.string().max(2000).optional(),
  greeting: z.string().max(2000).optional(),
  collectName: z.string().max(2000).optional(),
  collectProblem: z.string().max(2000).optional(),
  suggestDoctor: z.string().max(2000).optional(),
  confirm: z.string().max(2000).optional(),
});

const settingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  greetingTemplate: z.string().min(1).max(500).optional(),
  followup24hTemplate: z.string().min(1).max(500).optional(),
  followup72hTemplate: z.string().min(1).max(500).optional(),
  followup168hTemplate: z.string().min(1).max(500).optional(),
  stepInstructions: stepInstructionsSchema.optional(),
});

const managerExampleSchema = z.object({
  userMessage: z.string().min(1).max(1000),
  managerResponse: z.string().min(1).max(2000),
});

const reorderSchema = z.object({
  sortOrder: z.number().int().min(0),
});

const testMessageSchema = z.object({
  userMessage: z.string().min(1).max(500),
  state: z
    .enum([
      "greeting",
      "collect_iin",
      "collect_name",
      "collect_phone",
      "collect_problem",
      "suggest_doctor",
      "manage_appointment",
      "show_slots",
      "collect_datetime",
      "confirm_appointment",
      "dental_qa",
      "done",
      "human_takeover",
    ])
    .optional(),
});

// ─── Settings ────────────────────────────────────────────────────────────────

router.get(
  "/settings",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const settings = await service.getSettings(req.user!.clinicId).catch(next);
    if (!settings) return;
    res.json({ success: true, data: { settings } });
  },
);

router.put(
  "/settings",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = settingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const settings = await service.updateSettings(req.user!.clinicId, parsed.data).catch(next);
    if (!settings) return;
    res.json({ success: true, data: { settings } });
  },
);

// ─── Sessions ────────────────────────────────────────────────────────────────

router.get(
  "/sessions",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const sessions = await service.listSessions(req.user!.clinicId).catch(next);
    if (!sessions) return;
    res.json({ success: true, data: { sessions } });
  },
);

router.get(
  "/sessions/:phone/messages",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const phone = String(req.params["phone"]);
    const messages = await service.listMessages(req.user!.clinicId, phone).catch(next);
    if (!messages) return;
    res.json({ success: true, data: { messages } });
  },
);

router.delete(
  "/sessions/:phone",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const phone = String(req.params["phone"]);
    await service.clearSession(req.user!.clinicId, phone).catch(next);
    res.json({ success: true });
  },
);

// ─── Manager Examples ────────────────────────────────────────────────────────

router.get(
  "/manager-examples",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const examples = await service.listManagerExamples(req.user!.clinicId).catch(next);
    if (!examples) return;
    res.json({ success: true, data: { examples } });
  },
);

router.post(
  "/manager-examples",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = managerExampleSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const example = await service
      .createManagerExample(req.user!.clinicId, parsed.data.userMessage, parsed.data.managerResponse)
      .catch(next);
    if (!example) return;
    res.status(201).json({ success: true, data: { example } });
  },
);

router.put(
  "/manager-examples/:id",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    const parsed = managerExampleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const example = await service.updateManagerExample(req.user!.clinicId, id, parsed.data).catch(next);
    if (example === undefined) return;
    if (!example) {
      res.status(404).json({ success: false, error: "Example not found" });
      return;
    }
    res.json({ success: true, data: { example } });
  },
);

router.delete(
  "/manager-examples/:id",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    await service.deleteManagerExample(req.user!.clinicId, id).catch(next);
    res.json({ success: true });
  },
);

router.patch(
  "/manager-examples/:id/reorder",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const example = await service.reorderManagerExample(req.user!.clinicId, id, parsed.data.sortOrder).catch(next);
    if (example === undefined) return;
    if (!example) {
      res.status(404).json({ success: false, error: "Example not found" });
      return;
    }
    res.json({ success: true, data: { example } });
  },
);

// ─── Test message ─────────────────────────────────────────────────────────────

router.post(
  "/test-message",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = testMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const reply = await service
      .testMessage(req.user!.clinicId, parsed.data.userMessage, parsed.data.state)
      .catch(next);
    if (!reply) return;
    res.json({ success: true, data: { reply } });
  },
);

export default router;
