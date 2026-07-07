import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { platformConfigService } from "./platform-config.service";
import { ValidationError } from "../../shared/errors";

const planLimitsSchema = z.object({
  staff: z.number().int().min(0),
  branches: z.number().int().min(0),
  aiCredits: z.number().int().min(0),
  chatbotDialogs: z.number().int().min(0),
  documentTemplates: z.number().int().min(0).nullable(),
});

const planEntrySchema = z.object({
  id: z.enum(["starter", "professional", "enterprise"]),
  name: z.string().min(1).max(50),
  price: z.number().int().min(0),
  subtitle: z.string().max(200),
  audience: z.string().max(200),
  badge: z.string().max(50).optional(),
  recommended: z.boolean().optional(),
  highlights: z.array(z.string().max(200)).max(10),
  limits: planLimitsSchema,
});

export function createPlatformConfigTmaRouter(): IRouter {
  const router = Router();

  router.get("/platform/plans", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await platformConfigService.getPlansConfig();
      res.json({ success: true, data: config });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/platform/plans", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        implementationFee: z.number().int().min(0).optional(),
        trialDays: z.number().int().min(1).max(30).optional(),
        plans: z.array(planEntrySchema).length(3).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));
      }
      const config = await platformConfigService.updatePlansConfig(parsed.data);
      res.json({ success: true, data: config });
    } catch (err) {
      next(err);
    }
  });

  router.get("/platform/chatbot-defaults", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const defaults = await platformConfigService.getChatbotDefaults();
      res.json({ success: true, data: defaults });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/platform/chatbot-defaults", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        defaultEnabled: z.boolean().optional(),
        greetingTemplate: z.string().max(4000).optional(),
        followup24hTemplate: z.string().max(4000).optional(),
        followup72hTemplate: z.string().max(4000).optional(),
        followup168hTemplate: z.string().max(4000).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));
      }
      const defaults = await platformConfigService.updateChatbotDefaults(parsed.data);
      res.json({ success: true, data: defaults });
    } catch (err) {
      next(err);
    }
  });

  router.post("/platform/chatbot-defaults/apply-all", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformConfigService.applyChatbotDefaultsToAllClinics();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.get("/platform/contract-templates", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await platformConfigService.getContractTemplatesConfig();
      res.json({ success: true, data: config });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/platform/contract-templates", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        templates: z.array(
          z.object({
            id: z.string().min(1),
            name: z.string().min(1).max(300),
            category: z.string().min(1).max(200),
            subcategory: z.string().max(200).optional(),
            enabled: z.boolean(),
          }),
        ),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));
      }
      const config = await platformConfigService.updateContractTemplatesConfig(parsed.data);
      res.json({ success: true, data: config });
    } catch (err) {
      next(err);
    }
  });

  router.post("/platform/contract-templates/reseed", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await platformConfigService.reseedAllContractTemplates();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
