import { randomUUID } from "crypto";
import IORedis from "ioredis";
import {
  db,
  chatbotSettingsTable,
  chatbotSessionsTable,
  chatbotMessagesTable,
  chatbotManagerExamplesTable,
  messagesTable,
  patientsTable,
  notificationsTable,
  usersTable,
  proceduresTable,
  toothRecordsTable,
  toothTreatmentsTable,
  treatmentPlansTable,
  treatmentPlanItemsTable,
} from "@workspace/db";
import type { StepInstructions } from "@workspace/db";
import { eq, and, inArray, gte, lte, ne, asc, desc, sql } from "drizzle-orm";
import { isRedAlert } from "../../shared/whatsapp";
import { sendToPatient, sendTypingToPatient } from "../../shared/messaging";
import { getAlertQueue } from "../../shared/alert-queue";
import { logger } from "../../lib/logger";
import { pickBestDoctorAdvanced, type AdvancedScoringOptions } from "../analytics/analytics.repository";
import { ChannelsRepository } from "../channels/channels.repository";
import { classifyPatientRequest, generateChatbotResponse, extractDatetimeFromText, type ChatMessage, type ManagerExample } from "./ai-classifier";
import type { ChatbotState, ChatbotSessionData } from "./chatbot.types";
import type { ChatbotSettings } from "@workspace/db";

type CachedSettings = { settings: ChatbotSettings; expiresAt: number };
type CachedExamples = { examples: ManagerExample[]; expiresAt: number };

const SESSION_TTL_SECONDS = 24 * 60 * 60;
const REDIS_KEY_PREFIX = "chatbot:session:";

const OPERATOR_KEYWORDS = ["оператор", "operator", "человек", "admin", "администратор"];
const CONFIRM_YES = [
  "да", "yes", "ок", "ok", "конечно", "подтверждаю", "согласен", "согласна", "👍", "+",
  // Казахский
  "иә", "ия", "жарайды", "жаксы", "жақсы", "болады", "болат", "солай",
];
const CONFIRM_NO = [
  "нет", "no", "отмена", "отменить", "cancel", "не надо",
  // Казахский
  "жоқ", "жок", "керек емес", "болмайды", "қажет емес",
];
const RESCHEDULE_KEYWORDS = ["перенести", "другую дату", "другое время", "изменить дату", "өзгерту", "жылжыту", "ауыстыру", "басқа уақыт"];
const CANCEL_KEYWORDS = ["отменить", "отмена", "удалить запись", "болдырмау", "жою", "өшіру"];

function isOperatorRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return OPERATOR_KEYWORDS.some((kw) => lower.includes(kw));
}
function isYes(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return CONFIRM_YES.some((kw) => lower.includes(kw));
}
function isNo(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return CONFIRM_NO.some((kw) => lower === kw || lower.startsWith(kw + " "));
}

interface SessionRecord {
  id: string;
  clinicId: string;
  phone: string;
  state: ChatbotState;
  data: ChatbotSessionData;
  humanTakeover: boolean;
}

// ─── Redis-backed session store (falls back to PostgreSQL) ───────────────────

let redis: IORedis | null = null;
if (process.env["REDIS_URL"]) {
  redis = new IORedis(process.env["REDIS_URL"], { lazyConnect: true, enableReadyCheck: false });
  redis.on("error", (err: Error) => logger.warn({ err }, "[ChatbotSession] Redis error"));
  logger.info("[ChatbotSession] Redis session store enabled");
} else {
  logger.info("[ChatbotSession] REDIS_URL not set — using PostgreSQL session store");
}

async function loadSession(clinicId: string, phone: string): Promise<SessionRecord | null> {
  if (redis) {
    try {
      const raw = await redis.get(`${REDIS_KEY_PREFIX}${clinicId}:${phone}`);
      if (raw) return JSON.parse(raw) as SessionRecord;
    } catch (err) {
      logger.warn({ err }, "[ChatbotSession] Redis get failed, falling back to DB");
    }
  }

  const [row] = await db
    .select()
    .from(chatbotSessionsTable)
    .where(and(eq(chatbotSessionsTable.clinicId, clinicId), eq(chatbotSessionsTable.phone, phone)))
    .limit(1);

  if (!row) return null;

  const age = Date.now() - new Date(row.updatedAt).getTime();
  if (age > SESSION_TTL_SECONDS * 1000) return null;

  const session: SessionRecord = {
    id: row.id,
    clinicId: row.clinicId,
    phone: row.phone,
    state: row.state as ChatbotState,
    data: (row.data ?? {}) as ChatbotSessionData,
    humanTakeover: row.humanTakeover,
  };

  if (redis) {
    redis
      .setex(`${REDIS_KEY_PREFIX}${clinicId}:${phone}`, SESSION_TTL_SECONDS, JSON.stringify(session))
      .catch(() => {});
  }

  return session;
}

async function saveSession(session: SessionRecord): Promise<void> {
  await db
    .insert(chatbotSessionsTable)
    .values({
      id: session.id,
      clinicId: session.clinicId,
      phone: session.phone,
      state: session.state,
      data: session.data as Record<string, unknown>,
      humanTakeover: session.humanTakeover,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [chatbotSessionsTable.clinicId, chatbotSessionsTable.phone],
      set: {
        state: session.state,
        data: session.data as Record<string, unknown>,
        humanTakeover: session.humanTakeover,
        updatedAt: new Date(),
      },
    });

  if (redis) {
    redis
      .setex(
        `${REDIS_KEY_PREFIX}${session.clinicId}:${session.phone}`,
        SESSION_TTL_SECONDS,
        JSON.stringify(session),
      )
      .catch((err: Error) => logger.warn({ err }, "[ChatbotSession] Redis setex failed after DB write"));
  }
}

async function deleteRedisSession(clinicId: string, phone: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(`${REDIS_KEY_PREFIX}${clinicId}:${phone}`);
    } catch (_) { /* ignore */ }
  }
}

// ─── Chatbot message persistence ─────────────────────────────────────────────

async function saveChatbotMessage(
  clinicId: string,
  phone: string,
  direction: "inbound" | "outbound",
  content: string,
): Promise<void> {
  await db
    .insert(chatbotMessagesTable)
    .values({ id: randomUUID(), clinicId, phone, direction, content })
    .catch((err) => logger.error({ err }, "[ChatbotService] Failed to save chatbot message"));

  // For outbound replies, also save to the main messages table so they
  // appear in the internal chat panel alongside inbound patient messages.
  if (direction === "outbound") {
    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, phone)))
      .limit(1);

    if (patient) {
      await db
        .insert(messagesTable)
        .values({
          id: randomUUID(),
          clinicId,
          patientId: patient.id,
          direction: "outbound",
          senderId: null,
          content,
          whatsappMessageId: null,
          isRedAlert: false,
        })
        .catch((err) => logger.error({ err }, "[ChatbotService] Failed to mirror outbound message to messages table"));
    }
  }
}

// ─── Analytics-based doctor routing ─────────────────────────────────────────

/**
 * Pick the most general/entry-level doctor for low-confidence AI routing.
 * Prefers doctors with specialty matching "therapist"/"general"/"терапевт"/"терапия".
 * Falls back to the doctor with the lowest current load.
 */
