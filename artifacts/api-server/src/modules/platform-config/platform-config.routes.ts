import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { platformConfigService } from "./platform-config.service";
import { platformWhatsappService } from "./platform-whatsapp.service";
import { ValidationError } from "../../shared/errors";
import {
  createPartnerInstance,
  deletePartnerInstance,
  getGreenApiQrCode,
  setGreenApiWebhookUrl,
  getServerBaseUrl,
} from "../../shared/green-api";
import { pingPlatformWhatsAppInstance } from "../../shared/platform-whatsapp";
import { logger } from "../../lib/logger";

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

  router.get("/platform/whatsapp", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const instances = await platformWhatsappService.listInstances();
      res.json({
        success: true,
        data: {
          instances: instances.map((i) => ({
            ...i,
            greenApiToken: i.greenApiToken ? "••••••••" : "",
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/platform/whatsapp", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        label: z.string().min(1).max(100),
        greenApiInstanceId: z.string().min(1).optional(),
        greenApiToken: z.string().min(1).optional(),
        greenApiUrl: z.string().nullable().optional(),
        whatsappPhone: z.string().nullable().optional(),
        isDefault: z.boolean().optional(),
        autoProvision: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));
      }

      let instanceId = parsed.data.greenApiInstanceId;
      let token = parsed.data.greenApiToken;
      let apiUrl = parsed.data.greenApiUrl ?? null;

      if (parsed.data.autoProvision) {
        const partnerToken = process.env["GREEN_API_PARTNER_TOKEN"];
        if (!partnerToken) {
          return next(new ValidationError("Partner API не настроен"));
        }
        const created = await createPartnerInstance(partnerToken);
        instanceId = String(created.idInstance);
        token = created.apiTokenInstance;
        apiUrl = created.apiUrl;
      }

      if (!instanceId || !token) {
        return next(new ValidationError("Укажите instanceId и token или включите autoProvision"));
      }

      const instance = await platformWhatsappService.addInstance({
        label: parsed.data.label,
        greenApiInstanceId: instanceId,
        greenApiToken: token,
        greenApiUrl: apiUrl,
        whatsappPhone: parsed.data.whatsappPhone,
        isDefault: parsed.data.isDefault,
      });

      res.status(201).json({ success: true, data: { instance } });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/platform/whatsapp/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        label: z.string().min(1).max(100).optional(),
        greenApiInstanceId: z.string().min(1).optional(),
        greenApiToken: z.string().min(1).optional(),
        greenApiUrl: z.string().nullable().optional(),
        whatsappPhone: z.string().nullable().optional(),
        isDefault: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));
      }

      const patch = { ...parsed.data };
      if (patch.greenApiToken === "••••••••") {
        delete patch.greenApiToken;
      }

      const instance = await platformWhatsappService.updateInstance(String(req.params["id"]), patch);
      res.json({ success: true, data: { instance } });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/platform/whatsapp/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params["id"]);
      const instance = await platformWhatsappService.getInstanceById(id);
      if (!instance) {
        return next(new ValidationError("Instance not found"));
      }

      const partnerToken = process.env["GREEN_API_PARTNER_TOKEN"];
      if (partnerToken) {
        deletePartnerInstance(instance.greenApiInstanceId, partnerToken).catch((err) => {
          logger.warn({ err }, "Failed to delete partner platform WhatsApp instance");
        });
      }

      await platformWhatsappService.deleteInstance(id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/platform/whatsapp/:id/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pingPlatformWhatsAppInstance(String(req.params["id"]));
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.get("/platform/whatsapp/:id/qr", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instance = await platformWhatsappService.getInstanceById(String(req.params["id"]));
      if (!instance) {
        return next(new ValidationError("Instance not found"));
      }

      const qr = await getGreenApiQrCode(
        instance.greenApiInstanceId,
        instance.greenApiToken,
        instance.greenApiUrl,
      );
      res.json({ success: true, data: qr });
    } catch (err) {
      next(err);
    }
  });

  router.post("/platform/whatsapp/:id/register-webhook", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instance = await platformWhatsappService.getInstanceById(String(req.params["id"]));
      if (!instance) {
        return next(new ValidationError("Instance not found"));
      }

      const baseUrl = getServerBaseUrl();
      if (!baseUrl) {
        return next(new ValidationError("WEBHOOK_BASE_URL не настроен"));
      }

      const webhookUrl = `${baseUrl}/api/webhook/platform-whatsapp/${instance.id}`;
      await setGreenApiWebhookUrl(
        instance.greenApiInstanceId,
        instance.greenApiToken,
        webhookUrl,
        instance.greenApiUrl,
      );
      res.json({ success: true, data: { webhookUrl } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
