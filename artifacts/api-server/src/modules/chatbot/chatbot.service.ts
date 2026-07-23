import { randomUUID } from "crypto";
import IORedis from "ioredis";
import {
  db,
  pool,
  chatbotSettingsTable,
  chatbotSessionsTable,
  chatbotMessagesTable,
  chatbotManagerExamplesTable,
  messagesTable,
  patientsTable,
  usersTable,
  proceduresTable,
  toothRecordsTable,
  toothTreatmentsTable,
  treatmentPlansTable,
  treatmentPlanItemsTable,
  clinicsTable,
  clinicBranchesTable,
  knowledgeSourcesTable,
  procedureTemplatesTable,
} from "@workspace/db";
import type { StepInstructions } from "@workspace/db";
import { eq, and, inArray, gte, lte, ne, asc, desc, sql } from "drizzle-orm";
import { phonesMatch } from "../../shared/phone";
import { TREATING_DOCTOR_ROLES } from "../../lib/clinical-roles";
import { resolvePatientByPhone, setMarketingOptOut, ensureWhatsAppContactPatient, updatePatientNameByPhone, normalizedPhoneForStorage } from "../../shared/patient-phone-resolver";
import { mirrorChatbotMessageToPatient, syncChatbotMessagesToPatient } from "../../shared/whatsapp-message-sync";
import { withSessionLock } from "../../shared/session-lock";
import { parseReviewScoreFromText, savePatientReview } from "../../shared/patient-reviews";
import { isRedAlert } from "../../shared/whatsapp";
import { chatbotDefaultsForNewClinic } from "../platform-config/platform-config.service";
import { sendToPatient, sendTypingToPatient, startTypingKeepalive } from "../../shared/messaging";
import { getAlertQueue } from "../../shared/alert-queue";
import { insertNotifications } from "../../shared/notifications-dispatch";
import { logger } from "../../lib/logger";
import type { DoctorCandidate } from "../analytics/analytics.repository";
import { ChannelsRepository } from "../channels/channels.repository";
import {
  classifyPatientRequest,
  generateChatbotResponse,
  extractDatetimeFromText,
  extractBranchFromText,
  detectServiceTypeFromKeywords,
  joinChatbotReply,
  mergeReply,
  appendToReply,
  polishReply,
  conciseReply,
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
import { createChatCompletion, FAST_MODEL, parseLlmJson, assertOpenRouterConfigured } from "../../lib/openrouter-client";
import { aiCreditsService } from "../../shared/ai-credits";
import { planLimitsService } from "../../shared/plan-limits.service";
import { InsufficientAiCreditsError, PlanLimitExceededError } from "../../shared/errors/index";
import {
  renderMindMapCompactPath,
  renderMindMapScript,
  resolveMindMapNodeIdForState,
  getGreetingContentFromMindMap,
  findMindMapRootId,
  type ScriptMindMapData,
} from "./mindmap-utils";
import { validateMindMapScript, mergeMindMapWithDefault } from "./mindmap-validator";
import { shouldUseAgentTurn } from "./chatbot-agent.types";
import { runChatbotAgentTurn } from "./chatbot-agent-turn";
import { looksLikeRealPatientName } from "./chatbot-patient-identity";
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
import { KNOWLEDGE_CONTEXT_MAX_CHARS, getComposedChatbotPrompt, type ChatbotPromptComposeInputs } from "./chatbot-prompt-composer";
import {
  hasClinicKnowledge,
  isUsableClinicKnowledge,
  buildRefusalFallback,
  resolveBranchFromMessage,
  buildBranchListMessage,
  isBranchListInquiry,
  isPatientInquiry,
  isPriceInquiry,
} from "./clinic-knowledge";
import { scheduleAppointmentReminders } from "../followups/appointment-reminders.queue";
import { transitionPatientStage, PATIENT_STAGE_TRIGGERS } from "../patients/patient-stage.service";
import {
  isExplicitNegativeRepeatSaleReply,
  isMarketingOptOutReply,
  isNeutralRepeatSaleQuestion,
  isPositiveRepeatSaleReplyKeywords,
} from "./repeat-sale-reply";
import {
  markBroadcastBooking,
  markBroadcastReply,
} from "../dental-broadcast/dental-broadcast-metrics";
import {
  assignRankedDoctor,
  buildBranchPromptFallback,
  buildDoctorPresentationFallback,
  buildSymptomsPromptFallback,
  wantsAlternativeDoctor,
} from "./booking-fsm";
import { logChatbotTurnMeta } from "./chatbot-prompt-log";
import { canonicalChatbotPhone, chatbotPhoneLookupKeys } from "./chatbot-phone";
import {
  buildHistoryPreview,
  computeHistoryAgeMs,
  logChatbotTurnDiagnostics,
  type ChatbotEarlyExitReason,
  type ChatbotTurnDiagnostics,
} from "./chatbot-turn-diagnostics";
import {
  buildKnowledgeQueryFromTurn,
  excludeTrailingDuplicateUserMessage,
} from "./chatbot-history";
import {
  clearTakeoverAt,
  isBotResumeRequest,
  markSessionHumanTakeover,
  reopenDoneSessionData,
  shouldAutoResetHumanTakeover,
} from "./chatbot-session-resume";
import {
  buildChatbotPrompt,
  buildTaskForState,
  buildFollowUpMiniPrompt,
  type ChatbotPromptFacts,
  type BuildTaskForStateCtx,
} from "./chatbot-prompt-builder";

type CachedSettings = { settings: ChatbotSettings; expiresAt: number };
type CachedExamples = { examples: ManagerExample[]; expiresAt: number };
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
const BRANCH_DEFER_FALLBACK = "Напишите, когда будет удобно — продолжим 😊";

function isOperatorRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return OPERATOR_KEYWORDS.some((kw) => lower.includes(kw));
}
function matchesConfirmWord(text: string, keyword: string): boolean {
  const lower = text.toLowerCase().trim();
  if (lower === keyword) return true;
  // Symbols like "+" and emoji — exact match only (checked above)
  if (!/^[a-zа-яёәғқңөұүі]/i.test(keyword)) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s,])${escaped}(?=$|[\\s.,!?)»"']|👍)`, "i").test(lower);
}
function isYes(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return CONFIRM_YES.some((kw) => matchesConfirmWord(lower, kw));
}
function isNo(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return CONFIRM_NO.some((kw) => lower === kw || lower.startsWith(kw + " "));
}

/** Patient confirms he will come to the appointment («да», «буду», «приду»...). */
function isVisitConfirmYes(text: string): boolean {
  const lower = text.toLowerCase().trim();
  // «не приду», «не буду», «не успею» — this is a refusal, not a confirmation.
  if (/не\s+(буду|приду|придем|придём|подойду|подъеду|успею|смогу|получится)/i.test(lower)) return false;
  if (isYes(lower)) return true;
  return /(^|[\s,])(буду|приду|придем|придём|подойду|подъеду|успею|в силе|барамын|келемін|келем)(?=$|[\s.,!?)»"']|👍)/i.test(
    lower,
  );
}

/** Patient says he will not make it to the appointment. */
function isVisitConfirmNo(text: string): boolean {
  if (isNo(text)) return true;
  const lower = text.toLowerCase().trim();
  if (/не\s+(смогу|приду|придем|придём|успею|успеваю|получится|подойду|подъеду)/i.test(lower)) return true;
  return RESCHEDULE_KEYWORDS.some((kw) => lower.includes(kw)) || CANCEL_KEYWORDS.some((kw) => lower.includes(kw));
}

function symptomsAnswered(data: ChatbotSessionData, messageText: string): boolean {
  const desc = data.problemDescription?.trim() ?? "";
  if (desc.length > 12) return true;
  if (data.serviceType && data.serviceType !== "unknown") return true;
  if (data.qualificationAsked) return true;
  if (messageText.trim().length > 12 && !isPlainGreeting(messageText)) return true;
  return false;
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
  const keys = chatbotPhoneLookupKeys(phone);
  for (const key of keys) {
    if (redis) {
      try {
        const raw = await redis.get(`${REDIS_KEY_PREFIX}${clinicId}:${key}`);
        if (raw) {
          try {
            const session = JSON.parse(raw) as SessionRecord;
            return { ...session, phone: canonicalChatbotPhone(session.phone) };
          } catch (err) {
            logger.warn({ err, clinicId, key }, "[ChatbotSession] corrupt Redis session JSON — deleting key");
            await redis.del(`${REDIS_KEY_PREFIX}${clinicId}:${key}`).catch(() => {});
          }
        }
      } catch (err) {
        logger.warn({ err }, "[ChatbotSession] Redis get failed, falling back to DB");
      }
    }

    const [row] = await db
      .select()
      .from(chatbotSessionsTable)
      .where(and(eq(chatbotSessionsTable.clinicId, clinicId), eq(chatbotSessionsTable.phone, key)))
      .limit(1);

    if (!row) continue;

    const age = Date.now() - new Date(row.updatedAt).getTime();
    if (age > SESSION_TTL_SECONDS * 1000) continue;

    const canonicalPhone = canonicalChatbotPhone(row.phone);
    if (row.phone !== canonicalPhone) {
      db.update(chatbotSessionsTable)
        .set({ phone: canonicalPhone, updatedAt: new Date() })
        .where(eq(chatbotSessionsTable.id, row.id))
        .catch((err) => logger.warn({ err, sessionId: row.id }, "[ChatbotSession] failed to migrate phone format"));
    }

    const session: SessionRecord = {
      id: row.id,
      clinicId: row.clinicId,
      phone: canonicalPhone,
      state: row.state as ChatbotState,
      data: (row.data ?? {}) as ChatbotSessionData,
      humanTakeover: row.humanTakeover,
    };

    if (redis) {
      redis
        .setex(`${REDIS_KEY_PREFIX}${clinicId}:${session.phone}`, SESSION_TTL_SECONDS, JSON.stringify(session))
        .catch(() => {});
    }

    return session;
  }

  return null;
}

async function saveSession(session: SessionRecord): Promise<void> {
  const canonicalPhone = canonicalChatbotPhone(session.phone);
  const normalizedSession = { ...session, phone: canonicalPhone };

  const updated = await db
    .update(chatbotSessionsTable)
    .set({
      phone: canonicalPhone,
      state: normalizedSession.state,
      data: normalizedSession.data as Record<string, unknown>,
      humanTakeover: normalizedSession.humanTakeover,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(chatbotSessionsTable.id, normalizedSession.id),
        eq(chatbotSessionsTable.clinicId, normalizedSession.clinicId),
      ),
    )
    .returning({ id: chatbotSessionsTable.id });

  if (updated.length === 0) {
    await db
      .insert(chatbotSessionsTable)
      .values({
        id: normalizedSession.id,
        clinicId: normalizedSession.clinicId,
        phone: canonicalPhone,
        state: normalizedSession.state,
        data: normalizedSession.data as Record<string, unknown>,
        humanTakeover: normalizedSession.humanTakeover,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [chatbotSessionsTable.clinicId, chatbotSessionsTable.phone],
        set: {
          state: normalizedSession.state,
          data: normalizedSession.data as Record<string, unknown>,
          humanTakeover: normalizedSession.humanTakeover,
          updatedAt: new Date(),
        },
      });
  }

  if (redis) {
    for (const key of chatbotPhoneLookupKeys(session.phone)) {
      if (key !== canonicalPhone) {
        redis.del(`${REDIS_KEY_PREFIX}${normalizedSession.clinicId}:${key}`).catch(() => {});
      }
    }
    redis
      .setex(
        `${REDIS_KEY_PREFIX}${normalizedSession.clinicId}:${canonicalPhone}`,
        SESSION_TTL_SECONDS,
        JSON.stringify(normalizedSession),
      )
      .catch((err: Error) => logger.warn({ err }, "[ChatbotSession] Redis setex failed after DB write"));
  }
}

async function deleteRedisSession(clinicId: string, phone: string): Promise<void> {
  if (!redis) return;
  for (const key of chatbotPhoneLookupKeys(phone)) {
    try {
      await redis.del(`${REDIS_KEY_PREFIX}${clinicId}:${key}`);
    } catch (_) { /* ignore */ }
  }
}

// ─── Chatbot message persistence ─────────────────────────────────────────────

type PatientPhoneRow = {
  id: string;
  name: string;
  phone: string;
  status: string | null;
  doctorId: string | null;
};

async function findPatientByPhoneNormalized(
  clinicId: string,
  phone: string,
): Promise<PatientPhoneRow | undefined> {
  const resolved = await resolvePatientByPhone(clinicId, phone);
  if (!resolved) return undefined;
  return {
    id: resolved.id,
    name: resolved.name,
    phone: resolved.phone,
    status: resolved.status,
    doctorId: resolved.doctorId,
  };
}

