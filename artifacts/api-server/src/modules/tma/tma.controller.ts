import { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  db,
  platformAdminsTable,
  clinicsTable,
  usersTable,
  patientsTable,
  proceduresTable,
  procedureTemplatesTable,
  actionLogsTable,
  chatbotSessionsTable,
  chatbotMessagesTable,
  chatbotSettingsTable,
  clinicChannelsTable,
  knowledgeSourcesTable,
  knowledgeScriptsTable,
  contractTemplatesTable,
  patientContractsTable,
  clinicExpensesTable,
  payrollRecordsTable,
  userSalarySettingsTable,
  notificationsTable,
  appointmentRemindersTable,
  postopFollowupsTable,
  adminBroadcastsTable,
  doctorCapacityTable,
  inventoryItemsTable,
  inventoryStockTable,
} from "@workspace/db";
import { eq, desc, count, sum, gte, lte, and, sql, not, ilike, or, isNotNull, type SQL } from "drizzle-orm";
import { requireTmaAdmin, invalidateAdminCache } from "./tma.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { seedProcedureTemplates } from "../../seeds/procedure-templates.seed";

const router = Router();
router.use(requireTmaAdmin);

// ── GET /api/tma/me ────────────────────────────────────────────────────────────
router.get("/me", (req: Request, res: Response) => {
  res.json({ success: true, data: { user: req.tmaUser } });
});

// ── ADMINS ────────────────────────────────────────────────────────────────────
router.get("/admins", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const admins = await db.select().from(platformAdminsTable).orderBy(desc(platformAdminsTable.createdAt));
    res.json({ success: true, data: { admins } });
  } catch (err) { next(err); }
});

router.post("/admins", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      telegramUserId: z.string().min(1),
      telegramUsername: z.string().optional(),
      name: z.string().min(1).max(100),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const admin = await db.insert(platformAdminsTable).values({
      id: randomUUID(),
      telegramUserId: parsed.data.telegramUserId,
      telegramUsername: parsed.data.telegramUsername ?? null,
      name: parsed.data.name,
      addedBy: req.tmaUser!.telegramUserId,
    }).returning();
    res.status(201).json({ success: true, data: { admin: admin[0] } });
  } catch (err) { next(err); }
});

router.delete("/admins/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db.delete(platformAdminsTable)
      .where(eq(platformAdminsTable.id, req.params["id"] as string))
      .returning({ telegramUserId: platformAdminsTable.telegramUserId });
    if (!deleted) return next(new NotFoundError("Admin not found"));
    invalidateAdminCache(deleted.telegramUserId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── DASHBOARD ────────────────────────────────────────────────────────────────
router.get("/dashboard", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [[clinicsCount], [usersCount], [patientsCount], [revenueRow], [sessionsCount],
      [todayMsgRow], [channelsCount], [activeBots]] = await Promise.all([
      db.select({ count: count() }).from(clinicsTable).where(eq(clinicsTable.isActive, true)),
      db.select({ count: count() }).from(usersTable),
      db.select({ count: count() }).from(patientsTable),
      db.select({ total: sum(proceduresTable.price) }).from(proceduresTable)
        .where(and(eq(proceduresTable.status, "completed"), gte(proceduresTable.completedAt, monthStart))),
      db.select({ count: count() }).from(chatbotSessionsTable),
      db.select({ count: count() }).from(chatbotMessagesTable)
        .where(gte(chatbotMessagesTable.createdAt, todayStart)),
      db.select({ count: count() }).from(clinicChannelsTable),
      db.select({ count: count() }).from(clinicsTable)
        .where(and(eq(clinicsTable.isActive, true), not(eq(clinicsTable.telegramBotToken, "")))),
    ]);

    const allClinics = await db
      .select({ id: clinicsTable.id, name: clinicsTable.name, plan: clinicsTable.plan, isActive: clinicsTable.isActive, createdAt: clinicsTable.createdAt })
      .from(clinicsTable)
      .orderBy(desc(clinicsTable.createdAt));

    const withActivity = await Promise.all(allClinics.map(async (c) => {
      const [[procRow], [sesRow]] = await Promise.all([
        db.select({ count: count() }).from(proceduresTable)
          .where(and(eq(proceduresTable.clinicId, c.id), gte(proceduresTable.createdAt, sevenDaysAgo))),
        db.select({ count: count() }).from(chatbotSessionsTable)
          .where(and(eq(chatbotSessionsTable.clinicId, c.id), gte(chatbotSessionsTable.updatedAt, sevenDaysAgo))),
      ]);
      return { ...c, activityScore: (procRow?.count ?? 0) + (sesRow?.count ?? 0) };
    }));

    const top5 = [...withActivity].sort((a, b) => b.activityScore - a.activityScore).slice(0, 5);
    const recentClinics = allClinics.slice(0, 5);

    res.json({
      success: true,
      data: {
        totalClinics: clinicsCount?.count ?? 0,
        totalUsers: usersCount?.count ?? 0,
        totalPatients: patientsCount?.count ?? 0,
        revenueThisMonth: Number(revenueRow?.total ?? 0),
        totalChatbotSessions: sessionsCount?.count ?? 0,
        todayMessages: todayMsgRow?.count ?? 0,
        totalChannels: channelsCount?.count ?? 0,
        activeBots: activeBots?.count ?? 0,
        top5ByActivity: top5,
        recentClinics,
      },
    });
  } catch (err) { next(err); }
});

// ── CLINICS ───────────────────────────────────────────────────────────────────
router.get("/clinics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const showInactive = req.query["showInactive"] === "1";
    const clinics = await db
      .select()
      .from(clinicsTable)
      .where(showInactive ? undefined : eq(clinicsTable.isActive, true))
      .orderBy(desc(clinicsTable.createdAt));

    const withCounts = await Promise.all(clinics.map(async (c) => {
      const [[uc], [pc]] = await Promise.all([
        db.select({ count: count() }).from(usersTable).where(eq(usersTable.clinicId, c.id)),
        db.select({ count: count() }).from(patientsTable).where(eq(patientsTable.clinicId, c.id)),
      ]);
      return { ...c, usersCount: uc?.count ?? 0, patientsCount: pc?.count ?? 0 };
    }));

    res.json({ success: true, data: { clinics: withCounts } });
  } catch (err) { next(err); }
});

router.post("/clinics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200),
      plan: z.enum(["free", "starter", "professional", "enterprise"]).default("free"),
      ownerEmail: z.string().email().optional(),
      ownerName: z.string().min(1).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const clinicId = randomUUID();
    const [clinic] = await db.insert(clinicsTable)
      .values({ id: clinicId, isActive: true, name: parsed.data.name, plan: parsed.data.plan })
      .returning();
    let ownerInitialPassword: string | undefined;
    if (parsed.data.ownerEmail) {
      const { randomBytes } = await import("node:crypto");
      ownerInitialPassword = randomBytes(8).toString("hex"); // 16-char hex, one-time
      const passwordHash = await bcrypt.hash(ownerInitialPassword, 10);
      await db.insert(usersTable).values({
        id: randomUUID(),
        clinicId,
        name: parsed.data.ownerName ?? parsed.data.ownerEmail,
        email: parsed.data.ownerEmail,
        role: "owner",
        passwordHash,
        isActive: true,
      } as never);
    }
    const seedResult = await seedProcedureTemplates(clinicId);
    console.log(`[createClinic] Seeded ${seedResult.inserted} procedure templates for clinic ${clinicId}`);
    res.status(201).json({ success: true, data: { clinic, ownerInitialPassword } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) return next(new ValidationError("Email уже используется"));
    next(err);
  }
});

router.get("/clinics/:clinicId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, req.params["clinicId"] as string)).limit(1);
    if (!clinic) return next(new NotFoundError("Clinic not found"));
    const [[uc], [pc]] = await Promise.all([
      db.select({ count: count() }).from(usersTable).where(eq(usersTable.clinicId, clinic.id)),
      db.select({ count: count() }).from(patientsTable).where(eq(patientsTable.clinicId, clinic.id)),
    ]);
    res.json({ success: true, data: { clinic: { ...clinic, usersCount: uc?.count ?? 0, patientsCount: pc?.count ?? 0 } } });
  } catch (err) { next(err); }
});

router.patch("/clinics/:clinicId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200).optional(),
      plan: z.enum(["free", "starter", "professional", "enterprise"]).optional(),
      isActive: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const [clinic] = await db.update(clinicsTable)
      .set(parsed.data)
      .where(eq(clinicsTable.id, req.params["clinicId"] as string))
      .returning();
    if (!clinic) return next(new NotFoundError("Clinic not found"));
    res.json({ success: true, data: { clinic } });
  } catch (err) { next(err); }
});

// Soft-delete: deactivate clinic instead of hard delete
router.delete("/clinics/:clinicId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const [clinic] = await db.update(clinicsTable)
      .set({ isActive: false })
      .where(eq(clinicsTable.id, clinicId))
      .returning({ id: clinicsTable.id });
    if (!clinic) return next(new NotFoundError("Clinic not found"));
    // Deactivate all users of this clinic so their emails are freed for re-registration
    await db.update(usersTable)
      .set({ isActive: false })
      .where(eq(usersTable.clinicId, clinicId));
    res.json({ success: true, data: { deactivated: true } });
  } catch (err) { next(err); }
});

