import { randomUUID } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { NotFoundError, ValidationError } from "../../shared/errors";
import { TreatmentPlansRepository, PlanLockedError, ItemAlreadyCompletedError } from "./treatment-plans.repository";
import { PatientsRepository } from "../patients/patients.repository";
import { ClinicPricesRepository } from "../clinic/clinic-prices.repository";
import { DentalRepository } from "../dental/dental.repository";
import { generatePlanPdfBuffer, type PlanPdfContext } from "./treatment-plan-pdf";
import { sendFileToPatient } from "../../shared/messaging";
import { MessagesRepository } from "../messages/messages.repository";
import { logger } from "../../lib/logger";
import { db, clinicsTable, usersTable, patientsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router({ mergeParams: true });
const repo = new TreatmentPlansRepository();
const patientsRepo = new PatientsRepository();
const pricesRepo = new ClinicPricesRepository();
const dentalRepo = new DentalRepository();
const messagesRepo = new MessagesRepository();

const docRoles = roleGuard("owner", "admin", "doctor");

const CreatePlanSchema = z.object({
  items: z
    .array(
      z.object({
        toothFdi: z.number().int().optional(),
        condition: z.string().optional(),
        mkb10Code: z.string().optional(),
        title: z.string().min(1),
        price: z.number().min(0),
      }),
    )
    .optional(),
});

const UpdatePlanSchema = z.object({
  notes: z.string().nullable().optional(),
});

const UpdateItemSchema = z.object({
  title: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
  sortOrder: z.number().int().min(0).optional(),
  status: z.literal("cancelled").optional(),
  notes: z.string().nullable().optional(),
  attachments: z.array(z.string()).optional(),
  assignedDoctorId: z.string().nullable().optional(),
  bundleToken: z.string().nullable().optional(),
  stage: z.string().nullable().optional(),
  discount: z.number().int().min(0).max(100).optional(),
  procedureId: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
});

const AddItemSchema = z.object({
  toothFdi: z.number().int().optional(),
  condition: z.string().optional(),
  mkb10Code: z.string().optional(),
  title: z.string().min(1),
  price: z.number().min(0),
});

async function loadPlanPdfContext(
  patientId: string,
  clinicId: string,
  doctorId: string | null,
): Promise<PlanPdfContext | null> {
  const [patient] = await db
    .select({
      id: patientsTable.id,
      name: patientsTable.name,
      phone: patientsTable.phone,
    })
    .from(patientsTable)
    .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, clinicId)))
    .limit(1);
  if (!patient) return null;

  const [clinic] = await db
    .select({
      name: clinicsTable.name,
      whatsappPhone: clinicsTable.whatsappPhone,
    })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);

  let doctorName = "";
  if (doctorId) {
    const [doctor] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, doctorId))
      .limit(1);
    doctorName = doctor?.name ?? "";
  }

  return {
    patientId: patient.id,
    patientName: patient.name,
    patientPhone: patient.phone,
    clinicName: clinic?.name ?? "Стоматология",
    clinicWhatsappPhone: clinic?.whatsappPhone ?? null,
    doctorName,
  };
}

async function checkPatient(req: Request, res: Response, next: NextFunction): Promise<boolean> {
  const patientId = String(req.params["id"] ?? req.params["patientId"] ?? "");
  const patient = await patientsRepo.findById(patientId, req.user!.clinicId).catch(next);
  if (patient === undefined) return false;
  if (!patient) { next(new NotFoundError("Patient not found")); return false; }
  return true;
}

// GET /patients/:id/treatment-plans — list all plans
router.get(
  "/patients/:id/treatment-plans",
  authMiddleware,
  docRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    if (!(await checkPatient(req, res, next))) return;
    const plans = await repo.listPlans(req.params["id"] as string, req.user!.clinicId).catch(next);
    if (!plans) return;
    res.json({ success: true, data: { plans } });
  },
);

// GET /patients/:id/treatment-plan — get active plan
router.get(
  "/patients/:id/treatment-plan",
  authMiddleware,
  docRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    if (!(await checkPatient(req, res, next))) return;
    const plan = await repo.getActivePlan(req.params["id"] as string, req.user!.clinicId).catch(next);
    if (plan === undefined) return;
    res.json({ success: true, data: { plan } });
  },
);

