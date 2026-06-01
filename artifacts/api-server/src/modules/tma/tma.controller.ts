import { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "crypto";
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
  contractTemplatesTable,
  patientContractsTable,
  clinicExpensesTable,
  payrollRecordsTable,
  notificationsTable,
  appointmentRemindersTable,
  postopFollowupsTable,
  doctorCapacityTable,
} from "@workspace/db";
import { eq, desc, count, sum, gte, lte, and, sql, not, ilike, or, isNotNull } from "drizzle-orm";
import { requireTmaAdmin, invalidateAdminCache } from "./tma.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";

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
      .where(eq(platformAdminsTable.id, req.params["id"]!))
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

    const clinics = await db
      .select({ id: clinicsTable.id, name: clinicsTable.name, plan: clinicsTable.plan, isActive: clinicsTable.isActive, createdAt: clinicsTable.createdAt })
      .from(clinicsTable)
      .orderBy(desc(clinicsTable.createdAt))
      .limit(20);

    const withActivity = await Promise.all(clinics.map(async (c) => {
      const [[procRow], [sesRow]] = await Promise.all([
        db.select({ count: count() }).from(proceduresTable)
          .where(and(eq(proceduresTable.clinicId, c.id), gte(proceduresTable.createdAt, sevenDaysAgo))),
        db.select({ count: count() }).from(chatbotSessionsTable)
          .where(and(eq(chatbotSessionsTable.clinicId, c.id), gte(chatbotSessionsTable.updatedAt, sevenDaysAgo))),
      ]);
      return { ...c, activityScore: (procRow?.count ?? 0) + (sesRow?.count ?? 0) };
    }));

    const top5 = [...withActivity].sort((a, b) => b.activityScore - a.activityScore).slice(0, 5);
    const recentClinics = [...clinics].slice(0, 5);

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
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const [clinic] = await db.insert(clinicsTable)
      .values({ id: randomUUID(), isActive: true, ...parsed.data })
      .returning();
    res.status(201).json({ success: true, data: { clinic } });
  } catch (err) { next(err); }
});

router.get("/clinics/:clinicId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, req.params["clinicId"]!)).limit(1);
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
      .where(eq(clinicsTable.id, req.params["clinicId"]!))
      .returning();
    if (!clinic) return next(new NotFoundError("Clinic not found"));
    res.json({ success: true, data: { clinic } });
  } catch (err) { next(err); }
});

