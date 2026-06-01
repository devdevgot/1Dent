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
  clinicChannelsTable,
  knowledgeSourcesTable,
  contractTemplatesTable,
  patientContractsTable,
  clinicExpensesTable,
  payrollRecordsTable,
  notificationsTable,
  appointmentRemindersTable,
  postopFollowupsTable,
} from "@workspace/db";
import { eq, desc, count, sum, gte, lte, and, sql } from "drizzle-orm";
import { requireTmaAdmin, invalidateAdminCache } from "./tma.middleware";
import { logger } from "../../lib/logger";
import { ValidationError, NotFoundError } from "../../shared/errors";

const router = Router();

router.use(requireTmaAdmin);

// ── GET /api/tma/me ────────────────────────────────────────────────────────────
router.get("/me", (req: Request, res: Response) => {
  res.json({ success: true, data: { user: req.tmaUser } });
});

// ── GET /api/tma/admins ────────────────────────────────────────────────────────
router.get("/admins", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const admins = await db.select().from(platformAdminsTable).orderBy(desc(platformAdminsTable.createdAt));
    res.json({ success: true, data: { admins } });
  } catch (err) { next(err); }
});

// ── POST /api/tma/admins ───────────────────────────────────────────────────────
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

// ── DELETE /api/tma/admins/:id ────────────────────────────────────────────────
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