async function saveChatbotMessage(
  clinicId: string,
  phone: string,
  direction: "inbound" | "outbound",
  content: string,
): Promise<void> {
  const canonicalPhone = canonicalChatbotPhone(phone);
  await db
    .insert(chatbotMessagesTable)
    .values({ id: randomUUID(), clinicId, phone: canonicalPhone, direction, content })
    .catch((err) => logger.error({ err }, "[ChatbotService] Failed to save chatbot message"));

  if (direction !== "outbound") return;

  try {
    const patient = await ensureWhatsAppContactPatient(clinicId, phone);
    await mirrorChatbotMessageToPatient(clinicId, patient.id, "outbound", content);
  } catch (err) {
    logger.error({ err }, "[ChatbotService] Failed to mirror outbound chatbot message to CRM WhatsApp chat");
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

import {
  getKnowledgeCacheEntry,
  setKnowledgeCacheEntry,
} from "../knowledge/knowledge-cache";

// Doctors cache (5min TTL)
const doctorsCache = new Map<string, CachedDoctors>();

// Price list cache (2min TTL) — clinic procedure templates with prices
const priceListCache = new Map<string, CachedPriceList>();

async function loadKnowledgeContext(clinicId: string, query?: string): Promise<string> {
  const cachedText = getKnowledgeCacheEntry(clinicId);
  let fullText: string;
  if (cachedText !== null) {
    fullText = cachedText;
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
        setKnowledgeCacheEntry(clinicId, "");
        return "";
      }

      fullText = sources
        .map((s) => `=== ${s.name} ===\n${(s.extractedText ?? "").slice(0, 8000)}`)
        .join("\n\n---\n\n");

      setKnowledgeCacheEntry(clinicId, fullText);
    } catch (err) {
      logger.warn({ err }, "[ChatbotService] loadKnowledgeContext failed — skipping knowledge injection");
      return "";
    }
  }

  if (query?.trim()) {
    return retrieveRelevantKnowledge(fullText, query, { maxChars: KNOWLEDGE_CONTEXT_MAX_CHARS, topK: 8 });
  }
  return fullText.slice(0, KNOWLEDGE_CONTEXT_MAX_CHARS);
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
        inArray(usersTable.role, [...TREATING_DOCTOR_ROLES]),
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

let chatbotSettingsSchemaReady: Promise<void> | null = null;

/** Production DB may lag migrations journal — ensure columns Drizzle selects exist. */
async function ensureChatbotSettingsSchema(): Promise<void> {
  if (!chatbotSettingsSchemaReady) {
    chatbotSettingsSchemaReady = (async () => {
      await pool.query(
        `ALTER TABLE "chatbot_settings" ADD COLUMN IF NOT EXISTS "broadcast_ai_enabled" boolean DEFAULT false NOT NULL`,
      );
      await pool.query(
        `ALTER TABLE "chatbot_settings" ADD COLUMN IF NOT EXISTS "agent_mode_enabled" boolean DEFAULT true NOT NULL`,
      );
    })().catch((err) => {
      chatbotSettingsSchemaReady = null;
      logger.error({ err }, "[ChatbotService] Failed to ensure chatbot_settings schema");
      throw err;
    });
  }
  await chatbotSettingsSchemaReady;
}

async function getSettings(clinicId: string): Promise<ChatbotSettings> {
  await ensureChatbotSettingsSchema();

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
  const defaults = chatbotDefaultsForNewClinic();
  const [created] = await db
    .insert(chatbotSettingsTable)
    .values({ id, clinicId, ...defaults })
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
  return settings;
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
    await insertNotifications(
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
  const existing = await findPatientByPhoneNormalized(clinicId, phone);
  if (existing) {
    await db
      .update(patientsTable)
      .set({
        name,
        doctorId,
        iin: iin ?? undefined,
        status,
        phoneNormalized: normalizedPhoneForStorage(phone),
        updatedAt: new Date(),
      })
      .where(and(eq(patientsTable.id, existing.id), eq(patientsTable.clinicId, clinicId)));
    const [updated] = await db
      .select()
      .from(patientsTable)
      .where(and(eq(patientsTable.id, existing.id), eq(patientsTable.clinicId, clinicId)))
      .limit(1);
    return updated!;
  }

  const id = randomUUID();
  const [patient] = await db
    .insert(patientsTable)
    .values({
      id,
      clinicId,
      name,
      phone,
      phoneNormalized: normalizedPhoneForStorage(phone),
      iin: iin ?? null,
      source: source ?? "whatsapp",
      status,
      doctorId,
    })
    .returning();
  await syncChatbotMessagesToPatient(clinicId, phone, id).catch((err) =>
    logger.warn({ err, patientId: id }, "ChatbotService: chat history backfill failed after createPatient"),
  );
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
  clinicName?: string,
): string {
  const si = (settings.stepInstructions ?? {}) as StepInstructions;
  const generalExtra = si.general ? `\n\nДополнительные инструкции клиники:\n${si.general}` : "";
  const resolvedName = resolveClinicName(settings, clinicName) ?? "стоматологической клиники";

  return `Ты — вежливый и профессиональный AI-ассистент клиники «${resolvedName}» (Казахстан).
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

function resolveClinicName(
  settings: Awaited<ReturnType<typeof getSettings>>,
  clinicName?: string,
): string {
  return (
    clinicName?.trim() ||
    settings.greetingTemplate?.match(/«(.+?)»/)?.[1]?.trim() ||
    settings.greetingTemplate?.match(/"(.+?)"/)?.[1]?.trim() ||
    "нашу клинику"
  );
}

function createPromptPlaceholderResolver(params: {
  clinicName: string;
  date: string;
  time: string;
  doctorName: string;
}) {
  return (text: string) =>
    text
      .replace(/\{\{clinic_name\}\}/g, params.clinicName)
      .replace(/\{\{date\}\}/g, params.date)
      .replace(/\{\{time\}\}/g, params.time)
      .replace(/\{\{doctor_name\}\}/g, params.doctorName);
}

function hydrateMindMapPlaceholders(
  mindMap: ScriptMindMapData | undefined,
  resolvePlaceholders: (text: string) => string,
): ScriptMindMapData | undefined {
  if (!mindMap?.nodes?.length) return mindMap;
  return {
    ...mindMap,
    nodes: mindMap.nodes.map((node) => ({
      ...node,
      label: resolvePlaceholders(node.label ?? ""),
      content: resolvePlaceholders(node.content ?? ""),
    })),
    edges: (mindMap.edges ?? []).map((edge) => ({
      ...edge,
      label: edge.label ? resolvePlaceholders(edge.label) : edge.label,
    })),
  };
}

function buildDoctorBackendContext(candidate: DoctorCandidate, data: ChatbotSessionData): string {
  const reasons = candidate.reasons.length > 0
    ? candidate.reasons.join(", ")
    : "оптимальный баланс рейтинга, загрузки и доступных слотов";
  return [
    data.selectedBranch ? `Филиал: ${data.selectedBranch}.` : null,
    `Рекомендация по рейтингу (${candidate.rankPercent}/100): ${candidate.name}.`,
    candidate.specialty ? `Специализация: ${candidate.specialty}.` : null,
    `Причины выбора: ${reasons}.`,
    candidate.nearestSlotMinutes != null
      ? `Ближайшее окно примерно через ${candidate.nearestSlotMinutes} мин.`
      : null,
  ].filter(Boolean).join(" ");
}

function selectScriptBlocksForState(blocks: ScriptBlock[], state: ChatbotState): ScriptBlock[] {
  const preferredIds: Partial<Record<ChatbotState, string[]>> = {
    greeting: ["greeting"],
    collect_iin: ["qualification"],
    collect_name: ["appointment"],
    collect_phone: ["appointment"],
    collect_problem: ["qualification", "services"],
    collect_qualification: ["qualification"],
    suggest_doctor: ["decision"],
    await_decision: ["decision"],
    handle_objections: ["objections"],
    manage_appointment: ["appointment"],
    show_slots: ["appointment"],
    collect_datetime: ["appointment"],
    collect_branch: ["appointment"],
    confirm_appointment: ["appointment"],
    dental_qa: ["services"],
    done: ["followup"],
    human_takeover: ["objections"],
    reactivation: ["followup"],
  };
  const ids = preferredIds[state] ?? [];
  const selected = blocks.filter((block) => ids.includes(block.id));
  return selected.length > 0 ? selected : blocks.slice(0, 1);
}

function isPlainGreeting(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^\p{L}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  const greetings = [
    "здравствуйте",
    "привет",
    "добрый день",
    "доброе утро",
    "добрый вечер",
    "салем",
    "сәлем",
    "hello",
    "hi",
  ];
  return greetings.some((g) => normalized === g || normalized === `${g} вам`);
}

type UnifiedScriptPromptOpts = {
  fsmState?: ChatbotState;
  serviceType?: string;
  userText?: string;
  activeMindMapNodeId?: string;
  channel?: "playground" | "whatsapp";
  backendContext?: string;
  officialBranches?: string[];
  sessionData?: ChatbotSessionData;
  taskCtx?: Partial<BuildTaskForStateCtx>;
};

const STATE_INSTRUCTION_KEYS: Record<ChatbotState, keyof StepInstructions | null> = {
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
  collect_review: null,
  done: null,
  human_takeover: null,
  reactivation: null,
};

const KNOWLEDGE_STATES: ChatbotState[] = [
  "collect_problem",
  "collect_qualification",
  "collect_branch",
  "dental_qa",
  "handle_objections",
  "await_decision",
  "reactivation",
];

const SLOT_STATES: ChatbotState[] = ["suggest_doctor", "collect_datetime", "show_slots", "confirm_appointment"];

function buildPromptFacts(args: {
  settings: Awaited<ReturnType<typeof getSettings>>;
  clinicName?: string;
  doctorsWithSlots?: DoctorWithSlots[];
  knowledgeContext?: string;
  priceListContext?: string;
  officialBranches?: string[];
  sessionData?: ChatbotSessionData;
  fsmState: ChatbotState;
  userText?: string;
}): ChatbotPromptFacts {
  const resolvedClinicName = resolveClinicName(args.settings, args.clinicName);
  const data = args.sessionData ?? {};
  const userText = args.userText ?? "";

  const doc =
    args.doctorsWithSlots?.find((d) => d.id === data.suggestedDoctorId) ??
    (data.suggestedDoctorName
      ? args.doctorsWithSlots?.find((d) => d.name === data.suggestedDoctorName)
      : undefined);

  const altCandidate = data.doctorCandidates?.[1];

  const includeKnowledge =
    (KNOWLEDGE_STATES.includes(args.fsmState) || isPatientInquiry(userText)) &&
    isUsableClinicKnowledge(args.knowledgeContext);
  const includePrice =
    args.fsmState === "dental_qa" ||
    isPriceInquiry(userText) ||
    /\b(цен|стоим|сколько|прайс|price|cost|теңge|баға|қымбат)\b/i.test(userText);

  return {
    clinicName: resolvedClinicName,
    nowContext: formatAlmatyNowContext(new Date()),
    officialBranches: args.officialBranches,
    patientRequest: data.problemDescription,
    urgency: data.urgency,
    patientName: data.patientName,
    selectedBranch: data.selectedBranch,
    suggestedDoctor: doc
      ? {
          name: doc.name,
          specialty: doc.specialty,
          rankPercent: data.doctorRankPercent,
        }
      : data.suggestedDoctorName
        ? { name: data.suggestedDoctorName, rankPercent: data.doctorRankPercent }
        : undefined,
    alternativeDoctor: altCandidate
      ? { name: altCandidate.name, rankPercent: altCandidate.score }
      : undefined,
    slots:
      SLOT_STATES.includes(args.fsmState) && doc
        ? doc.slots.slice(0, 5).map((s) => formatAlmatySlotCompact(s))
        : undefined,
    knowledgeSnippet: includeKnowledge ? args.knowledgeContext?.slice(0, 1200) : undefined,
    priceSnippet: includePrice ? args.priceListContext?.slice(0, 800) : undefined,
  };
}

/** Layered prompt: ROLE → BEHAVIOR → STEP → FACTS → TASK → OUTPUT. */
function buildUnifiedScriptPrompt(
  settings: Awaited<ReturnType<typeof getSettings>>,
  doctorsWithSlots?: DoctorWithSlots[],
  clinicName?: string,
  knowledgeContext?: string,
  priceListContext?: string,
  opts?: UnifiedScriptPromptOpts,
): string {
  const fsmState = opts?.fsmState ?? "greeting";
  const channel = opts?.channel ?? "playground";
  const data = opts?.sessionData ?? {};
  const resolvedClinicName = resolveClinicName(settings, clinicName);

  const now = new Date();
  const firstDoctor = doctorsWithSlots?.[0];
  const resolvePlaceholders = createPromptPlaceholderResolver({
    clinicName: resolvedClinicName,
    date: firstDoctor?.slots?.[0] ? formatAlmatyDayMonth(firstDoctor.slots[0]) : formatAlmatyDayMonth(now),
    time: firstDoctor?.slots?.[0] ? formatAlmatyTime(firstDoctor.slots[0]) : "14:00",
    doctorName: firstDoctor?.name ?? "врач",
  });

  const mindMap = hydrateMindMapPlaceholders(
    settings.scriptMindMap as ScriptMindMapData | undefined,
    resolvePlaceholders,
  );

  const activeNodeId =
    opts?.activeMindMapNodeId ??
    resolveMindMapNodeIdForState(mindMap, fsmState, {
      serviceType: opts?.serviceType ?? data.serviceType,
      userText: opts?.userText,
      activeNodeId: data.activeMindMapNodeId,
    });

  const activeNode = activeNodeId ? mindMap?.nodes?.find((n) => n.id === activeNodeId) : undefined;

  const si = (settings.stepInstructions ?? {}) as StepInstructions;
  const stateKey = STATE_INSTRUCTION_KEYS[fsmState];

  const taskCtx: BuildTaskForStateCtx = {
    qualificationPhase: data.qualificationPhase,
    patientName: data.patientName,
    isReturningPatient: !!data.existingPatientId,
    objectionType: data.objectionType,
    decisionOutcome: data.decisionOutcome,
    hasSelectedBranch: !!data.selectedBranch,
    hasSuggestedDoctor: !!(data.suggestedDoctorId || data.suggestedDoctorName),
    ...opts?.taskCtx,
  };

  let task = buildTaskForState(fsmState, taskCtx);
  if (opts?.backendContext?.trim()) {
    task = opts.backendContext.trim();
  }

  const scriptSections = [
    renderMindMapScript(mindMap).slice(0, 4500),
    activeNodeId ? renderMindMapCompactPath(mindMap, activeNodeId) : "",
  ].filter(Boolean);

  return buildChatbotPrompt({
    fsmState,
    channel,
    facts: buildPromptFacts({
      settings,
      clinicName,
      doctorsWithSlots,
      knowledgeContext,
      priceListContext,
      officialBranches: opts?.officialBranches,
      sessionData: data,
      fsmState,
      userText: opts?.userText,
    }),
    task,
    mindMapCompactPath: scriptSections.length > 0 ? scriptSections.join("\n") : undefined,
    activeMindMapNode: activeNode
      ? { label: activeNode.label, content: activeNode.content, fsmState: activeNode.fsmState }
      : undefined,
    stepInstructions: {
      general: si.general?.slice(0, 500),
      state: stateKey && si[stateKey] ? String(si[stateKey]).slice(0, 500) : undefined,
    },
    iinRule:
      fsmState === "collect_iin"
        ? "Пациент хочет управлять существующей записью — попроси ввести ИИН (12 цифр)."
        : undefined,
  });
}

/** Renders the clinic's script blocks for injection into prompts. */
function renderScriptBlocks(
  settings: Awaited<ReturnType<typeof getSettings>>,
  clinicName?: string,
): string {
  const resolvedClinicName = resolveClinicName(settings, clinicName);
  const now = new Date();
  const todayDate = formatAlmatyDayMonth(now);

  const resolvePlaceholders = createPromptPlaceholderResolver({
    clinicName: resolvedClinicName,
    date: todayDate,
    time: "удобное вам время",
    doctorName: "вашего врача",
  });

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

/**
 * Lead-nurture cadence: 4 touches over 3 consecutive days.
 * Day 1 — two touches (morning-ish and evening-ish), days 2 and 3 — one touch each.
 * Hours are measured from the moment the patient went silent (leadNurtureAnchorAt).
 */
const LEAD_NURTURE_TOUCHES = [
  { hours: 3, label: "день 1, касание 1 из 2" },
  { hours: 9, label: "день 1, касание 2 из 2" },
  { hours: 27, label: "день 2, одно касание" },
  { hours: 51, label: "день 3, финальное касание" },
] as const;
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

function getLeadNurtureTemplates(
  settings: Awaited<ReturnType<typeof getSettings>>,
): [string, string, string, string] {
  const savedBlocks = (settings.scriptBlocks ?? []) as ScriptBlock[];
  const activeBlocks = savedBlocks.length > 0 ? savedBlocks : STANDARD_SCRIPT_BLOCKS;
  const followup = activeBlocks.find((b) => b.id === "followup" && b.enabled);
  const defaults: [string, string, string, string] = [
    "Подобрать для вас удобное время? 😊 Есть свободные окна на сегодня и завтра.",
    "Напоминаю вам 😊 Могу записать вас без ожидания. Когда вам будет удобно?",
    "Здравствуйте 😊 Вы интересовались приёмом. Могу записать на удобное время — когда подойдёт?",
    "Здравствуйте 😊 Не хочу быть навязчивым, поэтому пишу в последний раз. Если вопрос ещё актуален — с радостью подберу для вас удобное время, просто напишите 🤍",
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
    parts[3] ?? defaults[3],
  ];
}

// ─── Single-branch clinics: skip the branch question entirely ─────────────────

type CachedSingleBranch = { name: string | null; expiresAt: number };
const singleBranchCache = new Map<string, CachedSingleBranch>();
type CachedBranchList = { names: string[]; expiresAt: number };
const branchListCache = new Map<string, CachedBranchList>();

async function loadClinicBranchNames(clinicId: string): Promise<string[]> {
  const cached = branchListCache.get(clinicId);
  if (cached && cached.expiresAt > Date.now()) return cached.names;

  const rows = await db
    .select({ name: clinicBranchesTable.name })
    .from(clinicBranchesTable)
    .where(eq(clinicBranchesTable.clinicId, clinicId))
    .catch(() => [] as Array<{ name: string }>);

  const names = rows.map((r) => r.name).filter(Boolean);
  branchListCache.set(clinicId, { names, expiresAt: Date.now() + 5 * 60 * 1000 });
  return names;
}

async function getSingleBranchName(clinicId: string): Promise<string | null> {
  const cached = singleBranchCache.get(clinicId);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  const names = await loadClinicBranchNames(clinicId);
  const name = names.length === 1 ? names[0]! : null;
  singleBranchCache.set(clinicId, { name, expiresAt: Date.now() + 5 * 60 * 1000 });
  return name;
}

// ─── Objection handling: type-specific responses (no invented offers) ─────────

function buildObjectionBackendContext(objectionType?: "price" | "fear" | "info"): string {
  const base =
    "ВАЖНО: акции, скидки, «бесплатно» и рассрочку упоминай ТОЛЬКО если они явно есть в материалах клиники (база знаний / прайс).";
  switch (objectionType) {
    case "price":
      return `Возражение: цена. Объясни, что точную стоимость врач назовёт после осмотра, предложи записаться на осмотр и составить план с ценами по этапам. ${base}`;
    case "fear":
      return `Возражение: страх процедуры. Успокой: первый визит — только осмотр и план, без лечения. Расскажи про современную анестезию, предложи записаться на осмотр. ${base}`;
    case "info":
      return `Возражение: не хватает информации. Ответь на вопросы из материалов клиники, предложи осмотр, где врач всё подробно объяснит. ${base}`;
    default:
      return `Пациент сомневается — мягко выясни причину (цена / страх / информация) и предложи осмотр. ${base}`;
  }
}

function buildObjectionFallback(objectionType?: "price" | "fear" | "info"): string {
  switch (objectionType) {
    case "price":
      return "Понимаю 😊 Точную стоимость врач назовёт после осмотра — вы получите план лечения с ценами по этапам, и решите сами. Записать вас на осмотр?";
    case "fear":
      return "Понимаю ваши переживания 😊 Первый визит — только осмотр и план, без лечения. Врач всё объяснит и ответит на вопросы. Записать вас?";
    case "info":
      return "Хороший вопрос! На осмотре врач подробно всё расскажет и покажет варианты именно для вашего случая. Подобрать удобное время?";
    default:
      return "Понимаю 😊 Могу записать вас на осмотр — врач посмотрит и составит план, а решение останется за вами. Когда вам удобно?";
  }
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
    const response = await createChatCompletion(
      {
        model: FAST_MODEL,
        max_tokens: 100,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      },
      { timeoutMs: 10_000, label: "isComplaintReply" },
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
Примеры положительного ответа: "да", "давайте", "Продолжить", "продолжить", "хочу записаться", "какое время есть", "жазылайын деп едім", "иә", "жазыңыз", "ok", "хорошо", "хочу прийти".
Примеры отрицательного/нейтрального ответа: "нет", "не надо", "спасибо, не хочу", "пока нет", "жоқ", "сызып тастаңыз".

Ответь строго JSON объектом:
{
  "agreed": true или false
}`;

  try {
    const response = await createChatCompletion(
      {
        model: FAST_MODEL,
        max_tokens: 100,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      },
      { timeoutMs: 10_000, label: "isPositiveRepeatSaleReply" },
    );
    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = parseLlmJson<{ agreed?: boolean }>(content);
    return !!parsed?.agreed;
  } catch (err) {
    logger.warn({ err, text }, "[ChatbotService] isPositiveRepeatSaleReply classification failed, fallback to keyword check");
    return isPositiveRepeatSaleReplyKeywords(text);
  }
}

// ─── ChatbotService (main export) ───────────────────────────────────────────

function makeTurnResult(
  session: SessionRecord,
  response: OutboundResponse,
  simulatedActions: string[],
  opts?: { clinicName?: string | null; maxParts?: number; recentMessages?: ChatMessage[] },
): TurnResult {
  const baseReply = toChatbotReply(response) ?? replyFromText("...");
  const outbound = conciseReply(
    polishReply(baseReply, {
      clinicName: opts?.clinicName,
      maxParts: opts?.maxParts,
      recentAssistantTexts: opts?.recentMessages
        ?.filter((m) => m.role === "assistant")
        .slice(-3)
        .map((m) => m.content),
    }),
  );
  return {
    outbound,
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
}): Promise<{ data: ChatbotSessionData; response: OutboundResponse }> {
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

  if (!dryRun && !data.isReschedule && !looksLikeRealPatientName(data.patientName)) {
    return {
      data,
      response: replyFromText(
        "Подскажите, как к вам обращаться? Это нужно для оформления записи на консультацию.",
      ),
    };
  }

  const preferredDate = data.preferredDatetime ? new Date(data.preferredDatetime) : new Date();

  try {
    if (dryRun) {
      const serviceLabel =
        data.serviceType && data.serviceType !== "unknown" ? data.serviceType : "consultation";
      if (data.isReschedule && data.existingProcedureId) {
        noteAction(`[Симуляция] Перенос записи на ${formatAlmatyDateTimeLong(preferredDate)}, филиал: ${branchToSave}`);
      } else {
        noteAction(
          `[Симуляция] Создание записи: ${data.patientName ?? "пациент"} → ${data.suggestedDoctorName ?? "врач"}, ${serviceLabel}, ${formatAlmatyDateTimeLong(preferredDate)}, филиал: ${branchToSave}`,
        );
      }
      data.createdPatientId = data.existingPatientId ?? "sim-new-patient-id";
      data.createdProcedureId = data.createdProcedureId ?? "sim-procedure-id";
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
          .set({ doctorId: data.suggestedDoctorId, updatedAt: new Date() })
          .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, clinicId)));
        await transitionPatientStage({
          patientId,
          clinicId,
          toStatus: "initial_consultation",
          trigger: PATIENT_STAGE_TRIGGERS.APPOINTMENT_CREATED,
        });
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
            doctorId: data.suggestedDoctorId ?? null,
          });
        } catch (schedErr) {
          logger.warn({ err: schedErr, procedureId }, "ChatbotService: failed to schedule reminders after booking");
        }

        const staffRecipients = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.clinicId, clinicId), inArray(usersTable.role, ["owner", "admin"])));
        if (staffRecipients.length > 0) {
          const apptDateStr = formatAlmatyDateTimeShort(preferredDate);
          const notifMsg = `📅 Новая запись: ${data.patientName ?? phone} → ${data.suggestedDoctorName ?? "врач"} (${serviceLabel}), ${apptDateStr}. Филиал: ${branchToSave}`;
          await insertNotifications(
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
  } catch (err) {
    logger.error({ err }, "ChatbotService: failed to save procedure in finalizeBooking");
  }

  const bookingSaved =
    dryRun ||
    Boolean(data.createdProcedureId) ||
    (Boolean(data.isReschedule) && Boolean(data.existingProcedureId));

  if (!bookingSaved && !dryRun) {
    if (!looksLikeRealPatientName(data.patientName)) {
      return {
        data,
        response: replyFromText(
          "Подскажите, как к вам обращаться? Это нужно для оформления записи на консультацию.",
        ),
      };
    }
    logger.warn({ clinicId, phone }, "ChatbotService: booking confirmation skipped — no procedure created");
    return {
      data,
      response: replyFromText(
        "Не удалось оформить запись в системе. Напишите, пожалуйста, как к вам обращаться — и мы завершим запись.",
      ),
    };
  }

  const formattedDate = formatAlmatyDateTimeLong(preferredDate);
  const doctorName = data.suggestedDoctorName ?? data.existingProcedureDoctorName ?? "врача";
  const serviceName =
    data.serviceType && data.serviceType !== "unknown" ? data.serviceType : "консультация";

  const summaryInstruction = data.isReschedule
    ? `Запись успешно ПЕРЕНЕСЕНА. Подтверди: филиал ${branchToSave}, врач ${doctorName}, дата ${formattedDate}, услуга ${serviceName}. Контакт клиники — из материалов. Напомни взять удостоверение личности.`
    : `Запись ПОДТВЕРЖДЕНА. Повтори дату ${formattedDate}, время, адрес ${branchToSave}, услугу ${serviceName}, врача ${doctorName}. Контакт клиники — из материалов (сайт/настройки). Напомни взять удостоверение личности. Поблагодари. Спроси, остались ли вопросы.`;

  const thankLine = data.isReschedule
    ? "✅ Запись перенесена."
    : "✅ Запись подтверждена.";
  const detailsFallback = data.isReschedule
    ? `📅 ${formattedDate}\n👨‍⚕️ ${doctorName}\n📍 ${branchToSave}`
    : `📅 ${formattedDate}\n👨‍⚕️ ${doctorName}\n📍 ${branchToSave}\n\nВозьмите удостоверение личности.`;

  if (dryRun) {
    const response = appendToReply(replyFromText(thankLine), detailsFallback);
    return { data, response };
  }

  const aiDone = await generateChatbotResponse(
    up(promptState, { backendContext: summaryInstruction }),
    recentMessages,
    messageText,
    managerExamples,
  );

  const response = appendToReply(mergeReply(aiDone, thankLine), detailsFallback);

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
    pausesMs: outbound.pausesMs ?? [0],
    fsmState: turn.session.state,
    humanTakeover: turn.session.humanTakeover,
    sessionData: turn.session.data,
    mindMapNode: activeNode
      ? { id: activeNode.id, label: activeNode.label, fsmState: activeNode.fsmState ?? turn.session.state }
      : null,
    simulatedActions: turn.simulatedActions,
  };
}