async function pickTherapist(clinicId: string): Promise<{ id: string; name: string } | null> {
  const THERAPIST_SPECIALTIES = ["therapist", "general", "терапевт", "терапия", "дантист", "dentist"];
  const doctors = await db
    .select({ id: usersTable.id, name: usersTable.name, specialty: usersTable.specialty })
    .from(usersTable)
    .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor")));

  if (doctors.length === 0) return null;

  // Prefer doctors with matching specialty
  const therapist = doctors.find(
    (d) => d.specialty && THERAPIST_SPECIALTIES.includes(d.specialty.toLowerCase()),
  );
  if (therapist) return { id: therapist.id, name: therapist.name };

  // No specialty match — pick least-loaded doctor today using procedure count
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const loads = await Promise.all(
    doctors.map(async (doc) => {
      const [result] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(proceduresTable)
        .where(
          and(
            eq(proceduresTable.clinicId, clinicId),
            eq(proceduresTable.doctorId, doc.id),
            ne(proceduresTable.status, "cancelled"),
            gte(proceduresTable.scheduledAt, todayStart),
            lte(proceduresTable.scheduledAt, todayEnd),
          ),
        );
      return { id: doc.id, name: doc.name, load: result?.count ?? 0 };
    }),
  );

  // Sort by ascending load — pick least busy doctor
  loads.sort((a, b) => a.load - b.load);
  return { id: loads[0]!.id, name: loads[0]!.name };
}

const channelsRepo = new ChannelsRepository();

// ─── Available slots helper ───────────────────────────────────────────────────

/**
 * Returns up to 5 nearest free hourly slots for a doctor within the next 7 days.
 * Working hours: 09:00–18:00 Mon–Sat. Slots occupied by non-cancelled procedures are excluded.
 */
async function getAvailableSlots(clinicId: string, doctorId: string): Promise<Date[]> {
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const booked = await db
    .select({ scheduledAt: proceduresTable.scheduledAt })
    .from(proceduresTable)
    .where(
      and(
        eq(proceduresTable.clinicId, clinicId),
        eq(proceduresTable.doctorId, doctorId),
        ne(proceduresTable.status, "cancelled"),
        gte(proceduresTable.scheduledAt, now),
        lte(proceduresTable.scheduledAt, sevenDaysLater),
      ),
    );

  // Build set of occupied hours (YYYY-MM-DDTHH precision)
  const bookedHours = new Set(
    booked
      .filter((b) => b.scheduledAt)
      .map((b) => b.scheduledAt!.toISOString().slice(0, 13)),
  );

  const slots: Date[] = [];
  const cursor = new Date(now);
  // Start from the next hour boundary (at least 1 hour ahead)
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1);
  if (cursor.getHours() < 9) cursor.setHours(9, 0, 0, 0);

  while (slots.length < 5 && cursor <= sevenDaysLater) {
    const dayOfWeek = cursor.getDay(); // 0=Sun, 6=Sat
    const hour = cursor.getHours();

    if (dayOfWeek !== 0 && hour >= 9 && hour < 18) {
      const hourKey = cursor.toISOString().slice(0, 13);
      if (!bookedHours.has(hourKey)) {
        slots.push(new Date(cursor));
      }
    }

    cursor.setHours(cursor.getHours() + 1);
    if (cursor.getHours() >= 18) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(9, 0, 0, 0);
    }
  }

  return slots;
}

function formatSlots(slots: Date[]): string {
  const dayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  return slots
    .map((s) => {
      const day = dayNames[s.getDay()];
      const date = s.toLocaleDateString("ru-KZ", { day: "numeric", month: "long" });
      const time = s.toLocaleTimeString("ru-KZ", { hour: "2-digit", minute: "2-digit" });
      return `• ${day}, ${date} в ${time}`;
    })
    .join("\n");
}

// Simple settings cache (60s TTL) to avoid DB on every message
const settingsCache = new Map<string, CachedSettings>();

// Manager examples cache (60s TTL) — shared across sessions
const examplesCache = new Map<string, CachedExamples>();

async function getManagerExamples(clinicId: string): Promise<ManagerExample[]> {
  const cached = examplesCache.get(clinicId);
  if (cached && cached.expiresAt > Date.now()) return cached.examples;

  const rows = await db
    .select({
      userMessage: chatbotManagerExamplesTable.userMessage,
      managerResponse: chatbotManagerExamplesTable.managerResponse,
    })
    .from(chatbotManagerExamplesTable)
    .where(eq(chatbotManagerExamplesTable.clinicId, clinicId))
    .orderBy(asc(chatbotManagerExamplesTable.sortOrder), asc(chatbotManagerExamplesTable.createdAt))
    .limit(20);

  examplesCache.set(clinicId, { examples: rows, expiresAt: Date.now() + 60_000 });
  return rows;
}

function extractRefCode(text: string): string | null {
  const match = text.match(/ref:([a-f0-9]{4,8})/i);
  return match ? match[1]!.toLowerCase() : null;
}

function extractClickId(text: string): string | null {
  const match = text.match(/cid:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1]!.toLowerCase() : null;
}



// ─── Settings helpers ────────────────────────────────────────────────────────

async function getSettings(clinicId: string): Promise<ChatbotSettings> {
  // Try cache first
  const cached = settingsCache.get(clinicId);
  if (cached && cached.expiresAt > Date.now()) return cached.settings;

  const [settings] = await db
    .select()
    .from(chatbotSettingsTable)
    .where(eq(chatbotSettingsTable.clinicId, clinicId))
    .limit(1);

  if (settings) {
    settingsCache.set(clinicId, { settings, expiresAt: Date.now() + 60_000 });
    return settings;
  }

  const id = randomUUID();
  const [created] = await db
    .insert(chatbotSettingsTable)
    .values({ id, clinicId })
    .onConflictDoNothing()
    .returning();

  if (created) {
    settingsCache.set(clinicId, { settings: created, expiresAt: Date.now() + 60_000 });
    return created;
  }

  const [fetched] = await db
    .select()
    .from(chatbotSettingsTable)
    .where(eq(chatbotSettingsTable.clinicId, clinicId))
    .limit(1);

  return fetched!;
}

// ─── Red alert escalation ────────────────────────────────────────────────────

async function triggerRedAlert(
  clinicId: string,
  phone: string,
  text: string,
  patientId?: string,
): Promise<void> {
  const alertQueue = getAlertQueue();
  const payload = {
    clinicId,
    patientId: patientId ?? null,
    messageId: null,
    content: text,
    patientName: phone,
  };

  if (alertQueue && patientId) {
    alertQueue.add("red-alert", { ...payload, patientId }).catch(() => {
      logger.warn("[ChatbotService] Red alert queue add failed");
    });
  } else {
    const recipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.clinicId, clinicId), inArray(usersTable.role, ["owner", "admin", "doctor"])));

    if (recipients.length === 0) return;

    const msg = `🚨 Red Alert (чатбот) от ${phone}: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`;
    await db.insert(notificationsTable).values(
      recipients.map((r) => ({
        id: randomUUID(),
        clinicId,
        userId: r.id,
        type: "red_alert" as const,
        message: msg,
        read: false,
        patientId: patientId ?? null,
        messageId: null,
      })),
    );
  }
}

// ─── Patient creation ────────────────────────────────────────────────────────

async function createPatient(
  clinicId: string,
  phone: string,
  name: string,
  doctorId: string,
  source?: string,
  iin?: string,
) {
  const id = randomUUID();
  const [patient] = await db
    .insert(patientsTable)
    .values({ id, clinicId, name, phone, iin: iin ?? null, source: source ?? "whatsapp", status: "new_request", doctorId })
    .returning();
  return patient!;
}

// ─── AI system prompt builder ────────────────────────────────────────────────

/**
 * Loads a patient's dental card as structured text for the AI.
 * Only returns teeth with non-healthy conditions, recent treatments, and active plans.
 */