// Soft-delete: deactivate clinic instead of hard delete
router.delete("/clinics/:clinicId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [clinic] = await db.update(clinicsTable)
      .set({ isActive: false })
      .where(eq(clinicsTable.id, req.params["clinicId"]!))
      .returning({ id: clinicsTable.id });
    if (!clinic) return next(new NotFoundError("Clinic not found"));
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
      .where(eq(usersTable.clinicId, req.params["clinicId"]!))
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
      password: z.string().min(6).default("changeme123"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    // simple hash — clinic managers set real password later
    const { createHash } = await import("crypto");
    const passwordHash = createHash("sha256").update(parsed.data.password).digest("hex");
    const [user] = await db.insert(usersTable).values({
      id: randomUUID(),
      clinicId: req.params["clinicId"]!,
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
      .where(and(eq(usersTable.id, req.params["userId"]!), eq(usersTable.clinicId, req.params["clinicId"]!)))
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
      .from(doctorCapacityTable).where(eq(doctorCapacityTable.doctorId, req.params["userId"]!)).limit(1);
    if (existing.length) {
      await db.update(doctorCapacityTable).set({ maxPatientsPerDay: parsed.data.maxPatientsPerDay })
        .where(eq(doctorCapacityTable.doctorId, req.params["userId"]!));
    } else {
      await db.insert(doctorCapacityTable).values({
        doctorId: req.params["userId"]!, clinicId: req.params["clinicId"]!, maxPatientsPerDay: parsed.data.maxPatientsPerDay,
      });
    }
    res.json({ success: true, data: { maxPatientsPerDay: parsed.data.maxPatientsPerDay } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/users/:userId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [user] = await db.update(usersTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(usersTable.id, req.params["userId"]!), eq(usersTable.clinicId, req.params["clinicId"]!)))
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
    const clinicId = req.params["clinicId"]!;
    const search = req.query["search"] as string | undefined;
    const status = req.query["status"] as string | undefined;
    const source = req.query["source"] as string | undefined;

    const conditions = [eq(patientsTable.clinicId, clinicId)];
    if (status) conditions.push(eq(patientsTable.status, status as never));
    if (source) conditions.push(eq(patientsTable.source, source));
    if (search) conditions.push(or(
      ilike(patientsTable.name, `%${search}%`),
      ilike(patientsTable.phone, `%${search}%`),
    )!);

    const where = and(...conditions);
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
      .where(and(eq(patientsTable.id, req.params["patientId"]!), eq(patientsTable.clinicId, req.params["clinicId"]!)))
      .limit(1);
    if (!patient) return next(new NotFoundError("Patient not found"));
    const [[procRow]] = await Promise.all([
      db.select({ count: count() }).from(proceduresTable).where(eq(proceduresTable.patientId, req.params["patientId"]!)),
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
      .where(and(eq(patientsTable.id, req.params["patientId"]!), eq(patientsTable.clinicId, req.params["clinicId"]!)))
      .returning();
    if (!patient) return next(new NotFoundError("Patient not found"));
    res.json({ success: true, data: { patient } });
  } catch (err) { next(err); }
});

// ── CLINIC CHATBOT ────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/chatbot", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
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
    const clinicId = req.params["clinicId"]!;
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
    const clinicId = req.params["clinicId"]!;
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
      await db.update(clinicsTable).set(clinicUpd).where(eq(clinicsTable.id, clinicId));
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

router.post("/clinics/:clinicId/chatbot/ping", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const [clinic] = await db.select({
      greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken,
      greenApiUrl: clinicsTable.greenApiUrl,
    }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1);

    if (!clinic?.greenApiInstanceId || !clinic.greenApiToken) {
      return res.json({ success: true, data: { connected: false, reason: "WhatsApp not configured" } });
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
    const clinicId = req.params["clinicId"]!;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const sessions = await db.select({
      id: chatbotSessionsTable.id, phone: chatbotSessionsTable.phone,
      state: chatbotSessionsTable.state, humanTakeover: chatbotSessionsTable.humanTakeover,
      updatedAt: chatbotSessionsTable.updatedAt,
    })
      .from(chatbotSessionsTable)
      .where(eq(chatbotSessionsTable.clinicId, clinicId))
      .orderBy(desc(chatbotSessionsTable.updatedAt))
      .limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(chatbotSessionsTable).where(eq(chatbotSessionsTable.clinicId, clinicId));
    res.json({ success: true, data: { sessions, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/sessions/:sessionId/takeover", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicId, sessionId } = req.params;
    const schema = z.object({ humanTakeover: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError("humanTakeover (boolean) required"));
    const [updated] = await db.update(chatbotSessionsTable)
      .set({ humanTakeover: parsed.data.humanTakeover })
      .where(and(eq(chatbotSessionsTable.id, sessionId!), eq(chatbotSessionsTable.clinicId, clinicId!)))
      .returning();
    if (!updated) return next(new NotFoundError("Session not found"));
    res.json({ success: true, data: { session: updated } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/sessions/:sessionId/reset", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicId, sessionId } = req.params;
    const [updated] = await db.update(chatbotSessionsTable)
      .set({ state: "greeting", humanTakeover: false })
      .where(and(eq(chatbotSessionsTable.id, sessionId!), eq(chatbotSessionsTable.clinicId, clinicId!)))
      .returning();
    if (!updated) return next(new NotFoundError("Session not found"));
    res.json({ success: true, data: { session: updated } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/sessions/:sessionId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicId, sessionId } = req.params;
    const [deleted] = await db.delete(chatbotSessionsTable)
      .where(and(eq(chatbotSessionsTable.id, sessionId!), eq(chatbotSessionsTable.clinicId, clinicId!)))
      .returning({ id: chatbotSessionsTable.id });
    if (!deleted) return next(new NotFoundError("Session not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── CLINIC MESSAGES ───────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/messages", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const direction = req.query["direction"] as "inbound" | "outbound" | undefined;
    const search = req.query["search"] as string | undefined;
    const cursor = req.query["cursor"] as string | undefined;

    const conditions = [eq(chatbotMessagesTable.clinicId, clinicId)];
    if (direction) conditions.push(eq(chatbotMessagesTable.direction, direction));
    if (search) conditions.push(or(
      ilike(chatbotMessagesTable.content, `%${search}%`),
      ilike(chatbotMessagesTable.phone, `%${search}%`),
    )!);
    if (cursor) conditions.push(lte(chatbotMessagesTable.createdAt, new Date(cursor)));

    const where = and(...conditions);
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
    const clinicId = req.params["clinicId"]!;
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

router.post("/clinics/:clinicId/channels/ping", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const [clinic] = await db.select({
      greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken,
      greenApiUrl: clinicsTable.greenApiUrl,
    }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1);

    if (!clinic?.greenApiInstanceId || !clinic.greenApiToken) {
      return res.json({ success: true, data: { connected: false, reason: "WhatsApp not configured" } });
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

router.post("/clinics/:clinicId/channels", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      type: z.enum(["instagram", "telegram", "2gis", "website", "whatsapp", "referral", "other"]).default("other"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const refCode = randomUUID().split("-")[0]!;
    const [channel] = await db.insert(clinicChannelsTable).values({
      id: randomUUID(), clinicId: req.params["clinicId"]!, refCode, ...parsed.data,
    }).returning();
    res.status(201).json({ success: true, data: { channel } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/channels/:channelId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db.delete(clinicChannelsTable)
      .where(and(eq(clinicChannelsTable.id, req.params["channelId"]!), eq(clinicChannelsTable.clinicId, req.params["clinicId"]!)))
      .returning({ id: clinicChannelsTable.id });
    if (!deleted) return next(new NotFoundError("Channel not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── PROCEDURE TEMPLATES ───────────────────────────────────────────────────────
router.get("/clinics/:clinicId/procedure-templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await db.select().from(procedureTemplatesTable)
      .where(eq(procedureTemplatesTable.clinicId, req.params["clinicId"]!))
      .orderBy(procedureTemplatesTable.category, procedureTemplatesTable.name);
    res.json({ success: true, data: { templates } });
  } catch (err) { next(err); }
});

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/analytics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
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

// ── BROADCASTS ────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/broadcasts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const limit = 25;
    const [reminders, followups, [remCount], [followCount]] = await Promise.all([
      db.select({ id: appointmentRemindersTable.id, type: sql<string>`'appointment_reminder'`, status: appointmentRemindersTable.status, sendAt: appointmentRemindersTable.sendAt, createdAt: appointmentRemindersTable.createdAt })
        .from(appointmentRemindersTable).where(eq(appointmentRemindersTable.clinicId, clinicId)).orderBy(desc(appointmentRemindersTable.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ id: postopFollowupsTable.id, type: sql<string>`'postop_followup'`, status: postopFollowupsTable.status, sendAt: postopFollowupsTable.sendAt, createdAt: postopFollowupsTable.createdAt })
        .from(postopFollowupsTable).where(eq(postopFollowupsTable.clinicId, clinicId)).orderBy(desc(postopFollowupsTable.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: count() }).from(appointmentRemindersTable).where(eq(appointmentRemindersTable.clinicId, clinicId)),
      db.select({ count: count() }).from(postopFollowupsTable).where(eq(postopFollowupsTable.clinicId, clinicId)),
    ]);
    const broadcasts = [...reminders, ...followups].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
    res.json({ success: true, data: { broadcasts, total: (remCount?.count ?? 0) + (followCount?.count ?? 0), page } });
  } catch (err) { next(err); }
});

// ── KNOWLEDGE ─────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/knowledge", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await db.select({
      id: knowledgeSourcesTable.id, name: knowledgeSourcesTable.name,
      type: knowledgeSourcesTable.type, status: knowledgeSourcesTable.status,
      createdAt: knowledgeSourcesTable.createdAt,
    }).from(knowledgeSourcesTable).where(eq(knowledgeSourcesTable.clinicId, req.params["clinicId"]!)).orderBy(desc(knowledgeSourcesTable.createdAt));
    res.json({ success: true, data: { entries } });
  } catch (err) { next(err); }
});

router.post("/clinics/:clinicId/knowledge/:sourceId/rescan", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [updated] = await db.update(knowledgeSourcesTable)
      .set({ status: "pending" })
      .where(and(eq(knowledgeSourcesTable.id, req.params["sourceId"]!), eq(knowledgeSourcesTable.clinicId, req.params["clinicId"]!)))
      .returning();
    if (!updated) return next(new NotFoundError("Knowledge source not found"));
    res.json({ success: true, data: { source: updated } });
  } catch (err) { next(err); }
});

router.delete("/clinics/:clinicId/knowledge/:sourceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db.delete(knowledgeSourcesTable)
      .where(and(eq(knowledgeSourcesTable.id, req.params["sourceId"]!), eq(knowledgeSourcesTable.clinicId, req.params["clinicId"]!)))
      .returning({ id: knowledgeSourcesTable.id });
    if (!deleted) return next(new NotFoundError("Knowledge source not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── CONTRACTS ─────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/contracts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
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

// ── FINANCES ──────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/finances", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
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
      clinicId: req.params["clinicId"]!,
      amount: String(parsed.data.amount),
      category: parsed.data.category as never,
      description: parsed.data.description,
      expenseDate: new Date(),
    }).returning();
    res.status(201).json({ success: true, data: { expense } });
  } catch (err) { next(err); }
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/notifications", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
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
      .where(and(eq(notificationsTable.id, req.params["notifId"]!), eq(notificationsTable.clinicId, req.params["clinicId"]!)))
      .returning();
    if (!updated) return next(new NotFoundError("Notification not found"));
    res.json({ success: true, data: { notification: updated } });
  } catch (err) { next(err); }
});

// ── FILES ─────────────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/files", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
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
    const { clinicId, fileId } = req.params;
    const [kt] = await db.delete(contractTemplatesTable)
      .where(and(eq(contractTemplatesTable.id, fileId!), eq(contractTemplatesTable.clinicId, clinicId!)))
      .returning({ id: contractTemplatesTable.id });
    if (kt) return res.json({ success: true });
    const [ks] = await db.delete(knowledgeSourcesTable)
      .where(and(eq(knowledgeSourcesTable.id, fileId!), eq(knowledgeSourcesTable.clinicId, clinicId!)))
      .returning({ id: knowledgeSourcesTable.id });
    if (!ks) return next(new NotFoundError("File not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── CLINIC LOGS ───────────────────────────────────────────────────────────────
router.get("/clinics/:clinicId/logs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const logs = await db.select({
      id: actionLogsTable.id, actionType: actionLogsTable.actionType,
      entityType: actionLogsTable.entityType, entityId: actionLogsTable.entityId,
      details: actionLogsTable.details, createdAt: actionLogsTable.createdAt,
    }).from(actionLogsTable).where(eq(actionLogsTable.clinicId, clinicId))
      .orderBy(desc(actionLogsTable.createdAt)).limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(actionLogsTable).where(eq(actionLogsTable.clinicId, clinicId));
    res.json({ success: true, data: { logs, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── PLATFORM-WIDE LOGS ────────────────────────────────────────────────────────
router.get("/logs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const clinicId = req.query["clinicId"] as string | undefined;
    const where = clinicId ? eq(actionLogsTable.clinicId, clinicId) : undefined;
    const logs = await db.select({
      id: actionLogsTable.id, clinicId: actionLogsTable.clinicId,
      actionType: actionLogsTable.actionType, entityType: actionLogsTable.entityType,
      entityId: actionLogsTable.entityId, details: actionLogsTable.details,
      createdAt: actionLogsTable.createdAt,
    }).from(actionLogsTable).where(where).orderBy(desc(actionLogsTable.createdAt)).limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(actionLogsTable).where(where);
    res.json({ success: true, data: { logs, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── PLATFORM-WIDE SESSIONS ────────────────────────────────────────────────────
router.get("/sessions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const clinicId = req.query["clinicId"] as string | undefined;
    const where = clinicId ? eq(chatbotSessionsTable.clinicId, clinicId) : undefined;
    const sessions = await db.select({
      id: chatbotSessionsTable.id, clinicId: chatbotSessionsTable.clinicId,
      phone: chatbotSessionsTable.phone, state: chatbotSessionsTable.state,
      humanTakeover: chatbotSessionsTable.humanTakeover, updatedAt: chatbotSessionsTable.updatedAt,
    }).from(chatbotSessionsTable).where(where).orderBy(desc(chatbotSessionsTable.updatedAt)).limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(chatbotSessionsTable).where(where);
    res.json({ success: true, data: { sessions, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── PLATFORM-WIDE MESSAGES ────────────────────────────────────────────────────
router.get("/messages", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const clinicId = req.query["clinicId"] as string | undefined;
    const where = clinicId ? eq(chatbotMessagesTable.clinicId, clinicId) : undefined;
    const messages = await db.select({
      id: chatbotMessagesTable.id, clinicId: chatbotMessagesTable.clinicId,
      phone: chatbotMessagesTable.phone, direction: chatbotMessagesTable.direction,
      content: chatbotMessagesTable.content, createdAt: chatbotMessagesTable.createdAt,
    }).from(chatbotMessagesTable).where(where).orderBy(desc(chatbotMessagesTable.createdAt)).limit(50).offset((page - 1) * 50);
    const [total] = await db.select({ count: count() }).from(chatbotMessagesTable).where(where);
    res.json({ success: true, data: { messages, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

export default router;