// ── PLATFORM SETTINGS ────────────────────────────────────────────────────────
router.get("/settings", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [admins, [clinicsRow], [usersRow], [patientsRow]] = await Promise.all([
      db.select().from(platformAdminsTable).orderBy(platformAdminsTable.createdAt),
      db.select({ count: count() }).from(clinicsTable).where(eq(clinicsTable.isActive, true)),
      db.select({ count: count() }).from(usersTable),
      db.select({ count: count() }).from(patientsTable),
    ]);
    const botConfigured = !!process.env["PLATFORM_TG_BOT_TOKEN"];
    const webhookBase = process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : null;
    res.json({
      success: true,
      data: {
        admins,
        stats: { clinics: clinicsRow?.count ?? 0, users: usersRow?.count ?? 0, patients: patientsRow?.count ?? 0 },
        bot: {
          configured: botConfigured,
          webhookUrl: webhookBase ? `${webhookBase}/api/webhook/telegram/platform` : null,
          tmaUrl: webhookBase ? `${webhookBase}/tg-admin` : null,
        },
      },
    });
  } catch (err) { next(err); }
});

// ── CLINIC USERS ──────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/users", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await db.select({
      id: usersTable.id, name: usersTable.name, email: usersTable.email,
      role: usersTable.role, isActive: usersTable.isActive, phone: usersTable.phone,
      position: usersTable.position, specialty: usersTable.specialty, createdAt: usersTable.createdAt,
    })
      .from(usersTable)
      .where(eq(usersTable.clinicId, req.params["clinicId"] as string))
      .orderBy(usersTable.role, usersTable.name);
    // attach doctor capacity
    const withCapacity = await Promise.all(users.map(async (u) => {
      if (u.role !== "doctor") return { ...u, maxPatientsPerDay: null };
      const [cap] = await db.select({ max: doctorCapacityTable.maxPatientsPerDay }).from(doctorCapacityTable)
        .where(eq(doctorCapacityTable.doctorId, u.id)).limit(1);
      return { ...u, maxPatientsPerDay: cap?.max ?? 20 };
    }));
    res.json({ success: true, data: { users: withCapacity } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/users", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200),
      email: z.string().email(),
      role: z.enum(["owner","admin","doctor","accountant","warehouse"]).default("doctor"),
      specialty: z.string().optional(),
      phone: z.string().optional(),
      password: z.string().min(8),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    // simple hash — clinic managers set real password later
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const [user] = await db.insert(usersTable).values({
      id: randomUUID(),
      clinicId: req.params["clinicId"] as string,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      specialty: parsed.data.specialty,
      phone: parsed.data.phone,
      passwordHash,
      isActive: true,
    }).returning();
    res.status(201).json({ success: true, data: { user } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) return next(new ValidationError("Email уже используется"));
    next(err);
  }
});

router.patch("/clinics/:clinicId/users/:userId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      isActive: z.boolean().optional(),
      role: z.enum(["owner","admin","doctor","accountant","warehouse"]).optional(),
      name: z.string().min(1).optional(),
      specialty: z.string().optional(),
      phone: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError("Invalid fields"));
    const [user] = await db.update(usersTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(usersTable.id, req.params["userId"] as string), eq(usersTable.clinicId, req.params["clinicId"] as string)))
      .returning();
    if (!user) return next(new NotFoundError("User not found"));
    res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
});

router.patch("/clinics/:clinicId/users/:userId/capacity", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ maxPatientsPerDay: z.number().int().min(1).max(100) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError("maxPatientsPerDay (1–100) required"));
    const existing = await db.select({ doctorId: doctorCapacityTable.doctorId })
      .from(doctorCapacityTable).where(eq(doctorCapacityTable.doctorId, req.params["userId"] as string)).limit(1);
    if (existing.length) {
      await db.update(doctorCapacityTable).set({ maxPatientsPerDay: parsed.data.maxPatientsPerDay })
        .where(eq(doctorCapacityTable.doctorId, req.params["userId"] as string));
    } else {
      await db.insert(doctorCapacityTable).values({
        doctorId: req.params["userId"] as string, clinicId: req.params["clinicId"] as string, maxPatientsPerDay: parsed.data.maxPatientsPerDay,
      });
    }
    res.json({ success: true, data: { maxPatientsPerDay: parsed.data.maxPatientsPerDay } });
  } catch (err) { next(err); }
});

router.patch("/clinics/:clinicId/users/:userId/password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ password: z.string().min(6, "Пароль минимум 6 символов") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const [user] = await db.update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(usersTable.id, req.params["userId"] as string), eq(usersTable.clinicId, req.params["clinicId"] as string)))
      .returning({ id: usersTable.id, name: usersTable.name });
    if (!user) return next(new NotFoundError("User not found"));
    res.json({ success: true, data: { updated: true } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/users/:userId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [user] = await db.update(usersTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(usersTable.id, req.params["userId"] as string), eq(usersTable.clinicId, req.params["clinicId"] as string)))
      .returning({ id: usersTable.id });
    if (!user) return next(new NotFoundError("User not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── CLINIC PATIENTS ───────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/patients", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const limit = 50;
    const offset = (page - 1) * limit;
    const clinicId = req.params["clinicId"] as string;
    const search = req.query["search"] as string | undefined;
    const status = req.query["status"] as string | undefined;
    const source = req.query["source"] as string | undefined;

    const where = and(
      eq(patientsTable.clinicId, clinicId),
      status ? eq(patientsTable.status, status as never) : undefined,
      source ? eq(patientsTable.source, source) : undefined,
      search ? or(
        ilike(patientsTable.name, `%${search}%`),
        ilike(patientsTable.phone, `%${search}%`),
      ) : undefined,
    ) as SQL<unknown>;
    const patients = await db.select({
      id: patientsTable.id, name: patientsTable.name, phone: patientsTable.phone,
      status: patientsTable.status, source: patientsTable.source,
      gender: patientsTable.gender, createdAt: patientsTable.createdAt,
    })
      .from(patientsTable)
      .where(where)
      .orderBy(desc(patientsTable.createdAt))
      .limit(limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(patientsTable).where(where);
    res.json({ success: true, data: { patients, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

router.get("/clinics/:clinicId/patients/:patientId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [patient] = await db.select().from(patientsTable)
      .where(and(eq(patientsTable.id, req.params["patientId"] as string), eq(patientsTable.clinicId, req.params["clinicId"] as string)))
      .limit(1);
    if (!patient) return next(new NotFoundError("Patient not found"));
    const [[procRow]] = await Promise.all([
      db.select({ count: count() }).from(proceduresTable).where(eq(proceduresTable.patientId, req.params["patientId"] as string)),
    ]);
    res.json({ success: true, data: { patient: { ...patient, proceduresCount: procRow?.count ?? 0 } } });
  } catch (err) { next(err); }
});

router.patch("/clinics/:clinicId/patients/:patientId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      status: z.enum(["new_request","initial_consultation","diagnostics","treatment_assigned","treatment_in_progress","post_op_monitoring","completed"]).optional(),
      source: z.string().optional(),
      doctorId: z.string().optional(),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const [patient] = await db.update(patientsTable)
      .set(parsed.data)
      .where(and(eq(patientsTable.id, req.params["patientId"] as string), eq(patientsTable.clinicId, req.params["clinicId"] as string)))
      .returning();
    if (!patient) return next(new NotFoundError("Patient not found"));
    res.json({ success: true, data: { patient } });
  } catch (err) { next(err); }
});

// ── CLINIC CHATBOT ────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/chatbot", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const [[sessionsRow], [msgRow], activeSessions] = await Promise.all([
      db.select({ count: count() }).from(chatbotSessionsTable).where(eq(chatbotSessionsTable.clinicId, clinicId)),
      db.select({ count: count() }).from(chatbotMessagesTable).where(eq(chatbotMessagesTable.clinicId, clinicId)),
      db.select({
        id: chatbotSessionsTable.id, phone: chatbotSessionsTable.phone,
        state: chatbotSessionsTable.state, humanTakeover: chatbotSessionsTable.humanTakeover,
        updatedAt: chatbotSessionsTable.updatedAt,
      })
        .from(chatbotSessionsTable)
        .where(eq(chatbotSessionsTable.clinicId, clinicId))
        .orderBy(desc(chatbotSessionsTable.updatedAt)).limit(20),
    ]);
    res.json({ success: true, data: { totalSessions: sessionsRow?.count ?? 0, totalMessages: msgRow?.count ?? 0, recentSessions: activeSessions } });
  } catch (err) { next(err); }
});

// ── CHATBOT SETTINGS ─────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/chatbot/settings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const [settings] = await db.select().from(chatbotSettingsTable)
      .where(eq(chatbotSettingsTable.clinicId, clinicId)).limit(1);
    const [clinic] = await db.select({
      greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken,
      greenApiUrl: clinicsTable.greenApiUrl,
      telegramBotToken: clinicsTable.telegramBotToken,
      whatsappPhone: clinicsTable.whatsappPhone,
    }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1);
    res.json({ success: true, data: { settings: settings ?? null, connection: clinic ?? null } });
  } catch (err) { next(err); }
});