// POST /patients/:id/treatment-plan — create plan
router.post(
  "/patients/:id/treatment-plan",
  authMiddleware,
  docRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = CreatePlanSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));
    if (!(await checkPatient(req, res, next))) return;

    const patientId = req.params["id"] as string;
    const clinicId = req.user!.clinicId;

    // Rule 1: must have at least one tooth record (diagnosis done)
    const teeth = await dentalRepo.listTeeth(patientId, clinicId).catch(next);
    if (teeth === undefined) return;
    if (teeth.length === 0) {
      return next(new ValidationError("Необходимо провести диагностику перед составлением плана лечения"));
    }

    // Rule 2: for second+ plan, tooth records must have been updated AFTER the most recent plan was created
    const existingPlans = await repo.listPlans(patientId, clinicId).catch(next);
    if (existingPlans === undefined) return;
    if (existingPlans.length > 0) {
      const latestPlanTs = Math.max(...existingPlans.map((p) => new Date(p.createdAt).getTime()));
      const latestToothTs = Math.max(...teeth.map((t) => new Date(t.updatedAt).getTime()));
      if (latestToothTs <= latestPlanTs) {
        return next(new ValidationError("Необходима повторная диагностика перед созданием нового плана лечения"));
      }
    }

    const pricesMap = await pricesRepo.getConditionPrices(req.user!.clinicId).catch(next);
    if (!pricesMap) return;

    let plan;
    try {
      plan = await repo.createPlan(
        req.user!.clinicId,
        req.params["id"] as string,
        req.user!.userId,
        pricesMap,
        parsed.data.items,
      );
    } catch (err) {
      console.error("[CreateTreatmentPlan] Failed:", err);
      return next(err);
    }
    if (!plan) {
      return next(new Error("Failed to create treatment plan"));
    }

    res.status(201).json({ success: true, data: { plan } });
  },
);

// PATCH /patients/:id/treatment-plan/:planId — update plan (notes/status)
router.patch(
  "/patients/:id/treatment-plan/:planId",
  authMiddleware,
  docRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = UpdatePlanSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));

    const plan = await repo
      .updatePlan(req.params["planId"] as string, req.user!.clinicId, req.params["id"] as string, parsed.data)
      .catch(next);
    if (plan === undefined) return;
    if (!plan) return next(new NotFoundError("Treatment plan not found"));

    res.json({ success: true, data: { plan } });
  },
);

// POST /patients/:id/treatment-plan/:planId/approve
router.post(
  "/patients/:id/treatment-plan/:planId/approve",
  authMiddleware,
  docRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const plan = await repo
      .approvePlan(req.params["planId"] as string, req.user!.clinicId, req.params["id"] as string)
      .catch(next);
    if (plan === undefined) return;
    if (!plan) return next(new NotFoundError("Treatment plan not found"));

    await patientsRepo.updateStatus(req.params["id"] as string, req.user!.clinicId, "treatment_assigned").catch(() => {});

    res.json({ success: true, data: { plan } });
  },
);

// POST /patients/:id/treatment-plan/:planId/items — add item
router.post(
  "/patients/:id/treatment-plan/:planId/items",
  authMiddleware,
  docRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = AddItemSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));

    const existingPlan = await repo.getActivePlan(req.params["id"] as string, req.user!.clinicId).catch(next);
    if (existingPlan === undefined) return;
    if (!existingPlan || existingPlan.id !== req.params["planId"]) {
      return next(new NotFoundError("Treatment plan not found"));
    }

    const sortOrder = existingPlan.items.length;

    let item: Awaited<ReturnType<typeof repo.addItem>> | undefined;
    try {
      item = await repo.addItem(
        existingPlan.id,
        req.user!.clinicId,
        req.params["id"] as string,
        parsed.data,
        sortOrder,
      );
    } catch (err) {
      if (err instanceof PlanLockedError) {
        return res.status(409).json({ success: false, error: err.message, code: "PLAN_LOCKED" });
      }
      return next(err);
    }

    res.status(201).json({ success: true, data: { item } });
  },
);

// PATCH /patients/:id/treatment-plan/:planId/items/:itemId — update item
router.patch(
  "/patients/:id/treatment-plan/:planId/items/:itemId",
  authMiddleware,
  docRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = UpdateItemSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));

    let item: Awaited<ReturnType<typeof repo.updateItem>> | undefined;
    try {
      item = await repo.updateItem(req.params["itemId"] as string, req.user!.clinicId, req.params["planId"] as string, req.params["id"] as string, parsed.data);
    } catch (err) {
      if (err instanceof PlanLockedError) {
        return res.status(409).json({ success: false, error: err.message, code: "PLAN_LOCKED" });
      }
      return next(err);
    }

    if (item === null || item === undefined) {
      return next(new NotFoundError("Treatment plan item not found"));
    }

    res.json({ success: true, data: { item } });
  },
);

// POST /patients/:id/treatment-plan/:planId/items/:itemId/complete — complete item
router.post(
  "/patients/:id/treatment-plan/:planId/items/:itemId/complete",
  authMiddleware,
  docRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    let result: Awaited<ReturnType<typeof repo.completeItem>> | undefined;
    try {
      result = await repo.completeItem(req.params["itemId"] as string, req.user!.clinicId, req.user!.userId, req.params["planId"] as string, req.params["id"] as string);
    } catch (err) {
      if (err instanceof ItemAlreadyCompletedError) {
        return res.status(409).json({ success: false, error: err.message, code: "ITEM_ALREADY_COMPLETED" });
      }
      return next(err);
    }

    if (result === null || result === undefined) {
      return next(new NotFoundError("Treatment plan item not found"));
    }

    res.json({ success: true, data: { item: result.item, procedureId: result.procedureId } });
  },
);

