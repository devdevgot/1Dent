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
  clinicsTable,
  knowledgeSourcesTable,
  procedureTemplatesTable,
} from "@workspace/db";
import type { StepInstructions } from "@workspace/db";
import { eq, and, inArray, gte, lte, ne, asc, desc, sql } from "drizzle-orm";
import { isRedAlert } from "../../shared/whatsapp";
import { sendToPatient, sendTypingToPatient } from "../../shared/messaging";
import { getAlertQueue } from "../../shared/alert-queue";
import { logger } from "../../lib/logger";
import { pickBestDoctorAdvanced, type AdvancedScoringOptions } from "../analytics/analytics.repository";
import { ChannelsRepository } from "../channels/channels.repository";
import { classifyPatientRequest, generateChatbotResponse, extractDatetimeFromText, extractBranchFromText, type ChatMessage, type ManagerExample } from "./ai-classifier";
import type { ChatbotState, ChatbotSessionData } from "./chatbot.types";
import type { ChatbotSettings } from "@workspace/db";
import { STANDARD_SCRIPT_BLOCKS, type ScriptBlock } from "./script-templates";
import { openrouter, FAST_MODEL, withTimeout, parseLlmJson } from "../../lib/openrouter-client";
import { aiCreditsService } from "../../shared/ai-credits";
import { InsufficientAiCreditsError } from "../../shared/errors/index";
import {
  renderMindMapScript,
  buildActiveMindMapContext,
  findMindMapNodeByFsmState,
  matchMindMapBranch,
  resolveMindMapNodeIdForState,
  type ScriptMindMapData,
} from "./mindmap-utils";

type CachedSettings = { settings: ChatbotSettings; expiresAt: number };
type CachedExamples = { examples: ManagerExample[]; expiresAt: number };
type CachedKnowledge = { text: string; expiresAt: number };
type CachedDoctors = { text: string; expiresAt: number };
type CachedPriceList = { text: string; expiresAt: number };

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
  logger.info(
    "[ChatbotSession] REDIS_URL not set — using PostgreSQL session store. " +
      "For better latency under load, set REDIS_URL secret (e.g. Upstash, Redis Cloud, Replit Redis add-on).",
  );
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
      const date = s.toLocaleDateString("ru-KZ", { day: "numeric", month: "long", timeZone: "Asia/Almaty" });
      const time = s.toLocaleTimeString("ru-KZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });
      return `• ${day}, ${date} в ${time}`;
    })
    .join("\n");
}

interface DoctorWithSlots {
  name: string;
  specialty: string | null;
  slots: Date[];
}

async function getClinicDoctorsWithSlots(clinicId: string): Promise<DoctorWithSlots[]> {
  const doctors = await db
    .select({ id: usersTable.id, name: usersTable.name, specialty: usersTable.specialty })
    .from(usersTable)
    .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor")))
    .limit(10);

  if (doctors.length === 0) return [];

  const withSlots = await Promise.all(
    doctors.map(async (doc) => ({
      name: doc.name,
      specialty: doc.specialty ?? null,
      slots: await getAvailableSlots(clinicId, doc.id).catch(() => [] as Date[]),
    })),
  );

  return withSlots;
}

// Simple settings cache (60s TTL) to avoid DB on every message
const settingsCache = new Map<string, CachedSettings>();

// Manager examples cache (60s TTL) — shared across sessions
const examplesCache = new Map<string, CachedExamples>();

// Knowledge base cache (5min TTL) — refreshed lazily on each processMessage call
const knowledgeCache = new Map<string, CachedKnowledge>();

// Doctors cache (5min TTL)
const doctorsCache = new Map<string, CachedDoctors>();

// Price list cache (2min TTL) — clinic procedure templates with prices
const priceListCache = new Map<string, CachedPriceList>();

async function loadKnowledgeContext(clinicId: string): Promise<string> {
  const cached = knowledgeCache.get(clinicId);
  if (cached && cached.expiresAt > Date.now()) return cached.text;

  try {
    const sources = await db
      .select({ name: knowledgeSourcesTable.name, extractedText: knowledgeSourcesTable.extractedText })
      .from(knowledgeSourcesTable)
      .where(and(
        eq(knowledgeSourcesTable.clinicId, clinicId),
        eq(knowledgeSourcesTable.status, "ready"),
      ));

    if (sources.length === 0) {
      knowledgeCache.set(clinicId, { text: "", expiresAt: Date.now() + 5 * 60_000 });
      return "";
    }

    const text = sources
      .map((s) => `=== ${s.name} ===\n${(s.extractedText ?? "").slice(0, 4000)}`)
      .join("\n\n---\n\n");

    knowledgeCache.set(clinicId, { text, expiresAt: Date.now() + 5 * 60_000 });
    return text;
  } catch (err) {
    logger.warn({ err }, "[ChatbotService] loadKnowledgeContext failed — skipping knowledge injection");
    return "";
  }
}

async function loadDoctorsContext(clinicId: string): Promise<string> {
  const cached = doctorsCache.get(clinicId);
  if (cached && cached.expiresAt > Date.now()) return cached.text;

  try {
    const doctors = await db
      .select({ name: usersTable.name, specialty: usersTable.specialty, position: usersTable.position })
      .from(usersTable)
      .where(and(
        eq(usersTable.clinicId, clinicId),
        eq(usersTable.role, "doctor"),
        eq(usersTable.isActive, true),
      ));

    if (doctors.length === 0) {
      doctorsCache.set(clinicId, { text: "", expiresAt: Date.now() + 5 * 60_000 });
      return "";
    }

    const lines = doctors.map((d) => {
      const spec = d.specialty ?? d.position ?? "";
      return spec ? `• ${d.name} — ${spec}` : `• ${d.name}`;
    });
    const text = lines.join("\n");

    doctorsCache.set(clinicId, { text, expiresAt: Date.now() + 5 * 60_000 });
    return text;
  } catch (err) {
    logger.warn({ err }, "[ChatbotService] loadDoctorsContext failed — skipping doctors injection");
    return "";
  }
}

// Category names in Russian for price list formatting
const CATEGORY_LABELS: Record<string, string> = {
  diagnostics: "Диагностика",
  treatment: "Терапия",
  therapy: "Терапия",
  removal: "Удаление",
  extraction: "Удаление",
  surgery: "Хирургия",
  prosthetics: "Протезирование",
  implants: "Имплантология",
  implantology: "Имплантология",
  orthodontics: "Ортодонтия",
  hygiene: "Гигиена",
  cleaning: "Гигиена",
  cosmetic: "Эстетика",
  aesthetic: "Эстетика",
  pediatric: "Детская стоматология",
  children: "Детская стоматология",
  endodontics: "Эндодонтия",
  periodontology: "Пародонтология",
  other: "Прочее",
};