router.patch("/clinics/:clinicId/chatbot/settings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const schema = z.object({
      enabled: z.boolean().optional(),
      greetingTemplate: z.string().optional(),
      followup24hTemplate: z.string().optional(),
      followup72hTemplate: z.string().optional(),
      followup168hTemplate: z.string().optional(),
      greenApiInstanceId: z.string().optional(),
      greenApiToken: z.string().optional(),
      greenApiUrl: z.string().url().optional(),
      telegramBotToken: z.string().optional(),
      whatsappPhone: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));

    const { greenApiInstanceId, greenApiToken, greenApiUrl, telegramBotToken, whatsappPhone, ...botFields } = parsed.data;

    // Update clinic connection fields
    if (greenApiInstanceId !== undefined || greenApiToken !== undefined || greenApiUrl !== undefined || telegramBotToken !== undefined || whatsappPhone !== undefined) {
      const clinicUpd: Record<string, string | undefined> = {};
      if (greenApiInstanceId !== undefined) clinicUpd["greenApiInstanceId"] = greenApiInstanceId;
      if (greenApiToken !== undefined) clinicUpd["greenApiToken"] = greenApiToken;
      if (greenApiUrl !== undefined) clinicUpd["greenApiUrl"] = greenApiUrl;
      if (telegramBotToken !== undefined) clinicUpd["telegramBotToken"] = telegramBotToken;
      if (whatsappPhone !== undefined) clinicUpd["whatsappPhone"] = whatsappPhone;
      await db.update(clinicsTable).set(clinicUpd as never).where(eq(clinicsTable.id, clinicId));
    }

    // Upsert chatbot settings
    const existing = await db.select({ id: chatbotSettingsTable.id }).from(chatbotSettingsTable)
      .where(eq(chatbotSettingsTable.clinicId, clinicId)).limit(1);
    let settings;
    if (existing.length && Object.keys(botFields).length) {
      [settings] = await db.update(chatbotSettingsTable)
        .set({ ...botFields, updatedAt: new Date() })
        .where(eq(chatbotSettingsTable.clinicId, clinicId))
        .returning();
    } else if (!existing.length) {
      [settings] = await db.insert(chatbotSettingsTable).values({ id: randomUUID(), clinicId, ...botFields }).returning();
    } else {
      [settings] = await db.select().from(chatbotSettingsTable).where(eq(chatbotSettingsTable.clinicId, clinicId)).limit(1);
    }
    res.json({ success: true, data: { settings } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/chatbot/ping", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const [clinic] = await db.select({
      greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken,
      greenApiUrl: clinicsTable.greenApiUrl,
    }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1);

    if (!clinic?.greenApiInstanceId || !clinic.greenApiToken) {
      res.json({ success: true, data: { connected: false, reason: "WhatsApp not configured" } }); return;
    }

    try {
      const baseUrl = clinic.greenApiUrl || "https://api.green-api.com";
      const pingRes = await fetch(`${baseUrl}/waInstance${clinic.greenApiInstanceId}/getStateInstance/${clinic.greenApiToken}`, { signal: AbortSignal.timeout(5000) });
      const pingData = await pingRes.json() as Record<string, unknown>;
      const connected = (pingData["stateInstance"] as string) === "authorized";
      res.json({ success: true, data: { connected, stateInstance: pingData["stateInstance"] ?? "unknown" } });
    } catch {
      res.json({ success: true, data: { connected: false, reason: "ping failed" } });
    }
  } catch (err) { next(err); }
});

// ── CLINIC SESSIONS ───────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/sessions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const humanTakeover = req.query["humanTakeover"] === "true" ? true : req.query["humanTakeover"] === "false" ? false : undefined;
    const dateFrom = req.query["dateFrom"] as string | undefined;
    const dateTo = req.query["dateTo"] as string | undefined;
    const where = and(
      eq(chatbotSessionsTable.clinicId, clinicId),
      humanTakeover !== undefined ? eq(chatbotSessionsTable.humanTakeover, humanTakeover) : undefined,
      dateFrom ? gte(chatbotSessionsTable.updatedAt, new Date(dateFrom)) : undefined,
      dateTo ? lte(chatbotSessionsTable.updatedAt, new Date(dateTo)) : undefined,
    ) as SQL<unknown>;
    const sessions = await db.select({
      id: chatbotSessionsTable.id, phone: chatbotSessionsTable.phone,
      state: chatbotSessionsTable.state, humanTakeover: chatbotSessionsTable.humanTakeover,
      updatedAt: chatbotSessionsTable.updatedAt,
    })
      .from(chatbotSessionsTable)
      .where(where)
      .orderBy(desc(chatbotSessionsTable.updatedAt))
      .limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(chatbotSessionsTable).where(where);
    res.json({ success: true, data: { sessions, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/sessions/:sessionId/takeover", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicId, sessionId } = req.params as Record<string, string>;
    const schema = z.object({ humanTakeover: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError("humanTakeover (boolean) required"));
    const [updated] = await db.update(chatbotSessionsTable)
      .set({ humanTakeover: parsed.data.humanTakeover })
      .where(and(eq(chatbotSessionsTable.id, sessionId), eq(chatbotSessionsTable.clinicId, clinicId)))
      .returning();
    if (!updated) return next(new NotFoundError("Session not found"));
    res.json({ success: true, data: { session: updated } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/sessions/:sessionId/reset", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicId, sessionId } = req.params as Record<string, string>;
    const [updated] = await db.update(chatbotSessionsTable)
      .set({ state: "greeting", humanTakeover: false })
      .where(and(eq(chatbotSessionsTable.id, sessionId), eq(chatbotSessionsTable.clinicId, clinicId)))
      .returning();
    if (!updated) return next(new NotFoundError("Session not found"));
    res.json({ success: true, data: { session: updated } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/sessions/:sessionId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicId, sessionId } = req.params as Record<string, string>;
    const [deleted] = await db.delete(chatbotSessionsTable)
      .where(and(eq(chatbotSessionsTable.id, sessionId), eq(chatbotSessionsTable.clinicId, clinicId)))
      .returning({ id: chatbotSessionsTable.id });
    if (!deleted) return next(new NotFoundError("Session not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── CLINIC MESSAGES ───────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/messages", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const direction = req.query["direction"] as "inbound" | "outbound" | undefined;
    const search = req.query["search"] as string | undefined;
    const cursor = req.query["cursor"] as string | undefined;

    const where = and(
      eq(chatbotMessagesTable.clinicId, clinicId),
      direction ? eq(chatbotMessagesTable.direction, direction) : undefined,
      search ? or(
        ilike(chatbotMessagesTable.content, `%${search}%`),
        ilike(chatbotMessagesTable.phone, `%${search}%`),
      ) : undefined,
      cursor ? lte(chatbotMessagesTable.createdAt, new Date(cursor)) : undefined,
    ) as SQL<unknown>;
    const messages = await db.select({
      id: chatbotMessagesTable.id, phone: chatbotMessagesTable.phone,
      direction: chatbotMessagesTable.direction, content: chatbotMessagesTable.content,
      createdAt: chatbotMessagesTable.createdAt,
    })
      .from(chatbotMessagesTable)
      .where(where)
      .orderBy(desc(chatbotMessagesTable.createdAt))
      .limit(50).offset(cursor ? 0 : (page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(chatbotMessagesTable).where(where);
    const nextCursor = messages.length === 50 ? messages[messages.length - 1]?.createdAt?.toISOString() : null;
    res.json({ success: true, data: { messages, total: total?.count ?? 0, page, nextCursor } });
  } catch (err) { next(err); }
});

// ── CLINIC CHANNELS ───────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/channels", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const [channels, [clinic]] = await Promise.all([
      db.select().from(clinicChannelsTable)
        .where(eq(clinicChannelsTable.clinicId, clinicId))
        .orderBy(desc(clinicChannelsTable.createdAt)),
      db.select({
        greenApiInstanceId: clinicsTable.greenApiInstanceId,
        greenApiToken: clinicsTable.greenApiToken,
        greenApiUrl: clinicsTable.greenApiUrl,
        telegramBotToken: clinicsTable.telegramBotToken,
        whatsappPhone: clinicsTable.whatsappPhone,
      }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)),
    ]);
    // Build bot channels from clinic connection fields
    const botChannels: Array<{ type: string; idInstance?: string | null; apiToken?: string | null; apiUrl?: string | null; phone?: string | null; configured: boolean }> = [
      { type: "whatsapp", idInstance: clinic?.greenApiInstanceId, apiToken: clinic?.greenApiToken, apiUrl: clinic?.greenApiUrl, phone: clinic?.whatsappPhone, configured: !!clinic?.greenApiInstanceId && !!clinic.greenApiToken },
      { type: "telegram", apiToken: clinic?.telegramBotToken, configured: !!clinic?.telegramBotToken },
    ];
    res.json({ success: true, data: { botChannels, marketingChannels: channels } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/channels/ping", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const [clinic] = await db.select({
      greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken,
      greenApiUrl: clinicsTable.greenApiUrl,
    }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1);

    if (!clinic?.greenApiInstanceId || !clinic.greenApiToken) {
      res.json({ success: true, data: { connected: false, reason: "WhatsApp not configured" } }); return;
    }
    try {
      const baseUrl = clinic.greenApiUrl || "https://api.green-api.com";
      const pingRes = await fetch(`${baseUrl}/waInstance${clinic.greenApiInstanceId}/getStateInstance/${clinic.greenApiToken}`, { signal: AbortSignal.timeout(5000) });
      const pingData = await pingRes.json() as Record<string, unknown>;
      const connected = (pingData["stateInstance"] as string) === "authorized";
      res.json({ success: true, data: { connected, stateInstance: pingData["stateInstance"] ?? "unknown" } });
    } catch {
      res.json({ success: true, data: { connected: false, reason: "ping failed" } });
    }
  } catch (err) { next(err); }
});

// POST /clinics/:clinicId/channels — update WhatsApp tracker credentials on the clinic record
router.post("/clinics/:clinicId/channels", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      idInstance: z.string().min(1),
      apiToken: z.string().min(1),
      apiUrl: z.string().url().optional().or(z.literal("")),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "idInstance and apiToken are required"));
    const clinicId = req.params["clinicId"] as string;
    const [updated] = await db.update(clinicsTable).set({
      greenApiInstanceId: parsed.data.idInstance,
      greenApiToken: parsed.data.apiToken,
      greenApiUrl: parsed.data.apiUrl ?? null,
    }).where(eq(clinicsTable.id, clinicId)).returning({
      id: clinicsTable.id, greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken, greenApiUrl: clinicsTable.greenApiUrl,
    });
    if (!updated) return next(new NotFoundError("Clinic not found"));
    res.json({ success: true, data: { credentials: updated } });
  } catch (err) { next(err); }
});