// ── GET /api/tma/dashboard ────────────────────────────────────────────────────
router.get("/dashboard", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [clinicsCount] = await db.select({ count: count() }).from(clinicsTable);
    const [usersCount] = await db.select({ count: count() }).from(usersTable);
    const [patientsCount] = await db.select({ count: count() }).from(patientsTable);

    const [revenueRow] = await db
      .select({ total: sum(proceduresTable.price) })
      .from(proceduresTable)
      .where(and(
        eq(proceduresTable.status, "completed"),
        gte(proceduresTable.completedAt, monthStart),
      ));

    const [sessionsCount] = await db.select({ count: count() }).from(chatbotSessionsTable);

    const recentClinics = await db
      .select({ id: clinicsTable.id, name: clinicsTable.name, plan: clinicsTable.plan, createdAt: clinicsTable.createdAt })
      .from(clinicsTable)
      .orderBy(desc(clinicsTable.createdAt))
      .limit(5);

    res.json({
      success: true,
      data: {
        totalClinics: clinicsCount?.count ?? 0,
        totalUsers: usersCount?.count ?? 0,
        totalPatients: patientsCount?.count ?? 0,
        revenueThisMonth: Number(revenueRow?.total ?? 0),
        totalChatbotSessions: sessionsCount?.count ?? 0,
        recentClinics,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics ──────────────────────────────────────────────────────
router.get("/clinics", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const clinics = await db
      .select()
      .from(clinicsTable)
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

// ── GET /api/tma/clinics/:clinicId ────────────────────────────────────────────
router.get("/clinics/:clinicId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clinicId } = req.params;
    const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, clinicId!)).limit(1);
    if (!clinic) return next(new NotFoundError("Clinic not found"));
    res.json({ success: true, data: { clinic } });
  } catch (err) { next(err); }
});

// ── PATCH /api/tma/clinics/:clinicId ─────────────────────────────────────────
router.patch("/clinics/:clinicId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200).optional(),
      plan: z.enum(["free", "starter", "professional", "enterprise"]).optional(),
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

// ── DELETE /api/tma/clinics/:clinicId ─────────────────────────────────────────
router.delete("/clinics/:clinicId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db.delete(clinicsTable)
      .where(eq(clinicsTable.id, req.params["clinicId"]!))
      .returning({ id: clinicsTable.id });
    if (!deleted) return next(new NotFoundError("Clinic not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── POST /api/tma/clinics ─────────────────────────────────────────────────────
router.post("/clinics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200),
      plan: z.enum(["free", "starter", "professional", "enterprise"]).default("free"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const [clinic] = await db.insert(clinicsTable)
      .values({ id: randomUUID(), ...parsed.data })
      .returning();
    res.status(201).json({ success: true, data: { clinic } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/users ──────────────────────────────────────
router.get("/clinics/:clinicId/users", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await db.select({
      id: usersTable.id, name: usersTable.name, email: usersTable.email,
      role: usersTable.role, isActive: usersTable.isActive,
      specialty: usersTable.specialty, createdAt: usersTable.createdAt,
    })
      .from(usersTable)
      .where(eq(usersTable.clinicId, req.params["clinicId"]!))
      .orderBy(desc(usersTable.createdAt));
    res.json({ success: true, data: { users } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/patients ───────────────────────────────────
router.get("/clinics/:clinicId/patients", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const limit = 50;
    const offset = (page - 1) * limit;
    const clinicId = req.params["clinicId"]!;
    const patients = await db.select({
      id: patientsTable.id, name: patientsTable.name, phone: patientsTable.phone,
      status: patientsTable.status, createdAt: patientsTable.createdAt,
    })
      .from(patientsTable)
      .where(eq(patientsTable.clinicId, clinicId))
      .orderBy(desc(patientsTable.createdAt))
      .limit(limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(patientsTable).where(eq(patientsTable.clinicId, clinicId));
    res.json({ success: true, data: { patients, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/chatbot ────────────────────────────────────
router.get("/clinics/:clinicId/chatbot", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const [[sessionsRow], [msgRow], activeSessions] = await Promise.all([
      db.select({ count: count() }).from(chatbotSessionsTable).where(eq(chatbotSessionsTable.clinicId, clinicId)),
      db.select({ count: count() }).from(chatbotMessagesTable).where(eq(chatbotMessagesTable.clinicId, clinicId)),
      db.select({
        id: chatbotSessionsTable.id,
        phone: chatbotSessionsTable.phone,
        state: chatbotSessionsTable.state,
        humanTakeover: chatbotSessionsTable.humanTakeover,
        updatedAt: chatbotSessionsTable.updatedAt,
      })
        .from(chatbotSessionsTable)
        .where(eq(chatbotSessionsTable.clinicId, clinicId))
        .orderBy(desc(chatbotSessionsTable.updatedAt))
        .limit(20),
    ]);
    res.json({
      success: true,
      data: {
        totalSessions: sessionsRow?.count ?? 0,
        totalMessages: msgRow?.count ?? 0,
        recentSessions: activeSessions,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/sessions ───────────────────────────────────
router.get("/clinics/:clinicId/sessions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const limit = 50;
    const offset = (page - 1) * limit;
    const sessions = await db.select({
      id: chatbotSessionsTable.id,
      phone: chatbotSessionsTable.phone,
      state: chatbotSessionsTable.state,
      humanTakeover: chatbotSessionsTable.humanTakeover,
      updatedAt: chatbotSessionsTable.updatedAt,
    })
      .from(chatbotSessionsTable)
      .where(eq(chatbotSessionsTable.clinicId, clinicId))
      .orderBy(desc(chatbotSessionsTable.updatedAt))
      .limit(limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(chatbotSessionsTable).where(eq(chatbotSessionsTable.clinicId, clinicId));
    res.json({ success: true, data: { sessions, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── POST /api/tma/clinics/:clinicId/sessions/:sessionId/takeover ──────────────
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

// ── POST /api/tma/clinics/:clinicId/sessions/:sessionId/reset ────────────────
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

// ── GET /api/tma/clinics/:clinicId/messages ───────────────────────────────────
router.get("/clinics/:clinicId/messages", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const limit = 50;
    const offset = (page - 1) * limit;
    const messages = await db.select({
      id: chatbotMessagesTable.id,
      phone: chatbotMessagesTable.phone,
      direction: chatbotMessagesTable.direction,
      content: chatbotMessagesTable.content,
      createdAt: chatbotMessagesTable.createdAt,
    })
      .from(chatbotMessagesTable)
      .where(eq(chatbotMessagesTable.clinicId, clinicId))
      .orderBy(desc(chatbotMessagesTable.createdAt))
      .limit(limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(chatbotMessagesTable).where(eq(chatbotMessagesTable.clinicId, clinicId));
    res.json({ success: true, data: { messages, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/channels ───────────────────────────────────
router.get("/clinics/:clinicId/channels", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channels = await db.select().from(clinicChannelsTable)
      .where(eq(clinicChannelsTable.clinicId, req.params["clinicId"]!))
      .orderBy(desc(clinicChannelsTable.createdAt));
    res.json({ success: true, data: { channels } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/procedure-templates ────────────────────────
router.get("/clinics/:clinicId/procedure-templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await db.select().from(procedureTemplatesTable)
      .where(eq(procedureTemplatesTable.clinicId, req.params["clinicId"]!))
      .orderBy(procedureTemplatesTable.category, procedureTemplatesTable.name);
    res.json({ success: true, data: { templates } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/analytics ──────────────────────────────────
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

    const months: { month: string; revenue: number; procedures: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const [rev] = await db.select({ total: sum(proceduresTable.price), cnt: count() })
        .from(proceduresTable)
        .where(and(
          eq(proceduresTable.clinicId, clinicId),
          eq(proceduresTable.status, "completed"),
          gte(proceduresTable.completedAt, d),
          lte(proceduresTable.completedAt, end),
        ));
      months.push({
        month: d.toLocaleDateString("ru", { month: "short", year: "2-digit" }),
        revenue: Number(rev?.total ?? 0),
        procedures: rev?.cnt ?? 0,
      });
    }

    res.json({
      success: true,
      data: {
        totalPatients: patientsRow?.count ?? 0,
        revenueThisMonth: Number(revenueRow?.total ?? 0),
        proceduresThisMonth: procRow?.count ?? 0,
        revenueByMonth: months,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/broadcasts ─────────────────────────────────
// Uses appointment reminders + postop followups as "scheduled broadcasts"
router.get("/clinics/:clinicId/broadcasts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const limit = 25;
    const offset = (page - 1) * limit;

    const [reminders, followups, [remCount], [followCount]] = await Promise.all([
      db.select({
        id: appointmentRemindersTable.id,
        type: sql<string>`'appointment_reminder'`,
        status: appointmentRemindersTable.status,
        sendAt: appointmentRemindersTable.sendAt,
        createdAt: appointmentRemindersTable.createdAt,
      })
        .from(appointmentRemindersTable)
        .where(eq(appointmentRemindersTable.clinicId, clinicId))
        .orderBy(desc(appointmentRemindersTable.createdAt))
        .limit(limit).offset(offset),
      db.select({
        id: postopFollowupsTable.id,
        type: sql<string>`'postop_followup'`,
        status: postopFollowupsTable.status,
        sendAt: postopFollowupsTable.sendAt,
        createdAt: postopFollowupsTable.createdAt,
      })
        .from(postopFollowupsTable)
        .where(eq(postopFollowupsTable.clinicId, clinicId))
        .orderBy(desc(postopFollowupsTable.createdAt))
        .limit(limit).offset(offset),
      db.select({ count: count() }).from(appointmentRemindersTable).where(eq(appointmentRemindersTable.clinicId, clinicId)),
      db.select({ count: count() }).from(postopFollowupsTable).where(eq(postopFollowupsTable.clinicId, clinicId)),
    ]);

    const broadcasts = [...reminders, ...followups]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    res.json({
      success: true,
      data: {
        broadcasts,
        total: (remCount?.count ?? 0) + (followCount?.count ?? 0),
        page,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/knowledge ──────────────────────────────────
router.get("/clinics/:clinicId/knowledge", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await db.select({
      id: knowledgeSourcesTable.id, name: knowledgeSourcesTable.name,
      type: knowledgeSourcesTable.type, status: knowledgeSourcesTable.status,
      createdAt: knowledgeSourcesTable.createdAt,
    })
      .from(knowledgeSourcesTable)
      .where(eq(knowledgeSourcesTable.clinicId, req.params["clinicId"]!))
      .orderBy(desc(knowledgeSourcesTable.createdAt));
    res.json({ success: true, data: { entries } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/contracts ──────────────────────────────────
// Returns signed patient contracts joined with patient name
router.get("/clinics/:clinicId/contracts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const limit = 50;
    const offset = (page - 1) * limit;

    const contracts = await db
      .select({
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
      .limit(limit).offset(offset);

    const [total] = await db.select({ count: count() }).from(patientContractsTable).where(eq(patientContractsTable.clinicId, clinicId));
    const [templateCount] = await db.select({ count: count() }).from(contractTemplatesTable).where(eq(contractTemplatesTable.clinicId, clinicId));

    res.json({
      success: true,
      data: {
        contracts,
        total: total?.count ?? 0,
        templateCount: templateCount?.count ?? 0,
        page,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/finances ───────────────────────────────────
router.get("/clinics/:clinicId/finances", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [[revenueRow], [expensesRow], [payrollRow]] = await Promise.all([
      db.select({ total: sum(proceduresTable.price) })
        .from(proceduresTable)
        .where(and(eq(proceduresTable.clinicId, clinicId), eq(proceduresTable.status, "completed"), gte(proceduresTable.completedAt, monthStart))),
      db.select({ total: sum(clinicExpensesTable.amount) })
        .from(clinicExpensesTable)
        .where(and(eq(clinicExpensesTable.clinicId, clinicId), gte(clinicExpensesTable.expenseDate, monthStart))),
      db.select({ total: sum(payrollRecordsTable.netPay) })
        .from(payrollRecordsTable)
        .where(and(eq(payrollRecordsTable.clinicId, clinicId), gte(payrollRecordsTable.periodStart, monthStart))),
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
      months.push({
        month: d.toLocaleDateString("ru", { month: "short", year: "2-digit" }),
        revenue: Number(r?.total ?? 0),
        expenses: Number(e?.total ?? 0),
      });
    }

    res.json({ success: true, data: { revenue, expenses, payroll, profit: revenue - expenses - payroll, months } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/notifications ──────────────────────────────
router.get("/clinics/:clinicId/notifications", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const limit = 50;
    const offset = (page - 1) * limit;
    const notifications = await db.select({
      id: notificationsTable.id,
      type: notificationsTable.type,
      message: notificationsTable.message,
      read: notificationsTable.read,
      createdAt: notificationsTable.createdAt,
    })
      .from(notificationsTable)
      .where(eq(notificationsTable.clinicId, clinicId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(notificationsTable).where(eq(notificationsTable.clinicId, clinicId));
    res.json({ success: true, data: { notifications, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/files ──────────────────────────────────────
// Returns contract template files + knowledge source files
router.get("/clinics/:clinicId/files", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;

    const [contractFiles, knowledgeFiles] = await Promise.all([
      db.select({
        id: contractTemplatesTable.id,
        name: contractTemplatesTable.name,
        type: contractTemplatesTable.fileType,
        source: sql<string>`'contract_template'`,
        url: contractTemplatesTable.fileUrl,
        createdAt: contractTemplatesTable.createdAt,
      })
        .from(contractTemplatesTable)
        .where(eq(contractTemplatesTable.clinicId, clinicId))
        .orderBy(desc(contractTemplatesTable.createdAt)),
      db.select({
        id: knowledgeSourcesTable.id,
        name: knowledgeSourcesTable.name,
        type: knowledgeSourcesTable.type,
        source: sql<string>`'knowledge_source'`,
        url: sql<string>`''`,
        createdAt: knowledgeSourcesTable.createdAt,
      })
        .from(knowledgeSourcesTable)
        .where(eq(knowledgeSourcesTable.clinicId, clinicId))
        .orderBy(desc(knowledgeSourcesTable.createdAt)),
    ]);

    const files = [...contractFiles, ...knowledgeFiles]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ success: true, data: { files, total: files.length } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/clinics/:clinicId/logs ───────────────────────────────────────
router.get("/clinics/:clinicId/logs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.params["clinicId"]!;
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const limit = 50;
    const offset = (page - 1) * limit;
    const logs = await db.select({
      id: actionLogsTable.id,
      actionType: actionLogsTable.actionType,
      entityType: actionLogsTable.entityType,
      entityId: actionLogsTable.entityId,
      details: actionLogsTable.details,
      createdAt: actionLogsTable.createdAt,
    })
      .from(actionLogsTable)
      .where(eq(actionLogsTable.clinicId, clinicId))
      .orderBy(desc(actionLogsTable.createdAt))
      .limit(limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(actionLogsTable).where(eq(actionLogsTable.clinicId, clinicId));
    res.json({ success: true, data: { logs, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/logs (platform-wide) ────────────────────────────────────────
router.get("/logs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const clinicId = req.query["clinicId"] as string | undefined;
    const limit = 50;
    const offset = (page - 1) * limit;

    const where = clinicId ? eq(actionLogsTable.clinicId, clinicId) : undefined;

    const logs = await db.select({
      id: actionLogsTable.id,
      clinicId: actionLogsTable.clinicId,
      actionType: actionLogsTable.actionType,
      entityType: actionLogsTable.entityType,
      entityId: actionLogsTable.entityId,
      details: actionLogsTable.details,
      createdAt: actionLogsTable.createdAt,
    })
      .from(actionLogsTable)
      .where(where)
      .orderBy(desc(actionLogsTable.createdAt))
      .limit(limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(actionLogsTable).where(where);
    res.json({ success: true, data: { logs, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/sessions (platform-wide chatbot sessions) ────────────────────
router.get("/sessions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const clinicId = req.query["clinicId"] as string | undefined;
    const limit = 50;
    const offset = (page - 1) * limit;

    const where = clinicId ? eq(chatbotSessionsTable.clinicId, clinicId) : undefined;

    const sessions = await db.select({
      id: chatbotSessionsTable.id,
      clinicId: chatbotSessionsTable.clinicId,
      phone: chatbotSessionsTable.phone,
      state: chatbotSessionsTable.state,
      humanTakeover: chatbotSessionsTable.humanTakeover,
      updatedAt: chatbotSessionsTable.updatedAt,
    })
      .from(chatbotSessionsTable)
      .where(where)
      .orderBy(desc(chatbotSessionsTable.updatedAt))
      .limit(limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(chatbotSessionsTable).where(where);
    res.json({ success: true, data: { sessions, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

// ── GET /api/tma/messages (platform-wide recent messages) ─────────────────────
router.get("/messages", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query["page"] ?? "1"), 10);
    const clinicId = req.query["clinicId"] as string | undefined;
    const limit = 50;
    const offset = (page - 1) * limit;

    const where = clinicId ? eq(chatbotMessagesTable.clinicId, clinicId) : undefined;

    const messages = await db.select({
      id: chatbotMessagesTable.id,
      clinicId: chatbotMessagesTable.clinicId,
      phone: chatbotMessagesTable.phone,
      direction: chatbotMessagesTable.direction,
      content: chatbotMessagesTable.content,
      createdAt: chatbotMessagesTable.createdAt,
    })
      .from(chatbotMessagesTable)
      .where(where)
      .orderBy(desc(chatbotMessagesTable.createdAt))
      .limit(limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(chatbotMessagesTable).where(where);
    res.json({ success: true, data: { messages, total: total?.count ?? 0, page } });
  } catch (err) { next(err); }
});

export default router;