const PLAYGROUND_TURN_TIMEOUT_MS = 55_000;

const PATIENT_SAFE_FALLBACK_TEXT =
  "Сейчас не могу обработать запрос. Попробуйте через минуту или напишите «оператор» — администратор поможет.";

const PLAYGROUND_BUSY_FALLBACK_TEXT =
  "Извините, ответ занял слишком много времени. Попробуйте короче сообщение или повторите через несколько секунд.";

const PLAYGROUND_ERROR_FALLBACK_TEXT =
  "Сейчас не удалось получить ответ ИИ. Попробуйте ещё раз через несколько секунд.";

const PLAYGROUND_NO_OPENROUTER_TEXT =
  "ИИ не настроен на сервере (OPENROUTER_API_KEY). Обратитесь к администратору платформы.";

function isRecoverableLlmError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("openrouter") ||
    msg.includes("openroutertimeout") ||
    msg.includes("429") ||
    msg.includes("402") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("500")
  );
}

async function resolveSessionForErrorTurn(
  clinicId: string,
  phone: string,
  sessionInput?: PlaygroundSessionInput,
): Promise<SessionRecord> {
  if (sessionInput) {
    return {
      id: randomUUID(),
      clinicId,
      phone,
      state: sessionInput.state,
      data: { ...sessionInput.data },
      humanTakeover: sessionInput.humanTakeover ?? false,
    };
  }

  const loaded = await loadSession(clinicId, phone).catch(() => null);
  if (loaded) return loaded;

  return {
    id: randomUUID(),
    clinicId,
    phone,
    state: "greeting",
    data: {},
    humanTakeover: false,
  };
}