// POST /clinics/:clinicId/channels/marketing — create a marketing/referral channel
router.post("/clinics/:clinicId/channels/marketing", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      type: z.enum(["instagram", "telegram", "2gis", "website", "whatsapp", "referral", "other"]).default("other"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const refCode = randomUUID().split("-")[0]!;
    const [channel] = await db.insert(clinicChannelsTable).values({
      id: randomUUID(), clinicId: req.params["clinicId"] as string, refCode, ...parsed.data,
    }).returning();
    res.status(201).json({ success: true, data: { channel } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/channels/:channelId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db.delete(clinicChannelsTable)
      .where(and(eq(clinicChannelsTable.id, req.params["channelId"] as string), eq(clinicChannelsTable.clinicId, req.params["clinicId"] as string)))
      .returning({ id: clinicChannelsTable.id });
    if (!deleted) return next(new NotFoundError("Channel not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get("/clinics/:clinicId/channels/:channelId/status", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { clinicId, channelId } = req.params as Record<string, string>;
    const [channel] = await db.select().from(clinicChannelsTable)
      .where(and(eq(clinicChannelsTable.id, channelId), eq(clinicChannelsTable.clinicId, clinicId)) as SQL<unknown>);
    if (!channel) { next(new NotFoundError("Channel not found")); return; }
    const [clinic] = await db.select({
      greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken,
    }).from(clinicsTable).where(eq(clinicsTable.id, clinicId));
    if (!clinic?.greenApiInstanceId || !clinic?.greenApiToken) {
      res.json({ success: true, data: { channel, connected: false, reason: "no_integration" } }); return;
    }
    try {
      const baseUrl = "https://api.green-api.com";
      const pingRes = await fetch(`${baseUrl}/waInstance${clinic.greenApiInstanceId}/getStateInstance/${clinic.greenApiToken}`, { signal: AbortSignal.timeout(5000) });
      const pingData = await pingRes.json() as Record<string, unknown>;
      const connected = (pingData["stateInstance"] as string) === "authorized";
      res.json({ success: true, data: { channel, connected, stateInstance: pingData["stateInstance"] ?? "unknown" } });
    } catch {
      res.json({ success: true, data: { channel, connected: false, reason: "ping failed" } });
    }
  } catch (err) { next(err); }
});

// ── PROCEDURE TEMPLATES ───────────────────────────────────────────────────────
router.get("/clinics/:clinicId/procedure-templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await db.select().from(procedureTemplatesTable)
      .where(eq(procedureTemplatesTable.clinicId, req.params["clinicId"] as string))
      .orderBy(procedureTemplatesTable.category, procedureTemplatesTable.name);
    res.json({ success: true, data: { templates } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/procedure-templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200),
      category: z.string().min(1).max(100),
      defaultPrice: z.number().nonnegative().optional(),
      description: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const [template] = await db.insert(procedureTemplatesTable).values({
      id: randomUUID(),
      clinicId: req.params["clinicId"] as string,
      name: parsed.data.name,
      category: parsed.data.category,
      defaultPrice: parsed.data.defaultPrice ?? 0,
      description: parsed.data.description ?? null,
    }).returning();
    res.status(201).json({ success: true, data: { template } });
  } catch (err) { next(err); }
});

router.patch("/clinics/:clinicId/procedure-templates/:templateId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200).optional(),
      category: z.string().min(1).max(100).optional(),
      defaultPrice: z.number().nonnegative().optional(),
      description: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const [template] = await db.update(procedureTemplatesTable)
      .set(parsed.data)
      .where(and(
        eq(procedureTemplatesTable.id, req.params["templateId"] as string),
        eq(procedureTemplatesTable.clinicId, req.params["clinicId"] as string),
      ) as SQL<unknown>)
      .returning();
    if (!template) return next(new NotFoundError("Template not found"));
    res.json({ success: true, data: { template } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/procedure-templates/:templateId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db.delete(procedureTemplatesTable)
      .where(and(
        eq(procedureTemplatesTable.id, req.params["templateId"] as string),
        eq(procedureTemplatesTable.clinicId, req.params["clinicId"] as string),
      ) as SQL<unknown>)
      .returning({ id: procedureTemplatesTable.id });
    if (!deleted) return next(new NotFoundError("Template not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/analytics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [[patientsRow], [revenueRow], [procRow]] = await Promise.all([
      db.select({ count: count() }).from(patientsTable).where(eq(patientsTable.clinicId, clinicId)),
      db.select({ total: sum(proceduresTable.price) }).from(proceduresTable)
        .where(and(eq(proceduresTable.clinicId, clinicId), eq(proceduresTable.status, "completed"), gte(proceduresTable.completedAt, monthStart))),
      db.select({ count: count() }).from(proceduresTable)
        .where(and(eq(proceduresTable.clinicId, clinicId), eq(proceduresTable.status, "completed"), gte(proceduresTable.completedAt, monthStart))),
    ]);

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const [rev] = await db.select({ total: sum(proceduresTable.price), cnt: count() })
        .from(proceduresTable)
        .where(and(eq(proceduresTable.clinicId, clinicId), eq(proceduresTable.status, "completed"), gte(proceduresTable.completedAt, d), lte(proceduresTable.completedAt, end)));
      months.push({ month: d.toLocaleDateString("ru", { month: "short", year: "2-digit" }), revenue: Number(rev?.total ?? 0), procedures: rev?.cnt ?? 0 });
    }

    res.json({ success: true, data: { totalPatients: patientsRow?.count ?? 0, revenueThisMonth: Number(revenueRow?.total ?? 0), proceduresThisMonth: procRow?.count ?? 0, revenueByMonth: months } });
  } catch (err) { next(err); }
});

// ── ANALYTICS — DOCTOR & CHANNEL BREAKDOWN ────────────────────────────────────
router.get("/clinics/:clinicId/analytics/doctors", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const doctors = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      specialty: usersTable.specialty,
      completedCount: count(proceduresTable.id),
    })
      .from(usersTable)
      .leftJoin(proceduresTable, and(
        eq(proceduresTable.doctorId, usersTable.id),
        eq(proceduresTable.status, "completed"),
        gte(proceduresTable.completedAt, monthStart),
      ) as SQL<unknown>)
      .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor")) as SQL<unknown>)
      .groupBy(usersTable.id, usersTable.name, usersTable.specialty)
      .orderBy(desc(count(proceduresTable.id)));
    res.json({ success: true, data: { doctors } });
  } catch (err) { next(err); }
});

router.get("/clinics/:clinicId/analytics/channels", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const channels = await db.select({
      id: clinicChannelsTable.id,
      name: clinicChannelsTable.name,
      type: clinicChannelsTable.type,
      patientsCount: count(patientsTable.id),
    })
      .from(clinicChannelsTable)
      .leftJoin(patientsTable, and(
        eq(patientsTable.clinicId, clinicId),
        eq(patientsTable.source, clinicChannelsTable.refCode),
      ) as SQL<unknown>)
      .where(eq(clinicChannelsTable.clinicId, clinicId))
      .groupBy(clinicChannelsTable.id, clinicChannelsTable.name, clinicChannelsTable.type)
      .orderBy(desc(count(patientsTable.id)));
    res.json({ success: true, data: { channels } });
  } catch (err) { next(err); }
});