async function loadPatientDentalContext(clinicId: string, patientId: string): Promise<string> {
  const conditionNames: Record<string, string> = {
    healthy: "здоровый",
    cavity: "кариес",
    treated: "пролеченный",
    crown: "коронка",
    root_canal: "корневой канал (эндодонтия)",
    implant: "имплант",
    missing: "отсутствует",
    extraction_needed: "требует удаления",
  };

  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [records, treatments, activePlans] = await Promise.all([
    db
      .select()
      .from(toothRecordsTable)
      .where(
        and(
          eq(toothRecordsTable.clinicId, clinicId),
          eq(toothRecordsTable.patientId, patientId),
          ne(toothRecordsTable.condition, "healthy"),
        ),
      )
      .orderBy(asc(toothRecordsTable.toothFdi)),

    db
      .select()
      .from(toothTreatmentsTable)
      .where(
        and(
          eq(toothTreatmentsTable.clinicId, clinicId),
          eq(toothTreatmentsTable.patientId, patientId),
          gte(toothTreatmentsTable.performedAt, oneYearAgo),
        ),
      )
      .orderBy(desc(toothTreatmentsTable.performedAt))
      .limit(10),

    db
      .select()
      .from(treatmentPlansTable)
      .where(
        and(
          eq(treatmentPlansTable.clinicId, clinicId),
          eq(treatmentPlansTable.patientId, patientId),
          inArray(treatmentPlansTable.status, ["draft", "approved", "in_progress"]),
        ),
      )
      .orderBy(desc(treatmentPlansTable.createdAt))
      .limit(3),
  ]);

  let context = "📋 КАРТА ЗУБОВ ПАЦИЕНТА:\n";
  if (records.length === 0) {
    context += "— нет записей о проблемных зубах (все зубы здоровы или карта не заполнена)\n";
  } else {
    for (const r of records) {
      const cond = conditionNames[r.condition] ?? r.condition;
      const note = r.notes ? ` — ${r.notes}` : "";
      context += `— Зуб ${r.toothFdi} (FDI): ${cond}${note}\n`;
    }
  }

  if (treatments.length > 0) {
    context += "\n🔧 ПОСЛЕДНИЕ ПРОЦЕДУРЫ (за 12 мес.):\n";
    for (const t of treatments) {
      const d = new Date(t.performedAt).toLocaleDateString("ru-KZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const typeLabel = t.type === "extraction" ? "удаление" : "лечение";
      const statusLabel = t.status === "done" ? " ✓" : " (в процессе)";
      context += `— ${d}: Зуб ${t.toothFdi} — ${t.description} [${typeLabel}]${statusLabel}\n`;
    }
  }

  if (activePlans.length > 0) {
    const planStatusMap: Record<string, string> = {
      draft: "черновик",
      approved: "одобрен",
      in_progress: "в процессе",
      completed: "завершён",
      cancelled: "отменён",
    };
    context += "\n📑 АКТИВНЫЕ ПЛАНЫ ЛЕЧЕНИЯ:\n";
    for (const plan of activePlans) {
      const items = await db
        .select()
        .from(treatmentPlanItemsTable)
        .where(
          and(
            eq(treatmentPlanItemsTable.planId, plan.id),
            ne(treatmentPlanItemsTable.status, "cancelled"),
          ),
        )
        .orderBy(asc(treatmentPlanItemsTable.sortOrder))
        .limit(15);

      const totalStr = plan.totalCost.toLocaleString("ru") + " ₸";
      context += `— План №${plan.planNumber} (${planStatusMap[plan.status] ?? plan.status}), итого: ${totalStr}\n`;
      for (const item of items) {
        const done = item.status === "completed" ? " ✓" : "";
        const tooth = item.toothFdi ? ` (зуб ${item.toothFdi})` : "";
        context += `   • ${item.title}${tooth}: ${item.price.toLocaleString("ru")} ₸${done}\n`;
      }
    }
  }

  return context;
}

/**
 * Builds the system prompt for the dental_qa state.
 * Includes the patient's dental card data so the AI can answer specific questions.
 */
function buildDentalQaSystemPrompt(
  settings: Awaited<ReturnType<typeof getSettings>>,
  patientName: string,
  dentalContext: string,
): string {
  const si = (settings.stepInstructions ?? {}) as StepInstructions;
  const generalExtra = si.general ? `\n\nДополнительные инструкции клиники:\n${si.general}` : "";

  return `Ты — вежливый и профессиональный AI-ассистент стоматологической клиники 1Dent (Казахстан).
Пациент уже идентифицирован: его зовут ${patientName}.
Ты имеешь доступ к его карте зубов и истории лечения (см. ниже).
Отвечай коротко и понятно. Не ставь диагнозы. Используй фактическую информацию из карты.
Отвечай на том языке, на котором пишет пациент (русский, казахский или английский).${generalExtra}

${dentalContext}

ПРАВИЛА:
1. Отвечай на вопросы о состоянии зубов, планах лечения и процедурах, используя данные из карты.
2. Если пациент хочет записаться — уточни дату/время и предложи связаться с администратором.
3. Если вопрос выходит за рамки твоих данных или ты не можешь дать точный ответ — ответь ТОЛЬКО текстом: OPERATOR_NEEDED
4. Не придумывай цены, расписание или процедуры, которых нет в карте.`;
}

function buildPlaygroundPrompt(settings: Awaited<ReturnType<typeof getSettings>>): string {
  const si = (settings.stepInstructions ?? {}) as StepInstructions;
  const generalExtra = si.general ? `\n\nДополнительные инструкции клиники:\n${si.general}` : "";
  const kazakhNote = `\nВАЖНО: Пациент может писать на казахском языке обычными кириллическими буквами. Понимай такой текст как казахский и отвечай на казахском, если пациент пишет на казахском.`;

  const customInstructions = [
    si.greeting ? `Приветствие: ${si.greeting}` : null,
    si.collectName ? `Сбор имени: ${si.collectName}` : null,
    si.collectProblem ? `Описание проблемы: ${si.collectProblem}` : null,
    si.suggestDoctor ? `Предложение врача: ${si.suggestDoctor}` : null,
    si.confirm ? `Подтверждение: ${si.confirm}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const stepsExtra = customInstructions
    ? `\n\nПользовательские инструкции по этапам:\n${customInstructions}`
    : "";

  const now = new Date();
  const todayStr = now.toLocaleDateString("ru-KZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return `Ты — вежливый и профессиональный AI-ассистент стоматологической клиники 1Dent (Казахстан).
Отвечай коротко и по делу. Используй простой, дружелюбный язык. Не ставь диагнозы.
Отвечай на том языке, на котором пишет пациент (русский, казахский или английский).
Не придумывай информацию о клинике — цены, адрес и расписание уточняй у администратора.
Сегодня ${todayStr}.${kazakhNote}${generalExtra}${stepsExtra}

Веди диалог естественно: сначала поприветствуй пациента, затем узнай имя, проблему — и постепенно переходи к предложению записи. Определяй текущий этап разговора самостоятельно по контексту переписки.`;
}

function buildSystemPrompt(state: ChatbotState, settings: Awaited<ReturnType<typeof getSettings>>): string {
  const si = (settings.stepInstructions ?? {}) as StepInstructions;

  const generalExtra = si.general ? `\n\nДополнительные инструкции клиники:\n${si.general}` : "";

  const kazakhNote = `\nВАЖНО: Пациент может писать на казахском языке обычными кириллическими буквами вместо специфических казахских букв (ә→а/е, ғ→г, қ→к, ң→н, ө→о, ұ/ү→у, і→и). Например «салем» вместо «сәлем». Понимай такой текст как казахский и отвечай на казахском, если пациент пишет на казахском.`;

  const base = `Ты — вежливый и профессиональный AI-ассистент стоматологической клиники 1Dent (Казахстан).
Отвечай коротко и по делу. Используй простой, дружелюбный язык. Не ставь диагнозы.
Отвечай на том языке, на котором пишет пациент (русский, казахский или английский).
Не придумывай информацию о клинике — цены, адрес и расписание уточняй у администратора.${kazakhNote}${generalExtra}`;

  const now = new Date();
  const todayStr = now.toLocaleDateString("ru-KZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const defaults: Record<ChatbotState, string> = {
    greeting: `${base}\n\nТвоя задача: поприветствовать пациента и попросить ввести ИИН (12 цифр) — это обязательный шаг для идентификации. Используй шаблон: "${settings.greetingTemplate}"`,
    collect_iin: `${base}\n\nТы уже поприветствовал пациента и попросил ввести ИИН. ИИН — это 12 цифр и является обязательным для идентификации. Если пациент написал что-то кроме 12 цифр — вежливо попроси ввести именно ИИН.`,
    collect_name: `${base}\n\nТы уже поприветствовал пациента. Сейчас жди имя или помоги его уточнить если пациент написал что-то непонятное.`,
    collect_phone: `${base}\n\nТы знаешь имя пациента. Попроси его номер телефона для связи. Принимай номера в любом формате (+7, 8, с пробелами/дефисами).`,
    collect_problem: `${base}\n\nТы знаешь имя пациента. Твоя задача: узнать с какой проблемой или за какой услугой обращается пациент. Задавай уточняющие вопросы если нужно.`,
    suggest_doctor: `${base}\n\nТы подобрал врача на основе запроса пациента. Представь врача и предложи запись. Спроси подтверждение (Да/Нет). Казахский: иә/жарайды = да, жоқ/жок = нет.`,
    manage_appointment: `${base}\n\nУ пациента есть ближайшая запись. Спроси что он хочет сделать: перенести на другую дату, отменить запись или оставить как есть.`,
    show_slots: `${base}\n\nТы показываешь пациенту свободные слоты врача. Помоги пациенту выбрать удобное время.`,
    collect_datetime: `${base}\n\nСегодня ${todayStr}. Ты ждёшь от пациента предпочтительную дату и время визита. Казахские слова: ертең=завтра, бүгін=сегодня, жұма/жума=пятница, дүйсенбі=понедельник, сейсенбі=вторник, сәрсенбі=среда, бейсенбі=четверг, сенбі=суббота. Если пациент указал дату — подтверди её. Если неясно — вежливо попроси уточнить.`,
    confirm_appointment: `${base}\n\nПациент готов записаться. Попроси финальное подтверждение деталей записи.`,
    dental_qa: `${base}\n\nПациент идентифицирован. Отвечай на вопросы о состоянии его зубов и лечении по данным карты. Если вопрос вне твоих данных — ответь: OPERATOR_NEEDED`,
    done: `${base}\n\nЗапись подтверждена. Отвечай на вопросы о клинике или направляй к администратору.`,
    human_takeover: `${base}\n\nСоединяй пациента с администратором.`,
  };

  // State-specific custom instruction overrides base defaults if set
  const stateInstructionMap: Record<ChatbotState, keyof StepInstructions | null> = {
    greeting: "greeting",
    collect_iin: null,
    collect_name: "collectName",
    collect_phone: null,
    collect_problem: "collectProblem",
    suggest_doctor: "suggestDoctor",
    manage_appointment: null,
    show_slots: null,
    collect_datetime: null,
    confirm_appointment: "confirm",
    dental_qa: null,
    done: null,
    human_takeover: null,
  };
  const stateKey = stateInstructionMap[state];
  const customInstruction = stateKey ? si[stateKey] : undefined;

  const defaultPrompt = defaults[state] ?? base;
  return customInstruction ? `${base}\n\nИнструкции для этого этапа:\n${customInstruction}` : defaultPrompt;
}

// ─── ChatbotService (main export) ───────────────────────────────────────────

export class ChatbotService {
  async processMessage(
    clinicId: string,
    phone: string,
    text: string,
    options?: { skipRedAlert?: boolean },
  ): Promise<string | null> {
    let settings: Awaited<ReturnType<typeof getSettings>>;
    let managerExamples: ManagerExample[];
    try {
      [settings, managerExamples] = await Promise.all([
        getSettings(clinicId),
        getManagerExamples(clinicId),
      ]);
    } catch (err) {
      logger.error({ err }, "ChatbotService: failed to load settings");
      return null;
    }

    saveChatbotMessage(clinicId, phone, "inbound", text).catch(() => {});

    if (!settings.enabled) return null;

    let session = await loadSession(clinicId, phone);

    if (!session) {
      session = {
        id: randomUUID(),
        clinicId,
        phone,
        state: "greeting",
        data: {},
        humanTakeover: false,
      };
    }

    if (session.humanTakeover) return null;

    const state = session.state;
    const data = { ...session.data };

    // Parse ref code and click_id from any incoming message
    const refCode = extractRefCode(text);
    if (refCode && !data.refCode) {
      try {
        const channel = await channelsRepo.findByRefCode(refCode);
        if (channel && channel.clinicId === clinicId) {
          data.refCode = refCode;
          data.channelId = channel.id;
        }
      } catch (err) {
        logger.warn({ err }, "ChatbotService: failed to resolve ref code");
      }
    }

    const clickId = extractClickId(text);
    if (clickId && !data.clickId) {
      data.clickId = clickId;
    }

    // Operator request always takes priority
    if (isOperatorRequest(text)) {
      session.state = "human_takeover";
      session.data = data;
      session.humanTakeover = true;
      await saveSession(session);
      await this.notifyHumanTakeover(clinicId, phone, data.patientName);
      const takoverReply = "Соединяю вас с администратором. Пожалуйста, ожидайте — вам ответят в ближайшее время.";
      saveChatbotMessage(clinicId, phone, "outbound", takoverReply).catch(() => {});
      sendToPatient(clinicId, phone, takoverReply).catch(() => {});
      return takoverReply;
    }

    if (state === "done") {
      if (!options?.skipRedAlert && isRedAlert(text)) {
        await triggerRedAlert(clinicId, phone, text, data.createdPatientId);
        const alertReply = "🚨 Мы видим вашу проблему и передаём её администратору. Ожидайте, пожалуйста.";
        saveChatbotMessage(clinicId, phone, "outbound", alertReply).catch(() => {});
        sendToPatient(clinicId, phone, alertReply).catch(() => {});
        return alertReply;
      }
      const doneReply = "Рады вашему обращению! Если возникнут вопросы — пишите. Или напишите «оператор» для связи с администратором.";
      saveChatbotMessage(clinicId, phone, "outbound", doneReply).catch(() => {});
      sendToPatient(clinicId, phone, doneReply).catch(() => {});
      return doneReply;
    }

    let response: string | null = null;

    // Show typing indicator while AI processes — fire-and-forget so it never blocks
    sendTypingToPatient(clinicId, phone, true).catch(() => {});

    // Build conversation history for AI context
    const recentMessages = await this.getRecentHistory(clinicId, phone);

    switch (state) {
      case "greeting": {
        const greetingInstruction = (settings.stepInstructions as StepInstructions)?.greeting;
        if (greetingInstruction) {
          const aiGreeting = await generateChatbotResponse(
            buildSystemPrompt("greeting", settings),
            [],
            "Пациент впервые написал в чат. Поприветствуй его согласно инструкциям.",
            managerExamples,
          );
          response = aiGreeting ?? settings.greetingTemplate;
        } else {
          response = settings.greetingTemplate;
        }
        // IIN is the primary identifier — always required before proceeding
        response += "\n\nДля начала, пожалуйста, введите ваш ИИН (12 цифр).";
        session.state = "collect_iin";
        break;
      }

      case "collect_iin": {
        const digits = text.replace(/\D/g, "");
        if (digits.length === 12) {
          // Input looks like an IIN — try to find existing patient
          const [iinMatch] = await db
            .select()
            .from(patientsTable)
            .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.iin, digits)))
            .limit(1);

          if (iinMatch) {
            // Existing patient identified
            data.existingPatientId = iinMatch.id;
            data.patientName = iinMatch.name;

            // Check for nearest upcoming appointment
            const now = new Date();
            const [upcomingProc] = await db
              .select({
                id: proceduresTable.id,
                scheduledAt: proceduresTable.scheduledAt,
                doctorId: proceduresTable.doctorId,
              })
              .from(proceduresTable)
              .where(
                and(
                  eq(proceduresTable.clinicId, clinicId),
                  eq(proceduresTable.patientId, iinMatch.id),
                  eq(proceduresTable.status, "scheduled"),
                  gte(proceduresTable.scheduledAt, now),
                ),
              )
              .orderBy(asc(proceduresTable.scheduledAt))
              .limit(1);

            if (upcomingProc?.scheduledAt) {
              // Patient has an upcoming appointment — offer to manage it
              let doctorName = "врача";
              if (upcomingProc.doctorId) {
                const [doc] = await db
                  .select({ name: usersTable.name })
                  .from(usersTable)
                  .where(eq(usersTable.id, upcomingProc.doctorId))
                  .limit(1);
                if (doc) doctorName = doc.name;
              }
              const apptDate = upcomingProc.scheduledAt.toLocaleDateString("ru-KZ", {
                weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
              });
              data.existingProcedureId = upcomingProc.id;
              data.existingProcedureDate = apptDate;
              data.existingProcedureDoctorName = doctorName;

              const aiReply = await generateChatbotResponse(
                buildSystemPrompt("manage_appointment", settings),
                [],
                `Пациент ${iinMatch.name} вошёл. У него есть ближайшая запись к врачу ${doctorName} на ${apptDate}. Сообщи об этом и предложи: перенести на другую дату, отменить запись или оставить как есть.`,
                managerExamples,
              );
              response = aiReply ??
                `Добро пожаловать, ${iinMatch.name}! 👋\n\nУ вас запись к врачу *${doctorName}* на *${apptDate}*.\n\nЧто хотите сделать?\n• Перенести на другую дату\n• Отменить запись\n• Оставить как есть`;
              session.state = "manage_appointment";
            } else {
              // No upcoming appointment — start booking flow
              const aiReply = await generateChatbotResponse(
                buildSystemPrompt("collect_problem", settings),
                [],
                `Пациент ${iinMatch.name} вошёл по ИИН, активных записей нет. Поприветствуй его по имени и спроси, с чем он обращается или какую услугу хочет получить.`,
                managerExamples,
              );
              response = aiReply ??
                `Добро пожаловать, ${iinMatch.name}! 😊\nЧем могу помочь? Опишите, что вас беспокоит или какую услугу вы хотели бы получить.`;
              session.state = "collect_problem";
            }
          } else {
            // IIN not in DB — save it for later creation, ask for name
            data.collectedIin = digits;
            response = "К сожалению, по этому ИИН запись не найдена. Пожалуйста, напишите ваше имя — мы создадим новую запись.";
            session.state = "collect_name";
          }
        } else {
          // Not 12 digits — IIN is required, ask again
          response = "Пожалуйста, введите ваш ИИН — это 12 цифр (например: 123456789012). ИИН необходим для вашей идентификации.";
          // Stay in collect_iin state
        }
        session.data = data;
        break;
      }

      case "collect_name": {
        // Use AI to extract name from potentially complex input
        const classification0 = await classifyPatientRequest(text, recentMessages);
        const extractedName = classification0.extractedName ?? text.trim().slice(0, 60);
        data.patientName = extractedName;
        // If they already provided a phone in this message, save it
        if (classification0.extractedPhone) {
          data.collectedPhone = classification0.extractedPhone;
        }
        const aiReply0 = await generateChatbotResponse(
          buildSystemPrompt("collect_name", settings),
          recentMessages,
          text,
          managerExamples,
        );
        // If phone was already captured, skip collect_phone
        if (data.collectedPhone) {
          response = aiReply0 ?? `Приятно познакомиться, ${extractedName}! 😊\nОпишите вашу проблему или какую процедуру вы хотели бы пройти.`;
          session.state = "collect_problem";
        } else {
          response = aiReply0 ?? `Приятно познакомиться, ${extractedName}! 😊\nПожалуйста, укажите ваш номер телефона для связи.`;
          session.state = "collect_phone";
        }
        session.data = data;
        break;
      }

      case "collect_phone": {
        const classPhone = await classifyPatientRequest(text, recentMessages);
        if (classPhone.extractedPhone) {
          data.collectedPhone = classPhone.extractedPhone;
          const aiReplyPhone = await generateChatbotResponse(
            buildSystemPrompt("collect_phone", settings),
            recentMessages,
            text,
            managerExamples,
          );
          response = aiReplyPhone ?? `Отлично! Теперь опишите, что вас беспокоит или какую процедуру вы хотели бы пройти.`;
          session.state = "collect_problem";
        } else {
          response = `Пожалуйста, введите ваш номер телефона в формате +7XXXXXXXXXX или 8XXXXXXXXXX.`;
          // Stay in collect_phone
        }
        session.data = data;
        break;
      }

      case "collect_problem": {
        // AI classifies the request
        const classification = await classifyPatientRequest(text, recentMessages);
        data.problemDescription = text.trim().slice(0, 200);
        data.serviceType = classification.serviceType;
        data.urgency = classification.urgency;
        data.patientType = classification.patientType;
        data.aiConfidence = classification.confidence;

        logger.info(
          { clinicId, phone, classification },
          "[ChatbotService] AI classified patient request",
        );

        if (classification.confidence === "low") {
          // Low confidence → route to therapist (most general doctor in clinic)
          // Therapist = doctor with specialty matching "therapist"/"general"/"терапевт", else least loaded
          const therapist = await pickTherapist(clinicId);
          if (therapist) {
            data.suggestedDoctorId = therapist.id;
            data.suggestedDoctorName = therapist.name;
            const aiReply = await generateChatbotResponse(
              buildSystemPrompt("suggest_doctor", settings),
              recentMessages,
              `Пациент написал что-то неясное: "${text}". Мягко предложи запись к терапевту ${therapist.name} для первичного осмотра.`,
              managerExamples,
            );
            response = aiReply ?? `Понял! Для начала рекомендую записаться на консультацию к врачу *${therapist.name}* — он определит, какое лечение вам нужно.\n\nЗаписать вас? (Да / Нет)`;
            session.state = "suggest_doctor";
          } else {
            // No doctors at all — ask to clarify once more then escalate
            response = `Чтобы подобрать специалиста, уточните: что именно вас беспокоит?`;
          }
          session.data = data;
          break;
        }

        // Resolve returningPatientDoctorId: look up existing patient by phone to route back to same doctor
        let returningPatientDoctorId: string | undefined;
        if (classification.patientType === "returning") {
          const [existingPatient] = await db
            .select({ doctorId: patientsTable.doctorId })
            .from(patientsTable)
            .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, phone)))
            .limit(1);
          returningPatientDoctorId = existingPatient?.doctorId ?? undefined;
        }

        // High/medium confidence — pick best doctor with advanced scoring
        const scoringOpts: AdvancedScoringOptions = {
          serviceType: classification.serviceType,
          urgency: classification.urgency,
          patientType: classification.patientType,
          returningPatientDoctorId,
        };
        const doctor = await pickBestDoctorAdvanced(clinicId, scoringOpts);

        if (doctor) {
          data.suggestedDoctorId = doctor.id;
          data.suggestedDoctorName = doctor.name;

          const urgencyNote =
            classification.urgency === "urgent"
              ? " Вижу, что ситуация срочная — постараемся записать вас как можно скорее! 🚨"
              : "";

          const systemPrompt = buildSystemPrompt("suggest_doctor", settings);
          const context = `Пациент описал: ${classification.summary ?? text}. Рекомендуемый врач: ${doctor.name}. Предложи запись к этому врачу.`;
          const aiReply = await generateChatbotResponse(systemPrompt, recentMessages, context, managerExamples);
          response = aiReply ?? `Понял! Рекомендую врача *${doctor.name}*.${urgencyNote}\n\nЗаписать вас к нему? (Ответьте «Да» или «Нет»)`;
          session.state = "suggest_doctor";
        } else {
          response = `К сожалению, сейчас нет доступных врачей. Напишите «оператор», чтобы связаться с администратором.`;
        }

        session.data = data;
        break;
      }

      case "suggest_doctor": {
        if (isYes(text)) {
          data.confusedCount = 0;
          // Show available slots for the selected doctor
          let slotsText = "";
          if (data.suggestedDoctorId) {
            const slots = await getAvailableSlots(clinicId, data.suggestedDoctorId).catch(() => [] as Date[]);
            if (slots.length > 0) {
              slotsText = `\n\nБлижайшие свободные слоты:\n${formatSlots(slots)}\n\nИли укажите своё удобное время.`;
            }
          }
          const aiReply1 = await generateChatbotResponse(
            buildSystemPrompt("collect_datetime", settings),
            recentMessages,
            `Пациент согласен записаться к ${data.suggestedDoctorName ?? "врачу"}. Спроси удобную дату и время визита.`,
            managerExamples,
          );
          response = (aiReply1 ?? `Отлично! Когда вам удобно прийти к врачу *${data.suggestedDoctorName ?? ""}*?`) + slotsText;
          session.state = "collect_datetime";
        } else if (isNo(text)) {
          data.confusedCount = 0;
          response = "Понял. Опишите снова, что вас беспокоит, и я помогу подобрать специалиста?";
          session.state = "collect_problem";
        } else {
          // Ambiguous — AI interpretation with confusion counter
          const aiReply2 = await generateChatbotResponse(
            buildSystemPrompt("suggest_doctor", settings),
            recentMessages,
            text,
            managerExamples,
          );
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            response = "Соединяю вас с администратором — ожидайте ответа.";
          } else {
            response = aiReply2 ?? `Пожалуйста, ответьте «Да» для записи к врачу или «Нет» для отмены.`;
          }
        }
        break;
      }

      case "manage_appointment": {
        const lowerManage = text.toLowerCase().trim();
        const wantsReschedule = RESCHEDULE_KEYWORDS.some((kw) => lowerManage.includes(kw));
        const wantsCancel = CANCEL_KEYWORDS.some((kw) => lowerManage.includes(kw));
        const wantsKeep = isNo(text) || ["оставить", "всё хорошо", "все хорошо", "ничего", "қалдыру", "болсын", "жарайды"].some((kw) => lowerManage.includes(kw));

        if (wantsReschedule) {
          data.isReschedule = true;
          data.confusedCount = 0;
          // Show current doctor's available slots if we know the doctor
          let slotsText = "";
          if (data.suggestedDoctorId) {
            const slots = await getAvailableSlots(clinicId, data.suggestedDoctorId).catch(() => [] as Date[]);
            if (slots.length > 0) {
              slotsText = `\n\nСвободные слоты:\n${formatSlots(slots)}\n\nИли укажите своё удобное время.`;
            }
          }
          const aiReschedule = await generateChatbotResponse(
            buildSystemPrompt("collect_datetime", settings),
            recentMessages,
            `Пациент хочет перенести запись. Спроси новую дату и время визита.`,
            managerExamples,
          );
          response = (aiReschedule ?? `Хорошо! На какую дату и время вы хотите перенести запись?`) + slotsText;
          session.state = "collect_datetime";
        } else if (wantsCancel) {
          // Cancel the existing procedure
          if (data.existingProcedureId) {
            try {
              await db
                .update(proceduresTable)
                .set({ status: "cancelled" })
                .where(
                  and(
                    eq(proceduresTable.id, data.existingProcedureId),
                    eq(proceduresTable.clinicId, clinicId),
                  ),
                );
              logger.info({ procedureId: data.existingProcedureId }, "ChatbotService: procedure cancelled via chatbot");
            } catch (err) {
              logger.error({ err }, "ChatbotService: failed to cancel procedure");
            }
          }
          const aiCancel = await generateChatbotResponse(
            buildSystemPrompt("done", settings),
            recentMessages,
            `Пациент отменил запись к врачу ${data.existingProcedureDoctorName ?? ""}. Подтверди отмену и предложи записаться снова когда будет нужно.`,
            managerExamples,
          );
          response = aiCancel ?? `✅ Ваша запись к врачу *${data.existingProcedureDoctorName ?? ""}* отменена.\n\nЕсли захотите записаться снова — напишите нам. Будем рады помочь! 😊`;
          session.state = "done";
        } else if (wantsKeep || isYes(text)) {
          const aiKeep = await generateChatbotResponse(
            buildSystemPrompt("done", settings),
            recentMessages,
            `Пациент решил оставить запись как есть. Подтверди что запись сохранена и пожелай удачи.`,
            managerExamples,
          );
          response = aiKeep ?? `Отлично! Ваша запись остаётся в силе. Ждём вас! 😊\n\nЕсли возникнут вопросы — пишите.`;
          session.state = "done";
        } else {
          // Ambiguous
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            response = "Соединяю вас с администратором — ожидайте ответа.";
          } else {
            const aiManage = await generateChatbotResponse(
              buildSystemPrompt("manage_appointment", settings),
              recentMessages,
              text,
              managerExamples,
            );
            response = aiManage ?? `Пожалуйста, уточните: вы хотите *перенести*, *отменить* запись или *оставить* как есть?`;
          }
        }
        session.data = data;
        break;
      }

      case "collect_datetime": {
        const extractedDate = await extractDatetimeFromText(text).catch(() => null);
        if (extractedDate) {
          data.confusedCount = 0;
          try {
            if (data.isReschedule && data.existingProcedureId) {
              // Reschedule: update existing procedure's scheduledAt
              await db
                .update(proceduresTable)
                .set({ scheduledAt: extractedDate })
                .where(
                  and(
                    eq(proceduresTable.id, data.existingProcedureId),
                    eq(proceduresTable.clinicId, clinicId),
                  ),
                );
              logger.info(
                { procedureId: data.existingProcedureId, scheduledAt: extractedDate },
                "ChatbotService: procedure rescheduled via chatbot",
              );
              data.createdPatientId = data.existingPatientId;
            } else {
              // New booking: ensure patient exists, then create procedure
              let patientId = data.existingPatientId ?? data.createdPatientId;

              if (!patientId && data.patientName && data.suggestedDoctorId) {
                const patientSource = data.refCode ? `ref:${data.refCode}` : "whatsapp";
                const newPatient = await createPatient(
                  clinicId,
                  data.collectedPhone ?? phone,
                  data.patientName,
                  data.suggestedDoctorId,
                  patientSource,
                  data.collectedIin,
                );
                patientId = newPatient.id;
                data.createdPatientId = newPatient.id;

                if (data.clickId) {
                  channelsRepo
                    .linkClickToPatient(data.clickId, newPatient.id)
                    .catch((err) =>
                      logger.warn({ err, clickId: data.clickId }, "ChatbotService: failed to link click to patient"),
                    );
                }
              } else if (patientId && data.existingPatientId && data.suggestedDoctorId) {
                // Existing patient booking — update their doctor and status
                await db
                  .update(patientsTable)
                  .set({ doctorId: data.suggestedDoctorId, status: "new_request", updatedAt: new Date() })
                  .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, clinicId)));
              }

              if (patientId && data.suggestedDoctorId) {
                const serviceLabel =
                  data.serviceType && data.serviceType !== "unknown"
                    ? data.serviceType === "therapy" ? "Терапия"
                      : data.serviceType === "hygiene" ? "Гигиена"
                      : data.serviceType === "surgery" ? "Хирургия"
                      : data.serviceType === "orthopedics" ? "Ортопедия"
                      : data.serviceType === "orthodontics" ? "Ортодонтия"
                      : "Консультация"
                    : "Консультация";

                await db.insert(proceduresTable).values({
                  id: randomUUID(),
                  clinicId,
                  patientId,
                  doctorId: data.suggestedDoctorId,
                  name: serviceLabel,
                  scheduledAt: extractedDate,
                  price: 0,
                  status: "scheduled",
                });
                logger.info(
                  { patientId, doctorId: data.suggestedDoctorId, scheduledAt: extractedDate },
                  "ChatbotService: procedure created via chatbot",
                );
              }
            }
            session.data = data;
          } catch (err) {
            logger.error({ err }, "ChatbotService: failed to save procedure in collect_datetime");
          }

          const formattedDate = extractedDate.toLocaleDateString("ru-KZ", {
            weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
          });
          const doctorName = data.suggestedDoctorName ?? data.existingProcedureDoctorName ?? "врача";
          const aiDone = await generateChatbotResponse(
            buildSystemPrompt("done", settings),
            recentMessages,
            data.isReschedule
              ? `Запись перенесена на ${formattedDate} к врачу ${doctorName}. Подтверди перенос.`
              : `Запись создана к врачу ${doctorName} на ${formattedDate}. Поздравь пациента.`,
            managerExamples,
          );
          response = aiDone ??
            (data.isReschedule
              ? `✅ Ваша запись перенесена на *${formattedDate}* к врачу *${doctorName}*.\n\nЕсли нужно что-то ещё — пишите! 😊`
              : `✅ Запись подтверждена!\n\n👨‍⚕️ Врач: *${doctorName}*\n📅 Дата: *${formattedDate}*\n\nДо встречи в клинике 1Dent! Если возникнут вопросы — пишите сюда. 😊`);
          session.state = "done";
        } else {
          // Date not recognized
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            response = "Соединяю вас с администратором — он поможет выбрать удобное время.";
          } else {
            const aiDateRetry = await generateChatbotResponse(
              buildSystemPrompt("collect_datetime", settings),
              recentMessages,
              text,
              managerExamples,
            );
            response = aiDateRetry ?? `Не смог разобрать дату. Пожалуйста, напишите, например: «завтра в 11:00» или «пятница в 14:30».`;
          }
          session.data = data;
        }
        break;
      }

      case "confirm_appointment": {
        // Legacy state kept for backward compat — treat as collect_datetime
        if (isYes(text)) {
          data.confusedCount = 0;
          if (data.suggestedDoctorId && data.patientName) {
            try {
              if (data.existingPatientId) {
                await db
                  .update(patientsTable)
                  .set({ phone, doctorId: data.suggestedDoctorId, status: "new_request", updatedAt: new Date() })
                  .where(and(eq(patientsTable.id, data.existingPatientId), eq(patientsTable.clinicId, clinicId)));
                data.createdPatientId = data.existingPatientId;
              } else {
                const patientSource = data.refCode ? `ref:${data.refCode}` : "whatsapp";
                const patient = await createPatient(clinicId, phone, data.patientName, data.suggestedDoctorId, patientSource, data.collectedIin);
                data.createdPatientId = patient.id;
                if (data.clickId) {
                  channelsRepo.linkClickToPatient(data.clickId, patient.id).catch((err) =>
                    logger.warn({ err, clickId: data.clickId }, "ChatbotService: failed to link click to patient"),
                  );
                }
              }
              session.data = data;
            } catch (err) {
              logger.error({ err }, "ChatbotService: failed to create/update patient");
            }
          }
          const aiReply3 = await generateChatbotResponse(
            buildSystemPrompt("done", settings),
            recentMessages,
            `Запись подтверждена к врачу ${data.suggestedDoctorName ?? ""}. Поздравь пациента и скажи что администратор свяжется для уточнения времени.`,
            managerExamples,
          );
          response = aiReply3 ?? `✅ Запись подтверждена! Администратор свяжется с вами для уточнения времени визита.\n\nЕсли возникнут вопросы — пишите сюда. Мы на связи!`;
          session.state = "done";
        } else if (isNo(text)) {
          data.confusedCount = 0;
          data.suggestedDoctorId = undefined;
          data.suggestedDoctorName = undefined;
          session.data = { patientName: data.patientName };
          response = `Хорошо, отменяем. Опишите снова, что вас беспокоит, и я помогу подобрать специалиста.`;
          session.state = "collect_problem";
        } else {
          const aiReply4 = await generateChatbotResponse(
            buildSystemPrompt("confirm_appointment", settings),
            recentMessages,
            text,
            managerExamples,
          );
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            response = "Соединяю вас с администратором — ожидайте ответа.";
          } else {
            response = aiReply4 ?? `Пожалуйста, ответьте «Да» для подтверждения записи или «Нет» для отмены.`;
          }
        }
        break;
      }

      case "dental_qa": {
        // Known patient in Q&A mode: load their dental card and answer with AI
        const qaPatientId = data.existingPatientId;
        if (!qaPatientId) {
          // Session inconsistency — reset to greeting so patient can re-identify
          session.state = "greeting";
          session.data = {};
          session.humanTakeover = false;
          await saveSession(session);
          sendTypingToPatient(clinicId, phone, false).catch(() => {});
          const resetReply = "Произошла ошибка сессии. Пожалуйста, начните заново — введите ваш ИИН (12 цифр).";
          saveChatbotMessage(clinicId, phone, "outbound", resetReply).catch(() => {});
          sendToPatient(clinicId, phone, resetReply).catch(() => {});
          return resetReply;
        }

        const [qaPatient] = await db
          .select({ name: patientsTable.name })
          .from(patientsTable)
          .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.id, qaPatientId)))
          .limit(1);

        const qaName = qaPatient?.name ?? data.patientName ?? "пациент";
        const dentalContext = await loadPatientDentalContext(clinicId, qaPatientId).catch(() => "");

        const qaReply = await generateChatbotResponse(
          buildDentalQaSystemPrompt(settings, qaName, dentalContext),
          recentMessages,
          text,
          managerExamples,
        );

        if (!qaReply || qaReply.trim().startsWith("OPERATOR_NEEDED")) {
          // AI signals it can't answer this question — notify admin but keep chatbot active
          // so the patient can still ask other questions about their dental card.
          // Do NOT set humanTakeover = true here — that would permanently lock the chatbot.
          session.data = data;
          await saveSession(session);
          await this.notifyHumanTakeover(clinicId, phone, qaName);
          sendTypingToPatient(clinicId, phone, false).catch(() => {});
          const handoffReply =
            "Этот вопрос я передал администратору — он ответит в ближайшее время. 🙏\n\nЕсли у вас есть другие вопросы о вашей карте зубов или лечении — спрашивайте, я помогу!";
          saveChatbotMessage(clinicId, phone, "outbound", handoffReply).catch(() => {});
          sendToPatient(clinicId, phone, handoffReply).catch(() => {});
          return handoffReply;
        }

        response = qaReply;
        // Stay in dental_qa for follow-up questions
        break;
      }

      default:
        response = null;
    }

    session.data = data;
    await saveSession(session);

    // Stop typing indicator before sending (or when there is nothing to send)
    sendTypingToPatient(clinicId, phone, false).catch(() => {});

    if (response) {
      saveChatbotMessage(clinicId, phone, "outbound", response).catch(() => {});
      sendToPatient(clinicId, phone, response).catch((err) =>
        logger.error({ err }, "ChatbotService: failed to send WhatsApp reply"),
      );
    }

    return response;
  }

  /** Get recent chatbot message history for AI context */
  private async getRecentHistory(clinicId: string, phone: string): Promise<ChatMessage[]> {
    try {
      const messages = await db
        .select()
        .from(chatbotMessagesTable)
        .where(and(eq(chatbotMessagesTable.clinicId, clinicId), eq(chatbotMessagesTable.phone, phone)))
        .orderBy(asc(chatbotMessagesTable.createdAt))
        .limit(20);

      return messages.map((m) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.content,
      }));
    } catch {
      return [];
    }
  }

  private async notifyHumanTakeover(clinicId: string, phone: string, patientName?: string) {
    const recipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.clinicId, clinicId), inArray(usersTable.role, ["owner", "admin"])));

    if (recipients.length === 0) return;

    const name = patientName ?? phone;
    const msg = `👤 Пациент ${name} (${phone}) запросил переключение на оператора в чат-боте.`;

    await db.insert(notificationsTable).values(
      recipients.map((r) => ({
        id: randomUUID(),
        clinicId,
        userId: r.id,
        type: "system" as const,
        message: msg,
        read: false,
        patientId: null,
        messageId: null,
      })),
    );
  }

  async getSettings(clinicId: string) {
    return getSettings(clinicId);
  }

  async updateSettings(
    clinicId: string,
    updates: {
      enabled?: boolean;
      greetingTemplate?: string;
      followup24hTemplate?: string;
      followup72hTemplate?: string;
      followup168hTemplate?: string;
      stepInstructions?: StepInstructions;
    },
  ) {
    const settings = await getSettings(clinicId);
    const [updated] = await db
      .update(chatbotSettingsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chatbotSettingsTable.id, settings.id))
      .returning();
    // Invalidate cache
    settingsCache.delete(clinicId);
    return updated!;
  }

  // ─── Manager Examples CRUD ────────────────────────────────────────────────

  async listManagerExamples(clinicId: string) {
    return db
      .select()
      .from(chatbotManagerExamplesTable)
      .where(eq(chatbotManagerExamplesTable.clinicId, clinicId))
      .orderBy(asc(chatbotManagerExamplesTable.sortOrder), asc(chatbotManagerExamplesTable.createdAt));
  }

  async createManagerExample(clinicId: string, userMessage: string, managerResponse: string) {
    const [maxOrder] = await db
      .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
      .from(chatbotManagerExamplesTable)
      .where(eq(chatbotManagerExamplesTable.clinicId, clinicId));
    const sortOrder = ((maxOrder?.max ?? -1) as number) + 1;
    const [row] = await db
      .insert(chatbotManagerExamplesTable)
      .values({ id: randomUUID(), clinicId, userMessage, managerResponse, sortOrder })
      .returning();
    examplesCache.delete(clinicId);
    return row!;
  }

  async updateManagerExample(
    clinicId: string,
    id: string,
    updates: { userMessage?: string; managerResponse?: string },
  ) {
    const [row] = await db
      .update(chatbotManagerExamplesTable)
      .set(updates)
      .where(and(eq(chatbotManagerExamplesTable.id, id), eq(chatbotManagerExamplesTable.clinicId, clinicId)))
      .returning();
    examplesCache.delete(clinicId);
    return row ?? null;
  }

  async deleteManagerExample(clinicId: string, id: string) {
    await db
      .delete(chatbotManagerExamplesTable)
      .where(and(eq(chatbotManagerExamplesTable.id, id), eq(chatbotManagerExamplesTable.clinicId, clinicId)));
    examplesCache.delete(clinicId);
  }

  async reorderManagerExample(clinicId: string, id: string, newSortOrder: number) {
    const [row] = await db
      .update(chatbotManagerExamplesTable)
      .set({ sortOrder: newSortOrder })
      .where(and(eq(chatbotManagerExamplesTable.id, id), eq(chatbotManagerExamplesTable.clinicId, clinicId)))
      .returning();
    examplesCache.delete(clinicId);
    return row ?? null;
  }

  // ─── Test message (preview AI response with current settings) ─────────────

  async testMessage(
    clinicId: string,
    userMessage: string,
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
  ) {
    const [settings, managerExamples] = await Promise.all([
      getSettings(clinicId),
      getManagerExamples(clinicId),
    ]);
    const systemPrompt = buildPlaygroundPrompt(settings);
    const chatHistory = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const reply = await generateChatbotResponse(systemPrompt, chatHistory, userMessage, managerExamples);
    return reply ?? "AI не ответил. Проверьте API-ключ.";
  }

  async listSessions(clinicId: string) {
    const cutoff = new Date(Date.now() - SESSION_TTL_SECONDS * 1000);
    return db
      .select()
      .from(chatbotSessionsTable)
      .where(and(eq(chatbotSessionsTable.clinicId, clinicId), gte(chatbotSessionsTable.updatedAt, cutoff)))
      .orderBy(chatbotSessionsTable.updatedAt);
  }

  async listMessages(clinicId: string, phone: string) {
    return db
      .select()
      .from(chatbotMessagesTable)
      .where(and(eq(chatbotMessagesTable.clinicId, clinicId), eq(chatbotMessagesTable.phone, phone)))
      .orderBy(asc(chatbotMessagesTable.createdAt));
  }

  async clearSession(clinicId: string, phone: string) {
    await deleteRedisSession(clinicId, phone);
    await db
      .update(chatbotSessionsTable)
      .set({ state: "greeting", data: {}, humanTakeover: false, updatedAt: new Date() })
      .where(and(eq(chatbotSessionsTable.clinicId, clinicId), eq(chatbotSessionsTable.phone, phone)));
  }

  async hasActiveSession(clinicId: string, phone: string): Promise<boolean> {
    if (redis) {
      try {
        const exists = await redis.exists(`${REDIS_KEY_PREFIX}${clinicId}:${phone}`);
        if (exists) return true;
      } catch (_) { /* fall through */ }
    }
    const [row] = await db
      .select({ updatedAt: chatbotSessionsTable.updatedAt })
      .from(chatbotSessionsTable)
      .where(and(eq(chatbotSessionsTable.clinicId, clinicId), eq(chatbotSessionsTable.phone, phone)))
      .limit(1);

    if (!row) return false;
    const age = Date.now() - new Date(row.updatedAt).getTime();
    return age <= SESSION_TTL_SECONDS * 1000;
  }
}
