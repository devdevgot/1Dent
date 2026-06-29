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
import { sendTypingToPatient } from "../../shared/messaging";
import { getAlertQueue } from "../../shared/alert-queue";
import { logger } from "../../lib/logger";
import { pickBestDoctorAdvanced, type AdvancedScoringOptions } from "../analytics/analytics.repository";
import { ChannelsRepository } from "../channels/channels.repository";
import {
  classifyPatientRequest,
  generateChatbotResponse,
  extractDatetimeFromText,
  extractBranchFromText,
  joinChatbotReply,
  mergeReply,
  appendToReply,
  replyFromText,
  type ChatMessage,
  type ChatbotReply,
  type ManagerExample,
} from "./ai-classifier";
import {
  assignAbVariant,
  applyAbVariantToSettings,
  getChatbotFunnelAnalytics,
  logFunnelEvent,
} from "./chatbot-ab-funnel";
import {
  formatSlotAlternatives,
  getClinicDoctorsWithSlots,
  getDoctorAvailableSlots,
  validateAppointmentSlot,
} from "./calendar-slots";
import {
  formatAlmatyDateShort,
  formatAlmatyDateTimeLong,
  formatAlmatyDateTimeShort,
  formatAlmatyDayMonth,
  formatAlmatyNowContext,
  formatAlmatySlotCompact,
  formatAlmatyTime,
  getAlmatyDayBounds,
  getAlmatyYmd,
  KZ_UTC_OFFSET_LABEL,
} from "./almaty-time";
import { deliverChatbotReply } from "./chatbot-reply";
import type { ChatbotState, ChatbotSessionData } from "./chatbot.types";
import type { ProcessMessageOptions, TurnResult, SimulateMessageResult } from "./chatbot-simulate.types";
import type { DoctorWithSlots } from "./chatbot.service.types";
import {
  PLAYGROUND_SIM_PHONE,
  buildScenarioContext,
  getInitialSessionForScenario,
  type PlaygroundScenario,
  type PlaygroundSessionInput,
} from "./playground-scenarios";
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
import {
  DEFAULT_BOOKING_MIND_MAP,
  usesBookingFlow,
  buildDecisionFallback,
  isReadyToBook,
  isHesitating,
  isRefusing,
  detectObjectionType,
} from "./booking-script";
import { retrieveRelevantKnowledge } from "./knowledge-retrieval";
import {
  hasClinicKnowledge,
  buildRefusalFallback,
  resolveBranchFromMessage,
} from "./clinic-knowledge";
import { scheduleAppointmentReminders } from "../followups/appointment-reminders.queue";
import { scheduleFollowups } from "../followups/followup.queue";
import {
  assignRankedDoctor,
  buildBranchPromptFallback,
  buildDoctorPresentationFallback,
  buildSymptomsPromptFallback,
  wantsAlternativeDoctor,
} from "./booking-fsm";

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

type OutboundResponse = ChatbotReply | string | null;

function toChatbotReply(value: OutboundResponse): ChatbotReply | null {
  if (value == null) return null;
  if (typeof value === "string") return replyFromText(value);
  return value.parts.length > 0 ? value : null;
}