// ── BROADCASTS ────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/broadcasts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const status = req.query["status"] as string | undefined;
    const limit = 25;
    const adminWhere = and(
      eq(adminBroadcastsTable.clinicId, clinicId),
      status ? eq(adminBroadcastsTable.status, status as never) : undefined,
    ) as SQL<unknown>;
    const [adminBroadcasts, reminders, followups, [abCount], [remCount], [followCount]] = await Promise.all([
      db.select({ id: adminBroadcastsTable.id, type: sql<string>`'admin_broadcast'`, title: adminBroadcastsTable.title, message: adminBroadcastsTable.message, status: adminBroadcastsTable.status, sentCount: adminBroadcastsTable.sentCount, failedCount: adminBroadcastsTable.failedCount, sendAt: adminBroadcastsTable.scheduledAt, createdAt: adminBroadcastsTable.createdAt })
        .from(adminBroadcastsTable).where(adminWhere).orderBy(desc(adminBroadcastsTable.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ id: appointmentRemindersTable.id, type: sql<string>`'appointment_reminder'`, status: appointmentRemindersTable.status, sendAt: appointmentRemindersTable.sendAt, createdAt: appointmentRemindersTable.createdAt })
        .from(appointmentRemindersTable).where(eq(appointmentRemindersTable.clinicId, clinicId)).orderBy(desc(appointmentRemindersTable.createdAt)).limit(limit),
      db.select({ id: postopFollowupsTable.id, type: sql<string>`'postop_followup'`, status: postopFollowupsTable.status, sendAt: postopFollowupsTable.sendAt, createdAt: postopFollowupsTable.createdAt })
        .from(postopFollowupsTable).where(eq(postopFollowupsTable.clinicId, clinicId)).orderBy(desc(postopFollowupsTable.createdAt)).limit(limit),
      db.select({ count: count() }).from(adminBroadcastsTable).where(adminWhere),
      db.select({ count: count() }).from(appointmentRemindersTable).where(eq(appointmentRemindersTable.clinicId, clinicId)),
      db.select({ count: count() }).from(postopFollowupsTable).where(eq(postopFollowupsTable.clinicId, clinicId)),
    ]);
    const broadcasts = [...adminBroadcasts, ...reminders, ...followups].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
    res.json({ success: true, data: { broadcasts, total: (abCount?.count ?? 0) + (remCount?.count ?? 0) + (followCount?.count ?? 0), page } });
  } catch (err) { next(err); }
});

