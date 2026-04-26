import { randomUUID } from "crypto";
import IORedis from "ioredis";
import {
  db,
  chatbotSettingsTable,
  chatbotSessionsTable,
  chatbotMessagesTable,
  chatbotManagerExamplesTable,
  patientsTable,
  notificationsTable,
  usersTable,
  proceduresTable,
} from "@workspace/db";
import type { StepInstructions } from "@workspace/db";
import { eq, and, inArray, gte, lte, ne, asc, desc, sql } from "drizzle-orm";
import { isRedAlert } from "../../shared/whatsapp";
import { sendToPatient } from "../../shared/messaging";
import { getAlertQueue } from "../../shared/alert-queue";
import { logger } from "../../lib/logger";
import { pickBestDoctorAdvanced, type AdvancedScoringOptions } from "../analytics/analytics.repository";
import { ChannelsRepository } from "../channels/channels.repository";
import { classifyPatientRequest, generateChatbotResponse, type ChatMessage, type ManagerExample } from "./ai-classifier";
import type { ChatbotState, ChatbotSessionData } from "./chatbot.types";
import type { ChatbotSettings } from "@workspace/db";

type CachedSettings = { settings: ChatbotSettings; expiresAt: number };
type CachedExamples = { examples: ManagerExample[]; expiresAt: number };

const SESSION_TTL_SECONDS = 24 * 60 * 60;
const REDIS_KEY_PREFIX = "chatbot:session:";

const OPERATOR_KEYWORDS = ["оператор", "operator", "человек", "admin", "администратор"];
const CONFIRM_YES = ["да", "yes", "ок", "ok", "конечно", "подтверждаю", "согласен", "согласна", "👍", "+"];
const CONFIRM_NO = ["нет", "no", "отмена", "отменить", "cancel", "не надо"];

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