function buildSafeErrorTurnResult(
  session: SessionRecord,
  replyText: string,
  simulatedActions: string[] = [],
  opts?: { clinicName?: string | null; recentMessages?: ChatMessage[] },
): TurnResult {
  return makeTurnResult(session, replyText, simulatedActions, {
    clinicName: opts?.clinicName,
    maxParts: 2,
    recentMessages: opts?.recentMessages,
  });
}

function buildPlaygroundFallbackResult(
  opts: {
    session?: PlaygroundSessionInput;
    userMessage: string;
    userReply?: string;
    internalReason?: string;
  },
): SimulateMessageResult {
  const state = opts.session?.state ?? "greeting";
  const reply = opts.userReply ?? PLAYGROUND_BUSY_FALLBACK_TEXT;
  return {
    reply,
    parts: [reply],
    pausesMs: [0],
    fsmState: state,
    humanTakeover: false,
    sessionData: opts.session?.data ?? {},
    mindMapNode: null,
    simulatedActions: opts.internalReason ? [`[internal] ${opts.internalReason}`] : [],
  };
}

export class ChatbotService {
  async processMessage(
    clinicId: string,
    phone: string,
    text: string,
    options?: ProcessMessageOptions,
  ): Promise<string | null> {
    const canonicalPhone = canonicalChatbotPhone(phone);
    return withSessionLock(clinicId, canonicalPhone, async () => {
      const stopTyping = startTypingKeepalive(clinicId, canonicalPhone);
      try {
        const turn = await this.safeExecuteTurn(clinicId, canonicalPhone, text, { ...options, dryRun: false });
        if (!turn?.outbound) {
          return null;
        }
        await saveSession(turn.session);
        await deliverChatbotReply(clinicId, canonicalPhone, turn.outbound, {
          onPartDelivered: (part) => saveChatbotMessage(clinicId, canonicalPhone, "outbound", part),
        });
        return joinChatbotReply(turn.outbound);
      } catch (err) {
        logger.error({ err, clinicId, phone: canonicalPhone }, "[ChatbotService] processMessage failed — patient safe fallback");
        await sendOutboundReply(clinicId, canonicalPhone, PATIENT_SAFE_FALLBACK_TEXT).catch((sendErr) =>
          logger.error({ err: sendErr, clinicId, phone: canonicalPhone }, "[ChatbotService] failed to send patient safe fallback"),
        );
        return PATIENT_SAFE_FALLBACK_TEXT;
      } finally {
        stopTyping();
      }
    });
  }

