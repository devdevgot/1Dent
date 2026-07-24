import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { customerCareChatbotService } from "./customer-care-chatbot.service";

const router: IRouter = Router();

router.use(authMiddleware);

const str = z.string().max(4000);
const promptTriple = z.tuple([str, str, str]);
const promptPair = z.tuple([str, str]);

const promptsSchema = z
  .object({
    leadNurtureTemplates: promptTriple.optional(),
    leadNurturePrompts: promptTriple.optional(),
    reminder24hTemplate: str.optional(),
    reminder24hPrompt: str.optional(),
    reminder1hTemplate: str.optional(),
    reminder1hPrompt: str.optional(),
    noShowTemplate: str.optional(),
    noShowPrompt: str.optional(),
    postVisitTemplates: promptPair.optional(),
    postVisitPrompts: promptPair.optional(),
    upsellTemplate: str.optional(),
    upsellPrompt: str.optional(),
    handoffToBookingPrompt: str.optional(),
  })
  .optional();

const settingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  leadNurtureEnabled: z.boolean().optional(),
  leadNurtureDelaysMinutes: z.tuple([z.number().int().min(5).max(10080), z.number().int().min(5).max(10080), z.number().int().min(5).max(10080)]).optional(),
  reminder1hEnabled: z.boolean().optional(),
  reminder24hEnabled: z.boolean().optional(),
  noShowEnabled: z.boolean().optional(),
  noShowGraceHours: z.number().int().min(1).max(48).optional(),
  postVisitEnabled: z.boolean().optional(),
  upsellEnabled: z.boolean().optional(),
  prompts: promptsSchema,
});

router.get(
  "/settings",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;
      const settings = await customerCareChatbotService.getSettings(clinicId);
      res.json({ success: true, data: settings });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/settings",
  roleGuard("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = settingsUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
      }
      const clinicId = req.user!.clinicId;
      const settings = await customerCareChatbotService.updateSettings(clinicId, parsed.data);
      res.json({ success: true, data: settings });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