async function loadPriceListContext(clinicId: string): Promise<string> {
  const cached = priceListCache.get(clinicId);
  if (cached && cached.expiresAt > Date.now()) return cached.text;

  try {
    const templates = await db
      .select({
        name: procedureTemplatesTable.name,
        defaultPrice: procedureTemplatesTable.defaultPrice,
        category: procedureTemplatesTable.category,
      })
      .from(procedureTemplatesTable)
      .where(eq(procedureTemplatesTable.clinicId, clinicId))
      .orderBy(procedureTemplatesTable.category, procedureTemplatesTable.name);

    if (templates.length === 0) {
      priceListCache.set(clinicId, { text: "", expiresAt: Date.now() + 2 * 60_000 });
      return "";
    }

    // Group by category
    const grouped = new Map<string, Array<{ name: string; price: number }>>();
    for (const t of templates) {
      const cat = t.category ?? "other";
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push({ name: t.name, price: t.defaultPrice ?? 0 });
    }

    const lines: string[] = [];
    for (const [cat, items] of grouped) {
      const label = CATEGORY_LABELS[cat] ?? cat;
      const entries = items
        .map((i) => {
          const priceStr = i.price > 0
            ? `от ${Math.round(i.price).toLocaleString("ru")} ₸`
            : "цена по запросу";
          return `${i.name} — ${priceStr}`;
        })
        .join(", ");
      lines.push(`${label}: ${entries}`);
    }

    const text = lines.join("\n");
    priceListCache.set(clinicId, { text, expiresAt: Date.now() + 2 * 60_000 });
    return text;
  } catch (err) {
    logger.warn({ err }, "[ChatbotService] loadPriceListContext failed — skipping price injection");
    return "";
  }
}

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

  examplesCache.set(clinicId, { examples: rows, expiresAt: Date.now() + 10_000 });
  return rows;
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
    settingsCache.set(clinicId, { settings, expiresAt: Date.now() + 10_000 });
    return settings;
  }

  const id = randomUUID();
  const [created] = await db
    .insert(chatbotSettingsTable)
    .values({ id, clinicId })
    .onConflictDoNothing()
    .returning();

  if (created) {
    settingsCache.set(clinicId, { settings: created, expiresAt: Date.now() + 10_000 });
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
  status: "new_request" | "initial_consultation" = "new_request",
) {
  const id = randomUUID();
  const [patient] = await db
    .insert(patientsTable)
    .values({ id, clinicId, name, phone, iin: iin ?? null, source: source ?? "whatsapp", status, doctorId })
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
        timeZone: "Asia/Almaty",
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

function buildPlaygroundPrompt(
  settings: Awaited<ReturnType<typeof getSettings>>,
  doctorsWithSlots?: DoctorWithSlots[],
  clinicName?: string,
  knowledgeContext?: string,
  priceListContext?: string,
  playgroundOpts?: { fsmState?: ChatbotState; serviceType?: string; userText?: string },
): string {
  const kazakhNote = `ВАЖНО: Пациент может писать на казахском или русском. Отвечай строго на том языке, на котором пишет пациент.`;

  // Build doctors section
  let doctorsSection = "";
  if (doctorsWithSlots && doctorsWithSlots.length > 0) {
    doctorsSection = "\n\nВРАЧИ КЛИНИКИ (используй ТОЛЬКО этих врачей):\n";
    for (const doc of doctorsWithSlots) {
      const spec = doc.specialty ? ` — ${doc.specialty}` : "";
      doctorsSection += `• ${doc.name}${spec}\n`;
      if (doc.slots.length > 0) {
        const slotLine = doc.slots
          .map((s) => {
            const dayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
            const day = dayNames[s.getDay()];
            const date = s.toLocaleDateString("ru-KZ", { day: "numeric", month: "long", timeZone: "Asia/Almaty" });
            const time = s.toLocaleTimeString("ru-KZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });
            return `${day} ${date} в ${time}`;
          })
          .join(", ");
        doctorsSection += `  Свободные слоты: ${slotLine}\n`;
      } else {
        doctorsSection += `  Свободные слоты: нет на ближайшие 7 дней\n`;
      }
    }
  }

  // Resolve placeholder values for script block content
  const resolvedClinicName =
    clinicName ??
    settings.greetingTemplate?.match(/«(.+?)»/)?.[1] ??
    settings.greetingTemplate?.match(/"(.+?)"/)?.[1] ??
    "нашу клинику";
  const now = new Date();
  const todayDate = now.toLocaleDateString("ru-KZ", { day: "numeric", month: "long", timeZone: "Asia/Almaty" });
  const firstDoctor = doctorsWithSlots?.[0];
  const exampleDoctorName = firstDoctor?.name ?? "Иван Петров";
  const exampleTime =
    firstDoctor?.slots?.[0]?.toLocaleTimeString("ru-KZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }) ?? "14:00";
  const exampleDate =
    firstDoctor?.slots?.[0]?.toLocaleDateString("ru-KZ", { day: "numeric", month: "long", timeZone: "Asia/Almaty" }) ?? todayDate;

  const resolvePlaceholders = (text: string) =>
    text
      .replace(/\{\{clinic_name\}\}/g, resolvedClinicName)
      .replace(/\{\{date\}\}/g, exampleDate)
      .replace(/\{\{time\}\}/g, exampleTime)
      .replace(/\{\{doctor_name\}\}/g, exampleDoctorName);

  // Script blocks: use saved ones, fall back to standard blocks (never stepInstructions in playground)
  const savedBlocks = (settings.scriptBlocks ?? []) as ScriptBlock[];
  const activeBlocks = savedBlocks.length > 0 ? savedBlocks : STANDARD_SCRIPT_BLOCKS;
  const enabledBlocks = activeBlocks.filter((b) => b.enabled).sort((a, b) => a.order - b.order);

  let scriptContext = "\n\nСКРИПТ КЛИНИКИ (строго следуй этому скрипту):\n";
  for (const block of enabledBlocks) {
    scriptContext += `\n--- ${block.title.toUpperCase()} ---\n${resolvePlaceholders(block.content)}\n`;
  }

  const nowPlayground = new Date();
  const nowDateStr = nowPlayground.toLocaleDateString("ru-KZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" });
  const nowTimeStr = nowPlayground.toLocaleTimeString("ru-KZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });

  const priceListPlaygroundSection = priceListContext
    ? `\n\nПРАЙС-ЛИСТ КЛИНИКИ (официальные цены — используй для ответов о стоимости услуг):\n${priceListContext}\n\n⚠️ ПРАВИЛО РЕЛЕВАНТНОСТИ: Когда пациент спрашивает о конкретной услуге — называй цену ТОЛЬКО запрошенной услуги. Не перечисляй другие услуги.`
    : "";

  const knowledgeSection = knowledgeContext
    ? `\n\nМАТЕРИАЛЫ КЛИНИКИ (сайт, документы — дополнительный источник информации; цены берутся из ПРАЙС-ЛИСТА выше):\n${knowledgeContext}`
    : "";

  const mindMap = settings.scriptMindMap as ScriptMindMapData | undefined;
  const mindMapSection = renderMindMapScript(mindMap);
  const activeMindMapSection = playgroundOpts?.fsmState
    ? buildActiveMindMapContext(mindMap, playgroundOpts.fsmState, {
        serviceType: playgroundOpts.serviceType,
        userText: playgroundOpts.userText,
      })
    : "";
  // When a mind map exists it IS the script — skip standard/custom blocks to avoid conflict
  const effectiveScriptContext = mindMapSection ? "" : scriptContext;

    const systemPrompt = `Ты — AI-ассистент стоматологической клиники. Сейчас ТЕСТОВЫЙ РЕЖИМ (симуляция для проверки скрипта).
Текущее время: ${nowDateStr}, ${nowTimeStr} (Алматы/Астана).

⚠️ ЖЁСТКИЕ ПРАВИЛА ТЕСТОВОГО РЕЖИМА (приоритет выше скрипта):
1. НИ ПРИ КАКИХ УСЛОВИЯХ не проси ИИН, удостоверение или любой идентификатор — пациент уже идентифицирован
2. НЕ спрашивай имя или телефон в начале диалога — сразу узнай проблему
3. Если пациент согласился на запись и выбрал время — предложи ему выбрать филиал/адрес клиники из материалов, и только после выбора филиала подтверди запись с коротким саммари деталей
4. Отвечай коротко: 1–3 предложения максимум
5. Используй только информацию из материалов клиники и списка врачей — не придумывай
6. НИКОГДА не предлагай и не подтверждай время которое уже прошло (сейчас ${nowTimeStr}). Если пациент называет прошедшее время сегодня — объясни что оно уже прошло и предложи ближайший доступный слот. Все слоты в списке врачей уже являются будущими.
${kazakhNote}${doctorsSection}${priceListPlaygroundSection}${mindMapSection}${activeMindMapSection}${effectiveScriptContext}${knowledgeSection}`;
    return systemPrompt;
}

/** Renders the clinic's script blocks (same as playground) for injection into prompts. */
function renderScriptBlocks(
  settings: Awaited<ReturnType<typeof getSettings>>,
  clinicName?: string,
): string {
  const resolvedClinicName =
    clinicName ??
    settings.greetingTemplate?.match(/«(.+?)»/)?.[1] ??
    settings.greetingTemplate?.match(/"(.+?)"/)?.[1] ??
    "нашу клинику";
  const now = new Date();
  const todayDate = now.toLocaleDateString("ru-KZ", { day: "numeric", month: "long", timeZone: "Asia/Almaty" });

  const resolvePlaceholders = (text: string) =>
    text
      .replace(/\{\{clinic_name\}\}/g, resolvedClinicName)
      .replace(/\{\{date\}\}/g, todayDate)
      .replace(/\{\{time\}\}/g, "удобное вам время")
      .replace(/\{\{doctor_name\}\}/g, "вашего врача");

  const savedBlocks = (settings.scriptBlocks ?? []) as ScriptBlock[];
  const activeBlocks = savedBlocks.length > 0 ? savedBlocks : STANDARD_SCRIPT_BLOCKS;
  const enabledBlocks = activeBlocks.filter((b) => b.enabled).sort((a, b) => a.order - b.order);
  if (enabledBlocks.length === 0) return "";

  let out = "\n\nСКРИПТ КЛИНИКИ (используй как основу для ответов, придерживайся стиля и структуры):\n";
  for (const block of enabledBlocks) {
    out += `\n--- ${block.title.toUpperCase()} ---\n${resolvePlaceholders(block.content)}\n`;
  }
  return out;
}

function buildSystemPrompt(
  state: ChatbotState,
  settings: Awaited<ReturnType<typeof getSettings>>,
  opts?: {
    clinicName?: string;
    knowledgeContext?: string;
    doctorsContext?: string;
    priceListContext?: string;
    serviceType?: string;
    userText?: string;
    activeMindMapNodeId?: string;
  },
): string {
  const si = (settings.stepInstructions ?? {}) as StepInstructions;
  const generalExtra = si.general ? `\n\nДополнительные инструкции клиники:\n${si.general}` : "";

  const kazakhNote = `\nВАЖНО: Пациент может писать на казахском языке обычными кириллическими буквами вместо специфических казахских букв (ә→а/е, ғ→г, қ→к, ң→н, ө→о, ұ/ү→у, і→и). Например «салем» вместо «сәлем». Понимай такой текст как казахский и отвечай на казахском, если пациент пишет на казахском.`;

  const base = `Ты — вежливый и профессиональный AI-ассистент стоматологической клиники 1Dent (Казахстан).
Отвечай коротко и по делу (1–3 предложения). Используй простой, дружелюбный язык. Не ставь диагнозы.
Отвечай на том языке, на котором пишет пациент (русский, казахский или английский).
Не придумывай информацию о клинике — цены, адрес и расписание бери из скрипта ниже или уточняй у администратора.${kazakhNote}${generalExtra}`;

  const now = new Date();
  const todayStr = now.toLocaleDateString("ru-KZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" });
  const currentTimeStr = now.toLocaleTimeString("ru-KZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });
  const nowContext = `Сейчас: ${todayStr}, ${currentTimeStr} (Алматы/Астана).`;
  const timeRule = `ВАЖНО: никогда не предлагай и не подтверждай время которое уже прошло сегодня (сейчас ${currentTimeStr}). Если пациент называет прошедшее время — вежливо объясни что оно уже прошло и предложи ближайший доступный слот.`;

  const stateGuidance: Record<ChatbotState, string> = {
    greeting: `Сейчас этап: ПРИВЕТСТВИЕ. Поприветствуй пациента согласно блоку «Приветствие» в скрипте и сразу узнай, что его беспокоит или какая услуга интересует. НЕ проси ИИН, имя или телефон в начале — это создаёт барьер. Эти данные узнаешь позже, когда будешь оформлять запись.`,
    collect_iin: `Сейчас этап: ИДЕНТИФИКАЦИЯ ПО ИИН. Пациент хочет проверить свою существующую запись. Попроси ввести ИИН (12 цифр).`,
    collect_name: `Сейчас этап: ИМЯ ДЛЯ ЗАПИСИ. Пациент согласился на запись — попроси его представиться, чтобы оформить визит.`,
    collect_phone: `Сейчас этап: ТЕЛЕФОН. Попроси номер для связи в любом формате (+7, 8, с пробелами/дефисами).`,
    collect_problem: `Сейчас этап: МИНИ-ДИАГНОСТИКА. Если пациент жалуется на боль — задавай уточняющие вопросы по блоку «Мини-диагностика». Если запрос ясен (чистка, осмотр, конкретная процедура) — переходи к подбору врача. Используй ценовую информацию из блока «Ответы по услугам» если пациент спрашивает.`,
    suggest_doctor: `Сейчас этап: ПОДБОР ВРАЧА. Представь подобранного врача и предложи запись согласно блоку «Перевод в запись». Спроси подтверждение (Да/Нет). Казахский: иә/жарайды = да, жоқ/жок = нет.`,
    manage_appointment: `${nowContext} Сейчас этап: УПРАВЛЕНИЕ ЗАПИСЬЮ. У пациента есть ближайшая запись — спроси что он хочет сделать: перенести на другую дату, отменить запись или оставить как есть.`,
    show_slots: `${nowContext} Сейчас этап: ВЫБОР СЛОТА. Помоги пациенту выбрать удобное время из предложенных слотов. ${timeRule}`,
    collect_datetime: `${nowContext} Сейчас этап: ВЫБОР ВРЕМЕНИ. Жди от пациента дату и время визита. ${timeRule} Казахские слова: ертең=завтра, бүгін=сегодня, жұма/жума=пятница, дүйсенбі=понедельник, сейсенбі=вторник, сәрсенбі=среда, бейсенбі=четверг, сенбі=суббота.`,
    collect_branch: `Сейчас этап: ВЫБОР ФИЛИАЛА/АДРЕСА. Пациент выбрал время. Предложи ему доступные адреса/филиалы клиники (возьми их из источников/материалов клиники) и попроси выбрать удобный филиал.`,
    confirm_appointment: `${nowContext} Сейчас этап: ПОДТВЕРЖДЕНИЕ. Пациент готов записаться. Попроси финальное подтверждение деталей записи согласно блоку «Перевод в запись». ${timeRule}`,
    dental_qa: `Пациент идентифицирован. Отвечай на вопросы о состоянии его зубов и лечении по данным карты. Если вопрос вне твоих данных — ответь ТОЛЬКО: OPERATOR_NEEDED`,
    done: `Запись подтверждена. Отвечай на вопросы о клинике используя блок «Ответы по услугам» или направляй к администратору.`,
    human_takeover: `Соединяй пациента с администратором — больше не отвечай.`,
    reactivation: `Сейчас этап: РЕАКТИВАЦИЯ. Пациент не пришел на прием или отменил его. Твоя задача — вежливо выяснить причину (неудобное время, высокая цена, изменились планы) и предложить решение: перезапись на другое удобное время с предоставлением 10% скидки. Если пациент выражает готовность записаться — переводи его в выбор времени/даты.`,
  };

  // Optional state-specific override from clinic settings — appended as ADDITIONAL guidance
  // (no longer replaces the default — both work together so the clinic's tweaks layer on top).
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
    collect_branch: null,
    confirm_appointment: "confirm",
    dental_qa: null,
    done: null,
    human_takeover: null,
    reactivation: null,
  };
  const stateKey = stateInstructionMap[state];
  const customInstruction = stateKey ? si[stateKey] : undefined;
  const customExtra = customInstruction
    ? `\n\nДополнительные инструкции клиники для этого этапа:\n${customInstruction}`
    : "";

  const scriptContext = renderScriptBlocks(settings, opts?.clinicName);
  const mindMap = settings.scriptMindMap as ScriptMindMapData | undefined;
  const mindMapSection = renderMindMapScript(mindMap);
  const activeMindMapSection = buildActiveMindMapContext(mindMap, state, {
    serviceType: opts?.serviceType,
    userText: opts?.userText,
    activeNodeId: opts?.activeMindMapNodeId,
  });
  // When a mind map exists it IS the script — skip standard/custom blocks to avoid conflict
  const effectiveScriptContext = mindMapSection ? "" : scriptContext;

  const doctorsSection = opts?.doctorsContext
    ? `\n\nВРАЧИ КЛИНИКИ (используй ТОЛЬКО этих врачей при подборе специалиста — не придумывай других):\n${opts.doctorsContext}`
    : "";

  const priceListSection = opts?.priceListContext
    ? `\n\nПРАЙС-ЛИСТ КЛИНИКИ (официальные цены — используй для ответов о стоимости услуг):\n${opts.priceListContext}\n\n⚠️ ПРАВИЛО РЕЛЕВАНТНОСТИ: Когда пациент спрашивает о конкретной услуге (удаление, кариес, имплант, чистка и т.д.) — называй цену ТОЛЬКО запрошенной услуги. Не перечисляй другие услуги. Точно соответствуй запросу: спросили про удаление — дай цену удаления, про кариес — цену лечения кариеса, про имплант — цену имплантации.`
    : "";

  const knowledgeSection = opts?.knowledgeContext
    ? `\n\nМАТЕРИАЛЫ КЛИНИКИ (сайт, документы — дополнительный источник информации об услугах и особенностях клиники; цены берутся из ПРАЙС-ЛИСТА выше; информация о врачах — из раздела «ВРАЧИ КЛИНИКИ»):\n${opts.knowledgeContext}`
    : "";

  return `${base}\n\n${stateGuidance[state] ?? ""}${customExtra}${mindMapSection}${activeMindMapSection}${effectiveScriptContext}${doctorsSection}${priceListSection}${knowledgeSection}`;
}

async function isComplaintReply(text: string): Promise<boolean> {
  const systemPrompt = `Ты — AI-ассистент стоматологической клиники.
Пациент ответил на сообщение послеоперационного контроля (после удаления или лечения зуба).
Определи, есть ли у пациента жалобы на здоровье, боль, дискомфорт, кровотечение, температуру, отек или другие проблемы после процедуры.
Примеры жалоб: "болит зуб", "температура поднялась", "кровоточит десна", "мне плохо", "ісіп кетті", "ауырып тұр", "ноет десна".
Примеры нормы (всё хорошо): "всё хорошо", "спасибо, всё нормально", "рахмет, бәрі жақсы", "не болит", "отлично", "нормально всё".

Ответь строго JSON объектом:
{
  "hasComplaint": true или false
}`;

  try {
    const response = await withTimeout(
      openrouter.chat.completions.create({
        model: FAST_MODEL,
        max_tokens: 100,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
      10000,
      "isComplaintReply",
    );
    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = parseLlmJson<{ hasComplaint?: boolean }>(content);
    return !!parsed?.hasComplaint;
  } catch (err) {
    logger.warn({ err, text }, "[ChatbotService] isComplaintReply LLM check failed, falling back to keywords");
    const lower = text.toLowerCase();
    const hasNegation = /\b(не|нет|жоқ|жок|нормально|норма|отлично|жақсы|жаксы|рахмет|спасибо)\b/.test(lower);
    if (hasNegation) {
      return false;
    }
    const extraComplaintKeywords = [
      "болит", "ауырады", "температура", "қызу", "сыздап", "қан", "ісіп", "аурып", "мазалап", "ноет",
      "плохо", "жаман", "жәдім", "дерт", "дерті", "қызуым", "ыстық", "ауру", "ісік", "ауырды", "отек", "отёк", "пух"
    ];
    return extraComplaintKeywords.some((kw) => lower.includes(kw));
  }
}

async function isPositiveRepeatSaleReply(text: string): Promise<boolean> {
  const systemPrompt = `Ты — классификатор сообщений пациента стоматологии.
Определи, соглашается ли пациент на повторный прием, хочет ли записаться на консультацию/прием, или проявляет ли интерес к визиту в клинику в ответ на рассылку.
Примеры положительного ответа: "да", "давайте", "хочу записаться", "какое время есть", "жазылайын деп едім", "иә", "жазыңыз", "ok", "хорошо", "хочу прийти".
Примеры отрицательного/нейтрального ответа: "нет", "не надо", "спасибо, не хочу", "пока нет", "жоқ", "сызып тастаңыз".

Ответь строго JSON объектом:
{
  "agreed": true или false
}`;

  try {
    const response = await withTimeout(
      openrouter.chat.completions.create({
        model: FAST_MODEL,
        max_tokens: 100,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
      10000,
      "isPositiveRepeatSaleReply",
    );
    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = parseLlmJson<{ agreed?: boolean }>(content);
    return !!parsed?.agreed;
  } catch (err) {
    logger.warn({ err, text }, "[ChatbotService] isPositiveRepeatSaleReply classification failed, fallback to keyword check");
    const lower = text.toLowerCase();
    const positiveKeywords = ["да", "давайте", "запис", "хочу", "время", "ок", "хорошо", "иә", "жазы", "кел", "прийти", "приду", "yes", "ok", "agree"];
    const negativeKeywords = ["нет", "не надо", "не хочу", "жоқ", "кет", "отказ", "no", "stop"];
    for (const neg of negativeKeywords) {
      if (lower.includes(neg)) return false;
    }
    for (const pos of positiveKeywords) {
      if (lower.includes(pos)) return true;
    }
    return false;
  }
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
    let knowledgeContext: string;
    let doctorsContext: string;
    let priceListContext: string;
    try {
      [settings, managerExamples, knowledgeContext, doctorsContext, priceListContext] = await Promise.all([
        getSettings(clinicId),
        getManagerExamples(clinicId),
        loadKnowledgeContext(clinicId),
        loadDoctorsContext(clinicId),
        loadPriceListContext(clinicId),
      ]);
    } catch (err) {
      logger.error({ err }, "ChatbotService: failed to load settings");
      return null;
    }

    saveChatbotMessage(clinicId, phone, "inbound", text).catch(() => {});

    if (!settings.enabled) return null;

    try {
      await aiCreditsService.consumeCredits({ clinicId, feature: "chatbot_reply" });
    } catch (err) {
      if (err instanceof InsufficientAiCreditsError) {
        const exhaustedReply =
          "К сожалению, AI-кредиты клиники закончились. Администратору нужно докупить кредиты или сменить тариф в разделе «ИИ кредиты».";
        saveChatbotMessage(clinicId, phone, "outbound", exhaustedReply).catch(() => {});
        sendToPatient(clinicId, phone, exhaustedReply).catch(() => {});
        return exhaustedReply;
      }
      throw err;
    }

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

    const [patientDb] = await db
      .select()
      .from(patientsTable)
      .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, phone)))
      .limit(1);

    let state = session.state;
    let data = { ...session.data };

    // Local helper to build prompts with knowledge + doctors context pre-bound
    const sp = (promptState: ChatbotState, spOpts?: { clinicName?: string; userText?: string }) =>
      buildSystemPrompt(promptState, settings, {
        ...spOpts,
        knowledgeContext,
        doctorsContext,
        priceListContext,
        serviceType: data.serviceType,
        userText: spOpts?.userText ?? text,
        activeMindMapNodeId: data.activeMindMapNodeId,
      });

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

    if (patientDb) {
      if (patientDb.status === "post_op_monitoring") {
        const hasComplaint = await isComplaintReply(text);
        if (hasComplaint) {
          await triggerRedAlert(clinicId, phone, text, patientDb.id);
          session.state = "human_takeover";
          session.humanTakeover = true;
          session.data = data;
          await saveSession(session);
          await this.notifyHumanTakeover(clinicId, phone, patientDb.name);

          const replyText = "Мы видим, что вас беспокоит самочувствие после процедуры. Я уже передал эту информацию нашему дежурному администратору, он свяжется с вами в приоритетном порядке! Пожалуйста, будьте на связи.";
          saveChatbotMessage(clinicId, phone, "outbound", replyText).catch(() => {});
          sendToPatient(clinicId, phone, replyText).catch(() => {});
          return replyText;
        } else {
          await db
            .update(patientsTable)
            .set({ status: "completed", updatedAt: new Date() })
            .where(eq(patientsTable.id, patientDb.id));

          session.state = "done";
          session.data = data;
          await saveSession(session);

          const replyText = "Отлично! Рады, что у вас всё хорошо. Желаем вам скорейшего восстановления и крепкого здоровья! Если возникнут вопросы — пишите, мы всегда рядом.";
          saveChatbotMessage(clinicId, phone, "outbound", replyText).catch(() => {});
          sendToPatient(clinicId, phone, replyText).catch(() => {});
          return replyText;
        }
      } else if (patientDb.status === "repeat_sale") {
        const agreed = await isPositiveRepeatSaleReply(text);
        if (agreed) {
          await db
            .update(patientsTable)
            .set({ status: "initial_consultation", updatedAt: new Date() })
            .where(eq(patientsTable.id, patientDb.id));

          session.state = "collect_problem";
          session.data = {
            ...data,
            existingPatientId: patientDb.id,
            patientName: patientDb.name,
          };
          await saveSession(session);

          state = session.state;
          data = session.data;
        } else {
          session.state = "done";
          session.data = data;
          await saveSession(session);

          const replyText = "Хорошо! Если решите записаться на осмотр позже, просто напишите нам. Будем рады помочь вам в любое время!";
          saveChatbotMessage(clinicId, phone, "outbound", replyText).catch(() => {});
          sendToPatient(clinicId, phone, replyText).catch(() => {});
          return replyText;
        }
      }
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
        // Compute a script-based greeting fallback (NOT the legacy IIN-asking greetingTemplate).
        const scriptGreeting = (() => {
          const blocks = ((settings.scriptBlocks ?? []) as ScriptBlock[]);
          const active = blocks.length > 0 ? blocks : STANDARD_SCRIPT_BLOCKS;
          const greet = active.find((b) => b.id === "greeting" && b.enabled);
          const clinicName =
            settings.greetingTemplate?.match(/«(.+?)»/)?.[1] ??
            settings.greetingTemplate?.match(/"(.+?)"/)?.[1] ??
            "нашу клинику";
          return (greet?.content ?? STANDARD_SCRIPT_BLOCKS[0]!.content)
            .replace(/\{\{clinic_name\}\}/g, clinicName);
        })();

        // Identify patient by WhatsApp phone first — no need to ask for IIN if we already know them.
        const [existingByPhone] = await db
          .select()
          .from(patientsTable)
          .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, phone)))
          .limit(1);

        if (existingByPhone) {
          data.existingPatientId = existingByPhone.id;
          data.patientName = existingByPhone.name;

          // Check for upcoming appointment
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
                eq(proceduresTable.patientId, existingByPhone.id),
                eq(proceduresTable.status, "scheduled"),
                gte(proceduresTable.scheduledAt, now),
              ),
            )
            .orderBy(asc(proceduresTable.scheduledAt))
            .limit(1);

          if (upcomingProc?.scheduledAt) {
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
              weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty",
            });
            data.existingProcedureId = upcomingProc.id;
            data.existingProcedureDate = apptDate;
            data.existingProcedureDoctorName = doctorName;

            const aiReply = await generateChatbotResponse(
              sp("manage_appointment"),
              [{ role: "user" as const, content: text }],
              `Пациент ${existingByPhone.name} написал. У него уже есть запись к врачу ${doctorName} на ${apptDate}. Поздоровайся по имени, сообщи о записи и предложи: перенести / отменить / оставить как есть.`,
              managerExamples,
            );
            response = aiReply ??
              `Здравствуйте, ${existingByPhone.name}! 👋\n\nУ вас запись к врачу *${doctorName}* на *${apptDate}*.\n\nЧто хотите сделать?\n• Перенести\n• Отменить\n• Оставить как есть`;
            session.state = "manage_appointment";
            session.data = data;
            break;
          }

          // Returning patient, no upcoming → straight to problem collection
          const aiReply = await generateChatbotResponse(
            sp("collect_problem"),
            [{ role: "user" as const, content: text }],
            `Пациент ${existingByPhone.name} написал в чат — вы уже знаете его. Поздоровайся по имени и спроси, чем можешь помочь.`,
            managerExamples,
          );
          response = aiReply ?? `Здравствуйте, ${existingByPhone.name}! 😊 Чем могу помочь?`;
          session.state = "collect_problem";
          session.data = data;
          break;
        }

        // New patient (not found by phone). Detect if they want to manage an existing
        // appointment ("моя запись", "перенести", "отменить") — if so, route to IIN identification.
        const lowerFirst = text.toLowerCase();
        const wantsExistingAppt =
          /\b(моя запись|мою запись|мои записи|перенест|отменит|отмена|отменя|записан|жазылған|жылжыту|болдырмау)\b/.test(
            lowerFirst,
          );

        if (wantsExistingAppt) {
          const aiAskIin = await generateChatbotResponse(
            sp("collect_iin"),
            [],
            `Пациент написал: "${text}". Похоже, он хочет проверить или изменить существующую запись, но мы не нашли его по номеру телефона. Поздоровайся и попроси ввести ИИН (12 цифр) для идентификации.`,
            managerExamples,
          );
          response =
            aiAskIin ??
            "Здравствуйте! 👋 Чтобы найти вашу запись, пожалуйста, введите ваш ИИН (12 цифр).";
          session.state = "collect_iin";
          break;
        }

        // Otherwise — new patient, greet and process their actual first message as the patient input
        // so the model can immediately address what they wrote (not just send a generic greeting).
        const aiGreeting = await generateChatbotResponse(
          sp("greeting"),
          [],
          text,
          managerExamples,
        );
        response = aiGreeting ?? scriptGreeting;
        session.state = "collect_problem";
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
                weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty",
              });
              data.existingProcedureId = upcomingProc.id;
              data.existingProcedureDate = apptDate;
              data.existingProcedureDoctorName = doctorName;

              const aiReply = await generateChatbotResponse(
                sp("manage_appointment"),
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
                sp("collect_problem"),
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

        // If we already have a suggested doctor, the patient is mid-booking — go to datetime selection.
        if (data.suggestedDoctorId) {
          let slotsText = "";
          const slots = await getAvailableSlots(clinicId, data.suggestedDoctorId).catch(() => [] as Date[]);
          if (slots.length > 0) {
            slotsText = `\n\nБлижайшие свободные слоты:\n${formatSlots(slots)}\n\nИли укажите своё удобное время.`;
          }
          const aiAskTime = await generateChatbotResponse(
            sp("collect_datetime"),
            recentMessages,
            `Имя пациента: ${extractedName}. Записываем к врачу ${data.suggestedDoctorName ?? ""}. Спроси удобную дату и время визита.`,
            managerExamples,
          );
          response = (aiAskTime ?? `Приятно познакомиться, ${extractedName}! 😊\nКогда вам удобно прийти к врачу *${data.suggestedDoctorName ?? ""}*?`) + slotsText;
          session.state = "collect_datetime";
          session.data = data;
          break;
        }

        // No doctor yet — fall back to collecting the problem first
        const aiReply0 = await generateChatbotResponse(
          sp("collect_problem"),
          recentMessages,
          `Имя пациента: ${extractedName}. Спроси, чем он обеспокоен или какая услуга нужна.`,
          managerExamples,
        );
        response = aiReply0 ?? `Приятно познакомиться, ${extractedName}! 😊\nПодскажите, что вас беспокоит?`;
        session.state = "collect_problem";
        session.data = data;
        break;
      }

      case "collect_phone": {
        const classPhone = await classifyPatientRequest(text, recentMessages);
        if (classPhone.extractedPhone) {
          data.collectedPhone = classPhone.extractedPhone;
          const aiReplyPhone = await generateChatbotResponse(
            sp("collect_phone"),
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

        const mindMapData = settings.scriptMindMap as ScriptMindMapData | undefined;
        const problemNode = findMindMapNodeByFsmState(mindMapData, "collect_problem");
        if (problemNode) {
          const branch = matchMindMapBranch(mindMapData, problemNode.id, {
            serviceType: classification.serviceType,
            userText: text,
          });
          data.activeMindMapNodeId = branch?.node.id ?? problemNode.id;
        } else {
          data.activeMindMapNodeId = resolveMindMapNodeIdForState(mindMapData, "collect_problem", {
            serviceType: classification.serviceType,
            userText: text,
          });
        }

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
              sp("suggest_doctor"),
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

          const systemPrompt = sp("suggest_doctor");
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

          // If we don't yet know the patient's name (new patient), ask for it before collecting time.
          if (!data.patientName && !data.existingPatientId) {
            const aiAskName = await generateChatbotResponse(
              sp("collect_name"),
              recentMessages,
              `Пациент согласен записаться к ${data.suggestedDoctorName ?? "врачу"}. Спроси, как к нему обращаться, чтобы оформить запись.`,
              managerExamples,
            );
            response = aiAskName ?? `Отлично! Подскажите, как к вам обращаться?`;
            session.state = "collect_name";
            session.data = data;
            break;
          }

          // Show available slots for the selected doctor
          let slotsText = "";
          if (data.suggestedDoctorId) {
            const slots = await getAvailableSlots(clinicId, data.suggestedDoctorId).catch(() => [] as Date[]);
            if (slots.length > 0) {
              slotsText = `\n\nБлижайшие свободные слоты:\n${formatSlots(slots)}\n\nИли укажите своё удобное время.`;
            }
          }
          const aiReply1 = await generateChatbotResponse(
            sp("collect_datetime"),
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
            sp("suggest_doctor"),
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
            sp("collect_datetime"),
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
            sp("done"),
            recentMessages,
            `Пациент отменил запись к врачу ${data.existingProcedureDoctorName ?? ""}. Подтверди отмену и предложи записаться снова когда будет нужно.`,
            managerExamples,
          );
          response = aiCancel ?? `✅ Ваша запись к врачу *${data.existingProcedureDoctorName ?? ""}* отменена.\n\nЕсли захотите записаться снова — напишите нам. Будем рады помочь! 😊`;
          session.state = "done";
        } else if (wantsKeep || isYes(text)) {
          const aiKeep = await generateChatbotResponse(
            sp("done"),
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
              sp("manage_appointment"),
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
          data.preferredDatetime = extractedDate.toISOString();
          session.data = data;

          const formattedDate = extractedDate.toLocaleDateString("ru-KZ", {
            weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty",
          });

          // Propose the branch/address first
          const aiReplyBranch = await generateChatbotResponse(
            sp("collect_branch"),
            recentMessages,
            `Пациент выбрал время: ${formattedDate}. Теперь вежливо предложи ему выбрать один из адресов/филиалов клиники из материалов клиники.`,
            managerExamples,
          );
          response = aiReplyBranch ?? `В какой из наших филиалов вам будет удобнее подойти?`;
          session.state = "collect_branch";
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
              sp("collect_datetime"),
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

      case "collect_branch": {
        const selectedBranch = await extractBranchFromText(text, knowledgeContext).catch(() => null);

        if (selectedBranch || text.trim().length > 3) {
          data.confusedCount = 0;
          const branchToSave = selectedBranch || text.trim();
          data.selectedBranch = branchToSave;

          const preferredDate = data.preferredDatetime ? new Date(data.preferredDatetime) : new Date();

          try {
            if (data.isReschedule && data.existingProcedureId) {
              // Reschedule: update existing procedure
              await db
                .update(proceduresTable)
                .set({ 
                  scheduledAt: preferredDate,
                  notes: `Перенос. Филиал: ${branchToSave}`
                })
                .where(
                  and(
                    eq(proceduresTable.id, data.existingProcedureId),
                    eq(proceduresTable.clinicId, clinicId),
                  ),
                );
              logger.info(
                { procedureId: data.existingProcedureId, scheduledAt: preferredDate, branch: branchToSave },
                "ChatbotService: procedure rescheduled via chatbot with branch",
              );
              data.createdPatientId = data.existingPatientId;
            } else {
              // New booking
              let patientId = data.existingPatientId ?? data.createdPatientId;

              if (!patientId && data.patientName && data.suggestedDoctorId) {
                const newPatient = await createPatient(
                  clinicId,
                  data.collectedPhone ?? phone,
                  data.patientName,
                  data.suggestedDoctorId,
                  "whatsapp",
                  data.collectedIin,
                  "initial_consultation",
                );
                patientId = newPatient.id;
                data.createdPatientId = newPatient.id;
              } else if (patientId && data.existingPatientId && data.suggestedDoctorId) {
                await db
                  .update(patientsTable)
                  .set({ doctorId: data.suggestedDoctorId, status: "initial_consultation", updatedAt: new Date() })
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

                const procedureId = randomUUID();
                await db.insert(proceduresTable).values({
                  id: procedureId,
                  clinicId,
                  patientId,
                  doctorId: data.suggestedDoctorId,
                  name: serviceLabel,
                  scheduledAt: preferredDate,
                  price: 0,
                  status: "scheduled",
                  notes: `Филиал: ${branchToSave}`,
                });
                logger.info(
                  { patientId, doctorId: data.suggestedDoctorId, scheduledAt: preferredDate, branch: branchToSave },
                  "ChatbotService: procedure created via chatbot with branch",
                );

                // Notify staff
                const staffRecipients = await db
                  .select({ id: usersTable.id })
                  .from(usersTable)
                  .where(and(eq(usersTable.clinicId, clinicId), inArray(usersTable.role, ["owner", "admin"])));
                if (staffRecipients.length > 0) {
                  const apptDateStr = preferredDate.toLocaleDateString("ru-KZ", {
                    weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty",
                  });
                  const notifMsg = `📅 Новая запись: ${data.patientName ?? phone} → ${data.suggestedDoctorName ?? "врач"} (${serviceLabel}), ${apptDateStr}. Филиал: ${branchToSave}`;
                  await db.insert(notificationsTable).values(
                    staffRecipients.map((r) => ({
                      id: randomUUID(),
                      clinicId,
                      userId: r.id,
                      type: "system" as const,
                      message: notifMsg,
                      read: false,
                      patientId: patientId ?? null,
                      messageId: null,
                    })),
                  ).catch((err) => logger.warn({ err }, "ChatbotService: failed to insert notification"));
                }
              }
            }
            session.data = data;
          } catch (err) {
            logger.error({ err }, "ChatbotService: failed to save procedure in collect_branch");
          }

          const formattedDate = preferredDate.toLocaleDateString("ru-KZ", {
            weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty",
          });
          const doctorName = data.suggestedDoctorName ?? data.existingProcedureDoctorName ?? "врача";

          const summaryInstruction = data.isReschedule
            ? `Запись успешно ПЕРЕНЕСЕНА. Подтверди детали записи (Филиал: ${branchToSave}, Врач: ${doctorName}, Дата и время: ${formattedDate}). Выдай финальное краткое саммари.`
            : `Запись успешно ПОДТВЕРЖДЕНА. Поздравь пациента, укажи филиал: ${branchToSave}, врача: ${doctorName}, дату и время: ${formattedDate}. Предоставь краткое понятное саммари записи.`;

          const aiDone = await generateChatbotResponse(
            sp("done"),
            recentMessages,
            summaryInstruction,
            managerExamples,
          );

          response = aiDone ??
            (data.isReschedule
              ? `✅ Ваша запись успешно перенесена!\n\n📅 Время: *${formattedDate}*\n👨‍⚕️ Врач: *${doctorName}*\n📍 Филиал: *${branchToSave}*\n\nБудем ждать вас! 😊`
              : `✅ Запись успешно подтверждена!\n\n📅 Дата и время: *${formattedDate}*\n👨‍⚕️ Врач: *${doctorName}*\n📍 Филиал: *${branchToSave}*\n\nДо встречи в клинике! 😊`);

          session.state = "done";
        } else {
          // Branch not recognized
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            response = "Соединяю вас с администратором — он поможет выбрать удобный филиал.";
          } else {
            const aiBranchRetry = await generateChatbotResponse(
              sp("collect_branch"),
              recentMessages,
              `Пациент написал неразборчивый ответ: "${text}". Вежливо переспроси, какой филиал/адрес клиники он выбирает.`,
              managerExamples,
            );
            response = aiBranchRetry ?? `Пожалуйста, уточните филиал/адрес из списка предложенных.`;
          }
          session.data = data;
        }
        break;
      }

      case "confirm_appointment": {
        // Legacy state — when patient says yes, ask for datetime and create real procedure
        if (isYes(text)) {
          data.confusedCount = 0;
          // Pre-create patient record so collect_datetime can attach the procedure
          if (data.suggestedDoctorId && data.patientName && !data.existingPatientId && !data.createdPatientId) {
            try {
              const patient = await createPatient(clinicId, phone, data.patientName, data.suggestedDoctorId, "whatsapp", data.collectedIin, "initial_consultation");
              data.createdPatientId = patient.id;
              session.data = data;
            } catch (err) {
              logger.error({ err }, "ChatbotService: failed to create patient in confirm_appointment");
            }
          }
          // Ask for preferred time — collect_datetime will create the procedure
          let slotsText = "";
          if (data.suggestedDoctorId) {
            const slots = await getAvailableSlots(clinicId, data.suggestedDoctorId).catch(() => [] as Date[]);
            if (slots.length > 0) {
              slotsText = `\n\nБлижайшие свободные слоты:\n${formatSlots(slots)}\n\nИли укажите своё удобное время.`;
            }
          }
          const aiReply3 = await generateChatbotResponse(
            sp("collect_datetime"),
            recentMessages,
            `Пациент согласен записаться к ${data.suggestedDoctorName ?? "врачу"}. Спроси удобную дату и время визита.`,
            managerExamples,
          );
          response = (aiReply3 ?? `Отлично! Когда вам удобно прийти к врачу *${data.suggestedDoctorName ?? ""}*?`) + slotsText;
          session.state = "collect_datetime";
        } else if (isNo(text)) {
          data.confusedCount = 0;
          data.suggestedDoctorId = undefined;
          data.suggestedDoctorName = undefined;
          session.data = { patientName: data.patientName };
          response = `Хорошо, отменяем. Опишите снова, что вас беспокоит, и я помогу подобрать специалиста.`;
          session.state = "collect_problem";
        } else {
          const aiReply4 = await generateChatbotResponse(
            sp("confirm_appointment"),
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

      case "reactivation": {
        // The patient replied to our reactivation message.
        // Use AI to generate the next response.
        const classification = await classifyPatientRequest(text, recentMessages);
        
        // If patient wants to reschedule / book:
        const lowerText = text.toLowerCase();
        const wantsBook = isYes(text) || /\b(перенести|записать|запись|время|дата|давай|хочу|жазылу|уақыт)\b/.test(lowerText);
        
        if (wantsBook) {
          // If we have a doctor, show their slots
          let slotsText = "";
          if (data.suggestedDoctorId) {
            const slots = await getAvailableSlots(clinicId, data.suggestedDoctorId).catch(() => [] as Date[]);
            if (slots.length > 0) {
              slotsText = `\n\nСвободные слоты к врачу *${data.suggestedDoctorName ?? ""}*:\n${formatSlots(slots)}\n\nИли укажите другое удобное время.`;
            }
          }
          const aiReply = await generateChatbotResponse(
            sp("collect_datetime"),
            recentMessages,
            `Пациент согласен перезаписаться. Спроси новую дату и время визита.`,
            managerExamples,
          );
          response = (aiReply ?? `Отлично! Какое время и дата будут для вас удобны?`) + slotsText;
          session.state = "collect_datetime";
        } else if (isNo(text) || /\b(нет|не надо|жоқ|керек емес)\b/.test(lowerText)) {
          // Patient does not want to book
          const aiReply = await generateChatbotResponse(
            sp("done"),
            recentMessages,
            `Пациент отказался от перезаписи. Вежливо попрощайся и скажи, что мы всегда на связи если он передумает.`,
            managerExamples,
          );
          response = aiReply ?? `Хорошо, я вас понял. Если в будущем решите записаться — пишите нам в любое время. Всего вам доброго! 😊`;
          session.state = "done";
        } else {
          // General AI response for explaining the reason of no-show / negotiation
          const aiReply = await generateChatbotResponse(
            sp("reactivation"),
            recentMessages,
            text,
            managerExamples,
          );
          response = aiReply ?? `Я вас понял. Хотите ли вы выбрать другое время для визита? Мы сохраним для вас скидку 10%.`;
          // Stay in reactivation state
        }
        break;
      }

      default:
        response = null;
    }

    const mindMapForSync = settings.scriptMindMap as ScriptMindMapData | undefined;
    data.activeMindMapNodeId = resolveMindMapNodeIdForState(
      mindMapForSync,
      session.state as ChatbotState,
      {
        serviceType: data.serviceType,
        userText: text,
        activeNodeId: data.activeMindMapNodeId,
      },
    );

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

  async triggerReactivation(
    clinicId: string,
    patientId: string,
    procedureId: string,
  ): Promise<void> {
    const settings = await getSettings(clinicId);
    if (!settings.enabled) return;

    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.id, patientId)))
      .limit(1);

    if (!patient || !patient.phone) return;

    const [procedure] = await db
      .select()
      .from(proceduresTable)
      .where(and(eq(proceduresTable.clinicId, clinicId), eq(proceduresTable.id, procedureId)))
      .limit(1);

    if (!procedure) return;

    let doctorName = "врача";
    if (procedure.doctorId) {
      const [doc] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, procedure.doctorId))
        .limit(1);
      if (doc) doctorName = doc.name;
    }

    const patientName = patient.name;
    const procedureName = procedure.name;

    logger.info(
      { clinicId, patientId, phone: patient.phone, procedureId },
      "ChatbotService: triggering reactivation flow for patient"
    );

    // Load or initialize session
    let session = await loadSession(clinicId, patient.phone);
    if (!session) {
      session = {
        id: randomUUID(),
        clinicId,
        phone: patient.phone,
        state: "reactivation",
        data: {},
        humanTakeover: false,
      };
    } else {
      session.state = "reactivation";
      // Clear human takeover so the bot can talk to them again
      session.humanTakeover = false;
    }

    session.data = {
      ...session.data,
      existingPatientId: patientId,
      patientName,
      suggestedDoctorId: procedure.doctorId || undefined,
      suggestedDoctorName: doctorName,
      problemDescription: procedureName,
    };

    const sp = (state: ChatbotState, spOpts?: { clinicName?: string }) =>
      buildSystemPrompt(state, settings, {
        ...spOpts,
        knowledgeContext: "",
        doctorsContext: "",
        priceListContext: "",
      });

    const managerExamples = await getManagerExamples(clinicId);

    const context = `Пациент ${patientName} отменил или не пришел на процедуру "${procedureName}" к врачу ${doctorName}.
Напиши очень вежливое, заботливое и ненавязчивое сообщение от лица клиники 1Dent.
Спроси, все ли в порядке, по какой причине не получилось прийти (например, не подошло время или изменились планы), и предложи перенести запись на другое удобное время.
Также упомяни, что мы дарим ему скидку 10% на эту процедуру при перезаписи.`;

    const aiReply = await generateChatbotResponse(
      sp("reactivation"),
      [],
      context,
      managerExamples,
    );

    const reply = aiReply ?? `Здравствуйте, ${patientName}! Мы заметили, что ваш прием на процедуру «${procedureName}» был отменен. Всё ли у вас в порядке? Подскажите, пожалуйста, по какой причине не получилось прийти? Мы будем рады предложить вам перезапись на любое удобное время, а также специальную скидку 10% на эту процедуру. 😊`;

    await saveSession(session);
    await saveChatbotMessage(clinicId, patient.phone, "outbound", reply);
    await sendToPatient(clinicId, patient.phone, reply).catch((err) =>
      logger.error({ err }, "ChatbotService: failed to send WhatsApp reactivation reply"),
    );
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

  async parseScriptWithAI(clinicId: string, rawText: string, userId?: string | null): Promise<ScriptBlock[]> {
    await aiCreditsService.consumeCredits({
      clinicId,
      userId,
      feature: "chatbot_script_parse",
    });
    const systemPrompt = `Ты — парсер скриптов чат-бота для стоматологической клиники.
Твоя задача: разбить текст скрипта на логические блоки и вернуть JSON-массив.

Каждый блок должен иметь поля:
- id: строка на английском snake_case (например: "greeting", "mini_diagnosis", "services", "appointment", "followup", "reminders", "post_visit", "reactivation")
- title: краткое название блока на русском (2–4 слова)
- icon: один подходящий эмодзи
- description: одна строка — что делает этот блок
- content: полный текст этого раздела (сохраняй исходное форматирование, переносы строк, разделители)
- enabled: true
- order: порядковый номер начиная с 0

Верни ТОЛЬКО валидный JSON-массив без пояснений, кода и markdown.`;

    try {
      const response = await withTimeout(
        openrouter.chat.completions.create({
          model: FAST_MODEL,
          max_tokens: 6000,
          temperature: 0.1,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Разбей этот скрипт на блоки:\n\n${rawText}` },
          ],
        }),
        30_000,
        "parseScriptWithAI",
      );

      const content = response.choices[0]?.message?.content ?? "[]";
      const blocks = parseLlmJson<ScriptBlock[]>(content);
      if (!blocks || !Array.isArray(blocks)) {
        logger.warn("[ChatbotService] AI parse returned no JSON array — falling back to standard blocks");
        return STANDARD_SCRIPT_BLOCKS;
      }
      return blocks.map((b, i) => ({ ...b, order: i, enabled: b.enabled ?? true }));
    } catch (err) {
      logger.error({ err }, "[ChatbotService] parseScriptWithAI failed — returning standard blocks");
      return STANDARD_SCRIPT_BLOCKS;
    }
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
      scriptBlocks?: ScriptBlock[];
      scriptMindMap?: ScriptMindMapData;
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
    userId?: string | null,
    opts?: { fsmState?: ChatbotState },
  ) {
    await aiCreditsService.consumeCredits({
      clinicId,
      userId,
      feature: "chatbot_test",
    });

    const [settings, managerExamples, doctorsWithSlots, clinicRow, knowledgeContext, priceListContext] = await Promise.all([
      getSettings(clinicId),
      getManagerExamples(clinicId),
      getClinicDoctorsWithSlots(clinicId).catch(() => [] as DoctorWithSlots[]),
      db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1).catch(() => []),
      loadKnowledgeContext(clinicId),
      loadPriceListContext(clinicId),
    ]);
    const clinicName = clinicRow[0]?.name ?? undefined;
    const mindMap = settings.scriptMindMap as ScriptMindMapData | undefined;
    const fsmState = opts?.fsmState ?? "greeting";
    const activeNodeId = resolveMindMapNodeIdForState(mindMap, fsmState, { userText: userMessage });
    const activeNode = activeNodeId
      ? mindMap?.nodes?.find((n) => n.id === activeNodeId) ?? null
      : null;
    const playgroundOpts = { fsmState, userText: userMessage };

    const mindMapNodePayload = activeNode
      ? { id: activeNode.id, label: activeNode.label, fsmState: activeNode.fsmState ?? fsmState }
      : null;

    // Auto-start: empty message + empty history → generate greeting with AI using knowledge context
    if (!userMessage && history.length === 0) {
      const systemPrompt = buildPlaygroundPrompt(
        settings, doctorsWithSlots, clinicName, knowledgeContext, priceListContext, playgroundOpts,
      );
      const reply = await generateChatbotResponse(
        systemPrompt,
        [],
        "Начни диалог — отправь приветственное сообщение как если бы пациент только что написал в первый раз.",
        managerExamples,
      );
      return {
        reply: reply ?? "Здравствуйте! Чем могу помочь?",
        fsmState,
        mindMapNode: mindMapNodePayload,
      };
    }

    const systemPrompt = buildPlaygroundPrompt(
      settings, doctorsWithSlots, clinicName, knowledgeContext, priceListContext, playgroundOpts,
    );
    const chatHistory = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const reply = await generateChatbotResponse(systemPrompt, chatHistory, userMessage, managerExamples);
    return {
      reply: reply ?? "AI не ответил. Проверьте API-ключ.",
      fsmState,
      mindMapNode: mindMapNodePayload,
    };
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

  async checkInactivityReminders() {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const inactiveSessions = await db
      .select()
      .from(chatbotSessionsTable)
      .where(
        and(
          ne(chatbotSessionsTable.state, "done"),
          ne(chatbotSessionsTable.state, "human_takeover"),
          lte(chatbotSessionsTable.updatedAt, thirtyMinutesAgo)
        )
      );

    for (const session of inactiveSessions) {
      const data = session.data as ChatbotSessionData;
      if (data.inactivityReminderSent) {
        continue;
      }

      // Mark as sent immediately to avoid multiple ticks overlapping
      data.inactivityReminderSent = true;
      await saveSession({
        id: session.id,
        clinicId: session.clinicId,
        phone: session.phone,
        state: session.state as ChatbotState,
        data,
        humanTakeover: session.humanTakeover,
      });

      logger.info({ phone: session.phone, state: session.state }, "[ChatbotService] Sending inactivity reminder");

      let settings: Awaited<ReturnType<typeof getSettings>>;
      let managerExamples: ManagerExample[];
      let knowledgeContext: string;
      let doctorsContext: string;
      let priceListContext: string;
      let clinicName: string | undefined;

      try {
        const [settingsRow, managerExamplesRow, knowledgeContextRow, doctorsContextRow, priceListContextRow, clinicRow] = await Promise.all([
          getSettings(session.clinicId),
          getManagerExamples(session.clinicId),
          loadKnowledgeContext(session.clinicId),
          loadDoctorsContext(session.clinicId),
          loadPriceListContext(session.clinicId),
          db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, session.clinicId)).limit(1).catch(() => []),
        ]);
        settings = settingsRow;
        managerExamples = managerExamplesRow;
        knowledgeContext = knowledgeContextRow;
        doctorsContext = doctorsContextRow;
        priceListContext = priceListContextRow;
        clinicName = clinicRow[0]?.name ?? undefined;
      } catch (err) {
        logger.error({ err }, "[ChatbotService] Failed to load context for inactivity reminder");
        continue;
      }

      if (!settings.enabled) continue;

      const stateGuidance = `Пациент начал процесс записи в клинику, но остановился на этапе «${session.state}» и не отвечает более 30 минут. 
Вежливо обратись к нему, напомни, что вы остановились на записи, и предложи продолжить. Спроси, нужна ли помощь, или предложи свободный слот, если вы дошли до выбора времени/врача.
Отвечай вежливо, ненавязчиво, коротко (1–3 предложения).`;

      // Load recent messages
      const recentRows = await db
        .select()
        .from(chatbotMessagesTable)
        .where(and(eq(chatbotMessagesTable.clinicId, session.clinicId), eq(chatbotMessagesTable.phone, session.phone)))
        .orderBy(asc(chatbotMessagesTable.createdAt))
        .limit(20);

      const recentMessages = recentRows.map((r) => ({
        role: r.direction === "inbound" ? "user" as const : "assistant" as const,
        content: r.content,
      }));

      const reminderData = data as ChatbotSessionData;
      const mindMapForReminder = settings.scriptMindMap as ScriptMindMapData | undefined;
      const systemPrompt = buildSystemPrompt(session.state as ChatbotState, settings, {
        clinicName,
        knowledgeContext,
        doctorsContext,
        priceListContext,
        serviceType: reminderData.serviceType,
        activeMindMapNodeId: reminderData.activeMindMapNodeId
          ?? resolveMindMapNodeIdForState(mindMapForReminder, session.state as ChatbotState),
      });
      const helperPrompt = `${systemPrompt}\n\n⚠️ ДОПОЛНИТЕЛЬНОЕ РУКОВОДСТВО ДЛЯ НАПОМИНАНИЯ:\n${stateGuidance}`;

      const reply = await generateChatbotResponse(helperPrompt, recentMessages, "Отправь вежливое напоминание (reminder)", managerExamples);
      
      if (reply) {
        // Send message to patient
        await sendToPatient(session.clinicId, session.phone, reply).catch((err) =>
          logger.error({ err }, "[ChatbotService] Failed to send inactivity reminder")
        );
        // Persist message
        await saveChatbotMessage(session.clinicId, session.phone, "outbound", reply);
      }
    }
  }
}