// ── Send active plan as PDF via WhatsApp ───────────────────────────────────

const PaymentSchema = z
  .object({
    months: z.union([z.literal(3), z.literal(6), z.literal(12)]).optional(),
  })
  .optional();

const SendPlanPdfSchema = z.object({
  payment: PaymentSchema,
});

// GET /patients/:id/treatment-plan/pdf — download active plan as PDF (for preview / debugging)
router.get(
  "/patients/:id/treatment-plan/pdf",
  authMiddleware,
  docRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    if (!(await checkPatient(req, res, next))) return;
    const patientId = req.params["id"] as string;
    const clinicId = req.user!.clinicId;

    const plan = await repo.getActivePlan(patientId, clinicId).catch(next);
    if (plan === undefined) return;
    if (!plan) return next(new NotFoundError("Активный план лечения не найден"));

    const ctx = await loadPlanPdfContext(patientId, clinicId, plan.doctorId).catch(next);
    if (!ctx) return next(new NotFoundError("Не удалось собрать данные плана"));

    try {
      const buffer = await generatePlanPdfBuffer({ ctx, plan, planNumber: plan.planNumber });
      const filename = encodeURIComponent(`plan-lecheniya-${plan.planNumber}.pdf`);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${filename}`);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Cache-Control", "no-store");
      return res.send(buffer);
    } catch (err) {
      logger.error({ err, patientId, clinicId }, "[treatment-plan] PDF generation failed");
      return next(err);
    }
  },
);

// POST /patients/:id/treatment-plan/send-whatsapp-pdf — generate PDF & send via WhatsApp
router.post(
  "/patients/:id/treatment-plan/send-whatsapp-pdf",
  authMiddleware,
  docRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = SendPlanPdfSchema.safeParse(req.body ?? {});
    if (!parsed.success) return next(new ValidationError(parsed.error.message));

    if (!(await checkPatient(req, res, next))) return;
    const patientId = req.params["id"] as string;
    const clinicId = req.user!.clinicId;

    const plan = await repo.getActivePlan(patientId, clinicId).catch(next);
    if (plan === undefined) return;
    if (!plan) return next(new NotFoundError("Активный план лечения не найден"));

    const ctx = await loadPlanPdfContext(patientId, clinicId, plan.doctorId).catch(next);
    if (!ctx) return next(new NotFoundError("Не удалось собрать данные плана"));

    if (!ctx.patientPhone?.trim()) {
      return next(new ValidationError("У пациента не указан телефон для WhatsApp"));
    }

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generatePlanPdfBuffer({
        ctx,
        plan,
        planNumber: plan.planNumber,
        payment: parsed.data.payment,
      });
    } catch (err) {
      logger.error({ err, patientId, clinicId }, "[treatment-plan] PDF generation failed");
      return next(err);
    }

    const fileName = `plan-lecheniya-${plan.planNumber}.pdf`;
    const caption = `План лечения №${plan.planNumber} — ${ctx.clinicName}`;

    let whatsappMessageId = "";
    try {
      whatsappMessageId = await sendFileToPatient(clinicId, ctx.patientPhone, {
        buffer: pdfBuffer,
        fileName,
        contentType: "application/pdf",
        caption,
      });
    } catch (err) {
      logger.error({ err, patientId, clinicId }, "[treatment-plan] sendFileToPatient failed");
      return res.status(502).json({
        success: false,
        code: "WHATSAPP_SEND_FAILED",
        error: err instanceof Error ? err.message : "Не удалось отправить WhatsApp",
      });
    }

    if (!whatsappMessageId) {
      return res.status(502).json({
        success: false,
        code: "WHATSAPP_NOT_CONFIGURED",
        error: "WhatsApp не подключён в клинике",
      });
    }

    const message = await messagesRepo
      .create({
        id: randomUUID(),
        clinicId,
        patientId,
        direction: "outbound",
        senderId: req.user!.userId,
        content: `📎 ${caption}\n${fileName}`,
        whatsappMessageId,
        isRedAlert: false,
      })
      .catch((err) => {
        logger.warn({ err }, "[treatment-plan] Failed to persist outbound message record");
        return null;
      });

    logger.info(
      { patientId, clinicId, planId: plan.id, whatsappMessageId, fileName },
      "[treatment-plan] Plan PDF sent via WhatsApp",
    );

    res.json({
      success: true,
      data: {
        planId: plan.id,
        fileName,
        whatsappMessageId,
        messageId: message?.id ?? null,
      },
    });
  },
);

export default router;