function buildSystemPrompt(state: ChatbotState, settings: Awaited<ReturnType<typeof getSettings>>): string {
  const si = (settings.stepInstructions ?? {}) as StepInstructions;

  const generalExtra = si.general ? `\n\nДополнительные инструкции клиники:\n${si.general}` : "";

  const base = `Ты — вежливый и профессиональный AI-ассистент стоматологической клиники 1Dent (Казахстан).
Отвечай коротко и по делу. Используй простой, дружелюбный язык. Не ставь диагнозы.
Отвечай на том языке, на котором пишет пациент (русский, казахский или английский).
Не придумывай информацию о клинике — цены, адрес и расписание уточняй у администратора.${generalExtra}`;

  const defaults: Record<ChatbotState, string> = {
    greeting: `${base}\n\nТвоя задача: поприветствовать пациента и попросить его ввести ИИН (12 цифр) или имя если обращается впервые. Используй шаблон: "${settings.greetingTemplate}"`,
    collect_iin: `${base}\n\nТы уже поприветствовал пациента. Ожидаешь ИИН (12 цифр) или имя. Если пациент написал что-то непонятное — мягко уточни.`,
    collect_name: `${base}\n\nТы уже поприветствовал пациента. Сейчас жди имя или помоги его уточнить если пациент написал что-то непонятное.`,
    collect_problem: `${base}\n\nТы знаешь имя пациента. Твоя задача: узнать с какой проблемой или за какой услугой обращается пациент. Задавай уточняющие вопросы если нужно.`,
    suggest_doctor: `${base}\n\nТы подобрал врача на основе запроса пациента. Представь врача и предложи запись. Спроси подтверждение (Да/Нет).`,
    confirm_appointment: `${base}\n\nПациент готов записаться. Попроси финальное подтверждение деталей записи.`,
    done: `${base}\n\nЗапись подтверждена. Отвечай на вопросы о клинике или направляй к администратору.`,
    human_takeover: `${base}\n\nСоединяй пациента с администратором.`,
  };

  // State-specific custom instruction overrides base defaults if set
  const stateInstructionMap: Record<ChatbotState, keyof StepInstructions | null> = {
    greeting: "greeting",
    collect_iin: null,
    collect_name: "collectName",
    collect_problem: "collectProblem",
    suggest_doctor: "suggestDoctor",
    confirm_appointment: "confirm",
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
        // Append IIN identification hint to the greeting
        response += "\n\nЕсли вы уже были у нас — введите ваш ИИН (12 цифр) для быстрой идентификации. Если обращаетесь впервые — напишите ваше имя.";
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
            // Patient identified by IIN — greet by name and jump straight to collect_problem
            data.existingPatientId = iinMatch.id;
            data.patientName = iinMatch.name;
            const aiReply = await generateChatbotResponse(
              buildSystemPrompt("collect_problem", settings),
              recentMessages,
              `Пациент успешно идентифицирован по ИИН. Его зовут ${iinMatch.name}. Поприветствуй его как вернувшегося пациента и спроси с чем обращается сегодня.`,
              managerExamples,
            );
            response = aiReply ?? `Рады снова вас видеть, ${iinMatch.name}! 😊\nС чем вы обращаетесь сегодня?`;
            session.state = "collect_problem";
          } else {
            // IIN not in DB — save it for later creation, ask for name
            data.collectedIin = digits;
            response = "К сожалению, по этому ИИН запись не найдена. Пожалуйста, напишите ваше имя — мы создадим новую запись.";
            session.state = "collect_name";
          }
        } else {
          // Not 12 digits — treat as name, same logic as collect_name
          const cls = await classifyPatientRequest(text, recentMessages);
          const extractedName = cls.extractedName ?? text.trim().slice(0, 60);
          data.patientName = extractedName;
          if (cls.extractedPhone) data.extractedPhone = cls.extractedPhone;
          const aiReply = await generateChatbotResponse(
            buildSystemPrompt("collect_name", settings),
            recentMessages,
            text,
            managerExamples,
          );
          response = aiReply ?? `Приятно познакомиться, ${extractedName}! 😊\nОпишите вашу проблему или какую процедуру вы хотели бы пройти.`;
          session.state = "collect_problem";
        }
        session.data = data;
        break;
      }

      case "collect_name": {
        // Use AI to extract name from potentially complex input
        const classification0 = await classifyPatientRequest(text, recentMessages);
        const extractedName = classification0.extractedName ?? text.trim().slice(0, 60);
        data.patientName = extractedName;
        if (classification0.extractedPhone) {
          data.extractedPhone = classification0.extractedPhone;
        }
        const aiReply0 = await generateChatbotResponse(
          buildSystemPrompt("collect_name", settings),
          recentMessages,
          text,
          managerExamples,
        );
        response = aiReply0 ?? `Приятно познакомиться, ${extractedName}! 😊\nОпишите вашу проблему или какую процедуру вы хотели бы пройти.`;
        session.state = "collect_problem";
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
          const aiReply1 = await generateChatbotResponse(
            buildSystemPrompt("confirm_appointment", settings),
            recentMessages,
            `Пациент согласен записаться к ${data.suggestedDoctorName ?? "врачу"}. Попроси подтвердить запись.`,
            managerExamples,
          );
          response = aiReply1 ?? `Отлично! Подтверждаете запись к ${data.suggestedDoctorName ?? "врачу"}? (Да / Нет)`;
          session.state = "confirm_appointment";
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

      case "confirm_appointment": {
        if (isYes(text)) {
          data.confusedCount = 0;
          if (data.suggestedDoctorId && data.patientName) {
            try {
              if (data.existingPatientId) {
                // Patient was identified by IIN — update existing record
                await db
                  .update(patientsTable)
                  .set({
                    phone,
                    doctorId: data.suggestedDoctorId,
                    status: "new_request",
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(patientsTable.id, data.existingPatientId),
                      eq(patientsTable.clinicId, clinicId),
                    ),
                  );
                data.createdPatientId = data.existingPatientId;
                logger.info(
                  { patientId: data.existingPatientId },
                  "ChatbotService: updated existing patient identified by IIN",
                );
              } else {
                // New patient — create record, optionally saving collected IIN
                const patientSource = data.refCode ? `ref:${data.refCode}` : "whatsapp";
                const patient = await createPatient(
                  clinicId,
                  phone,
                  data.patientName,
                  data.suggestedDoctorId,
                  patientSource,
                  data.collectedIin,
                );
                data.createdPatientId = patient.id;

                if (data.clickId) {
                  channelsRepo
                    .linkClickToPatient(data.clickId, patient.id)
                    .catch((err) =>
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

      default:
        response = null;
    }

    session.data = data;
    await saveSession(session);

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

  async testMessage(clinicId: string, userMessage: string, state: ChatbotState = "collect_problem") {
    const [settings, managerExamples] = await Promise.all([
      getSettings(clinicId),
      getManagerExamples(clinicId),
    ]);
    const systemPrompt = buildSystemPrompt(state, settings);
    const reply = await generateChatbotResponse(systemPrompt, [], userMessage, managerExamples);
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