  /** Never throws — returns a safe fallback turn for patients and playground. */
  private async safeExecuteTurn(
    clinicId: string,
    phone: string,
    text: string,
    options?: ProcessMessageOptions,
  ): Promise<TurnResult | null> {
    const dryRun = options?.dryRun ?? false;
    try {
      return await this.executeTurn(clinicId, phone, text, options);
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, clinicId, phone, dryRun, errMessage },
        "[ChatbotService] executeTurn threw — returning safe fallback turn",
      );
      const session = await resolveSessionForErrorTurn(clinicId, phone, options?.sessionInput);
      const replyText = dryRun ? PLAYGROUND_ERROR_FALLBACK_TEXT : PATIENT_SAFE_FALLBACK_TEXT;
      const internalNote =
        err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160);
      return buildSafeErrorTurnResult(
        session,
        replyText,
        dryRun ? [`[safe-fallback] ${internalNote}`] : [],
        { recentMessages: options?.historyInput },
      );
    }
  }

  private async executeTurn(
    clinicId: string,
    phone: string,
    text: string,
    options?: ProcessMessageOptions,
  ): Promise<TurnResult | null> {
    const dryRun = options?.dryRun ?? false;
    const phoneRaw = phone;
    phone = canonicalChatbotPhone(phone);
    const promptChannel = dryRun ? ("playground" as const) : ("whatsapp" as const);
    const simulatedActions: string[] = [];
    let resolvedClinicNameForReply: string | undefined;
    let recentMessagesForReply: ChatMessage[] = [];
    const turnDiag: ChatbotTurnDiagnostics = {
      clinicId,
      phoneCanonical: phone,
      phoneRaw,
      channel: promptChannel,
      dryRun,
      sessionState: "greeting",
      sessionHumanTakeover: false,
      messageText: "",
      historyCount: 0,
      historyPreview: [],
      historyAgeMs: null,
      knowledgeContextLength: 0,
      agentUsed: false,
    };
    const noteAction = (msg: string) => {
      if (dryRun) simulatedActions.push(msg);
    };
    const persistSession = async (session: SessionRecord) => {
      if (!dryRun) await saveSession(session);
    };
    const finishTurn = async (session: SessionRecord, response: OutboundResponse): Promise<TurnResult> => {
      turnDiag.sessionState = session.state;
      turnDiag.sessionHumanTakeover = session.humanTakeover;
      logChatbotTurnDiagnostics(turnDiag);
      logChatbotTurnMeta({
        clinicId,
        phone,
        state: session.state,
        usedFallback: false,
      });
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
      return makeTurnResult(session, response, simulatedActions, {
        clinicName: resolvedClinicNameForReply,
        maxParts: 3,
        recentMessages: recentMessagesForReply,
      });
    };

    let messageText = text;
    if (options?.initGreeting && !messageText.trim()) {
      messageText = "Здравствуйте";
    }
    turnDiag.messageText = messageText;

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
    turnDiag.sessionState = session.state;
    turnDiag.sessionHumanTakeover = session.humanTakeover;

    const historyForKnowledge =
      dryRun && options?.historyInput
        ? options.historyInput
        : await this.getRecentHistory(clinicId, phone, messageText);
    turnDiag.historyCount = historyForKnowledge.length;
    turnDiag.historyPreview = buildHistoryPreview(historyForKnowledge);
    const knowledgeQuery = buildKnowledgeQueryFromTurn(messageText, historyForKnowledge);

    let managerExamples: ManagerExample[];
    let knowledgeContext: string;
    let priceListContext: string;
    let doctorsWithSlots: DoctorWithSlots[];
    let clinicName: string | undefined;
    let clinicBranchNames: string[] = [];
    try {
      const doctorsPromise = getClinicDoctorsWithSlots(clinicId, calendarConfig).catch(
        () => [] as DoctorWithSlots[],
      );
      [managerExamples, knowledgeContext, priceListContext, doctorsWithSlots, clinicName, clinicBranchNames] = await Promise.all([
        getManagerExamples(clinicId),
        loadKnowledgeContext(clinicId, knowledgeQuery),
        loadPriceListContext(clinicId),
        doctorsPromise,
        db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1).catch(() => []).then((rows) => rows[0]?.name),
        loadClinicBranchNames(clinicId),
      ]);
    } catch (err) {
      logger.error({ err }, "ChatbotService: failed to load context");
      return null;
    }
    turnDiag.knowledgeContextLength = knowledgeContext.length;
    resolvedClinicNameForReply = resolveClinicName(settings, clinicName);

    const scenarioCtx = dryRun ? buildScenarioContext(options?.scenario, doctorsWithSlots) : null;

    if (!dryRun) {
      saveChatbotMessage(clinicId, phone, "inbound", messageText).catch(() => {});
    }

    if (!settings.enabled && !dryRun) {
      const earlyPatient = await findPatientByPhoneNormalized(clinicId, phone);
      const allowAutoresponder =
        earlyPatient?.status === "repeat_sale" || session.state === "collect_review";
      if (!allowAutoresponder) {
        turnDiag.earlyExitReason = "bot_disabled";
        logChatbotTurnDiagnostics(turnDiag);
        return null;
      }
    }

    if (session.humanTakeover) {
      const autoReset =
        isBotResumeRequest(messageText) || shouldAutoResetHumanTakeover(session.data.takeoverAt);
      if (autoReset) {
        session.humanTakeover = false;
        session.data = clearTakeoverAt(session.data);
        turnDiag.takeoverAutoReset = true;
        turnDiag.sessionHumanTakeover = false;
      } else {
        turnDiag.earlyExitReason = "human_takeover";
        logChatbotTurnDiagnostics(turnDiag);
        return { outbound: null, session, simulatedActions };
      }
    }

    if (!dryRun && settings.enabled) {
      try {
        await planLimitsService.assertCanStartChatbotDialog(clinicId, phone);
        await aiCreditsService.consumeCredits({ clinicId, feature: "chatbot_reply" });
      } catch (err) {
        if (err instanceof InsufficientAiCreditsError || err instanceof PlanLimitExceededError) {
          turnDiag.earlyExitReason =
            err instanceof PlanLimitExceededError ? "plan_limit" : "credits_exhausted";
          logChatbotTurnDiagnostics(turnDiag);
          const exhaustedReply =
            err instanceof PlanLimitExceededError
              ? "К сожалению, лимит диалогов чат-бота по вашему тарифу исчерпан. Администратору нужно перейти на тариф с большим лимитом."
              : "К сожалению, AI-кредиты клиники закончились. Администратору нужно докупить кредиты или сменить тариф в разделе «ИИ кредиты».";
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
            { clinicName: resolvedClinicNameForReply, maxParts: 2 },
          );
        }
        logger.error({ err, clinicId, phone }, "[ChatbotService] plan/credits check failed — safe fallback");
        turnDiag.earlyExitReason = "credits_exhausted";
        logChatbotTurnDiagnostics(turnDiag);
        return buildSafeErrorTurnResult(
          session,
          PATIENT_SAFE_FALLBACK_TEXT,
          [],
          { clinicName: resolvedClinicNameForReply, recentMessages: historyForKnowledge },
        );
      }
    }

    type PatientRow = { id: string; name: string; status: string | null; doctorId?: string | null };
    let patientDb: PatientRow | undefined;
    if (dryRun && scenarioCtx?.patient) {
      patientDb = {
        id: scenarioCtx.patient.id,
        name: scenarioCtx.patient.name,
        status: scenarioCtx.patient.status,
      };
    } else if (!dryRun) {
      const row = await findPatientByPhoneNormalized(clinicId, phone);
      patientDb = row
        ? { id: row.id, name: row.name, status: row.status, doctorId: row.doctorId }
        : undefined;
    }
    turnDiag.patientStatus = patientDb?.status ?? null;

    let state = session.state;
    let data = { ...session.data };

    if (LEAD_NURTURE_STATES.includes(state)) {
      // Patient wrote to us — restart the silence timer and the 3-day touch cadence.
      data.leadNurtureAnchorAt = new Date().toISOString();
      data.leadNurtureTouchesSent = 0;
      data.leadFollowup24Sent = false;
      data.leadFollowup72Sent = false;
      data.leadFollowup168Sent = false;
    }

    // Single-branch clinic — pre-select the branch so the funnel never asks about it
    if (!data.selectedBranch) {
      if (clinicBranchNames.length === 1) {
        data.selectedBranch = clinicBranchNames[0];
      } else if (!dryRun) {
        const singleBranch = await getSingleBranchName(clinicId);
        if (singleBranch) data.selectedBranch = singleBranch;
      }
    }

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
          activeMindMapNodeId: data.activeMindMapNodeId
            ?? resolveMindMapNodeIdForState(settings.scriptMindMap as ScriptMindMapData | undefined, promptState),
          channel: promptChannel,
          backendContext: upOpts?.backendContext,
          officialBranches: clinicBranchNames,
          sessionData: data,
        },
      );

    // Operator request always takes priority
    if (isOperatorRequest(messageText)) {
      session.state = "human_takeover";
      session.data = { ...data, handoffSummary: buildHandoffSummary({ ...session, data }) };
      markSessionHumanTakeover(session);
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

    // Patient answers the 1-hour pre-appointment reminder («всё в силе — вы придёте?»)
    if (data.pendingVisitConfirmation) {
      const confirmation = data.pendingVisitConfirmation;
      const apptMs = Date.parse(confirmation.scheduledAt);
      const staleAfterMs = 3 * 60 * 60 * 1000;
      if (Number.isFinite(apptMs) && Date.now() - apptMs > staleAfterMs) {
        // Appointment is long past — the question is no longer relevant.
        delete data.pendingVisitConfirmation;
        session.data = data;
      } else if (isVisitConfirmYes(messageText)) {
        delete data.pendingVisitConfirmation;
        session.data = data;
        const timeStr = Number.isFinite(apptMs)
          ? new Date(apptMs).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" })
          : null;
        const confirmReply =
          `Отлично, ждём вас${timeStr ? ` в ${timeStr}` : ""}! 🤍 ` +
          `Уже готовим всё к вашему приёму${confirmation.doctorName ? ` у врача ${confirmation.doctorName}` : ""} — до скорой встречи! 😊`;
        noteAction("Пациент подтвердил визит за час до приёма");
        return finishTurn(session, confirmReply);
      } else if (isVisitConfirmNo(messageText)) {
        delete data.pendingVisitConfirmation;
        data.existingProcedureId = confirmation.procedureId;
        data.existingProcedureDate = Number.isFinite(apptMs)
          ? formatAlmatyDateTimeLong(new Date(apptMs))
          : confirmation.scheduledAt;
        data.existingProcedureDoctorName = confirmation.doctorName;
        session.state = "manage_appointment";
        session.data = data;
        state = session.state;
        const rescheduleReply =
          "Ничего страшного 😊 Хотите перенести запись на другое время или отменить?\n• Перенести\n• Отменить";
        noteAction("Пациент не сможет прийти — предложен перенос записи");
        return finishTurn(session, rescheduleReply);
      } else {
        // Patient replied with something else — answer it normally, don't re-ask.
        delete data.pendingVisitConfirmation;
        session.data = data;
      }
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
            await transitionPatientStage({
              patientId: patientDb.id,
              clinicId,
              toStatus: "completed",
              trigger: PATIENT_STAGE_TRIGGERS.POST_OP_OK_REPLY,
            });
          } else {
            noteAction("Статус пациента → completed");
          }

          session.state = "done";
          session.data = data;

          const replyText = "Отлично! Рады, что у вас всё хорошо. Желаем вам скорейшего восстановления и крепкого здоровья! Если возникнут вопросы — пишите, мы всегда рядом.";
          return finishTurn(session, replyText);
        }
      } else if (patientDb.status === "repeat_sale") {
        if (!dryRun) {
          markBroadcastReply(clinicId, patientDb.id).catch(() => {});
        }

        if (isExplicitNegativeRepeatSaleReply(messageText)) {
          if (!dryRun && patientDb) {
            await setMarketingOptOut(patientDb.id, clinicId, true);
            await transitionPatientStage({
              patientId: patientDb.id,
              clinicId,
              toStatus: "rejected",
              trigger: PATIENT_STAGE_TRIGGERS.REPEAT_SALE_OPT_OUT,
            });
          }
          session.state = "done";
          session.data = data;

          const replyText = isMarketingOptOutReply(messageText)
            ? "Вы отписаны от рассылок. Если захотите записаться позже — просто напишите нам."
            : "Хорошо! Если решите записаться на осмотр позже, просто напишите нам. Будем рады помочь вам в любое время!";
          return finishTurn(session, replyText);
        }

        const showInterest =
          isNeutralRepeatSaleQuestion(messageText) ||
          isPositiveRepeatSaleReplyKeywords(messageText) ||
          await isPositiveRepeatSaleReply(messageText);

        if (showInterest) {
          if (!dryRun) {
            await transitionPatientStage({
              patientId: patientDb.id,
              clinicId,
              toStatus: "initial_consultation",
              trigger: PATIENT_STAGE_TRIGGERS.REPEAT_SALE_BOOKING_INTEREST,
            });
            markBroadcastBooking(clinicId, patientDb.id).catch(() => {});
          } else {
            noteAction("Статус пациента → initial_consultation");
          }

          session.state = "collect_problem";
          session.data = {
            ...data,
            existingPatientId: patientDb.id,
            patientName: patientDb.name,
            fromRepeatSaleBroadcast: true,
          };
          await persistSession(session);

          state = session.state;
          data = session.data;
        } else {
          session.state = state;
          session.data = data;

          const replyText = "Хотите записаться на осмотр? Напишите «да» или «продолжить»";
          return finishTurn(session, replyText);
        }
      }
    }

    if (state === "done") {
      if (!options?.skipRedAlert && isRedAlert(messageText)) {
        if (!dryRun) await triggerRedAlert(clinicId, phone, messageText, data.createdPatientId);
        else noteAction("Red alert");
        turnDiag.earlyExitReason = "done_state";
        const alertReply = "🚨 Мы видим вашу проблему и передаём её администратору. Ожидайте, пожалуйста.";
        return finishTurn(session, alertReply);
      }
      if (messageText.trim() && !isOperatorRequest(messageText)) {
        session.state = "greeting";
        data = reopenDoneSessionData(data);
        session.data = data;
        state = session.state;
        turnDiag.doneReopened = true;
        turnDiag.sessionState = state;
      } else {
        turnDiag.earlyExitReason = "done_state";
        const doneReply = "Рады вашему обращению! Если возникнут вопросы — пишите. Или напишите «оператор» для связи с администратором.";
        return finishTurn(session, doneReply);
      }
    }

    const recentMessages = historyForKnowledge;
    recentMessagesForReply = recentMessages;

    let response: OutboundResponse = null;

    if (!dryRun && !data.existingPatientId) {
      const knownPatient = await findPatientByPhoneNormalized(clinicId, phone);
      if (knownPatient) {
        data.existingPatientId = knownPatient.id;
        if (!data.patientName) data.patientName = knownPatient.name;
      }
    }

    if (
      shouldUseAgentTurn(promptChannel) &&
      state !== "human_takeover" &&
      !session.humanTakeover &&
      state !== "collect_iin"
    ) {
      turnDiag.agentUsed = true;
      turnDiag.earlyExitReason = "agent_turn";
      const resolvedName = resolvedClinicNameForReply ?? resolveClinicName(settings, clinicName);
      const doctorsList = await loadDoctorsContext(clinicId);
      const composedSystemPrompt = await getComposedChatbotPrompt({
        clinicId,
        clinicName: resolvedName,
        knowledgeText: knowledgeContext,
        priceListText: priceListContext,
        officialBranches: clinicBranchNames,
        doctorsList,
        managerExamples,
      });

      const agentOutcome = await runChatbotAgentTurn({
        clinicId,
        phone,
        messageText,
        dryRun,
        settings,
        clinicName: resolvedName,
        composedSystemPrompt,
        knowledgeContext,
        clinicBranchNames,
        calendarConfig,
        recentMessages,
        sessionState: state,
        sessionData: data,
        noteAction,
        finalizeBooking: async ({ data: bookingData, branchToSave, promptState }) =>
          finalizeBookingAppointment({
            clinicId,
            phone,
            data: bookingData,
            branchToSave,
            dryRun,
            noteAction,
            recentMessages,
            messageText,
            managerExamples,
            up: (ps, upOpts) =>
              buildUnifiedScriptPrompt(
                settings,
                doctorsWithSlots,
                clinicName,
                knowledgeContext,
                priceListContext,
                {
                  fsmState: ps,
                  serviceType: bookingData.serviceType,
                  userText: upOpts?.userText ?? messageText,
                  activeMindMapNodeId: bookingData.activeMindMapNodeId,
                  channel: promptChannel,
                  backendContext: upOpts?.backendContext,
                  officialBranches: clinicBranchNames,
                  sessionData: bookingData,
                },
              ),
            promptState,
          }),
      });

      session.state = agentOutcome.state;
      session.data = agentOutcome.data;
      if (agentOutcome.humanTakeover) {
        markSessionHumanTakeover(session);
      } else {
        session.humanTakeover = false;
      }
      if (agentOutcome.humanTakeover && !dryRun) {
        await this.notifyHumanTakeover(clinicId, phone, agentOutcome.data.patientName, agentOutcome.data.handoffSummary);
      } else if (agentOutcome.humanTakeover && dryRun) {
        noteAction("[Симуляция] Передача диалога оператору (уведомление не отправлено)");
      }
      return finishTurn(session, agentOutcome.response);
    }

    turnDiag.earlyExitReason = "legacy_fsm";

    switch (state) {
      case "greeting": {
        // Compute a script-based greeting fallback (NOT the legacy IIN-asking greetingTemplate).
        const scriptGreeting = (() => {
          const resolvePlaceholders = createPromptPlaceholderResolver({
            clinicName: resolvedClinicNameForReply ?? resolveClinicName(settings, clinicName),
            date: formatAlmatyDayMonth(new Date()),
            time: "удобное вам время",
            doctorName: "вашего врача",
          });
          const mindMapData = settings.scriptMindMap as ScriptMindMapData | undefined;
          const fromMindMap = getGreetingContentFromMindMap(mindMapData);
          const rawContent = fromMindMap ?? STANDARD_SCRIPT_BLOCKS[0]!.content;
          return rawContent
            .split("\n")
            .filter((line) => !line.includes("• "))
            .join("\n")
            .trim()
            .replace(/\n{3,}/g, "\n\n")
            .split("\n")
            .map(resolvePlaceholders)
            .join("\n");
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
          const row = await findPatientByPhoneNormalized(clinicId, phone);
          if (row) {
            existingByPhone = { id: row.id, name: row.name };
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
            upcomingProc = proc?.scheduledAt
              ? { id: proc.id, scheduledAt: proc.scheduledAt, doctorId: proc.doctorId }
              : null;
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

          // Returning patient, no upcoming appointment.
          // If the first message already contains intent, classify it right away
          // (same fast-path as new leads) instead of wasting a turn on "чем могу помочь?".
          if (!isPlainGreeting(messageText)) {
            const keywordService = detectServiceTypeFromKeywords(messageText);
            const returningClassification = keywordService
              ? {
                  serviceType: keywordService,
                  urgency: /болит|ауыра|срочн/i.test(messageText) ? ("urgent" as const) : ("planned" as const),
                  confidence: "high" as const,
                  patientType: "returning" as const,
                  summary: messageText.slice(0, 100),
                }
              : await classifyPatientRequest(messageText, recentMessages);
            if (returningClassification.serviceType !== "unknown" || returningClassification.confidence === "high") {
              data.problemDescription = messageText.trim().slice(0, 200);
              data.serviceType = returningClassification.serviceType;
              data.urgency = returningClassification.urgency;
              data.patientType = "returning";
              data.aiConfidence = returningClassification.confidence;

              const aiReply = await generateChatbotResponse(
                up("collect_qualification", {
                  backendContext: `Постоянный пациент ${existingByPhone.name} сразу описал запрос. Не переспрашивай, что беспокоит — уточни детали (симптомы/срочность) и веди к записи.`,
                }),
                [{ role: "user" as const, content: messageText }],
                messageText,
                managerExamples,
              );
              response = mergeReply(aiReply, `Здравствуйте, ${existingByPhone.name}! 😊 Спасибо, что описали запрос — подскажите, есть ли боль или дискомфорт сейчас? Подберу врача и удобное время.`);
              session.state = "collect_qualification";
              session.data = data;
              break;
            }
          }

          // Returning patient, plain greeting → warm opener with booking CTA
          const aiReply = await generateChatbotResponse(
            up("collect_problem", { backendContext: `Пациент ${existingByPhone.name} — постоянный клиент. Поприветствуй тепло и предложи записаться.` }),
            [{ role: "user" as const, content: messageText }],
            messageText,
            managerExamples,
          );
          response = mergeReply(aiReply, `Здравствуйте, ${existingByPhone.name}! 😊 Рады снова вас видеть. Что планируете — лечение, чистку или консультацию? Могу сразу подобрать время.`);
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

        if (!isPlainGreeting(messageText)) {
          const keywordService = detectServiceTypeFromKeywords(messageText);
          const firstClassification = keywordService
            ? {
                serviceType: keywordService,
                urgency: /болит|ауыра|срочн/i.test(messageText) ? ("urgent" as const) : ("planned" as const),
                confidence: "high" as const,
                patientType: "new" as const,
                summary: messageText.slice(0, 100),
              }
            : await classifyPatientRequest(messageText, recentMessages);
          if (firstClassification.serviceType !== "unknown" || firstClassification.confidence === "high") {
            data.problemDescription = messageText.trim().slice(0, 200);
            data.serviceType = firstClassification.serviceType;
            data.urgency = firstClassification.urgency;
            data.patientType = firstClassification.patientType;
            data.aiConfidence = firstClassification.confidence;

            // Hot lead: «хочу записаться завтра в 15:00» — remember the requested time
            // so we don't re-ask at the datetime step.
            if (isReadyToBook(messageText) || firstClassification.urgency === "urgent") {
              const earlyDt = await extractDatetimeFromText(messageText).catch(() => null);
              if (earlyDt) data.preferredDatetime = earlyDt.toISOString();
            }

            const mindMapData = settings.scriptMindMap as ScriptMindMapData | undefined;
            data.activeMindMapNodeId = resolveMindMapNodeIdForState(mindMapData, "collect_problem", {
              serviceType: firstClassification.serviceType,
              userText: messageText,
            });

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

            const aiReply = await generateChatbotResponse(
              up("collect_qualification", {
                userText: messageText,
                backendContext:
                  `Первое сообщение уже содержит запрос пациента: ${firstClassification.summary}. ` +
                  `Не спрашивай повторно "что беспокоит"; уточни только недостающие симптомы/срочность и филиал.`,
              }),
              recentMessages,
              messageText,
              managerExamples,
            );
            const fallback =
              `Здравствуйте! 👋 Вы обратились в клинику «${resolvedClinicNameForReply ?? resolveClinicName(settings, clinicName)}». ` +
              `Понял: ${firstClassification.summary}. Уточните, пожалуйста, есть ли боль/дискомфорт и какой филиал или адрес вам удобнее?`;
            response = mergeReply(aiReply, fallback, {
              clinicName: resolvedClinicNameForReply,
              maxParts: 2,
            });
            session.state = "collect_qualification";
            session.data = data;
            break;
          }
        }

        // Otherwise — new patient greeting only.
        const aiGreeting = await generateChatbotResponse(
          up("greeting"),
          [],
          messageText,
          managerExamples,
        );
        response = mergeReply(aiGreeting, scriptGreeting, {
          clinicName: resolvedClinicNameForReply,
          maxParts: 2,
        });
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
        if (data.fromRepeatSaleBroadcast && data.patientName) {
          response = `Здравствуйте, ${data.patientName}! Расскажите, что вас беспокоит, или подтвердите, что хотите продолжить лечение.`;
          session.state = "collect_problem";
          session.data = data;
          break;
        }
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
          slotsText = data.suggestedDoctorId
            ? await buildSlotsAppendix(clinicId, data.suggestedDoctorId, settings.calendarConfig)
            : "";
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
        data.activeMindMapNodeId = resolveMindMapNodeIdForState(mindMapData, "collect_problem", {
          serviceType: classification.serviceType,
          userText: messageText,
        });

        logger.info(
          { clinicId, phone, classification },
          "[ChatbotService] AI classified patient request",
        );

        let returningPatientDoctorId: string | undefined;
        if (classification.patientType === "returning") {
          const existingPatient = await findPatientByPhoneNormalized(clinicId, phone);
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
              ? buildBranchPromptFallback(hasKnowledge, clinicBranchNames)
              : buildSymptomsPromptFallback();
          response = mergeReply(aiReply, fallback);
          session.state = "collect_qualification";
          session.data = data;
          break;
        }

        const rankedDoctor = await assignRankedDoctor(clinicId, data, true);
        data = rankedDoctor.data;
        const pickedDoctor = rankedDoctor.top;

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
              slotsText = data.suggestedDoctorId
                ? await buildSlotsAppendix(clinicId, data.suggestedDoctorId, settings.calendarConfig)
                : "";
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
            nodeFsm === "suggest_doctor" && pickedDoctor
              ? buildDoctorBackendContext(pickedDoctor, data)
              : undefined;
          const aiReply = await generateChatbotResponse(
            up(promptState, { backendContext: doctorBackend }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(
            aiReply,
            pickedDoctor && nodeFsm === "suggest_doctor"
              ? buildDoctorPresentationFallback(pickedDoctor, data.urgency)
              : `Спасибо, понял запрос. Уточните, пожалуйста, есть ли боль и какой филиал/адрес вам удобнее?`,
          );
          session.state = nodeFsm && nodeFsm !== "collect_problem" ? nodeFsm : "collect_problem";
          session.data = data;
          break;
        }

        if (pickedDoctor) {
          const aiReply = await generateChatbotResponse(
            up("suggest_doctor", { backendContext: buildDoctorBackendContext(pickedDoctor, data) }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiReply, buildDoctorPresentationFallback(pickedDoctor, data.urgency));
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
        if (qualClassification.serviceType && qualClassification.serviceType !== "unknown") {
          data.serviceType = qualClassification.serviceType;
        }
        if (messageText.trim().length > 3) {
          const snippet = messageText.trim().slice(0, 200);
          data.problemDescription = data.problemDescription
            ? `${data.problemDescription} ${snippet}`.slice(0, 400)
            : snippet;
        }

        const hasKnowledge = isUsableClinicKnowledge(knowledgeContext);
        const phase = data.qualificationPhase ?? (data.selectedBranch ? "branch" : "symptoms");
        const inBranchPhase = phase === "branch" || !!data.selectedBranch;

        const extractedBranch = await resolveBranchFromMessage(
          messageText,
          knowledgeContext,
          extractBranchFromText,
          { allowFreeText: inBranchPhase, officialBranches: clinicBranchNames },
        );

        if (extractedBranch) {
          data.selectedBranch = extractedBranch;
          data.confusedCount = 0;
          data.branchAskCount = 0;
        }

        const branchBackendContext = (): string => {
          if (clinicBranchNames.length > 1) {
            return `Покажи ВСЕ филиалы нумерованным списком в одном сообщении (исключение из правила краткости). Только из списка: ${clinicBranchNames.join("; ")}. Не придумывай адреса.`;
          }
          if (clinicBranchNames.length === 1) {
            return `Единственный филиал: «${clinicBranchNames[0]}». Подтверди коротко и иди дальше.`;
          }
          return hasKnowledge
            ? "Спроси адрес одним коротким вопросом. Не перечисляй выдуманные филиалы."
            : "Спроси адрес одним коротким вопросом.";
        };

        const tryProceedWithoutBranch = (): boolean => {
          if (isBranchListInquiry(messageText)) return false;
          if (clinicBranchNames.length === 1) {
            data.selectedBranch = clinicBranchNames[0];
            return true;
          }
          const askCount = data.branchAskCount ?? 0;
          if (askCount < 1) return false;
          if (messageText.trim().length > 3) {
            data.selectedBranch = messageText.trim().slice(0, 200);
            return true;
          }
          return false;
        };

        if (inBranchPhase && isBranchListInquiry(messageText) && clinicBranchNames.length > 1) {
          data.qualificationPhase = "branch";
          data.activeMindMapNodeId =
            resolveMindMapNodeIdForState(mindMapData, "collect_qualification", {
              activeNodeId: data.activeMindMapNodeId,
            }) ?? data.activeMindMapNodeId;
          const aiBranch = await generateChatbotResponse(
            up("collect_qualification", {
              backendContext: `${branchBackendContext()} Пациент спрашивает о филиалах — ответь на вопрос по материалам клиники, затем мягко предложи выбрать номер.`,
            }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiBranch, buildBranchPromptFallback(hasKnowledge, clinicBranchNames), {
            maxParts: 3,
          });
          session.state = "collect_qualification";
          session.data = data;
          break;
        }

        if (phase === "symptoms" && !symptomsAnswered(data, messageText)) {
          data.qualificationAsked = true;
          data.activeMindMapNodeId =
            resolveMindMapNodeIdForState(mindMapData, "collect_qualification", {
              activeNodeId: data.activeMindMapNodeId,
            }) ?? data.activeMindMapNodeId;

          const aiSymptoms = await generateChatbotResponse(
            up("collect_qualification", {
              backendContext: `Услуга: ${data.serviceType ?? qualClassification.serviceType}. Срочность: ${data.urgency ?? "planned"}. Уточни симптомы (боль, дискомфорт).`,
            }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiSymptoms, buildSymptomsPromptFallback());
          session.state = "collect_qualification";
          session.data = data;
          break;
        }

        if (phase === "symptoms") {
          data.qualificationPhase = "branch";
          data.activeMindMapNodeId =
            resolveMindMapNodeIdForState(mindMapData, "collect_qualification", {
              activeNodeId: data.activeMindMapNodeId,
            }) ?? data.activeMindMapNodeId;
        }

        if (!data.selectedBranch) {
          if (tryProceedWithoutBranch()) {
            // proceed to doctor ranking below
          } else {
            const askCount = data.branchAskCount ?? 0;
            if (askCount >= 2) {
              response = BRANCH_DEFER_FALLBACK;
              logChatbotTurnMeta({
                clinicId,
                phone,
                state: "collect_qualification",
                usedFallback: true,
              });
              session.state = "collect_qualification";
              session.data = data;
              break;
            }
            data.branchAskCount = askCount + 1;
            const symptomsNote =
              phase === "symptoms" || data.qualificationPhase === "branch"
                ? `Симптомы приняты. Срочность: ${data.urgency ?? "planned"}. `
                : "";
            const aiBranch = await generateChatbotResponse(
              up("collect_qualification", {
                backendContext: `${symptomsNote}${branchBackendContext()}`,
              }),
              recentMessages,
              messageText,
              managerExamples,
            );
            response = mergeReply(aiBranch, buildBranchPromptFallback(hasKnowledge, clinicBranchNames));
            session.state = "collect_qualification";
            session.data = data;
            break;
          }
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

        const doctorBackend = buildDoctorBackendContext(ranked.top, data);

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
            slotsText = data.suggestedDoctorId
              ? await buildSlotsAppendix(clinicId, data.suggestedDoctorId, settings.calendarConfig)
              : "";
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

          const objectionBackend = buildObjectionBackendContext(data.objectionType);
          const aiObj = await generateChatbotResponse(
            up("handle_objections", { backendContext: objectionBackend }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiObj, buildObjectionFallback(data.objectionType));
          data.objectionsHandled = true;
          session.state = "handle_objections";
        } else if (isRefusing(messageText)) {
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
        } else if (isNo(messageText)) {
          data.confusedCount = 0;
          if (bookingFlow && data.suggestedDoctorId) {
            const excluded = [
              ...(data.excludedDoctorIds ?? []),
              data.suggestedDoctorId,
            ];
            data.excludedDoctorIds = excluded;

            const reranked = await assignRankedDoctor(clinicId, { ...data, excludedDoctorIds: excluded }, dryRun);
            data = reranked.data;

            if (reranked.top) {
              const aiAlt = await generateChatbotResponse(
                up("suggest_doctor", {
                  backendContext: `Альтернатива: ${reranked.top.name}, рейтинг ${reranked.top.rankPercent}/100.`,
                }),
                recentMessages,
                messageText,
                managerExamples,
              );
              response = mergeReply(aiAlt, buildDoctorPresentationFallback(reranked.top, data.urgency));
              session.state = "suggest_doctor";
            } else {
              const aiClarify = await generateChatbotResponse(up("await_decision"), recentMessages, messageText, managerExamples);
              response = mergeReply(aiClarify, buildDecisionFallback());
              session.state = "await_decision";
            }
          } else {
            const aiClarify = await generateChatbotResponse(up("await_decision"), recentMessages, messageText, managerExamples);
            response = mergeReply(aiClarify, buildDecisionFallback());
            session.state = "await_decision";
          }
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
            slotsText = data.suggestedDoctorId
              ? await buildSlotsAppendix(clinicId, data.suggestedDoctorId, settings.calendarConfig)
              : "";
          }
          const aiDt = await generateChatbotResponse(
            up("collect_datetime", { backendContext: "Повторное предложение записи после возражений." }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = appendToReply(mergeReply(aiDt, `Отлично, что смогли помочь! Когда вам удобно прийти?`), slotsText);
          session.state = "collect_datetime";
          session.data = data;
          break;
        }

        if (isRefusing(messageText)) {
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

        if (isNo(messageText)) {
          const aiClarify = await generateChatbotResponse(
            up("await_decision", { backendContext: "Пациент ответил «нет» без явного отказа — уточни, готовы ли записаться позже или нужен другой врач." }),
            recentMessages,
            messageText,
            managerExamples,
          );
          response = mergeReply(aiClarify, buildDecisionFallback());
          session.state = "await_decision";
          session.data = data;
          break;
        }

        const objectionBackend = buildObjectionBackendContext(data.objectionType);
        const aiObj = await generateChatbotResponse(
          up("handle_objections", { backendContext: objectionBackend }),
          recentMessages,
          messageText,
          managerExamples,
        );

        if (!data.objectionsHandled) {
          data.objectionsHandled = true;
          response = mergeReply(aiObj, buildObjectionFallback(data.objectionType));
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
            let nextCandidate: DoctorCandidate | null = nextStored
              ? {
                  id: nextStored.id,
                  name: nextStored.name,
                  specialty: nextStored.specialty ?? null,
                  rankPercent: nextStored.score,
                  reasons: nextStored.reasons ?? [],
                  finalScore: nextStored.finalScore ?? nextStored.score,
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
            slotsText = await buildSlotsAppendix(clinicId, data.suggestedDoctorId, settings.calendarConfig);
          } else if (data.existingProcedureId) {
            const [proc] = await db
              .select({ doctorId: proceduresTable.doctorId })
              .from(proceduresTable)
              .where(and(eq(proceduresTable.id, data.existingProcedureId), eq(proceduresTable.clinicId, clinicId)))
              .limit(1);
            if (proc?.doctorId) {
              slotsText = await buildSlotsAppendix(clinicId, proc.doctorId, settings.calendarConfig);
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

      case "show_slots": {
        const slotsText = data.suggestedDoctorId
          ? await buildSlotsAppendix(clinicId, data.suggestedDoctorId, settings.calendarConfig)
          : "";
        const aiReply = await generateChatbotResponse(
          up("collect_datetime", {
            backendContext: `Покажи доступные слоты врача ${data.suggestedDoctorName ?? ""} и попроси выбрать дату/время.`,
          }),
          recentMessages,
          messageText,
          managerExamples,
        );
        response = appendToReply(
          mergeReply(
            aiReply,
            `Вот ближайшие окна${data.suggestedDoctorName ? ` к врачу *${data.suggestedDoctorName}*` : ""}. Какое время вам удобно?`,
          ),
          slotsText,
        );
        session.state = "collect_datetime";
        session.data = data;
        break;
      }

      case "collect_datetime": {
        // Hot-lead shortcut: patient may have named the time earlier in the funnel
        // (e.g. «хочу записаться завтра» in the first message) — reuse it instead of re-asking.
        let extractedDate = await extractDatetimeFromText(messageText).catch(() => null);
        if (!extractedDate && data.preferredDatetime && (isYes(messageText) || isReadyToBook(messageText))) {
          const stored = new Date(data.preferredDatetime);
          if (!Number.isNaN(stored.getTime()) && stored.getTime() > Date.now()) {
            extractedDate = stored;
          }
        }
        if (extractedDate) {
          data.confusedCount = 0;

          const doctorId = data.suggestedDoctorId;
          let slotOk = true;
          let slotHint = "";

          if (doctorId) {
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
              if (dryRun) {
                noteAction(`Слот недоступен (${validation.reason}): ${formatAlmatyDateTimeLong(extractedDate)}`);
              }
            } else if (dryRun) {
              noteAction(`Слот доступен: ${formatAlmatyDateTimeLong(extractedDate)}`);
            }
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
            slotsText = data.suggestedDoctorId
              ? await buildSlotsAppendix(clinicId, data.suggestedDoctorId, settings.calendarConfig)
              : "";
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

      case "collect_review": {
        const score = parseReviewScoreFromText(messageText);
        if (score && patientDb) {
          if (!dryRun) {
            await savePatientReview({
              clinicId,
              patientId: patientDb.id,
              doctorId: data.pendingReviewDoctorId ?? patientDb.doctorId,
              procedureId: data.pendingReviewProcedureId,
              score,
              comment: messageText.length > 3 && !/^[1-5]$/.test(messageText.trim()) ? messageText : undefined,
            });
          }
          session.state = "done";
          session.data = { ...data, pendingReviewProcedureId: undefined, pendingReviewDoctorId: undefined };
          response = "Спасибо за вашу оценку! 🙏 Мы ценим ваше мнение и постоянно работаем над качеством обслуживания.";
        } else {
          response =
            "Пожалуйста, оцените визит от 1 до 5 (где 5 — отлично). Можно просто отправить цифру.";
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
          buildDentalQaSystemPrompt(settings, qaName, dentalContext, clinicName),
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
            slotsText = data.suggestedDoctorId
              ? await buildSlotsAppendix(clinicId, data.suggestedDoctorId, settings.calendarConfig)
              : "";
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
          response = mergeReply(aiReply, `Я вас понял. Хотите ли вы выбрать другое время для визита? Подберём удобное окно без ожидания.`);
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
      useRealSession?: boolean;
      realPatientPhone?: string;
    },
  ): Promise<SimulateMessageResult> {
    try {
      assertOpenRouterConfigured();
    } catch (err) {
      logger.warn({ err, clinicId }, "[ChatbotService] Playground: OpenRouter not configured");
      return buildPlaygroundFallbackResult({
        session: opts?.session,
        userMessage,
        userReply: PLAYGROUND_NO_OPENROUTER_TEXT,
        internalReason: "openrouter_not_configured",
      });
    }

    try {
      try {
        await aiCreditsService.consumeCredits({
          clinicId,
          userId: opts?.userId,
          feature: "chatbot_test",
        });
      } catch (err) {
        if (!(err instanceof InsufficientAiCreditsError)) throw err;
        logger.info({ clinicId }, "[ChatbotService] Playground test without AI credits — allowed for preview");
      }

      const settings = getEffectiveSettings(await getSettings(clinicId));
      const simPhone = opts?.useRealSession && opts.realPatientPhone
        ? canonicalChatbotPhone(opts.realPatientPhone)
        : PLAYGROUND_SIM_PHONE;
      const simOpts: ProcessMessageOptions = opts?.useRealSession && opts.realPatientPhone
        ? { dryRun: true, initGreeting: opts.initGreeting }
        : {
            dryRun: true,
            sessionInput: opts?.session,
            historyInput: opts?.history,
            scenario: opts?.scenario,
            initGreeting: opts?.initGreeting,
          };
      type PlaygroundRaceResult = { timedOut: true } | { timedOut: false; turn: TurnResult | null };
      let raceResult: PlaygroundRaceResult;
      try {
        raceResult = await Promise.race([
          this.safeExecuteTurn(clinicId, simPhone, userMessage, simOpts).then((turn) => ({ timedOut: false as const, turn })),
          new Promise<PlaygroundRaceResult>((resolve) => {
            setTimeout(() => resolve({ timedOut: true }), PLAYGROUND_TURN_TIMEOUT_MS);
          }),
        ]);
      } catch (turnErr) {
        logger.warn({ err: turnErr, clinicId }, "[ChatbotService] Playground turn failed");
        return buildPlaygroundFallbackResult({
          session: opts?.session,
          userMessage,
          userReply: isRecoverableLlmError(turnErr)
            ? PLAYGROUND_ERROR_FALLBACK_TEXT
            : PLAYGROUND_BUSY_FALLBACK_TEXT,
          internalReason: "turn_error",
        });
      }

      if (raceResult.timedOut) {
        logger.warn({ clinicId }, "[ChatbotService] Playground turn exceeded time budget");
        return buildPlaygroundFallbackResult({
          session: opts?.session,
          userMessage,
          internalReason: "timeout",
        });
      }

      const turn = raceResult.turn;
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

      const resolved = turn.outbound ?? replyFromText(PLAYGROUND_ERROR_FALLBACK_TEXT);
      return {
        ...formatSimulateMessageResult(
          { ...turn, outbound: resolved },
          settings,
          userMessage || "Здравствуйте",
        ),
      };
    } catch (err) {
      logger.error({ err, clinicId }, "[ChatbotService] simulateMessage failed — playground safe fallback");
      return buildPlaygroundFallbackResult({
        session: opts?.session,
        userMessage,
        userReply: PLAYGROUND_ERROR_FALLBACK_TEXT,
        internalReason: err instanceof Error ? err.message.slice(0, 80) : "error",
      });
    }
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
        backendContext: `Пациент ${patientName} отменил или не пришёл на процедуру «${procedureName}» к врачу ${doctorName}. Мягко узнай причину и предложи перезапись.`,
        sessionData: { patientName, problemDescription: `${procedureName} — ${doctorName}` },
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
      `Здравствуйте, ${patientName}! Заметили, что ваш приём на «${procedureName}» не состоялся. Всё ли у вас в порядке? Если хотите, подберём новое удобное время к врачу — просто напишите, когда вам удобно. 😊`,
    );

    await saveSession(session);
    await sendOutboundReply(clinicId, patient.phone, reply).catch((err) =>
      logger.error({ err }, "ChatbotService: failed to send WhatsApp reactivation reply"),
    );
  }

  /** Get recent chatbot message history for AI context (newest 20, chronological). */
  private async getRecentHistory(
    clinicId: string,
    phone: string,
    excludeContent?: string,
  ): Promise<ChatMessage[]> {
    try {
      const phoneKeys = chatbotPhoneLookupKeys(phone);
      if (phoneKeys.length === 0) return [];
      const messages = await db
        .select({
          direction: chatbotMessagesTable.direction,
          content: chatbotMessagesTable.content,
          createdAt: chatbotMessagesTable.createdAt,
        })
        .from(chatbotMessagesTable)
        .where(and(eq(chatbotMessagesTable.clinicId, clinicId), inArray(chatbotMessagesTable.phone, phoneKeys)))
        .orderBy(desc(chatbotMessagesTable.createdAt))
        .limit(20);

      const chronological = [...messages].reverse();
      const mapped = chronological.map((m) => ({
        role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt,
      }));

      const asChatMessages = mapped.map(({ role, content }) => ({ role, content }));
      return excludeContent
        ? excludeTrailingDuplicateUserMessage(asChatMessages, excludeContent)
        : asChatMessages;
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

    await insertNotifications(
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
      const response = await createChatCompletion(
        {
          model: FAST_MODEL,
          max_tokens: 6000,
          temperature: 0.1,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Разбей этот скрипт на блоки:\n\n${rawText}` },
          ],
        },
        { timeoutMs: 30_000, label: "parseScriptWithAI" },
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
      calendarConfig?: ChatbotSettings["calendarConfig"];
      abTestEnabled?: boolean;
      broadcastAiEnabled?: boolean;
      agentModeEnabled?: boolean;
      scriptVariants?: ChatbotSettings["scriptVariants"];
    },
  ): Promise<{ settings: ChatbotSettings }> {
    const settings = await getSettings(clinicId);
    const [updated] = await db
      .update(chatbotSettingsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chatbotSettingsTable.id, settings.id))
      .returning();
    settingsCache.delete(clinicId);
    return { settings: updated! };
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
      useRealSession?: boolean;
      realPatientPhone?: string;
    },
  ): Promise<SimulateMessageResult> {
    const sessionInput =
      opts?.useRealSession
        ? undefined
        : opts?.session ??
          (opts?.fsmState
            ? { state: opts.fsmState, data: {} as ChatbotSessionData, humanTakeover: false }
            : undefined);

    return this.simulateMessage(clinicId, userMessage, {
      userId,
      session: sessionInput,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      scenario: opts?.useRealSession ? undefined : opts?.scenario,
      initGreeting: opts?.initGreeting ?? (!userMessage && history.length === 0),
      useRealSession: opts?.useRealSession,
      realPatientPhone: opts?.realPatientPhone,
    });
  }

  async getSessionByPhone(clinicId: string, phone: string) {
    const canonical = canonicalChatbotPhone(phone);
    const session = await loadSession(clinicId, canonical);
    if (!session) return null;
    return {
      id: session.id,
      clinicId: session.clinicId,
      phone: session.phone,
      state: session.state,
      data: session.data,
      humanTakeover: session.humanTakeover,
    };
  }

  async compareTurn(clinicId: string, phone: string, userMessage: string) {
    const canonical = canonicalChatbotPhone(phone);
    const patient = await findPatientByPhoneNormalized(clinicId, canonical);
    const [playgroundTurn, productionTurn, session, history] = await Promise.all([
      this.safeExecuteTurn(clinicId, PLAYGROUND_SIM_PHONE, userMessage, {
        dryRun: true,
        scenario: "new_patient",
      }),
      this.safeExecuteTurn(clinicId, canonical, userMessage, { dryRun: true }),
      loadSession(clinicId, canonical),
      this.getRecentHistory(clinicId, canonical, userMessage),
    ]);

    const format = (turn: TurnResult | null) => ({
      reply: turn?.outbound ? joinChatbotReply(turn.outbound) : null,
      fsmState: turn?.session.state ?? null,
      humanTakeover: turn?.session.humanTakeover ?? false,
      sessionData: turn?.session.data ?? {},
    });

    return {
      playground: format(playgroundTurn),
      production: format(productionTurn),
      diagnostics: {
        phoneCanonical: canonical,
        sessionState: session?.state ?? null,
        sessionHumanTakeover: session?.humanTakeover ?? false,
        historyCount: history.length,
        historyPreview: buildHistoryPreview(history),
        patientStatus: patient?.status ?? null,
      },
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
    const phoneKeys = chatbotPhoneLookupKeys(phone);
    return db
      .select()
      .from(chatbotMessagesTable)
      .where(and(eq(chatbotMessagesTable.clinicId, clinicId), inArray(chatbotMessagesTable.phone, phoneKeys)))
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
    const session = await loadSession(clinicId, canonicalChatbotPhone(phone));
    if (!session || session.humanTakeover) return;
    markSessionHumanTakeover(session);
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
    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);
    const inactiveSessions = await db
      .select()
      .from(chatbotSessionsTable)
      .where(
        and(
          ne(chatbotSessionsTable.state, "done"),
          ne(chatbotSessionsTable.state, "human_takeover"),
          lte(chatbotSessionsTable.updatedAt, sixtyMinutesAgo)
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

      let clinicBranchNames: string[] = [];

      try {
        const [settingsRow, managerExamplesRow, knowledgeContextRow, priceListContextRow, doctorsWithSlotsRow, clinicRow, branchNamesRow] = await Promise.all([
          getSettings(session.clinicId),
          getManagerExamples(session.clinicId),
          loadKnowledgeContext(session.clinicId),
          loadPriceListContext(session.clinicId),
          getClinicDoctorsWithSlots(session.clinicId).catch(() => [] as DoctorWithSlots[]),
          db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, session.clinicId)).limit(1).catch(() => []),
          loadClinicBranchNames(session.clinicId),
        ]);
        settings = settingsRow;
        managerExamples = managerExamplesRow;
        knowledgeContext = knowledgeContextRow;
        priceListContext = priceListContextRow;
        doctorsWithSlots = doctorsWithSlotsRow;
        clinicName = clinicRow[0]?.name ?? undefined;
        clinicBranchNames = branchNamesRow;
      } catch (err) {
        logger.error({ err }, "[ChatbotService] Failed to load context for inactivity reminder");
        continue;
      }

      if (!settings.enabled) continue;

      const reminderData = data as ChatbotSessionData;
      const contextBits = [
        reminderData.problemDescription ? `Запрос пациента: «${reminderData.problemDescription}».` : null,
        reminderData.suggestedDoctorName ? `Обсуждали врача: ${reminderData.suggestedDoctorName}.` : null,
        reminderData.preferredDatetime ? `Пациент упоминал время: ${reminderData.preferredDatetime}.` : null,
        reminderData.selectedBranch ? `Филиал: ${reminderData.selectedBranch}.` : null,
      ].filter(Boolean).join(" ");

      const recentRows = await db
        .select()
        .from(chatbotMessagesTable)
        .where(and(eq(chatbotMessagesTable.clinicId, session.clinicId), eq(chatbotMessagesTable.phone, session.phone)))
        .orderBy(asc(chatbotMessagesTable.createdAt))
        .limit(20);

      const recentMessages = recentRows.map((r) => ({
        role: r.direction === "inbound" ? ("user" as const) : ("assistant" as const),
        content: r.content,
      }));

      const helperPrompt = buildFollowUpMiniPrompt({
        clinicName: resolveClinicName(settings, clinicName),
        state: session.state as ChatbotState,
        contextBits,
        template: "Отправь одно короткое напоминание без повторения уже заданных вопросов.",
      });

      const aiReminder = await generateChatbotResponse(
        helperPrompt,
        recentMessages,
        "Отправь вежливое напоминание (reminder)",
        managerExamples,
      );
      const reminderReply = mergeReply(aiReminder, "Если актуально — напишите, продолжим запись 😊");
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

      // Migrate in-flight sessions from the legacy 24/72/168h flags to the touch counter.
      const legacyTouches = data.leadFollowup72Sent ? 3 : data.leadFollowup24Sent ? 2 : 0;
      const touchesSent = Math.max(data.leadNurtureTouchesSent ?? 0, legacyTouches);
      if (touchesSent >= LEAD_NURTURE_TOUCHES.length) continue;

      const nextTouch = LEAD_NURTURE_TOUCHES[touchesSent]!;
      if (hoursSince < nextTouch.hours) continue;
      const stage = touchesSent as 0 | 1 | 2 | 3;

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
      data.leadNurtureTouchesSent = stage + 1;
      // Keep legacy flags in sync so older readers/deploys behave sanely.
      if (stage + 1 >= 2) data.leadFollowup24Sent = true;
      if (stage + 1 >= 3) data.leadFollowup72Sent = true;
      if (stage + 1 >= 4) data.leadFollowup168Sent = true;

      await saveSession({
        id: row.id,
        clinicId: row.clinicId,
        phone: row.phone,
        state,
        data,
        humanTakeover: row.humanTakeover,
      });

      logger.info(
        { phone: row.phone, stage, touch: nextTouch.label, hoursSince },
        "[ChatbotService] Sending lead nurture follow-up",
      );

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
      let clinicBranchNames: string[] = [];

      try {
        [managerExamples, knowledgeContext, priceListContext, doctorsWithSlots, clinicName, clinicBranchNames] = await Promise.all([
          getManagerExamples(row.clinicId),
          loadKnowledgeContext(row.clinicId, data.problemDescription ?? ""),
          loadPriceListContext(row.clinicId),
          getClinicDoctorsWithSlots(row.clinicId).catch(() => [] as DoctorWithSlots[]),
          db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, row.clinicId)).limit(1).then((rows) => rows[0]?.name),
          loadClinicBranchNames(row.clinicId),
        ]);
      } catch (err) {
        logger.error({ err }, "[ChatbotService] Failed to load context for lead nurture");
        await sendOutboundReply(row.clinicId, row.phone, fallbackText).catch(() => {});
        continue;
      }

      const nurtureGuidance = `Пациент не завершил запись (этап «${state}») и не отвечает. Это повторное касание ${stage + 1} из 4 (${nextTouch.label}). Одно короткое follow-up — новая формулировка, без повторения уже заданных вопросов и прошлых напоминаний.${stage === 3 ? " Это финальное касание: мягко попрощайся и оставь дверь открытой, без давления." : ""}`;

      const helperPrompt = buildFollowUpMiniPrompt({
        clinicName: resolveClinicName(settings, clinicName),
        state,
        contextBits: data.problemDescription ? `Запрос: «${data.problemDescription}».` : "",
        template: `${nurtureGuidance}\n\nБазовый шаблон:\n${fallbackText}`,
      });

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

export interface ArmVisitConfirmationInput {
  clinicId: string;
  phone: string;
  procedureId: string;
  scheduledAt: Date;
  doctorName?: string;
  procedureName?: string;
}

/**
 * Arm the chatbot session after the 1-hour pre-appointment reminder is sent,
 * so the patient's reply («да» / «не смогу») gets a warm deterministic answer.
 */
export async function armVisitConfirmation(input: ArmVisitConfirmationInput): Promise<void> {
  const phone = canonicalChatbotPhone(input.phone);
  const existing = await loadSession(input.clinicId, phone);
  // Operator owns the dialog — don't intercept the patient's replies.
  if (existing?.humanTakeover) return;

  const session: SessionRecord = existing ?? {
    id: randomUUID(),
    clinicId: input.clinicId,
    phone,
    state: "done",
    data: {},
    humanTakeover: false,
  };
  session.data = {
    ...session.data,
    pendingVisitConfirmation: {
      procedureId: input.procedureId,
      scheduledAt: input.scheduledAt.toISOString(),
      doctorName: input.doctorName || undefined,
      procedureName: input.procedureName || undefined,
      armedAt: new Date().toISOString(),
    },
  };
  await saveSession(session);
  logger.info(
    { clinicId: input.clinicId, phone, procedureId: input.procedureId },
    "[ChatbotService] Visit confirmation armed for 1h pre-appointment reminder",
  );
}

export async function loadChatbotPromptComposeInputs(
  clinicId: string,
): Promise<ChatbotPromptComposeInputs> {
  const [
    settings,
    managerExamples,
    knowledgeText,
    priceListText,
    doctorsList,
    clinicNameRow,
    clinicBranchNames,
  ] = await Promise.all([
    getSettings(clinicId),
    getManagerExamples(clinicId),
    loadKnowledgeContext(clinicId),
    loadPriceListContext(clinicId),
    loadDoctorsContext(clinicId),
    db
      .select({ name: clinicsTable.name })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1)
      .then((rows) => rows[0]?.name),
    loadClinicBranchNames(clinicId),
  ]);

  return {
    clinicId,
    clinicName: resolveClinicName(settings, clinicNameRow),
    knowledgeText,
    priceListText,
    officialBranches: clinicBranchNames,
    doctorsList,
    managerExamples,
  };
}