// ── KNOWLEDGE ─────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/knowledge", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await db.select({
      id: knowledgeSourcesTable.id, name: knowledgeSourcesTable.name,
      type: knowledgeSourcesTable.type, status: knowledgeSourcesTable.status,
      createdAt: knowledgeSourcesTable.createdAt,
    }).from(knowledgeSourcesTable).where(eq(knowledgeSourcesTable.clinicId, req.params["clinicId"] as string)).orderBy(desc(knowledgeSourcesTable.createdAt));
    res.json({ success: true, data: { entries } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/knowledge", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200),
      type: z.enum(["text", "url", "file", "faq"]).default("text"),
      content: z.string().optional(),
      url: z.string().url().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const [source] = await db.insert(knowledgeSourcesTable).values({
      id: randomUUID(),
      clinicId: req.params["clinicId"] as string,
      name: parsed.data.name,
      type: parsed.data.type,
      status: "pending",
      extractedText: parsed.data.content ?? null,
      url: parsed.data.url ?? null,
    }).returning();
    res.status(201).json({ success: true, data: { source } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/knowledge/:sourceId/rescan", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [updated] = await db.update(knowledgeSourcesTable)
      .set({ status: "pending" })
      .where(and(eq(knowledgeSourcesTable.id, req.params["sourceId"] as string), eq(knowledgeSourcesTable.clinicId, req.params["clinicId"] as string)))
      .returning();
    if (!updated) return next(new NotFoundError("Knowledge source not found"));
    res.json({ success: true, data: { source: updated } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/knowledge/:sourceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db.delete(knowledgeSourcesTable)
      .where(and(eq(knowledgeSourcesTable.id, req.params["sourceId"] as string), eq(knowledgeSourcesTable.clinicId, req.params["clinicId"] as string)))
      .returning({ id: knowledgeSourcesTable.id });
    if (!deleted) return next(new NotFoundError("Knowledge source not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── BROADCASTS WRITE ─────────────────────────────────────────────────────────
router.post("/clinics/:clinicId/broadcasts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      title: z.string().min(1, "title required"),
      message: z.string().min(1, "message required"),
      scheduledAt: z.string().datetime().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const clinicId = req.params["clinicId"] as string;
    const admin = (req as Request & { tmaAdmin?: { id: string } }).tmaAdmin;
    const [broadcast] = await db.insert(adminBroadcastsTable).values({
      id: randomUUID(),
      clinicId,
      title: parsed.data.title,
      message: parsed.data.message,
      status: "scheduled",
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      createdBy: admin?.id ?? null,
    }).returning();
    res.status(201).json({ success: true, data: { broadcast } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/broadcasts/:broadcastId/stop", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicId, broadcastId } = req.params as Record<string, string>;
    // Try admin_broadcasts first, then legacy tables
    const [ab] = await db.update(adminBroadcastsTable)
      .set({ status: "cancelled" })
      .where(and(eq(adminBroadcastsTable.id, broadcastId), eq(adminBroadcastsTable.clinicId, clinicId)) as SQL<unknown>)
      .returning({ id: adminBroadcastsTable.id });
    if (ab) return res.json({ success: true, data: { stopped: true } });
    const [ar] = await db.update(appointmentRemindersTable)
      .set({ status: "cancelled" })
      .where(and(eq(appointmentRemindersTable.id, broadcastId), eq(appointmentRemindersTable.clinicId, clinicId)) as SQL<unknown>)
      .returning({ id: appointmentRemindersTable.id });
    if (ar) return res.json({ success: true, data: { stopped: true } });
    const [pf] = await db.update(postopFollowupsTable)
      .set({ status: "cancelled" })
      .where(and(eq(postopFollowupsTable.id, broadcastId), eq(postopFollowupsTable.clinicId, clinicId)) as SQL<unknown>)
      .returning({ id: postopFollowupsTable.id });
    if (!pf) return next(new NotFoundError("Broadcast not found"));
    res.json({ success: true, data: { stopped: true } });
  } catch (err) { next(err); }
});

router.get("/clinics/:clinicId/broadcasts/:broadcastId/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicId, broadcastId } = req.params as Record<string, string>;
    const [broadcast] = await db.select().from(adminBroadcastsTable)
      .where(and(eq(adminBroadcastsTable.id, broadcastId), eq(adminBroadcastsTable.clinicId, clinicId)) as SQL<unknown>);
    if (!broadcast) return next(new NotFoundError("Broadcast not found"));
    res.json({ success: true, data: { broadcast, stats: { sentCount: broadcast.sentCount, failedCount: broadcast.failedCount, status: broadcast.status } } });
  } catch (err) { next(err); }
});

// ── CONTRACTS ─────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/contracts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const limit = 50;
    const contracts = await db.select({
      id: patientContractsTable.id,
      patientName: patientsTable.name,
      patientPhone: patientsTable.phone,
      status: patientContractsTable.status,
      signedAt: patientContractsTable.signedAt,
      createdAt: patientContractsTable.createdAt,
    })
      .from(patientContractsTable)
      .innerJoin(patientsTable, eq(patientContractsTable.patientId, patientsTable.id))
      .where(eq(patientContractsTable.clinicId, clinicId))
      .orderBy(desc(patientContractsTable.createdAt))
      .limit(limit).offset((page - 1) * limit);
    const [total] = await db.select({ count: count() }).from(patientContractsTable).where(eq(patientContractsTable.clinicId, clinicId));
    const [templateCount] = await db.select({ count: count() }).from(contractTemplatesTable).where(eq(contractTemplatesTable.clinicId, clinicId));
    res.json({ success: true, data: { contracts, total: total?.count ?? 0, templateCount: templateCount?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── CONTRACT TEMPLATES WRITE ──────────────────────────────────────────────────
router.post("/clinics/:clinicId/contracts/templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200),
      content: z.string().optional(),
      fileType: z.string().optional(),
      fileUrl: z.string().url().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const [template] = await db.insert(contractTemplatesTable).values({
      id: randomUUID(),
      clinicId: req.params["clinicId"] as string,
      name: parsed.data.name,
      fileType: parsed.data.fileType ?? "text",
      fileUrl: parsed.data.fileUrl ?? "",
    } as never).returning();
    res.status(201).json({ success: true, data: { template } });
  } catch (err) { next(err); }
});

router.get("/clinics/:clinicId/contracts/templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await db.select().from(contractTemplatesTable)
      .where(eq(contractTemplatesTable.clinicId, req.params["clinicId"] as string))
      .orderBy(desc(contractTemplatesTable.createdAt));
    res.json({ success: true, data: { templates } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/contracts/templates/:templateId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db.delete(contractTemplatesTable)
      .where(and(
        eq(contractTemplatesTable.id, req.params["templateId"] as string),
        eq(contractTemplatesTable.clinicId, req.params["clinicId"] as string),
      ) as SQL<unknown>)
      .returning({ id: contractTemplatesTable.id });
    if (!deleted) return next(new NotFoundError("Template not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── FINANCES ──────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/finances", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [[revenueRow], [expensesRow], [payrollRow]] = await Promise.all([
      db.select({ total: sum(proceduresTable.price) }).from(proceduresTable)
        .where(and(eq(proceduresTable.clinicId, clinicId), eq(proceduresTable.status, "completed"), gte(proceduresTable.completedAt, monthStart))),
      db.select({ total: sum(clinicExpensesTable.amount) }).from(clinicExpensesTable)
        .where(and(eq(clinicExpensesTable.clinicId, clinicId), gte(clinicExpensesTable.expenseDate, monthStart))),
      db.select({ total: sum(payrollRecordsTable.calculatedAmount) }).from(payrollRecordsTable)
        .where(and(
          eq(payrollRecordsTable.clinicId, clinicId),
          eq(payrollRecordsTable.periodYear, now.getFullYear()),
          eq(payrollRecordsTable.periodMonth, now.getMonth() + 1),
        )),
    ]);

    const revenue = Number(revenueRow?.total ?? 0);
    const expenses = Number(expensesRow?.total ?? 0);
    const payroll = Number(payrollRow?.total ?? 0);

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const [[r], [e]] = await Promise.all([
        db.select({ total: sum(proceduresTable.price) }).from(proceduresTable)
          .where(and(eq(proceduresTable.clinicId, clinicId), eq(proceduresTable.status, "completed"), gte(proceduresTable.completedAt, d), lte(proceduresTable.completedAt, end))),
        db.select({ total: sum(clinicExpensesTable.amount) }).from(clinicExpensesTable)
          .where(and(eq(clinicExpensesTable.clinicId, clinicId), gte(clinicExpensesTable.expenseDate, d), lte(clinicExpensesTable.expenseDate, end))),
      ]);
      months.push({ month: d.toLocaleDateString("ru", { month: "short", year: "2-digit" }), revenue: Number(r?.total ?? 0), expenses: Number(e?.total ?? 0) });
    }
    res.json({ success: true, data: { revenue, expenses, payroll, profit: revenue - expenses - payroll, months } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/expenses", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      amount: z.number().positive(),
      category: z.string().min(1).default("other"),
      description: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const [expense] = await db.insert(clinicExpensesTable).values({
      id: randomUUID(),
      clinicId: req.params["clinicId"] as string,
      amount: String(parsed.data.amount),
      category: parsed.data.category as never,
      description: parsed.data.description,
      expenseDate: new Date(),
    }).returning();
    res.status(201).json({ success: true, data: { expense } });
  } catch (err) { next(err); }
});

router.get("/clinics/:clinicId/expenses", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const expenses = await db.select({
      id: clinicExpensesTable.id, amount: clinicExpensesTable.amount,
      category: clinicExpensesTable.category, description: clinicExpensesTable.description,
      expenseDate: clinicExpensesTable.expenseDate, createdAt: clinicExpensesTable.createdAt,
    }).from(clinicExpensesTable)
      .where(eq(clinicExpensesTable.clinicId, clinicId))
      .orderBy(desc(clinicExpensesTable.expenseDate))
      .limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(clinicExpensesTable).where(eq(clinicExpensesTable.clinicId, clinicId));
    res.json({ success: true, data: { expenses, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/notifications", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const notifications = await db.select({
      id: notificationsTable.id, type: notificationsTable.type,
      message: notificationsTable.message, read: notificationsTable.read,
      createdAt: notificationsTable.createdAt,
    }).from(notificationsTable).where(eq(notificationsTable.clinicId, clinicId))
      .orderBy(desc(notificationsTable.createdAt)).limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(notificationsTable).where(eq(notificationsTable.clinicId, clinicId));
    res.json({ success: true, data: { notifications, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

router.patch("/clinics/:clinicId/notifications/:notifId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ read: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError("read (boolean) required"));
    const [updated] = await db.update(notificationsTable)
      .set({ read: parsed.data.read })
      .where(and(eq(notificationsTable.id, req.params["notifId"] as string), eq(notificationsTable.clinicId, req.params["clinicId"] as string)))
      .returning();
    if (!updated) return next(new NotFoundError("Notification not found"));
    res.json({ success: true, data: { notification: updated } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/notifications/mark-all-read", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.clinicId, req.params["clinicId"] as string), eq(notificationsTable.read, false)) as SQL<unknown>);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── FILES ─────────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/files", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const [contractFiles, knowledgeFiles] = await Promise.all([
      db.select({ id: contractTemplatesTable.id, name: contractTemplatesTable.name, type: contractTemplatesTable.fileType, source: sql<string>`'contract_template'`, url: contractTemplatesTable.fileUrl, createdAt: contractTemplatesTable.createdAt })
        .from(contractTemplatesTable).where(eq(contractTemplatesTable.clinicId, clinicId)).orderBy(desc(contractTemplatesTable.createdAt)),
      db.select({ id: knowledgeSourcesTable.id, name: knowledgeSourcesTable.name, type: knowledgeSourcesTable.type, source: sql<string>`'knowledge_source'`, url: sql<string>`''`, createdAt: knowledgeSourcesTable.createdAt })
        .from(knowledgeSourcesTable).where(eq(knowledgeSourcesTable.clinicId, clinicId)).orderBy(desc(knowledgeSourcesTable.createdAt)),
    ]);
    const files = [...contractFiles, ...knowledgeFiles].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ success: true, data: { files, total: files.length } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/files/:fileId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicId, fileId } = req.params as Record<string, string>;
    const [kt] = await db.delete(contractTemplatesTable)
      .where(and(eq(contractTemplatesTable.id, fileId), eq(contractTemplatesTable.clinicId, clinicId)) as SQL<unknown>)
      .returning({ id: contractTemplatesTable.id });
    if (kt) return res.json({ success: true });
    const [ks] = await db.delete(knowledgeSourcesTable)
      .where(and(eq(knowledgeSourcesTable.id, fileId), eq(knowledgeSourcesTable.clinicId, clinicId)) as SQL<unknown>)
      .returning({ id: knowledgeSourcesTable.id });
    if (!ks) return next(new NotFoundError("File not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── CLINIC LOGS ───────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/logs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const action = req.query["action"] as string | undefined;
    const userId = req.query["userId"] as string | undefined;
    const dateFrom = req.query["dateFrom"] as string | undefined;
    const dateTo = req.query["dateTo"] as string | undefined;
    const search = req.query["search"] as string | undefined;
    const where = and(
      eq(actionLogsTable.clinicId, clinicId),
      action ? eq(actionLogsTable.actionType, action) : undefined,
      userId ? eq(actionLogsTable.userId, userId) : undefined,
      dateFrom ? gte(actionLogsTable.createdAt, new Date(dateFrom)) : undefined,
      dateTo ? lte(actionLogsTable.createdAt, new Date(dateTo)) : undefined,
      search ? or(ilike(actionLogsTable.details, `%${search}%`), ilike(actionLogsTable.entityId, `%${search}%`), ilike(actionLogsTable.actionType, `%${search}%`)) : undefined,
    ) as SQL<unknown>;
    const logs = await db.select({
      id: actionLogsTable.id, userId: actionLogsTable.userId,
      actionType: actionLogsTable.actionType, entityType: actionLogsTable.entityType,
      entityId: actionLogsTable.entityId, details: actionLogsTable.details,
      createdAt: actionLogsTable.createdAt,
    }).from(actionLogsTable).where(where)
      .orderBy(desc(actionLogsTable.createdAt)).limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(actionLogsTable).where(where);
    res.json({ success: true, data: { logs, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── INVENTORY ─────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/inventory", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const category = req.query["category"] as string | undefined;
    const where = and(
      eq(inventoryItemsTable.clinicId, clinicId),
      category ? eq(inventoryItemsTable.category, category as never) : undefined,
    ) as SQL<unknown>;
    const items = await db.select({
      id: inventoryItemsTable.id, name: inventoryItemsTable.name,
      category: inventoryItemsTable.category, unit: inventoryItemsTable.unit,
      unitPrice: inventoryItemsTable.unitPrice, isActive: inventoryItemsTable.isActive,
      quantity: inventoryStockTable.quantity, minQuantity: inventoryStockTable.minQuantity,
    })
      .from(inventoryItemsTable)
      .leftJoin(inventoryStockTable, eq(inventoryStockTable.itemId, inventoryItemsTable.id))
      .where(where)
      .orderBy(inventoryItemsTable.category, inventoryItemsTable.name);
    const [total] = await db.select({ count: count() }).from(inventoryItemsTable).where(where);
    res.json({ success: true, data: { items, total: total?.count ?? 0 } });
  } catch (err) { next(err); }
});

router.get("/clinics/:clinicId/inventory/consumption", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // Low stock items
    const lowStock = await db.select({
      id: inventoryItemsTable.id, name: inventoryItemsTable.name,
      category: inventoryItemsTable.category, unit: inventoryItemsTable.unit,
      quantity: inventoryStockTable.quantity, minQuantity: inventoryStockTable.minQuantity,
    })
      .from(inventoryItemsTable)
      .innerJoin(inventoryStockTable, eq(inventoryStockTable.itemId, inventoryItemsTable.id))
      .where(and(
        eq(inventoryItemsTable.clinicId, clinicId),
        sql`${inventoryStockTable.quantity} <= ${inventoryStockTable.minQuantity}`,
      ) as SQL<unknown>);
    // Item counts and value
    const [[itemCount], [stockValue]] = await Promise.all([
      db.select({ count: count() }).from(inventoryItemsTable).where(eq(inventoryItemsTable.clinicId, clinicId)),
      db.select({ total: sum(sql<number>`${inventoryStockTable.quantity} * ${inventoryItemsTable.unitPrice}`) })
        .from(inventoryItemsTable)
        .innerJoin(inventoryStockTable, eq(inventoryStockTable.itemId, inventoryItemsTable.id))
        .where(eq(inventoryItemsTable.clinicId, clinicId)),
    ]);
    res.json({ success: true, data: {
      lowStockItems: lowStock,
      lowStockCount: lowStock.length,
      totalItems: itemCount?.count ?? 0,
      stockValueThisMonth: Number(stockValue?.total ?? 0),
      periodStart: monthStart.toISOString(),
    } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/inventory/items", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200),
      category: z.enum(["materials", "instruments", "medications", "consumables", "prosthetics", "implants", "other"]).default("other"),
      unit: z.string().min(1).max(50).default("шт"),
      unitPrice: z.number().nonnegative().default(0),
      minQuantity: z.number().nonnegative().default(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const clinicId = req.params["clinicId"] as string;
    const itemId = randomUUID();
    const [item] = await db.insert(inventoryItemsTable).values({
      id: itemId,
      clinicId,
      name: parsed.data.name,
      category: parsed.data.category as never,
      unit: parsed.data.unit,
      unitPrice: parsed.data.unitPrice,
    }).returning();
    await db.insert(inventoryStockTable).values({
      id: randomUUID(),
      clinicId,
      itemId,
      quantity: 0,
      minQuantity: parsed.data.minQuantity,
    });
    res.status(201).json({ success: true, data: { item } });
  } catch (err) { next(err); }
});

router.patch("/clinics/:clinicId/inventory/stock/:itemId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      quantity: z.number().nonnegative().optional(),
      minQuantity: z.number().nonnegative().optional(),
      delta: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const { clinicId, itemId } = req.params as Record<string, string>;
    const [existing] = await db.select().from(inventoryStockTable)
      .where(and(eq(inventoryStockTable.itemId, itemId), eq(inventoryStockTable.clinicId, clinicId)) as SQL<unknown>);
    if (!existing) return next(new NotFoundError("Stock record not found"));
    const newQty = parsed.data.delta !== undefined
      ? Math.max(0, Number(existing.quantity) + parsed.data.delta)
      : (parsed.data.quantity ?? Number(existing.quantity));
    const [updated] = await db.update(inventoryStockTable)
      .set({
        quantity: newQty,
        ...(parsed.data.minQuantity !== undefined ? { minQuantity: parsed.data.minQuantity } : {}),
      })
      .where(and(eq(inventoryStockTable.itemId, itemId), eq(inventoryStockTable.clinicId, clinicId)) as SQL<unknown>)
      .returning();
    res.json({ success: true, data: { stock: updated } });
  } catch (err) { next(err); }
});

// ── PAYROLL ───────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/payroll", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const now = new Date();
    const year = parseInt(String(req.query["year"] ?? now.getFullYear()), 10);
    const month = parseInt(String(req.query["month"] ?? (now.getMonth() + 1)), 10);
    const records = await db.select({
      id: payrollRecordsTable.id, userId: payrollRecordsTable.userId,
      userName: usersTable.name, userRole: usersTable.role,
      periodMonth: payrollRecordsTable.periodMonth, periodYear: payrollRecordsTable.periodYear,
      salaryType: payrollRecordsTable.salaryType, fixedAmount: payrollRecordsTable.fixedAmount,
      commissionPercent: payrollRecordsTable.commissionPercent, revenueBase: payrollRecordsTable.revenueBase,
      calculatedAmount: payrollRecordsTable.calculatedAmount, approvedAmount: payrollRecordsTable.approvedAmount,
      status: payrollRecordsTable.status, notes: payrollRecordsTable.notes,
    })
      .from(payrollRecordsTable)
      .innerJoin(usersTable, eq(usersTable.id, payrollRecordsTable.userId))
      .where(and(
        eq(payrollRecordsTable.clinicId, clinicId),
        eq(payrollRecordsTable.periodYear, year),
        eq(payrollRecordsTable.periodMonth, month),
      ) as SQL<unknown>)
      .orderBy(usersTable.name);
    const [totalRow] = await db.select({ total: sum(payrollRecordsTable.calculatedAmount) })
      .from(payrollRecordsTable)
      .where(and(eq(payrollRecordsTable.clinicId, clinicId), eq(payrollRecordsTable.periodYear, year), eq(payrollRecordsTable.periodMonth, month)) as SQL<unknown>);
    // Salary settings per user
    const settings = await db.select().from(userSalarySettingsTable).where(eq(userSalarySettingsTable.clinicId, clinicId));
    res.json({ success: true, data: { records, totalCalculated: Number(totalRow?.total ?? 0), period: { year, month }, settings } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/payroll/calculate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      year: z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "year + month required"));
    const clinicId = req.params["clinicId"] as string;
    const { year, month } = parsed.data;
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
    // Get doctors with salary settings
    const doctors = await db.select({
      userId: usersTable.id, name: usersTable.name,
      salaryType: userSalarySettingsTable.salaryType,
      fixedAmount: userSalarySettingsTable.fixedAmount,
      commissionPercent: userSalarySettingsTable.commissionPercent,
    })
      .from(usersTable)
      .innerJoin(userSalarySettingsTable, eq(userSalarySettingsTable.userId, usersTable.id))
      .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor")) as SQL<unknown>);
    const records = [];
    for (const doc of doctors) {
      // Revenue from completed procedures in this period
      const [rev] = await db.select({ total: sum(proceduresTable.price) })
        .from(proceduresTable)
        .where(and(
          eq(proceduresTable.clinicId, clinicId),
          eq(proceduresTable.doctorId, doc.userId),
          eq(proceduresTable.status, "completed"),
          gte(proceduresTable.completedAt, periodStart),
          lte(proceduresTable.completedAt, periodEnd),
        ) as SQL<unknown>);
      const revenueBase = Number(rev?.total ?? 0);
      const fixed = Number(doc.fixedAmount ?? 0);
      const commission = (Number(doc.commissionPercent ?? 0) / 100) * revenueBase;
      const calculated = doc.salaryType === "fixed" ? fixed
        : doc.salaryType === "commission" ? commission
        : doc.salaryType === "fixed_plus_commission" ? fixed + commission
        : fixed; // hourly treated as fixed for now
      // Upsert payroll record
      await db.insert(payrollRecordsTable).values({
        id: randomUUID(), clinicId, userId: doc.userId,
        periodYear: year, periodMonth: month,
        salaryType: doc.salaryType ?? "fixed",
        fixedAmount: String(fixed), commissionPercent: String(Number(doc.commissionPercent ?? 0)),
        revenueBase: String(revenueBase), calculatedAmount: String(calculated),
        status: "pending",
      } as never).onConflictDoNothing();
      records.push({ userId: doc.userId, name: doc.name, calculated });
    }
    res.json({ success: true, data: { calculated: records.length, records } });
  } catch (err) { next(err); }
});

router.patch("/clinics/:clinicId/payroll/:recordId/confirm", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      approvedAmount: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError("Invalid fields"));
    const { clinicId, recordId } = req.params as Record<string, string>;
    const [updated] = await db.update(payrollRecordsTable)
      .set({
        status: "approved",
        approvedAmount: parsed.data.approvedAmount !== undefined ? String(parsed.data.approvedAmount) : undefined,
        notes: parsed.data.notes,
        approvedAt: new Date(),
      } as never)
      .where(and(eq(payrollRecordsTable.id, recordId), eq(payrollRecordsTable.clinicId, clinicId)) as SQL<unknown>)
      .returning();
    if (!updated) return next(new NotFoundError("Payroll record not found"));
    res.json({ success: true, data: { record: updated } });
  } catch (err) { next(err); }
});

// ── KNOWLEDGE SOURCES + SCRIPTS ───────────────────────────────────────────────
router.get("/clinics/:clinicId/knowledge/sources", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await db.select({
      id: knowledgeSourcesTable.id, name: knowledgeSourcesTable.name,
      type: knowledgeSourcesTable.type, status: knowledgeSourcesTable.status,
      url: knowledgeSourcesTable.url, createdAt: knowledgeSourcesTable.createdAt,
    }).from(knowledgeSourcesTable)
      .where(eq(knowledgeSourcesTable.clinicId, req.params["clinicId"] as string))
      .orderBy(desc(knowledgeSourcesTable.createdAt));
    res.json({ success: true, data: { entries } });
  } catch (err) { next(err); }
});

router.get("/clinics/:clinicId/knowledge/scripts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [scripts] = await db.select().from(knowledgeScriptsTable)
      .where(eq(knowledgeScriptsTable.clinicId, req.params["clinicId"] as string)).limit(1);
    res.json({ success: true, data: { scripts: scripts ?? null } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/knowledge/sources", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200),
      type: z.enum(["text", "url", "file", "faq"]).default("text"),
      content: z.string().optional(),
      url: z.string().url().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const [source] = await db.insert(knowledgeSourcesTable).values({
      id: randomUUID(),
      clinicId: req.params["clinicId"] as string,
      name: parsed.data.name,
      type: parsed.data.type,
      status: "pending",
      extractedText: parsed.data.content ?? null,
      url: parsed.data.url ?? null,
    }).returning();
    res.status(201).json({ success: true, data: { source } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/knowledge/sources/:sourceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db.delete(knowledgeSourcesTable)
      .where(and(eq(knowledgeSourcesTable.id, req.params["sourceId"] as string), eq(knowledgeSourcesTable.clinicId, req.params["clinicId"] as string)) as SQL<unknown>)
      .returning({ id: knowledgeSourcesTable.id });
    if (!deleted) return next(new NotFoundError("Knowledge source not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── CONTRACTS — SIGNED ────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/contracts/signed", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"] as string;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const signed = await db.select({
      id: patientContractsTable.id, patientId: patientContractsTable.patientId,
      templateId: patientContractsTable.templateId, patientName: patientsTable.name,
      patientPhone: patientsTable.phone, templateName: contractTemplatesTable.name,
      signedAt: patientContractsTable.signedAt, status: patientContractsTable.status,
      bundleToken: patientContractsTable.bundleToken, createdAt: patientContractsTable.createdAt,
    })
      .from(patientContractsTable)
      .innerJoin(patientsTable, eq(patientContractsTable.patientId, patientsTable.id))
      .innerJoin(contractTemplatesTable, eq(patientContractsTable.templateId, contractTemplatesTable.id))
      .where(and(
        eq(patientContractsTable.clinicId, clinicId),
        eq(patientContractsTable.status, "signed"),
      ) as SQL<unknown>)
      .orderBy(desc(patientContractsTable.signedAt))
      .limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(patientContractsTable)
      .where(and(eq(patientContractsTable.clinicId, clinicId), eq(patientContractsTable.status, "signed")) as SQL<unknown>);
    res.json({ success: true, data: { contracts: signed, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── PLATFORM-WIDE LOGS (with full filtering) ──────────────────────────────────
router.get("/logs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const clinicId = req.query["clinicId"] as string | undefined;
    const action = req.query["action"] as string | undefined;
    const userId = req.query["userId"] as string | undefined;
    const dateFrom = req.query["dateFrom"] as string | undefined;
    const dateTo = req.query["dateTo"] as string | undefined;
    const search = req.query["search"] as string | undefined;
    const where = and(
      clinicId ? eq(actionLogsTable.clinicId, clinicId) : undefined,
      action ? eq(actionLogsTable.actionType, action) : undefined,
      userId ? eq(actionLogsTable.userId, userId) : undefined,
      dateFrom ? gte(actionLogsTable.createdAt, new Date(dateFrom)) : undefined,
      dateTo ? lte(actionLogsTable.createdAt, new Date(dateTo)) : undefined,
      search ? or(ilike(actionLogsTable.details, `%${search}%`), ilike(actionLogsTable.entityId, `%${search}%`), ilike(actionLogsTable.actionType, `%${search}%`)) : undefined,
    ) as SQL<unknown>;
    const logs = await db.select({
      id: actionLogsTable.id, clinicId: actionLogsTable.clinicId, userId: actionLogsTable.userId,
      actionType: actionLogsTable.actionType, entityType: actionLogsTable.entityType,
      entityId: actionLogsTable.entityId, details: actionLogsTable.details,
      createdAt: actionLogsTable.createdAt,
    }).from(actionLogsTable).where(where).orderBy(desc(actionLogsTable.createdAt)).limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(actionLogsTable).where(where);
    res.json({ success: true, data: { logs, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── PLATFORM-WIDE SESSIONS (with clinic-picker + global control) ──────────────
router.get("/sessions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const clinicId = req.query["clinicId"] as string | undefined;
    const humanTakeover = req.query["humanTakeover"] === "true" ? true : req.query["humanTakeover"] === "false" ? false : undefined;
    const dateFrom = req.query["dateFrom"] as string | undefined;
    const dateTo = req.query["dateTo"] as string | undefined;
    const where = and(
      clinicId ? eq(chatbotSessionsTable.clinicId, clinicId) : undefined,
      humanTakeover !== undefined ? eq(chatbotSessionsTable.humanTakeover, humanTakeover) : undefined,
      dateFrom ? gte(chatbotSessionsTable.updatedAt, new Date(dateFrom)) : undefined,
      dateTo ? lte(chatbotSessionsTable.updatedAt, new Date(dateTo)) : undefined,
    ) as SQL<unknown>;
    const sessions = await db.select({
      id: chatbotSessionsTable.id, clinicId: chatbotSessionsTable.clinicId,
      phone: chatbotSessionsTable.phone, state: chatbotSessionsTable.state,
      humanTakeover: chatbotSessionsTable.humanTakeover, updatedAt: chatbotSessionsTable.updatedAt,
    }).from(chatbotSessionsTable).where(where).orderBy(desc(chatbotSessionsTable.updatedAt)).limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(chatbotSessionsTable).where(where);
    res.json({ success: true, data: { sessions, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

router.post("/sessions/:sessionId/takeover", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ humanTakeover: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError("humanTakeover (boolean) required"));
    const [updated] = await db.update(chatbotSessionsTable)
      .set({ humanTakeover: parsed.data.humanTakeover })
      .where(eq(chatbotSessionsTable.id, req.params["sessionId"] as string))
      .returning();
    if (!updated) return next(new NotFoundError("Session not found"));
    res.json({ success: true, data: { session: updated } });
  } catch (err) { next(err); }
});

router.delete("/sessions/:sessionId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db.delete(chatbotSessionsTable)
      .where(eq(chatbotSessionsTable.id, req.params["sessionId"] as string))
      .returning({ id: chatbotSessionsTable.id });
    if (!deleted) return next(new NotFoundError("Session not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post("/sessions/reset-all", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.query["clinicId"] as string | undefined;
    const where = clinicId ? eq(chatbotSessionsTable.clinicId, clinicId) : undefined;
    await db.update(chatbotSessionsTable).set({ humanTakeover: false }).where(where);
    res.json({ success: true, data: { message: "All sessions reset" } });
  } catch (err) { next(err); }
});

// ── PLATFORM-WIDE MESSAGES (with date-range + cursor) ─────────────────────────
router.get("/messages", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const clinicId = req.query["clinicId"] as string | undefined;
    const direction = req.query["direction"] as string | undefined;
    const search = req.query["search"] as string | undefined;
    const cursor = req.query["cursor"] as string | undefined;
    const dateFrom = req.query["dateFrom"] as string | undefined;
    const dateTo = req.query["dateTo"] as string | undefined;
    const where = and(
      clinicId ? eq(chatbotMessagesTable.clinicId, clinicId) : undefined,
      direction ? eq(chatbotMessagesTable.direction, direction as never) : undefined,
      search ? or(ilike(chatbotMessagesTable.content, `%${search}%`), ilike(chatbotMessagesTable.phone, `%${search}%`)) : undefined,
      cursor ? lte(chatbotMessagesTable.createdAt, new Date(cursor)) : undefined,
      dateFrom ? gte(chatbotMessagesTable.createdAt, new Date(dateFrom)) : undefined,
      dateTo ? lte(chatbotMessagesTable.createdAt, new Date(dateTo)) : undefined,
    ) as SQL<unknown>;
    const messages = await db.select({
      id: chatbotMessagesTable.id, clinicId: chatbotMessagesTable.clinicId,
      phone: chatbotMessagesTable.phone, direction: chatbotMessagesTable.direction,
      content: chatbotMessagesTable.content, createdAt: chatbotMessagesTable.createdAt,
    }).from(chatbotMessagesTable).where(where).orderBy(desc(chatbotMessagesTable.createdAt))
      .limit(50).offset(cursor ? 0 : (page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(chatbotMessagesTable).where(where);
    const nextCursor = messages.length === 50 ? messages[messages.length - 1]?.createdAt?.toISOString() : null;
    res.json({ success: true, data: { messages, total: total?.count ?? 0, page, nextCursor } });
  } catch (err) { next(err); }
});

export default router;