async function sendOutboundReply(clinicId: string, phone: string, value: OutboundResponse): Promise<string | null> {
  const reply = toChatbotReply(value);
  if (!reply) return null;
  await deliverChatbotReply(clinicId, phone, reply, {
    onPartDelivered: (part) => saveChatbotMessage(clinicId, phone, "outbound", part),
  });
  return joinChatbotReply(reply);
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

  // No specialty match — pick least-loaded doctor today using procedure count (Almaty calendar day)
  const { todayStart, todayEnd } = getAlmatyDayBounds();

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

async function buildSlotsAppendix(
  clinicId: string,
  doctorId?: string,
  calendarConfig?: ChatbotSettings["calendarConfig"],
): Promise<string> {
  if (!doctorId) return "";
  const slots = await getDoctorAvailableSlots(clinicId, doctorId, calendarConfig, { limit: 5 }).catch(
    () => [] as Date[],
  );
  if (slots.length === 0) return "";
  return `\n\nБлижайшие свободные слоты:\n${formatSlotAlternatives(slots, formatAlmatySlotCompact)}\n\nИли укажите своё удобное время.`;
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

async function loadKnowledgeContext(clinicId: string, query?: string): Promise<string> {
  const cached = knowledgeCache.get(clinicId);
  let fullText: string;
  if (cached && cached.expiresAt > Date.now()) {
    fullText = cached.text;
  } else {
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

      fullText = sources
        .map((s) => `=== ${s.name} ===\n${(s.extractedText ?? "").slice(0, 8000)}`)
        .join("\n\n---\n\n");

      knowledgeCache.set(clinicId, { text: fullText, expiresAt: Date.now() + 5 * 60_000 });
    } catch (err) {
      logger.warn({ err }, "[ChatbotService] loadKnowledgeContext failed — skipping knowledge injection");
      return "";
    }
  }

  if (query?.trim()) {
    return retrieveRelevantKnowledge(fullText, query, { maxChars: 3500, topK: 4 });
  }
  return fullText.slice(0, 3500);
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

function getEffectiveSettings(settings: ChatbotSettings): ChatbotSettings {
  const mm = settings.scriptMindMap as ScriptMindMapData | undefined;
  if (mm?.nodes?.length) return settings;
  return { ...settings, scriptMindMap: DEFAULT_BOOKING_MIND_MAP };
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
      const d = formatAlmatyDateShort(new Date(t.performedAt));
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

const VALID_CHATBOT_STATES = new Set<ChatbotState>([
  "greeting", "collect_iin", "collect_name", "collect_phone", "collect_problem",
  "collect_qualification", "suggest_doctor", "manage_appointment", "show_slots",
  "collect_datetime", "collect_branch", "await_decision", "handle_objections",
  "confirm_appointment", "dental_qa", "done", "human_takeover", "reactivation",
]);

function parseMindMapFsmState(fsm?: string): ChatbotState | null {
  if (!fsm || !VALID_CHATBOT_STATES.has(fsm as ChatbotState)) return null;
  return fsm as ChatbotState;
}

type UnifiedScriptPromptOpts = {
  fsmState?: ChatbotState;
  serviceType?: string;
  userText?: string;
  activeMindMapNodeId?: string;
  channel?: "playground" | "whatsapp";
  backendContext?: string;
};

/** Shared prompt for Playground preview and WhatsApp — same script, mind map, doctors, and rules. */
function buildUnifiedScriptPrompt(
  settings: Awaited<ReturnType<typeof getSettings>>,
  doctorsWithSlots?: DoctorWithSlots[],
  clinicName?: string,
  knowledgeContext?: string,
  priceListContext?: string,
  opts?: UnifiedScriptPromptOpts,
): string {
  const channel = opts?.channel ?? "playground";
  const fsmState = opts?.fsmState ?? "greeting";
  const kazakhNote = `ВАЖНО: Пациент может писать на казахском или русском. Отвечай строго на том языке, на котором пишет пациент.`;

  let doctorsSection = "";
  if (doctorsWithSlots && doctorsWithSlots.length > 0) {
    doctorsSection = "\n\nВРАЧИ КЛИНИКИ (используй ТОЛЬКО этих врачей):\n";
    for (const doc of doctorsWithSlots) {
      const spec = doc.specialty ? ` — ${doc.specialty}` : "";
      doctorsSection += `• ${doc.name}${spec}\n`;
      if (doc.slots.length > 0) {
        const slotLine = doc.slots.map((s) => formatAlmatySlotCompact(s)).join(", ");
        doctorsSection += `  Свободные слоты: ${slotLine}\n`;
      } else {
        doctorsSection += `  Свободные слоты: нет на ближайшие 7 дней\n`;
      }
    }
  }

  const resolvedClinicName =
    clinicName ??
    settings.greetingTemplate?.match(/«(.+?)»/)?.[1] ??
    settings.greetingTemplate?.match(/"(.+?)"/)?.[1] ??
    "нашу клинику";
  const now = new Date();
  const todayDate = formatAlmatyDayMonth(now);
  const firstDoctor = doctorsWithSlots?.[0];
  const exampleDoctorName = firstDoctor?.name ?? "Иван Петров";
  const exampleTime = firstDoctor?.slots?.[0] ? formatAlmatyTime(firstDoctor.slots[0]) : "14:00";
  const exampleDate =
    firstDoctor?.slots?.[0] ? formatAlmatyDayMonth(firstDoctor.slots[0]) : todayDate;

  const resolvePlaceholders = (text: string) =>
    text
      .replace(/\{\{clinic_name\}\}/g, resolvedClinicName)
      .replace(/\{\{date\}\}/g, exampleDate)
      .replace(/\{\{time\}\}/g, exampleTime)
      .replace(/\{\{doctor_name\}\}/g, exampleDoctorName);

  const savedBlocks = (settings.scriptBlocks ?? []) as ScriptBlock[];
  const activeBlocks = savedBlocks.length > 0 ? savedBlocks : STANDARD_SCRIPT_BLOCKS;
  const enabledBlocks = activeBlocks.filter((b) => b.enabled).sort((a, b) => a.order - b.order);

  let scriptContext = "\n\nСКРИПТ КЛИНИКИ (строго следуй этому скрипту):\n";
  for (const block of enabledBlocks) {
    scriptContext += `\n--- ${block.title.toUpperCase()} ---\n${resolvePlaceholders(block.content)}\n`;
  }

  const nowContext = formatAlmatyNowContext(now);
  const nowTimeStr = formatAlmatyTime(now);
  const todayYmdPlayground = getAlmatyYmd(now);

  const priceListSection = priceListContext
    ? `\n\nПРАЙС-ЛИСТ КЛИНИКИ (официальные цены — используй для ответов о стоимости услуг):\n${priceListContext}\n\n⚠️ ПРАВИЛО РЕЛЕВАНТНОСТИ: Когда пациент спрашивает о конкретной услуге — называй цену ТОЛЬКО запрошенной услуги. Не перечисляй другие услуги.`
    : "";

  const knowledgeSection = knowledgeContext
    ? `\n\nМАТЕРИАЛЫ КЛИНИКИ (сайт, документы — дополнительный источник информации; цены берутся из ПРАЙС-ЛИСТА выше):\n${knowledgeContext}`
    : "";

  const mindMap = settings.scriptMindMap as ScriptMindMapData | undefined;
  const mindMapSection = renderMindMapScript(mindMap);
  const activeMindMapSection = buildActiveMindMapContext(mindMap, fsmState, {
    serviceType: opts?.serviceType,
    userText: opts?.userText,
    activeNodeId: opts?.activeMindMapNodeId,
  });
  const effectiveScriptContext = mindMapSection ? "" : scriptContext;

  const channelNote =
    channel === "playground"
      ? "Сейчас ТЕСТОВЫЙ РЕЖИМ (симуляция для проверки скрипта)."
      : "Сейчас реальный диалог с пациентом в WhatsApp.";

  const iinRule =
    fsmState === "collect_iin"
      ? "Пациент хочет управлять существующей записью — попроси ввести ИИН (12 цифр)."
      : "НИ ПРИ КАКИХ УСЛОВИЯХ не проси ИИН, удостоверение или любой идентификатор в начале диалога — пациент уже идентифицирован по номеру WhatsApp.";

  const backendSection = opts?.backendContext?.trim()
    ? `\n\nКОНТЕКСТ ДЛЯ ЭТОГО ОТВЕТА (факты из системы, не озвучивай дословно если не уместно):\n${opts.backendContext.trim()}`
    : "";

  const si = (settings.stepInstructions ?? {}) as StepInstructions;
  const stateInstructionMap: Record<ChatbotState, keyof StepInstructions | null> = {
    greeting: "greeting",
    collect_iin: null,
    collect_name: "collectName",
    collect_phone: null,
    collect_problem: "collectProblem",
    collect_qualification: null,
    suggest_doctor: "suggestDoctor",
    manage_appointment: null,
    show_slots: null,
    await_decision: null,
    collect_datetime: null,
    collect_branch: null,
    handle_objections: null,
    confirm_appointment: "confirm",
    dental_qa: null,
    done: null,
    human_takeover: null,
    reactivation: null,
  };
  const stateKey = stateInstructionMap[fsmState];
  const instructionsExtra =
    (si.general ? `\n\nДополнительные инструкции клиники:\n${si.general}` : "") +
    (stateKey && si[stateKey] ? `\n\nИнструкции для этапа «${fsmState}»:\n${si[stateKey]}` : "");

  return `Ты — AI-ассистент стоматологической клиники. ${channelNote}
${nowContext}

⚠️ ЖЁСТКИЕ ПРАВИЛА (приоритет выше скрипта):
1. ${iinRule}
2. НЕ спрашивай имя или телефон в начале диалога — имя и телефон собираются только при оформлении записи
3. Строго следуй майнд-мэпу/скрипту клиники — проходи этапы: знакомство → квалификация (симптомы → филиал) → подбор врача по рейтингу → решение → запись или возражения
4. На этапе подбора врача озвучь имя, рейтинг (из контекста) и 1–2 причины выбора (специализация, загрузка, ближайший слот). Если пациент просит «другого врача» — предложи альтернативу из топ-3
5. После подтверждения врача спроси готовность записаться. Если готов — дата и время. Если сомневается — отработай возражения и снова предложи запись. Если отказ — поблагодари и оставь контакт
6. Если филиал уже выбран — не спрашивай его повторно при выборе времени
7. Отвечай коротко: 1–3 предложения максимум
8. Используй только информацию из материалов клиники и списка врачей — не придумывай
9. Все даты и время — только в часовом поясе Казахстана (${KZ_UTC_OFFSET_LABEL}, Алматы/Астана). Сегодняшняя дата: ${todayYmdPlayground}. НИКОГДА не предлагай и не подтверждай время которое уже прошло (сейчас ${nowTimeStr}). Если пациент называет время из списка свободных слотов — подтверждай его вместе с полной датой из списка. Если пациент называет прошедшее время сегодня — объясни что оно уже прошло и предложи ближайший доступный слот. Все слоты в списке врачей уже являются будущими.
10. Адреса филиалов, телефоны, часы работы и акции — ТОЛЬКО из материалов клиники (сайт и ссылки в настройках чатбота). Не используй вымышленные адреса. Если материалов нет — не перечисляй филиалы, попроси уточнить адрес или предложи оператора.
11. Отвечай мгновенно и по делу — как опытный менеджер по продажам: один вопрос за раз, мягко веди к записи, не дави.
12. Если пациент сомневается — отработай возражение и снова предложи конкретный следующий шаг (время, врач, филиал).
13. Не завершай диалог, пока пациент явно не отказался («не надо», «не интересно») или не записался — при паузе система отправит follow-up автоматически.
${kazakhNote}${instructionsExtra}${doctorsSection}${priceListSection}${mindMapSection}${activeMindMapSection}${effectiveScriptContext}${knowledgeSection}${backendSection}`;
}

/** Renders the clinic's script blocks for injection into prompts. */
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
  const todayDate = formatAlmatyDayMonth(now);

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

const LEAD_NURTURE_HOURS = [24, 72, 168] as const;
const LEAD_NURTURE_STATES: ChatbotState[] = [
  "collect_problem",
  "collect_qualification",
  "suggest_doctor",
  "await_decision",
  "handle_objections",
  "collect_datetime",
  "collect_branch",
  "confirm_appointment",
  "dental_qa",
  "show_slots",
  "collect_name",
  "collect_phone",
];

function getLeadNurtureTemplates(settings: Awaited<ReturnType<typeof getSettings>>): [string, string, string] {
  const savedBlocks = (settings.scriptBlocks ?? []) as ScriptBlock[];
  const activeBlocks = savedBlocks.length > 0 ? savedBlocks : STANDARD_SCRIPT_BLOCKS;
  const followup = activeBlocks.find((b) => b.id === "followup" && b.enabled);
  const defaults: [string, string, string] = [
    "Подобрать для вас удобное время? 😊 Есть свободные окна на сегодня и завтра.",
    "Напоминаю вам 😊 Могу записать вас без ожидания. Когда вам будет удобно?",
    "Здравствуйте 😊 Вы интересовались приёмом. Могу записать на удобное время — когда подойдёт?",
  ];
  if (!followup?.content.trim()) return defaults;

  const parts = followup.content
    .split(/\n---+\n/)
    .map((p) => p.replace(/^[^\n]+:\n?/, "").trim())
    .filter((p) => p.length > 10);
  return [
    parts[0] ?? defaults[0],
    parts[1] ?? defaults[1],
    parts[2] ?? defaults[2],
  ];
}

function buildHandoffSummary(session: SessionRecord): string {
  const d = session.data;
  return [
    "📋 Передача диалога оператору",
    d.patientName ? `Имя: ${d.patientName}` : null,
    `Тел: ${session.phone}`,
    `Этап: ${session.state}`,
    d.problemDescription ? `Запрос: ${d.problemDescription}` : null,
    d.suggestedDoctorName ? `Врач: ${d.suggestedDoctorName}` : null,
    d.selectedBranch ? `Филиал: ${d.selectedBranch}` : null,
    d.preferredDatetime ? `Время: ${d.preferredDatetime}` : null,
    d.decisionOutcome ? `Статус: ${d.decisionOutcome}` : null,
  ]
    .filter(Boolean)
    .join("\n");
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

function makeTurnResult(
  session: SessionRecord,
  response: OutboundResponse,
  simulatedActions: string[],
): TurnResult {
  return {
    outbound: toChatbotReply(response),
    session,
    simulatedActions,
  };
}

async function finalizeBookingAppointment(params: {
  clinicId: string;
  phone: string;
  data: ChatbotSessionData;
  branchToSave: string;
  dryRun: boolean;
  noteAction: (msg: string) => void;
  recentMessages: ChatMessage[];
  messageText: string;
  managerExamples: ManagerExample[];
  up: (state: ChatbotState, opts?: { backendContext?: string }) => string;
  promptState?: ChatbotState;
}): Promise<{ data: ChatbotSessionData; response: string }> {
  const {
    clinicId,
    phone,
    branchToSave,
    dryRun,
    noteAction,
    recentMessages,
    messageText,
    managerExamples,
    up,
    promptState = "confirm_appointment",
  } = params;
  const data = { ...params.data };
  data.confusedCount = 0;
  data.selectedBranch = branchToSave;

  const preferredDate = data.preferredDatetime ? new Date(data.preferredDatetime) : new Date();

  try {
    if (dryRun) {
      const serviceLabel =
        data.serviceType && data.serviceType !== "unknown" ? data.serviceType : "consultation";
      if (data.isReschedule && data.existingProcedureId) {
        noteAction(`Перенос записи на ${formatAlmatyDateTimeLong(preferredDate)}, филиал: ${branchToSave}`);
      } else {
        noteAction(
          `Создание записи: ${data.patientName ?? "пациент"} → ${data.suggestedDoctorName ?? "врач"}, ${serviceLabel}, ${formatAlmatyDateTimeLong(preferredDate)}, филиал: ${branchToSave}`,
        );
      }
      data.createdPatientId = data.existingPatientId ?? "sim-new-patient-id";
    } else if (data.isReschedule && data.existingProcedureId) {
      await db
        .update(proceduresTable)
        .set({
          scheduledAt: preferredDate,
          notes: `Перенос. Филиал: ${branchToSave}`,
        })
        .where(and(eq(proceduresTable.id, data.existingProcedureId), eq(proceduresTable.clinicId, clinicId)));
      logger.info(
        { procedureId: data.existingProcedureId, scheduledAt: preferredDate, branch: branchToSave },
        "ChatbotService: procedure rescheduled via chatbot with branch",
      );
      data.createdPatientId = data.existingPatientId;
    } else {
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
            ? data.serviceType === "therapy"
              ? "Терапия"
              : data.serviceType === "hygiene"
                ? "Гигиена"
                : data.serviceType === "surgery"
                  ? "Хирургия"
                  : data.serviceType === "orthopedics"
                    ? "Ортопедия"
                    : data.serviceType === "orthodontics"
                      ? "Ортодонтия"
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
        data.createdProcedureId = procedureId;
        logger.info(
          { patientId, doctorId: data.suggestedDoctorId, scheduledAt: preferredDate, branch: branchToSave },
          "ChatbotService: procedure created via chatbot with branch",
        );

        try {
          const [[clinicRow], [patientRow]] = await Promise.all([
            db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1),
            db.select({ name: patientsTable.name }).from(patientsTable).where(eq(patientsTable.id, patientId)).limit(1),
          ]);
          await scheduleAppointmentReminders({
            clinicId,
            patientId,
            procedureId,
            scheduledAt: preferredDate,
            patientName: patientRow?.name ?? data.patientName ?? "Пациент",
            procedureName: serviceLabel,
            doctorName: data.suggestedDoctorName ?? "",
            clinicName: clinicRow?.name ?? "",
          });
          await scheduleFollowups({ clinicId, patientId, procedureId });
        } catch (schedErr) {
          logger.warn({ err: schedErr, procedureId }, "ChatbotService: failed to schedule reminders/followups after booking");
        }

        const staffRecipients = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.clinicId, clinicId), inArray(usersTable.role, ["owner", "admin"])));
        if (staffRecipients.length > 0) {
          const apptDateStr = formatAlmatyDateTimeShort(preferredDate);
          const notifMsg = `📅 Новая запись: ${data.patientName ?? phone} → ${data.suggestedDoctorName ?? "врач"} (${serviceLabel}), ${apptDateStr}. Филиал: ${branchToSave}`;
          await db
            .insert(notificationsTable)
            .values(
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
            )
            .catch((err) => logger.warn({ err }, "ChatbotService: failed to insert notification"));
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "ChatbotService: failed to save procedure in finalizeBooking");
  }

  const formattedDate = formatAlmatyDateTimeLong(preferredDate);
  const doctorName = data.suggestedDoctorName ?? data.existingProcedureDoctorName ?? "врача";
  const serviceName =
    data.serviceType && data.serviceType !== "unknown" ? data.serviceType : "консультация";

  const summaryInstruction = data.isReschedule
    ? `Запись успешно ПЕРЕНЕСЕНА. Подтверди: филиал ${branchToSave}, врач ${doctorName}, дата ${formattedDate}, услуга ${serviceName}. Контакт клиники — из материалов. Напомни взять удостоверение личности.`
    : `Запись ПОДТВЕРЖДЕНА. Повтори дату ${formattedDate}, время, адрес ${branchToSave}, услугу ${serviceName}, врача ${doctorName}. Контакт клиники — из материалов (сайт/настройки). Напомни взять удостоверение личности. Поблагодари. Спроси, остались ли вопросы.`;

  const aiDone = await generateChatbotResponse(
    up(promptState, { backendContext: summaryInstruction }),
    recentMessages,
    messageText,
    managerExamples,
  );

  const response = mergeReply(
    aiDone,
    data.isReschedule
      ? `✅ Ваша запись успешно перенесена!\n\n📅 Время: *${formattedDate}*\n👨‍⚕️ Врач: *${doctorName}*\n📍 Филиал: *${branchToSave}*\n\nНе забудьте удостоверение личности. Будем ждать вас! 😊`
      : `✅ Запись подтверждена!\n\n📅 Дата и время: *${formattedDate}*\n👨‍⚕️ Врач: *${doctorName}*\n📍 Филиал: *${branchToSave}*\n\nНе забудьте удостоверение личности. До встречи! 😊`,
  );

  return { data, response };
}

function formatSimulateMessageResult(
  turn: TurnResult,
  settings: Awaited<ReturnType<typeof getSettings>>,
  userText: string,
): SimulateMessageResult {
  const mindMap = settings.scriptMindMap as ScriptMindMapData | undefined;
  const activeNodeId = resolveMindMapNodeIdForState(mindMap, turn.session.state, {
    serviceType: turn.session.data.serviceType,
    userText,
    activeNodeId: turn.session.data.activeMindMapNodeId,
  });
  const activeNode = activeNodeId ? mindMap?.nodes?.find((n) => n.id === activeNodeId) ?? null : null;
  const outbound = turn.outbound ?? replyFromText("...");
  return {
    reply: joinChatbotReply(outbound),
    parts: outbound.parts,
    pausesMs: outbound.pausesMs,
    fsmState: turn.session.state,
    humanTakeover: turn.session.humanTakeover,
    sessionData: turn.session.data,
    mindMapNode: activeNode
      ? { id: activeNode.id, label: activeNode.label, fsmState: activeNode.fsmState ?? turn.session.state }
      : null,
    simulatedActions: turn.simulatedActions,
  };
}

export class ChatbotService {
  async processMessage(
    clinicId: string,
    phone: string,
    text: string,
    options?: ProcessMessageOptions,
  ): Promise<string | null> {
    const turn = await this.executeTurn(clinicId, phone, text, { ...options, dryRun: false });
    if (!turn?.outbound) {
      sendTypingToPatient(clinicId, phone, false).catch(() => {});
      return null;
    }
    await saveSession(turn.session);
    await deliverChatbotReply(clinicId, phone, turn.outbound, {
      onPartDelivered: (part) => saveChatbotMessage(clinicId, phone, "outbound", part),
    });
    return joinChatbotReply(turn.outbound);
  }

  private async executeTurn(
    clinicId: string,
    phone: string,
    text: string,
    options?: ProcessMessageOptions,
  ): Promise<TurnResult | null> {
    const dryRun = options?.dryRun ?? false;
    const simulatedActions: string[] = [];
    const noteAction = (msg: string) => {
      if (dryRun) simulatedActions.push(msg);
    };
    const persistSession = async (session: SessionRecord) => {
      if (!dryRun) await saveSession(session);
    };
    const finishTurn = async (session: SessionRecord, response: OutboundResponse): Promise<TurnResult> => {
      if (!dryRun) {
        if (stateAtTurnStart !== session.state) {
          logFunnelEvent({
            clinicId,
            phone,
            sessionId: session.id,
            variantId: session.data.abVariantId,
            eventType: "state_transition",
            fromState: stateAtTurnStart,
            toState: session.state,
          });
        }
        if (session.state === "done" && session.data.createdProcedureId) {
          logFunnelEvent({
            clinicId,
            phone,
            sessionId: session.id,
            variantId: session.data.abVariantId,
            eventType: "booking_completed",
            toState: "done",
          });
        }
      }
      await persistSession(session);
      return makeTurnResult(session, response, simulatedActions);
    };

    let messageText = text;
    if (options?.initGreeting && !messageText.trim()) {
      messageText = "Здравствуйте";
    }

    let rawSettings: ChatbotSettings;
    try {
      rawSettings = await getSettings(clinicId);
    } catch (err) {
      logger.error({ err }, "ChatbotService: failed to load settings");
      return null;
    }

    let session: SessionRecord;
    if (dryRun && options?.sessionInput) {
      session = {
        id: randomUUID(),
        clinicId,
        phone,
        state: options.sessionInput.state,
        data: { ...options.sessionInput.data },
        humanTakeover: options.sessionInput.humanTakeover ?? false,
      };
    } else if (dryRun) {
      const initial = getInitialSessionForScenario(options?.scenario);
      session = {
        id: randomUUID(),
        clinicId,
        phone,
        state: initial.state,
        data: { ...initial.data },
        humanTakeover: initial.humanTakeover ?? false,
      };
    } else {
      const loaded = await loadSession(clinicId, phone);
      session = loaded ?? {
        id: randomUUID(),
        clinicId,
        phone,
        state: "greeting",
        data: {},
        humanTakeover: false,
      };
    }

    const assignedVariant = assignAbVariant(rawSettings, session.data.abVariantId);
    if (assignedVariant && !session.data.abVariantId) {
      session.data = { ...session.data, abVariantId: assignedVariant };
    }

    let settings = getEffectiveSettings(
      applyAbVariantToSettings(rawSettings, session.data.abVariantId),
    );
    const calendarConfig = settings.calendarConfig;
    const stateAtTurnStart = session.state;

    let managerExamples: ManagerExample[];
    let knowledgeContext: string;
    let priceListContext: string;
    let doctorsWithSlots: DoctorWithSlots[];
    let clinicName: string | undefined;
    try {
      [managerExamples, knowledgeContext, priceListContext, doctorsWithSlots, clinicName] = await Promise.all([
        getManagerExamples(clinicId),
        loadKnowledgeContext(clinicId, messageText),
        loadPriceListContext(clinicId),
        getClinicDoctorsWithSlots(clinicId, calendarConfig).catch(() => [] as DoctorWithSlots[]),
        db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1).catch(() => []).then((rows) => rows[0]?.name),
      ]);
    } catch (err) {
      logger.error({ err }, "ChatbotService: failed to load context");
      return null;
    }

    const scenarioCtx = dryRun ? buildScenarioContext(options?.scenario, doctorsWithSlots) : null;

    if (!dryRun) {
      saveChatbotMessage(clinicId, phone, "inbound", messageText).catch(() => {});
    }

    if (!settings.enabled) return null;

    if (!dryRun) {
      try {
        await aiCreditsService.consumeCredits({ clinicId, feature: "chatbot_reply" });
      } catch (err) {
        if (err instanceof InsufficientAiCreditsError) {
          const exhaustedReply =
            "К сожалению, AI-кредиты клиники закончились. Администратору нужно докупить кредиты или сменить тариф в разделе «ИИ кредиты».";
          return makeTurnResult(
            {
              id: randomUUID(),
              clinicId,
              phone,
              state: "greeting",
              data: {},
              humanTakeover: false,
            },
            exhaustedReply,
            simulatedActions,
          );
        }
        throw err;
      }
    }

    if (session.humanTakeover) return { outbound: null, session, simulatedActions };

    type PatientRow = { id: string; name: string; status: string | null };
    let patientDb: PatientRow | undefined;
    if (dryRun && scenarioCtx?.patient) {
      patientDb = {
        id: scenarioCtx.patient.id,
        name: scenarioCtx.patient.name,
        status: scenarioCtx.patient.status,
      };
    } else if (!dryRun) {
      const [row] = await db
        .select({ id: patientsTable.id, name: patientsTable.name, status: patientsTable.status })
        .from(patientsTable)
        .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, phone)))
        .limit(1);
      patientDb = row;
    }

    let state = session.state;
    let data = { ...session.data };

    const promptChannel = dryRun ? "playground" as const : "whatsapp" as const;

    const up = (
      promptState: ChatbotState,
      upOpts?: { userText?: string; backendContext?: string },
    ) =>
      buildUnifiedScriptPrompt(
        settings,
        doctorsWithSlots,
        clinicName,
        knowledgeContext,
        priceListContext,
        {
          fsmState: promptState,
          serviceType: data.serviceType,
          userText: upOpts?.userText ?? messageText,
          activeMindMapNodeId: data.activeMindMapNodeId,
          channel: promptChannel,
          backendContext: upOpts?.backendContext,
        },
      );

    // Operator request always takes priority
    if (isOperatorRequest(messageText)) {
      session.state = "human_takeover";
      session.data = { ...data, handoffSummary: buildHandoffSummary({ ...session, data }) };
      session.humanTakeover = true;
      if (!dryRun) {
        logFunnelEvent({
          clinicId,
          phone,
          sessionId: session.id,
          variantId: data.abVariantId,
          eventType: "handoff",
          fromState: stateAtTurnStart,
          toState: "human_takeover",
        });
        await this.notifyHumanTakeover(clinicId, phone, data.patientName, session.data.handoffSummary);
      } else {
        noteAction("Оператор: уведомление администратору");
      }
      const takoverReply = "Соединяю вас с администратором. Пожалуйста, ожидайте — вам ответят в ближайшее время.";
      return finishTurn(session, takoverReply);
    }

    if (patientDb) {
      if (patientDb.status === "post_op_monitoring") {
        const hasComplaint = await isComplaintReply(messageText);
        if (hasComplaint) {
          if (!dryRun) {
            await triggerRedAlert(clinicId, phone, messageText, patientDb.id);
            await this.notifyHumanTakeover(clinicId, phone, patientDb.name);
          } else {
            noteAction("Red alert: жалоба после операции");
            noteAction("Оператор: уведомление администратору");
          }
          session.state = "human_takeover";
          session.humanTakeover = true;
          session.data = data;
          const replyText = "Мы видим, что вас беспокоит самочувствие после процедуры. Я уже передал эту информацию нашему дежурному администратору, он свяжется с вами в приоритетном порядке! Пожалуйста, будьте на связи.";
          return finishTurn(session, replyText);
        } else {
          if (!dryRun) {
            await db
              .update(patientsTable)
              .set({ status: "completed", updatedAt: new Date() })
              .where(eq(patientsTable.id, patientDb.id));
          } else {
            noteAction("Статус пациента → completed");
          }

          session.state = "done";
          session.data = data;

          const replyText = "Отлично! Рады, что у вас всё хорошо. Желаем вам скорейшего восстановления и крепкого здоровья! Если возникнут вопросы — пишите, мы всегда рядом.";
          return finishTurn(session, replyText);
        }
      } else if (patientDb.status === "repeat_sale") {
        const agreed = await isPositiveRepeatSaleReply(messageText);
        if (agreed) {
          if (!dryRun) {
            await db
              .update(patientsTable)
              .set({ status: "initial_consultation", updatedAt: new Date() })
              .where(eq(patientsTable.id, patientDb.id));
          } else {
            noteAction("Статус пациента → initial_consultation");
          }

          session.state = "collect_problem";
          session.data = {
            ...data,
            existingPatientId: patientDb.id,
            patientName: patientDb.name,
          };
          await persistSession(session);

          state = session.state;
          data = session.data;
        } else {
          session.state = "done";
          session.data = data;

          const replyText = "Хорошо! Если решите записаться на осмотр позже, просто напишите нам. Будем рады помочь вам в любое время!";
          return finishTurn(session, replyText);
        }
      }
    }

    if (state === "done") {
      if (!options?.skipRedAlert && isRedAlert(messageText)) {
        if (!dryRun) await triggerRedAlert(clinicId, phone, messageText, data.createdPatientId);
        else noteAction("Red alert");
        const alertReply = "🚨 Мы видим вашу проблему и передаём её администратору. Ожидайте, пожалуйста.";
        return finishTurn(session, alertReply);
      }
      const doneReply = "Рады вашему обращению! Если возникнут вопросы — пишите. Или напишите «оператор» для связи с администратором.";
      return finishTurn(session, doneReply);
    }

    if (!dryRun) {
      sendTypingToPatient(clinicId, phone, true).catch(() => {});
    }

    const recentMessages =
      dryRun && options?.historyInput
        ? options.historyInput
        : await this.getRecentHistory(clinicId, phone);

    let response: OutboundResponse = null;

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
        let existingByPhone: { id: string; name: string } | null = null;
        let upcomingProc: { id: string; scheduledAt: Date; doctorId: string | null } | null = null;

        if (dryRun && scenarioCtx?.patient) {
          existingByPhone = { id: scenarioCtx.patient.id, name: scenarioCtx.patient.name };
          if (scenarioCtx.upcomingProcedure) {
            upcomingProc = {
              id: scenarioCtx.upcomingProcedure.id,
              scheduledAt: scenarioCtx.upcomingProcedure.scheduledAt,
              doctorId: scenarioCtx.upcomingProcedure.doctorId,
            };
          }
        } else if (!dryRun) {
          const [row] = await db
            .select({ id: patientsTable.id, name: patientsTable.name })
            .from(patientsTable)
            .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, phone)))
            .limit(1);
          if (row) {
            existingByPhone = row;
            const now = new Date();
            const [proc] = await db
              .select({
                id: proceduresTable.id,
                scheduledAt: proceduresTable.scheduledAt,
                doctorId: proceduresTable.doctorId,
              })
              .from(proceduresTable)
              .where(
                and(
                  eq(proceduresTable.clinicId, clinicId),
                  eq(proceduresTable.patientId, row.id),
                  eq(proceduresTable.status, "scheduled"),
                  gte(proceduresTable.scheduledAt, now),
                ),
              )
              .orderBy(asc(proceduresTable.scheduledAt))
              .limit(1);
            upcomingProc = proc ?? null;
          }
        }

        if (existingByPhone) {
          data.existingPatientId = existingByPhone.id;
          data.patientName = existingByPhone.name;

          if (upcomingProc?.scheduledAt) {
            let doctorName = "врача";
            if (dryRun && scenarioCtx?.upcomingProcedure) {
              doctorName = scenarioCtx.upcomingProcedure.doctorName;
            } else if (upcomingProc.doctorId) {
              const [doc] = await db
                .select({ name: usersTable.name })
                .from(usersTable)
                .where(eq(usersTable.id, upcomingProc.doctorId))
                .limit(1);
              if (doc) doctorName = doc.name;
            }
            const apptDate = formatAlmatyDateTimeLong(upcomingProc.scheduledAt);
            data.existingProcedureId = upcomingProc.id;
            data.existingProcedureDate = apptDate;
            data.existingProcedureDoctorName = doctorName;

            const aiReply = await generateChatbotResponse(
              up("manage_appointment", {
                backendContext: `Пациент ${existingByPhone.name}. Ближайшая запись: врач ${doctorName}, ${apptDate}.`,
              }),
              [{ role: "user" as const, content: messageText }],
              messageText,
              managerExamples,
            );
            response = mergeReply(aiReply, `Здравствуйте, ${existingByPhone.name}! 👋\n\nУ вас запись к врачу *${doctorName}* на *${apptDate}*.\n\nЧто хотите сделать?\n• Перенести\n• Отменить\n• Оставить как есть`);
            session.state = "manage_appointment";
            session.data = data;
            break;
          }

          // Returning patient, no upcoming → straight to problem collection
          const aiReply = await generateChatbotResponse(
            up("collect_problem", { backendContext: `Пациент ${existingByPhone.name} — постоянный клиент.` }),
            [{ role: "user" as const, content: messageText }],
            messageText,
            managerExamples,
          );
          response = mergeReply(aiReply, `Здравствуйте, ${existingByPhone.name}! 😊 Чем могу помочь?`);
          session.state = "collect_problem";
          session.data = data;
          break;
        }

        // New patient (not found by phone). Detect if they want to manage an existing
        // appointment ("моя запись", "перенести", "отменить") — if so, route to IIN identification.
        const lowerFirst = messageText.toLowerCase();
        const wantsExistingAppt =
          options?.scenario === "wants_existing_appt" ||
          /\b(моя запись|мою запись|мои записи|перенест|отменит|отмена|отменя|записан|жазылған|жылжыту|болдырмау)\b/.test(
            lowerFirst,
          );

        if (wantsExistingAppt) {
          const aiAskIin = await generateChatbotResponse(
            up("collect_iin"),
            [],
            messageText,
            managerExamples,
          );
          response = mergeReply(
            aiAskIin,
            "Здравствуйте! 👋 Чтобы найти вашу запись, пожалуйста, введите ваш ИИН (12 цифр).",
          );
          session.state = "collect_iin";
          break;
        }

        // Otherwise — new patient, greet and process their actual first message as the patient input
        // so the model can immediately address what they wrote (not just send a generic greeting).
        const aiGreeting = await generateChatbotResponse(
          up("greeting"),
          [],
          messageText,
          managerExamples,
        );
        response = mergeReply(aiGreeting, scriptGreeting);
        session.state = "collect_problem";
        break;
      }

      case "collect_iin": {
        const digits = messageText.replace(/\D/g, "");
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
              const apptDate = formatAlmatyDateTimeLong(upcomingProc.scheduledAt);
              data.existingProcedureId = upcomingProc.id;
              data.existingProcedureDate = apptDate;
              data.existingProcedureDoctorName = doctorName;

              const aiReply = await generateChatbotResponse(
                up("manage_appointment", {
                  backendContext: `Пациент ${iinMatch.name}. Ближайшая запись: врач ${doctorName}, ${apptDate}.`,
                }),
                [],
                messageText,
                managerExamples,
              );
              response = mergeReply(aiReply, `Добро пожаловать, ${iinMatch.name}! 👋\n\nУ вас запись к врачу *${doctorName}* на *${apptDate}*.\n\nЧто хотите сделать?\n• Перенести на другую дату\n• Отменить запись\n• Оставить как есть`);
              session.state = "manage_appointment";
            } else {
              // No upcoming appointment — start booking flow
              const aiReply = await generateChatbotResponse(
                up("collect_problem", { backendContext: `Пациент ${iinMatch.name} идентифицирован по ИИН, активных записей нет.` }),
                [],
                messageText,
                managerExamples,
              );
              response = mergeReply(aiReply, `Добро пожаловать, ${iinMatch.name}! 😊\nЧем могу помочь? Опишите, что вас беспокоит или какую услугу вы хотели бы получить.`);
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
        const classification0 = await classifyPatientRequest(messageText, recentMessages);
        const extractedName = classification0.extractedName ?? messageText.trim().slice(0, 60);
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
            up("collect_datetime", {
              backendContext: `Имя пациента: ${extractedName}. Врач: ${data.suggestedDoctorName ?? ""}.`,
            }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = appendToReply(mergeReply(aiAskTime, `Приятно познакомиться, ${extractedName}! 😊\nКогда вам удобно прийти к врачу *${data.suggestedDoctorName ?? ""}*?`), slotsText);
          session.state = "collect_datetime";
          session.data = data;
          break;
        }

        // No doctor yet — fall back to collecting the problem first
        const aiReply0 = await generateChatbotResponse(
          up("collect_problem", { backendContext: `Имя пациента: ${extractedName}.` }),
          recentMessages,
          messageText,
          managerExamples,
        );
        response = mergeReply(aiReply0, `Приятно познакомиться, ${extractedName}! 😊\nПодскажите, что вас беспокоит?`);
        session.state = "collect_problem";
        session.data = data;
        break;
      }

      case "collect_phone": {
        const classPhone = await classifyPatientRequest(messageText, recentMessages);
        if (classPhone.extractedPhone) {
          data.collectedPhone = classPhone.extractedPhone;
          const aiReplyPhone = await generateChatbotResponse(
            up("collect_phone"),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiReplyPhone, `Отлично! Теперь опишите, что вас беспокоит или какую процедуру вы хотели бы пройти.`);
          session.state = "collect_problem";
        } else {
          response = `Пожалуйста, введите ваш номер телефона в формате +7XXXXXXXXXX или 8XXXXXXXXXX.`;
          // Stay in collect_phone
        }
        session.data = data;
        break;
      }

      case "collect_problem": {
        const classification = await classifyPatientRequest(messageText, recentMessages);
        data.problemDescription = messageText.trim().slice(0, 200);
        data.serviceType = classification.serviceType;
        data.urgency = classification.urgency;
        data.patientType = classification.patientType;
        data.aiConfidence = classification.confidence;

        const mindMapData = settings.scriptMindMap as ScriptMindMapData | undefined;
        const hasMindMap = !!(mindMapData?.nodes?.length);
        const problemNode = findMindMapNodeByFsmState(mindMapData, "collect_problem");
        if (problemNode) {
          const branch = matchMindMapBranch(mindMapData, problemNode.id, {
            serviceType: classification.serviceType,
            userText: messageText,
          });
          data.activeMindMapNodeId = branch?.node.id ?? problemNode.id;
        } else {
          data.activeMindMapNodeId = resolveMindMapNodeIdForState(mindMapData, "collect_problem", {
            serviceType: classification.serviceType,
            userText: messageText,
          });
        }

        logger.info(
          { clinicId, phone, classification },
          "[ChatbotService] AI classified patient request",
        );

        let returningPatientDoctorId: string | undefined;
        if (classification.patientType === "returning") {
          const [existingPatient] = await db
            .select({ doctorId: patientsTable.doctorId })
            .from(patientsTable)
            .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, phone)))
            .limit(1);
          returningPatientDoctorId = existingPatient?.doctorId ?? undefined;
          if (returningPatientDoctorId) {
            data.returningDoctorId = returningPatientDoctorId;
          }
        }

        // Booking flow: defer doctor ranking until qualification is complete
        if (hasMindMap && usesBookingFlow(mindMapData)) {
          const hasKnowledge = hasClinicKnowledge(knowledgeContext);
          const earlyBranch = hasKnowledge
            ? await resolveBranchFromMessage(messageText, knowledgeContext, extractBranchFromText)
            : null;
          if (earlyBranch) {
            data.selectedBranch = earlyBranch;
            data.qualificationPhase = "branch";
          } else {
            data.qualificationPhase = "symptoms";
          }

          data.activeMindMapNodeId =
            resolveMindMapNodeIdForState(mindMapData, "collect_qualification", {
              serviceType: classification.serviceType,
              userText: messageText,
              activeNodeId: data.activeMindMapNodeId,
            }) ?? data.activeMindMapNodeId;

          const qualBackend = `Услуга: ${classification.serviceType}. Срочность: ${classification.urgency ?? "planned"}.`;
          const aiReply = await generateChatbotResponse(
            up("collect_qualification", { backendContext: qualBackend }),
            recentMessages,
            messageText,
            managerExamples,
          );
          const fallback =
            data.qualificationPhase === "branch"
              ? buildBranchPromptFallback(hasKnowledge)
              : buildSymptomsPromptFallback();
          response = mergeReply(aiReply, fallback);
          session.state = "collect_qualification";
          session.data = data;
          break;
        }

        const scoringOpts: AdvancedScoringOptions = {
          serviceType: classification.serviceType,
          urgency: classification.urgency,
          patientType: classification.patientType,
          returningPatientDoctorId,
          deterministic: dryRun,
        };
        const pickedDoctor =
          classification.confidence === "low"
            ? await pickTherapist(clinicId)
            : await pickBestDoctorAdvanced(clinicId, scoringOpts);

        if (pickedDoctor) {
          data.suggestedDoctorId = pickedDoctor.id;
          data.suggestedDoctorName = pickedDoctor.name;
        }

        const activeNode = data.activeMindMapNodeId
          ? mindMapData?.nodes?.find((n) => n.id === data.activeMindMapNodeId)
          : null;
        const nodeFsm = parseMindMapFsmState(activeNode?.fsmState);

        if (hasMindMap) {
          if (nodeFsm === "suggest_doctor" && isYes(messageText) && data.suggestedDoctorId) {
            data.confusedCount = 0;
            if (!data.patientName && !data.existingPatientId) {
              const aiAskName = await generateChatbotResponse(up("collect_name"), recentMessages, messageText, managerExamples);
              response = mergeReply(aiAskName, `Отлично! Подскажите, как к вам обращаться?`);
              session.state = "collect_name";
            } else {
              let slotsText = "";
              const slots = await getAvailableSlots(clinicId, data.suggestedDoctorId).catch(() => [] as Date[]);
              if (slots.length > 0) {
                slotsText = `\n\nБлижайшие свободные слоты:\n${formatSlots(slots)}\n\nИли укажите своё удобное время.`;
              }
              const aiReplyDt = await generateChatbotResponse(
                up("collect_datetime", { backendContext: `Врач: ${data.suggestedDoctorName ?? ""}.` }),
                recentMessages,
                messageText,
                managerExamples,
              );
              response = appendToReply(mergeReply(aiReplyDt, `Отлично! Когда вам удобно прийти к врачу *${data.suggestedDoctorName ?? ""}*?`), slotsText);
              session.state = "collect_datetime";
            }
            session.data = data;
            break;
          }

          const promptState = nodeFsm ?? "collect_problem";
          const doctorBackend =
            nodeFsm === "suggest_doctor" && data.suggestedDoctorName
              ? `Рекомендуемый врач: ${data.suggestedDoctorName}.`
              : undefined;
          const aiReply = await generateChatbotResponse(
            up(promptState, { backendContext: doctorBackend }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiReply, `Расскажите, пожалуйста, что вас беспокоит?`);
          session.state = nodeFsm && nodeFsm !== "collect_problem" ? nodeFsm : "collect_problem";
          session.data = data;
          break;
        }

        // Legacy flow without mind map
        if (classification.confidence === "low") {
          if (pickedDoctor) {
            const aiReply = await generateChatbotResponse(
              up("suggest_doctor", { backendContext: `Рекомендуемый врач: ${pickedDoctor.name}.` }),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiReply, `Понял! Для начала рекомендую записаться на консультацию к врачу *${pickedDoctor.name}* — он определит, какое лечение вам нужно.\n\nЗаписать вас? (Да / Нет)`);
            session.state = "suggest_doctor";
          } else {
            response = `Чтобы подобрать специалиста, уточните: что именно вас беспокоит?`;
          }
          session.data = data;
          break;
        }

        if (pickedDoctor) {
          const urgencyNote =
            classification.urgency === "urgent"
              ? " Вижу, что ситуация срочная — постараемся записать вас как можно скорее! 🚨"
              : "";
          const aiReply = await generateChatbotResponse(
            up("suggest_doctor", { backendContext: `Рекомендуемый врач: ${pickedDoctor.name}.` }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiReply, `Понял! Рекомендую врача *${pickedDoctor.name}*.${urgencyNote}\n\nЗаписать вас к нему? (Ответьте «Да» или «Нет»)`);
          session.state = "suggest_doctor";
        } else {
          response = `К сожалению, сейчас нет доступных врачей. Напишите «оператор», чтобы связаться с администратором.`;
        }

        session.data = data;
        break;
      }

      case "collect_qualification": {
        const mindMapData = settings.scriptMindMap as ScriptMindMapData | undefined;
        const qualClassification = await classifyPatientRequest(messageText, recentMessages);
        if (qualClassification.urgency) data.urgency = qualClassification.urgency;
        if (messageText.trim().length > 3) {
          const snippet = messageText.trim().slice(0, 200);
          data.problemDescription = data.problemDescription
            ? `${data.problemDescription} ${snippet}`.slice(0, 400)
            : snippet;
        }

        const hasKnowledge = hasClinicKnowledge(knowledgeContext);
        const phase = data.qualificationPhase ?? (data.selectedBranch ? "branch" : "symptoms");
        const inBranchPhase = phase === "branch" || !!data.selectedBranch;

        const extractedBranch = await resolveBranchFromMessage(
          messageText,
          knowledgeContext,
          extractBranchFromText,
          { allowFreeText: inBranchPhase },
        );

        if (extractedBranch) {
          data.selectedBranch = extractedBranch;
          data.confusedCount = 0;
        }

        data.qualificationAsked = true;

        if (phase === "symptoms") {
          data.qualificationPhase = "branch";
          data.activeMindMapNodeId =
            resolveMindMapNodeIdForState(mindMapData, "collect_qualification", {
              activeNodeId: data.activeMindMapNodeId,
            }) ?? data.activeMindMapNodeId;

          if (data.selectedBranch) {
            // Branch already mentioned — proceed to doctor ranking
          } else {
            const aiBranch = await generateChatbotResponse(
              up("collect_qualification", {
                backendContext: `Симптомы приняты. Срочность: ${data.urgency ?? "planned"}. ${hasKnowledge ? "Перечисли филиалы из материалов клиники." : "Попроси указать адрес или филиал."}`,
              }),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiBranch, buildBranchPromptFallback(hasKnowledge));
            session.state = "collect_qualification";
            session.data = data;
            break;
          }
        }

        if (!data.selectedBranch) {
          const aiBranch = await generateChatbotResponse(
            up("collect_qualification", {
              backendContext: hasKnowledge
                ? "Филиал не выбран — предложи адреса из материалов клиники."
                : "Филиал не выбран — попроси пациента написать удобный адрес.",
            }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiBranch, buildBranchPromptFallback(hasKnowledge));
          session.state = "collect_qualification";
          session.data = data;
          break;
        }

        const ranked = await assignRankedDoctor(clinicId, data, dryRun);
        data = ranked.data;

        if (!ranked.top) {
          response =
            "К сожалению, сейчас нет доступных врачей. Напишите «оператор», чтобы связаться с администратором.";
          session.state = "human_takeover";
          session.humanTakeover = true;
          if (!dryRun) await this.notifyHumanTakeover(clinicId, phone, data.patientName);
          else noteAction("Оператор: нет доступных врачей");
          session.data = data;
          break;
        }

        data.qualificationPhase = undefined;
        data.activeMindMapNodeId =
          resolveMindMapNodeIdForState(mindMapData, "suggest_doctor", {
            activeNodeId: data.activeMindMapNodeId,
          }) ?? data.activeMindMapNodeId;

        const doctorBackend =
          `Филиал: ${data.selectedBranch}. ` +
          `Рекомендация по рейтингу (${ranked.top.rankPercent}/100): ${ranked.top.name}. ` +
          `Причины: ${ranked.top.reasons.join(", ") || "оптимальный баланс загрузки и KPI"}.`;

        const aiDoctor = await generateChatbotResponse(
          up("suggest_doctor", { backendContext: doctorBackend }),
          recentMessages,
          messageText,
          managerExamples,
        );
        response = mergeReply(aiDoctor, buildDoctorPresentationFallback(ranked.top, data.urgency));
        session.state = "suggest_doctor";
        session.data = data;
        break;
      }

      case "await_decision": {
        const mindMapData = settings.scriptMindMap as ScriptMindMapData | undefined;
        const bookingFlow = usesBookingFlow(mindMapData);

        if (isYes(messageText) || isReadyToBook(messageText)) {
          data.decisionOutcome = "ready";
          data.confusedCount = 0;
          data.activeMindMapNodeId =
            resolveMindMapNodeIdForState(mindMapData, "collect_datetime", {
              activeNodeId: data.activeMindMapNodeId,
            }) ?? data.activeMindMapNodeId;

          if (!data.patientName && !data.existingPatientId) {
            const aiAskName = await generateChatbotResponse(
              up("collect_name", { backendContext: `Запись к врачу ${data.suggestedDoctorName ?? ""}, филиал ${data.selectedBranch ?? ""}.` }),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiAskName, `Отлично! Подскажите, как к вам обращаться?`);
            session.state = "collect_name";
            session.data = data;
            break;
          }

          let slotsText = "";
          if (data.suggestedDoctorId) {
            const slots = await getAvailableSlots(clinicId, data.suggestedDoctorId).catch(() => [] as Date[]);
            if (slots.length > 0) {
              slotsText = `\n\nБлижайшие свободные слоты:\n${formatSlots(slots)}\n\nИли укажите своё удобное время.`;
            }
          }
          const dtBackend = `Филиал: ${data.selectedBranch ?? ""}. Врач: ${data.suggestedDoctorName ?? ""}.`;
          const aiDt = await generateChatbotResponse(
            up("collect_datetime", { backendContext: dtBackend }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = appendToReply(
            mergeReply(aiDt, `Отлично! Когда вам удобно прийти${data.suggestedDoctorName ? ` к врачу *${data.suggestedDoctorName}*` : ""}?`),
            slotsText,
          );
          session.state = "collect_datetime";
        } else if (isHesitating(messageText) || (!isNo(messageText) && !isYes(messageText) && detectObjectionType(messageText))) {
          data.decisionOutcome = "hesitating";
          data.objectionType = detectObjectionType(messageText) ?? data.objectionType;
          data.activeMindMapNodeId =
            resolveMindMapNodeIdForState(mindMapData, "handle_objections", {
              activeNodeId: data.activeMindMapNodeId,
            }) ?? data.activeMindMapNodeId;

          const objectionBackend = data.objectionType
            ? `Причина сомнения: ${data.objectionType}. Предложи бесплатную консультацию, индивидуальный план, рассрочку 0-0-24, бесплатный осмотр.`
            : "Пациент сомневается — выясни причину и отработай возражения.";
          const aiObj = await generateChatbotResponse(
            up("handle_objections", { backendContext: objectionBackend }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(
            aiObj,
            "Понимаю 😊 Могу записать вас на бесплатный осмотр — врач осмотрит и составит план без обязательств. Рассрочка 0-0-24 тоже доступна.",
          );
          data.objectionsHandled = true;
          session.state = "handle_objections";
        } else if (isRefusing(messageText) || isNo(messageText)) {
          data.decisionOutcome = "refused";
          if (!dryRun) {
            logFunnelEvent({
              clinicId,
              phone,
              sessionId: session.id,
              variantId: data.abVariantId,
              eventType: "refused",
              fromState: stateAtTurnStart,
              toState: "done",
            });
          }
          data.activeMindMapNodeId =
            resolveMindMapNodeIdForState(mindMapData, "done", { activeNodeId: data.activeMindMapNodeId }) ??
            data.activeMindMapNodeId;

          const aiGoodbye = await generateChatbotResponse(
            up("done", { backendContext: "Пациент отказался от записи — поблагодари, оставь контакт, напомни об акциях." }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiGoodbye, buildRefusalFallback());
          session.state = "done";
        } else if (bookingFlow) {
          const aiClarify = await generateChatbotResponse(up("await_decision"), recentMessages, messageText, managerExamples);
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            if (!dryRun) await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            else noteAction("Оператор: уведомление администратору");
            response = "Соединяю вас с администратором — ожидайте ответа.";
          } else {
            response = mergeReply(aiClarify, buildDecisionFallback());
          }
        } else {
          response = buildDecisionFallback();
        }

        session.data = data;
        break;
      }

      case "handle_objections": {
        const mindMapData = settings.scriptMindMap as ScriptMindMapData | undefined;
        const objection = detectObjectionType(messageText);
        if (objection) data.objectionType = objection;

        if (isYes(messageText) || isReadyToBook(messageText)) {
          data.decisionOutcome = "ready";
          data.confusedCount = 0;
          data.activeMindMapNodeId =
            resolveMindMapNodeIdForState(mindMapData, "collect_datetime", {
              activeNodeId: data.activeMindMapNodeId,
            }) ?? data.activeMindMapNodeId;

          if (!data.patientName && !data.existingPatientId) {
            const aiAskName = await generateChatbotResponse(
              up("collect_name", { backendContext: "Пациент согласился после отработки возражений." }),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiAskName, `Отлично! Подскажите, как к вам обращаться?`);
            session.state = "collect_name";
            session.data = data;
            break;
          }

          let slotsText = "";
          if (data.suggestedDoctorId) {
            const slots = await getAvailableSlots(clinicId, data.suggestedDoctorId).catch(() => [] as Date[]);
            if (slots.length > 0) {
              slotsText = `\n\nБлижайшие свободные слоты:\n${formatSlots(slots)}\n\nИли укажите своё удобное время.`;
            }
          }
          const aiDt = await generateChatbotResponse(
            up("collect_datetime", { backendContext: "Повторное предложение записи после возражений." }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = appendToReply(mergeReply(aiDt, `Рада, что смогли помочь! Когда вам удобно прийти?`), slotsText);
          session.state = "collect_datetime";
          session.data = data;
          break;
        }

        if (isRefusing(messageText) || isNo(messageText)) {
          data.decisionOutcome = "refused";
          if (!dryRun) {
            logFunnelEvent({
              clinicId,
              phone,
              sessionId: session.id,
              variantId: data.abVariantId,
              eventType: "refused",
              fromState: stateAtTurnStart,
              toState: "done",
            });
          }
          const aiGoodbye = await generateChatbotResponse(
            up("done", { backendContext: "Пациент отказался после возражений." }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiGoodbye, buildRefusalFallback());
          session.state = "done";
          session.data = data;
          break;
        }

        const objectionBackend = data.objectionType
          ? `Возражение: ${data.objectionType}. Бесплатная консультация, индивидуальный план, рассрочка 0-0-24, бесплатный осмотр.`
          : "Отработай возражения и предложи бесплатный осмотр.";
        const aiObj = await generateChatbotResponse(
          up("handle_objections", { backendContext: objectionBackend }),
          recentMessages,
          messageText,
          managerExamples,
        );

        if (!data.objectionsHandled) {
          data.objectionsHandled = true;
          response = mergeReply(aiObj, "Могу записать вас на бесплатный осмотр — когда вам удобно?");
          session.state = "await_decision";
        } else {
          response = mergeReply(aiObj, buildDecisionFallback());
          session.state = "await_decision";
        }

        session.data = data;
        break;
      }

      case "suggest_doctor": {
        const mindMapData = settings.scriptMindMap as ScriptMindMapData | undefined;
        const bookingFlow = usesBookingFlow(mindMapData);

        if (isYes(messageText)) {
          data.confusedCount = 0;
          data.doctorConfirmed = true;

          if (bookingFlow && data.selectedBranch) {
            data.activeMindMapNodeId =
              resolveMindMapNodeIdForState(mindMapData, "await_decision", {
                activeNodeId: data.activeMindMapNodeId,
              }) ?? data.activeMindMapNodeId;

            const decisionBackend =
              `Врач подтверждён: ${data.suggestedDoctorName ?? ""} (рейтинг ${data.doctorRankPercent ?? "—"}/100). ` +
              `Филиал: ${data.selectedBranch}.`;
            const aiDecision = await generateChatbotResponse(
              up("await_decision", { backendContext: decisionBackend }),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiDecision, buildDecisionFallback());
            session.state = "await_decision";
            session.data = data;
            break;
          }

          if (!data.patientName && !data.existingPatientId) {
            const aiAskName = await generateChatbotResponse(
              up("collect_name", { backendContext: `Запись к врачу ${data.suggestedDoctorName ?? ""}.` }),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiAskName, `Отлично! Подскажите, как к вам обращаться?`);
            session.state = "collect_name";
            session.data = data;
            break;
          }

          const slotsText = await buildSlotsAppendix(clinicId, data.suggestedDoctorId, calendarConfig);
          const aiReply1 = await generateChatbotResponse(
            up("collect_datetime", { backendContext: `Врач: ${data.suggestedDoctorName ?? ""}.` }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = appendToReply(
            mergeReply(aiReply1, `Отлично! Когда вам удобно прийти к врачу *${data.suggestedDoctorName ?? ""}*?`),
            slotsText,
          );
          session.state = "collect_datetime";
        } else if (isNo(messageText) || wantsAlternativeDoctor(messageText)) {
          data.confusedCount = 0;
          const excluded = [
            ...(data.excludedDoctorIds ?? []),
            ...(data.suggestedDoctorId ? [data.suggestedDoctorId] : []),
          ];
          data.excludedDoctorIds = excluded;

          if (bookingFlow) {
            const stored = data.doctorCandidates ?? [];
            const nextStored = stored.find((c) => !excluded.includes(c.id));
            let nextCandidate = nextStored
              ? {
                  id: nextStored.id,
                  name: nextStored.name,
                  specialty: nextStored.specialty ?? null,
                  rankPercent: nextStored.score,
                  reasons: nextStored.reasons ?? [],
                  finalScore: nextStored.score,
                  hasCapacity: true,
                  nearestSlotMinutes: null,
                }
              : null;

            if (!nextCandidate) {
              const reranked = await assignRankedDoctor(clinicId, { ...data, excludedDoctorIds: excluded }, dryRun);
              data = reranked.data;
              nextCandidate = reranked.top;
            } else {
              data = {
                ...data,
                suggestedDoctorId: nextCandidate.id,
                suggestedDoctorName: nextCandidate.name,
                doctorPickReason: nextCandidate.reasons.join(", "),
                doctorRankPercent: nextCandidate.rankPercent,
              };
            }

            if (nextCandidate) {
              const aiAlt = await generateChatbotResponse(
                up("suggest_doctor", {
                  backendContext: `Альтернатива: ${nextCandidate.name}, рейтинг ${nextCandidate.rankPercent}/100.`,
                }),
                recentMessages,
                messageText,
                managerExamples,
              );
              response = mergeReply(aiAlt, buildDoctorPresentationFallback(nextCandidate, data.urgency));
              session.state = "suggest_doctor";
            } else {
              response =
                "К сожалению, других доступных врачей сейчас нет. Напишите «оператор» — администратор подберёт специалиста.";
              session.state = "human_takeover";
              session.humanTakeover = true;
              if (!dryRun) await this.notifyHumanTakeover(clinicId, phone, data.patientName);
              else noteAction("Оператор: нет альтернативных врачей");
            }
          } else {
            response = "Понял. Опишите снова, что вас беспокоит, и я помогу подобрать специалиста?";
            session.state = "collect_problem";
          }
        } else {
          const aiReply2 = await generateChatbotResponse(
            up("suggest_doctor"),
            recentMessages,
            messageText,
            managerExamples,
          );
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            if (!dryRun) await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            else noteAction("Оператор: уведомление администратору");
            response = "Соединяю вас с администратором — ожидайте ответа.";
          } else {
            const hint = bookingFlow
              ? `Ответьте «Да», «другой врач» или «Нет».`
              : `Пожалуйста, ответьте «Да» для записи к врачу или «Нет» для отмены.`;
            response = mergeReply(aiReply2, hint);
          }
        }
        session.data = data;
        break;
      }

      case "manage_appointment": {
        const lowerManage = messageText.toLowerCase().trim();
        const wantsReschedule = RESCHEDULE_KEYWORDS.some((kw) => lowerManage.includes(kw));
        const wantsCancel = CANCEL_KEYWORDS.some((kw) => lowerManage.includes(kw));
        const wantsKeep = isNo(messageText) || ["оставить", "всё хорошо", "все хорошо", "ничего", "қалдыру", "болсын", "жарайды"].some((kw) => lowerManage.includes(kw));

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
            up("collect_datetime", { backendContext: "Пациент хочет перенести запись." }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = appendToReply(mergeReply(aiReschedule, `Хорошо! На какую дату и время вы хотите перенести запись?`), slotsText);
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
            up("done", { backendContext: `Запись к врачу ${data.existingProcedureDoctorName ?? ""} отменена.` }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiCancel, `✅ Ваша запись к врачу *${data.existingProcedureDoctorName ?? ""}* отменена.\n\nЕсли захотите записаться снова — напишите нам. Будем рады помочь! 😊`);
          session.state = "done";
        } else if (wantsKeep || isYes(messageText)) {
          const aiKeep = await generateChatbotResponse(
            up("done", { backendContext: `Запись на ${data.existingProcedureDate ?? ""} сохранена.` }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiKeep, `Отлично! Ваша запись остаётся в силе. Ждём вас! 😊\n\nЕсли возникнут вопросы — пишите.`);
          session.state = "done";
        } else {
          // Ambiguous
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            if (!dryRun) await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            else noteAction("Оператор: уведомление администратору");
            response = "Соединяю вас с администратором — ожидайте ответа.";
          } else {
            const aiManage = await generateChatbotResponse(
              up("manage_appointment"),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiManage, `Пожалуйста, уточните: вы хотите *перенести*, *отменить* запись или *оставить* как есть?`);
          }
        }
        session.data = data;
        break;
      }

      case "collect_datetime": {
        const extractedDate = await extractDatetimeFromText(messageText).catch(() => null);
        if (extractedDate) {
          data.confusedCount = 0;

          const doctorId = data.suggestedDoctorId;
          let slotOk = true;
          let slotHint = "";

          if (doctorId && !dryRun) {
            const validation = await validateAppointmentSlot(
              clinicId,
              doctorId,
              extractedDate,
              calendarConfig,
              data.existingProcedureId,
            );
            if (!validation.ok) {
              slotOk = false;
              const alt = validation.nearestSlots?.length
                ? `\n\nБлижайшие свободные слоты:\n${formatSlotAlternatives(validation.nearestSlots, formatAlmatySlotCompact)}`
                : "";
              slotHint =
                validation.reason === "occupied"
                  ? `К сожалению, на ${formatAlmatyDateTimeLong(extractedDate)} уже есть запись.${alt}\n\nВыберите другое время.`
                  : validation.reason === "day_full"
                    ? `На этот день у врача уже полная запись.${alt}\n\nПредложите другой день.`
                    : `Это время вне рабочих часов клиники.${alt}\n\nУкажите время в рабочие часы.`;
            }
          } else if (doctorId && dryRun) {
            noteAction(`Проверка слота в календаре: ${formatAlmatyDateTimeLong(extractedDate)}`);
          }

          if (!slotOk) {
            const aiSlotRetry = await generateChatbotResponse(
              up("collect_datetime", { backendContext: slotHint }),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiSlotRetry, slotHint);
            session.data = data;
            break;
          }

          data.preferredDatetime = extractedDate.toISOString();
          session.data = data;

          const formattedDate = formatAlmatyDateTimeLong(extractedDate);
          const mindMapData = settings.scriptMindMap as ScriptMindMapData | undefined;
          const bookingFlow = usesBookingFlow(mindMapData);

          if (bookingFlow && data.selectedBranch) {
            const finalized = await finalizeBookingAppointment({
              clinicId,
              phone,
              data,
              branchToSave: data.selectedBranch,
              dryRun,
              noteAction,
              recentMessages,
              messageText,
              managerExamples,
              up,
              promptState: "confirm_appointment",
            });
            data = finalized.data;
            response = finalized.response;
            session.state = "done";
            session.data = data;
            break;
          }

          const aiReplyBranch = await generateChatbotResponse(
            up("collect_branch", { backendContext: `Выбранное время: ${formattedDate}.` }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiReplyBranch, `В какой из наших филиалов вам будет удобнее подойти?`);
          session.state = "collect_branch";
        } else {
          // Date not recognized
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            if (!dryRun) await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            else noteAction("Оператор: уведомление администратору");
            response = "Соединяю вас с администратором — он поможет выбрать удобное время.";
          } else {
            const aiDateRetry = await generateChatbotResponse(
              up("collect_datetime"),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiDateRetry, `Не смог разобрать дату. Пожалуйста, напишите, например: «завтра в 11:00» или «пятница в 14:30».`);
          }
          session.data = data;
        }
        break;
      }

      case "collect_branch": {
        const selectedBranch = await resolveBranchFromMessage(
          messageText,
          knowledgeContext,
          extractBranchFromText,
          { allowFreeText: true },
        );

        if (selectedBranch || messageText.trim().length > 3) {
          const branchToSave = selectedBranch || messageText.trim();
          const finalized = await finalizeBookingAppointment({
            clinicId,
            phone,
            data,
            branchToSave,
            dryRun,
            noteAction,
            recentMessages,
            messageText,
            managerExamples,
            up,
            promptState: "confirm_appointment",
          });
          data = finalized.data;
          response = finalized.response;
          session.state = "done";
          session.data = data;
        } else {
          // Branch not recognized
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            if (!dryRun) await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            else noteAction("Оператор: уведомление администратору");
            response = "Соединяю вас с администратором — он поможет выбрать удобный филиал.";
          } else {
            const aiBranchRetry = await generateChatbotResponse(
              up("collect_branch"),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiBranchRetry, `Пожалуйста, уточните филиал/адрес из списка предложенных.`);
          }
          session.data = data;
        }
        break;
      }

      case "confirm_appointment": {
        // Legacy state — when patient says yes, ask for datetime and create real procedure
        if (isYes(messageText)) {
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
            up("collect_datetime", { backendContext: `Врач: ${data.suggestedDoctorName ?? ""}.` }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = appendToReply(mergeReply(aiReply3, `Отлично! Когда вам удобно прийти к врачу *${data.suggestedDoctorName ?? ""}*?`), slotsText);
          session.state = "collect_datetime";
        } else if (isNo(messageText)) {
          data.confusedCount = 0;
          data.suggestedDoctorId = undefined;
          data.suggestedDoctorName = undefined;
          session.data = { patientName: data.patientName };
          response = `Хорошо, отменяем. Опишите снова, что вас беспокоит, и я помогу подобрать специалиста.`;
          session.state = "collect_problem";
        } else {
          const aiReply4 = await generateChatbotResponse(
            up("confirm_appointment"),
            recentMessages,
            messageText,
            managerExamples,
          );
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 3) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            if (!dryRun) await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            else noteAction("Оператор: уведомление администратору");
            response = "Соединяю вас с администратором — ожидайте ответа.";
          } else {
            response = mergeReply(aiReply4, `Пожалуйста, ответьте «Да» для подтверждения записи или «Нет» для отмены.`);
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
          return await finishTurn(session, "Произошла ошибка сессии. Пожалуйста, начните заново — введите ваш ИИН (12 цифр).");
        }

        const qaName =
          dryRun && scenarioCtx?.patient
            ? scenarioCtx.patient.name
            : (
                await db
                  .select({ name: patientsTable.name })
                  .from(patientsTable)
                  .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.id, qaPatientId)))
                  .limit(1)
              )[0]?.name ?? data.patientName ?? "пациент";

        const dentalContext =
          dryRun
            ? "Симуляция: карта зубов пациента (тестовые данные)."
            : await loadPatientDentalContext(clinicId, qaPatientId).catch(() => "");

        const qaReply = await generateChatbotResponse(
          buildDentalQaSystemPrompt(settings, qaName, dentalContext),
          recentMessages,
          messageText,
          managerExamples,
        );

        const qaText = qaReply ? joinChatbotReply(qaReply) : "";
        if (!qaReply || qaText.trim().startsWith("OPERATOR_NEEDED")) {
          // AI signals it can't answer this question — notify admin but keep chatbot active
          // so the patient can still ask other questions about their dental card.
          // Do NOT set humanTakeover = true here — that would permanently lock the chatbot.
          session.data = data;
          if (!dryRun) await this.notifyHumanTakeover(clinicId, phone, qaName);
          else noteAction("Оператор: вопрос передан администратору");
          const handoffReply =
            "Этот вопрос я передал администратору — он ответит в ближайшее время. 🙏\n\nЕсли у вас есть другие вопросы о вашей карте зубов или лечении — спрашивайте, я помогу!";
          return await finishTurn(session, handoffReply);
        }

        response = qaReply;
        // Stay in dental_qa for follow-up questions
        break;
      }

      case "reactivation": {
        // The patient replied to our reactivation message.
        // Use AI to generate the next response.
        const classification = await classifyPatientRequest(messageText, recentMessages);
        
        // If patient wants to reschedule / book:
        const lowerText = messageText.toLowerCase();
        const wantsBook = isYes(messageText) || /\b(перенести|записать|запись|время|дата|давай|хочу|жазылу|уақыт)\b/.test(lowerText);
        
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
            up("collect_datetime"),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = appendToReply(mergeReply(aiReply, `Отлично! Какое время и дата будут для вас удобны?`), slotsText);
          session.state = "collect_datetime";
        } else if (isNo(messageText) || /\b(нет|не надо|жоқ|керек емес)\b/.test(lowerText)) {
          // Patient does not want to book
          const aiReply = await generateChatbotResponse(
            up("done"),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiReply, `Хорошо, я вас понял. Если в будущем решите записаться — пишите нам в любое время. Всего вам доброго! 😊`);
          session.state = "done";
        } else {
          // General AI response for explaining the reason of no-show / negotiation
          const aiReply = await generateChatbotResponse(
            up("reactivation"),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiReply, `Я вас понял. Хотите ли вы выбрать другое время для визита? Мы сохраним для вас скидку 10%.`);
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
        userText: messageText,
        activeNodeId: data.activeMindMapNodeId,
      },
    );

    session.data = data;

    if (!response) {
      if (!dryRun) sendTypingToPatient(clinicId, phone, false).catch(() => {});
      return { outbound: null, session, simulatedActions };
    }
    return await finishTurn(session, response);
  }

  async simulateMessage(
    clinicId: string,
    userMessage: string,
    opts?: {
      userId?: string | null;
      session?: PlaygroundSessionInput;
      history?: ChatMessage[];
      scenario?: PlaygroundScenario;
      initGreeting?: boolean;
    },
  ): Promise<SimulateMessageResult> {
    await aiCreditsService.consumeCredits({
      clinicId,
      userId: opts?.userId,
      feature: "chatbot_test",
    });

    const settings = getEffectiveSettings(await getSettings(clinicId));
    const turn = await this.executeTurn(clinicId, PLAYGROUND_SIM_PHONE, userMessage, {
      dryRun: true,
      sessionInput: opts?.session,
      historyInput: opts?.history,
      scenario: opts?.scenario,
      initGreeting: opts?.initGreeting,
    });

    if (!turn) {
      return {
        reply: "Чат-бот отключён или недоступен.",
        parts: ["Чат-бот отключён или недоступен."],
        pausesMs: [0],
        fsmState: opts?.session?.state ?? "greeting",
        humanTakeover: false,
        sessionData: opts?.session?.data ?? {},
        mindMapNode: null,
        simulatedActions: [],
      };
    }

    const resolved = turn.outbound ?? replyFromText("...");
    return {
      ...formatSimulateMessageResult(
        { ...turn, outbound: resolved },
        settings,
        userMessage || "Здравствуйте",
      ),
    };
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

    const [managerExamples, doctorsWithSlots, clinicRow, knowledgeContext, priceListContext] = await Promise.all([
      getManagerExamples(clinicId),
      getClinicDoctorsWithSlots(clinicId).catch(() => [] as DoctorWithSlots[]),
      db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1).catch(() => []),
      loadKnowledgeContext(clinicId),
      loadPriceListContext(clinicId),
    ]);
    const reactivationClinicName = clinicRow[0]?.name ?? undefined;

    const reactivationPrompt = buildUnifiedScriptPrompt(
      settings,
      doctorsWithSlots,
      reactivationClinicName,
      knowledgeContext,
      priceListContext,
      {
        fsmState: "reactivation",
        channel: "whatsapp",
        backendContext: `Пациент ${patientName} отменил или не пришёл на процедуру «${procedureName}» к врачу ${doctorName}. Начни реактивацию: узнай причину и предложи перезапись со скидкой 10%.`,
      },
    );

    const aiReply = await generateChatbotResponse(
      reactivationPrompt,
      [],
      "Начни диалог реактивации — отправь первое сообщение пациенту.",
      managerExamples,
    );

    const reply = mergeReply(
      aiReply,
      `Здравствуйте, ${patientName}! Мы заметили, что ваш прием на процедуру «${procedureName}» был отменен. Всё ли у вас в порядке? Подскажите, пожалуйста, по какой причине не получилось прийти? Мы будем рады предложить вам перезапись на любое удобное время, а также специальную скидку 10% на эту процедуру. 😊`,
    );

    await saveSession(session);
    await sendOutboundReply(clinicId, patient.phone, reply).catch((err) =>
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

  private async notifyHumanTakeover(clinicId: string, phone: string, patientName?: string, handoffSummary?: string) {
    const recipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.clinicId, clinicId), inArray(usersTable.role, ["owner", "admin"])));

    if (recipients.length === 0) return;

    const name = patientName ?? phone;
    const msg = handoffSummary
      ? `${handoffSummary}\n\n👤 Пациент ${name} (${phone}) ждёт ответа оператора.`
      : `👤 Пациент ${name} (${phone}) запросил переключение на оператора в чат-боте.`;

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
    return getEffectiveSettings(await getSettings(clinicId));
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
      calendarConfig?: ChatbotSettings["calendarConfig"];
      abTestEnabled?: boolean;
      scriptVariants?: ChatbotSettings["scriptVariants"];
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

  async getFunnelAnalytics(clinicId: string, days = 30) {
    const [analytics, settings] = await Promise.all([
      getChatbotFunnelAnalytics(clinicId, days),
      getSettings(clinicId),
    ]);
    const variantMap = new Map(
      ((settings.scriptVariants ?? []) as Array<{ id: string; name: string }>).map((v) => [v.id, v.name]),
    );
    return {
      ...analytics,
      variants: analytics.variants.map((v) => ({
        ...v,
        variantName: variantMap.get(v.variantId) ?? v.variantName,
      })),
    };
  }

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

  // ─── Test message (Playground — same FSM as WhatsApp, dry-run) ─────────────

  async testMessage(
    clinicId: string,
    userMessage: string,
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
    userId?: string | null,
    opts?: {
      fsmState?: ChatbotState;
      session?: PlaygroundSessionInput;
      scenario?: PlaygroundScenario;
      initGreeting?: boolean;
    },
  ): Promise<SimulateMessageResult> {
    const sessionInput =
      opts?.session ??
      (opts?.fsmState
        ? { state: opts.fsmState, data: {} as ChatbotSessionData, humanTakeover: false }
        : undefined);

    return this.simulateMessage(clinicId, userMessage, {
      userId,
      session: sessionInput,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      scenario: opts?.scenario,
      initGreeting: opts?.initGreeting ?? (!userMessage && history.length === 0),
    });
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

  async setSessionTakeover(clinicId: string, phone: string, takeover: boolean) {
    let session = await loadSession(clinicId, phone);
    if (!session) {
      session = {
        id: randomUUID(),
        clinicId,
        phone,
        state: takeover ? "human_takeover" : "greeting",
        data: {},
        humanTakeover: takeover,
      };
    } else {
      session.humanTakeover = takeover;
      if (takeover) {
        session.state = "human_takeover";
      } else if (session.state === "human_takeover") {
        session.state = session.data.problemDescription ? "collect_problem" : "greeting";
      }
    }
    await saveSession(session);
    return session;
  }

  async pauseBotForStaffMessage(clinicId: string, phone: string): Promise<void> {
    const session = await loadSession(clinicId, phone);
    if (!session || session.humanTakeover) return;
    session.humanTakeover = true;
    await saveSession(session);
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
      let priceListContext: string;
      let doctorsWithSlots: DoctorWithSlots[];
      let clinicName: string | undefined;

      try {
        const [settingsRow, managerExamplesRow, knowledgeContextRow, priceListContextRow, doctorsWithSlotsRow, clinicRow] = await Promise.all([
          getSettings(session.clinicId),
          getManagerExamples(session.clinicId),
          loadKnowledgeContext(session.clinicId),
          loadPriceListContext(session.clinicId),
          getClinicDoctorsWithSlots(session.clinicId).catch(() => [] as DoctorWithSlots[]),
          db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, session.clinicId)).limit(1).catch(() => []),
        ]);
        settings = settingsRow;
        managerExamples = managerExamplesRow;
        knowledgeContext = knowledgeContextRow;
        priceListContext = priceListContextRow;
        doctorsWithSlots = doctorsWithSlotsRow;
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
      const helperPrompt = buildUnifiedScriptPrompt(
        settings,
        doctorsWithSlots,
        clinicName,
        knowledgeContext,
        priceListContext,
        {
          fsmState: session.state as ChatbotState,
          serviceType: reminderData.serviceType,
          activeMindMapNodeId: reminderData.activeMindMapNodeId
            ?? resolveMindMapNodeIdForState(mindMapForReminder, session.state as ChatbotState),
          channel: "whatsapp",
          backendContext: stateGuidance,
        },
      );

      const aiReminder = await generateChatbotResponse(
        helperPrompt,
        recentMessages,
        "Отправь вежливое напоминание (reminder)",
        managerExamples,
      );
      const reminderReply = mergeReply(aiReminder, "Напоминаем — мы остановились на записи. Нужна помощь? Напишите, и мы продолжим.");
      if (reminderReply.parts.length > 0) {
        await sendOutboundReply(session.clinicId, session.phone, reminderReply).catch((err) =>
          logger.error({ err }, "[ChatbotService] Failed to send inactivity reminder"),
        );
      }
    }
  }

  async checkLeadNurtureFollowups() {
    const sessions = await db
      .select()
      .from(chatbotSessionsTable)
      .where(
        and(
          ne(chatbotSessionsTable.state, "done"),
          ne(chatbotSessionsTable.state, "human_takeover"),
          eq(chatbotSessionsTable.humanTakeover, false),
        ),
      );

    const now = Date.now();

    for (const row of sessions) {
      const state = row.state as ChatbotState;
      if (!LEAD_NURTURE_STATES.includes(state)) continue;

      const data = row.data as ChatbotSessionData;
      if (data.decisionOutcome === "refused") continue;
      if (data.leadFollowup168Sent) continue;

      const anchorMs = new Date(data.leadNurtureAnchorAt ?? row.updatedAt).getTime();
      const hoursSince = (now - anchorMs) / (60 * 60 * 1000);

      let stage: 0 | 1 | 2 | null = null;
      if (hoursSince >= LEAD_NURTURE_HOURS[2] && !data.leadFollowup168Sent && data.leadFollowup72Sent) {
        stage = 2;
      } else if (hoursSince >= LEAD_NURTURE_HOURS[1] && !data.leadFollowup72Sent && data.leadFollowup24Sent) {
        stage = 1;
      } else if (hoursSince >= LEAD_NURTURE_HOURS[0] && !data.leadFollowup24Sent) {
        stage = 0;
      }
      if (stage === null) continue;

      let settings: Awaited<ReturnType<typeof getSettings>>;
      try {
        settings = getEffectiveSettings(await getSettings(row.clinicId));
      } catch {
        continue;
      }
      if (!settings.enabled) continue;

      const templates = getLeadNurtureTemplates(settings);
      const fallbackText = templates[stage]!;

      if (!data.leadNurtureAnchorAt) {
        data.leadNurtureAnchorAt = new Date(anchorMs).toISOString();
      }
      if (stage === 0) data.leadFollowup24Sent = true;
      if (stage === 1) data.leadFollowup72Sent = true;
      if (stage === 2) data.leadFollowup168Sent = true;

      await saveSession({
        id: row.id,
        clinicId: row.clinicId,
        phone: row.phone,
        state,
        data,
        humanTakeover: row.humanTakeover,
      });

      logger.info({ phone: row.phone, stage, hoursSince }, "[ChatbotService] Sending lead nurture follow-up");

      const recentRows = await db
        .select()
        .from(chatbotMessagesTable)
        .where(and(eq(chatbotMessagesTable.clinicId, row.clinicId), eq(chatbotMessagesTable.phone, row.phone)))
        .orderBy(asc(chatbotMessagesTable.createdAt))
        .limit(20);

      const recentMessages = recentRows.map((r) => ({
        role: r.direction === "inbound" ? ("user" as const) : ("assistant" as const),
        content: r.content,
      }));

      let managerExamples: ManagerExample[] = [];
      let knowledgeContext = "";
      let priceListContext = "";
      let doctorsWithSlots: DoctorWithSlots[] = [];
      let clinicName: string | undefined;

      try {
        [managerExamples, knowledgeContext, priceListContext, doctorsWithSlots, clinicName] = await Promise.all([
          getManagerExamples(row.clinicId),
          loadKnowledgeContext(row.clinicId, data.problemDescription ?? ""),
          loadPriceListContext(row.clinicId),
          getClinicDoctorsWithSlots(row.clinicId).catch(() => [] as DoctorWithSlots[]),
          db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, row.clinicId)).limit(1).then((rows) => rows[0]?.name),
        ]);
      } catch (err) {
        logger.error({ err }, "[ChatbotService] Failed to load context for lead nurture");
        await sendOutboundReply(row.clinicId, row.phone, fallbackText).catch(() => {});
        continue;
      }

      const nurtureGuidance = `Пациент не завершил запись (этап «${state}»). Отправь мягкое follow-up сообщение — дожим без давления. Это этап ${stage + 1} из 3 серии напоминаний.`;

      const helperPrompt = buildUnifiedScriptPrompt(
        settings,
        doctorsWithSlots,
        clinicName,
        knowledgeContext,
        priceListContext,
        {
          fsmState: state,
          serviceType: data.serviceType,
          activeMindMapNodeId: data.activeMindMapNodeId,
          channel: "whatsapp",
          backendContext: `${nurtureGuidance}\n\nБазовый шаблон:\n${fallbackText}`,
        },
      );

      const aiNurture = await generateChatbotResponse(
        helperPrompt,
        recentMessages,
        "Отправь follow-up для дожима лида",
        managerExamples,
      );
      const nurtureReply = mergeReply(aiNurture, fallbackText);
      if (nurtureReply.parts.length > 0) {
        await sendOutboundReply(row.clinicId, row.phone, nurtureReply).catch((err) =>
          logger.error({ err }, "[ChatbotService] Failed to send lead nurture follow-up"),
        );
      }
    }
  }
}
