import { randomUUID } from "crypto";
import IORedis from "ioredis";
import {
  db,
  chatbotSettingsTable,
  chatbotSessionsTable,
  patientsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, gte } from "drizzle-orm";
import { sendWhatsAppMessage, isRedAlert } from "../../shared/whatsapp";
import { getAlertQueue } from "../../shared/alert-queue";
import { logger } from "../../lib/logger";
import { AnalyticsRepository } from "../analytics/analytics.repository";
import { ChannelsRepository } from "../channels/channels.repository";
import type { ChatbotState, ChatbotSessionData } from "./chatbot.types";

const WHATSAPP_ENABLED = !!(
  process.env["WHATSAPP_TOKEN"] && process.env["WHATSAPP_PHONE_ID"]
);

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
  // Try Redis first (fast path)
  if (redis) {
    try {
      const raw = await redis.get(`${REDIS_KEY_PREFIX}${clinicId}:${phone}`);
      if (raw) return JSON.parse(raw) as SessionRecord;
    } catch (err) {
      logger.warn({ err }, "[ChatbotSession] Redis get failed, falling back to DB");
    }
  }

  // Always check DB (source of truth for session listing UI)
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

  // Re-populate Redis cache from DB if miss
  if (redis) {
    redis
      .setex(`${REDIS_KEY_PREFIX}${clinicId}:${phone}`, SESSION_TTL_SECONDS, JSON.stringify(session))
      .catch(() => {});
  }

  return session;
}

async function saveSession(session: SessionRecord): Promise<void> {
  // Write-through: always persist to DB so listSessions() UI always works
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

  // Also update Redis cache (non-blocking — DB is authoritative)
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

// ─── Analytics-based doctor routing ─────────────────────────────────────────

const analyticsRepo = new AnalyticsRepository();
const channelsRepo = new ChannelsRepository();

function extractRefCode(text: string): string | null {
  const match = text.match(/ref:([a-f0-9]{8})/i);
  return match ? match[1]!.toLowerCase() : null;
}

async function pickBestDoctorViaKpi(
  clinicId: string,
): Promise<{ id: string; name: string } | null> {
  const kpis = await analyticsRepo.getDoctorKpis(clinicId);
  if (kpis.length === 0) return null;

  // Sort by score desc, pick best doctor who still has open slots today
  const withSlots = [...kpis]
    .filter((k) => k.slotsUsedToday < k.maxSlotsPerDay)
    .sort((a, b) => b.score - a.score);

  if (withSlots.length > 0) {
    const best = withSlots[0]!;
    return { id: best.doctorId, name: best.doctorName };
  }

  // Fallback: all slots filled — fall back to fewest patients
  const sorted = [...kpis].sort((a, b) => a.patientsCount - b.patientsCount);
  const best = sorted[0]!;
  return { id: best.doctorId, name: best.doctorName };
}

// ─── Settings helpers ────────────────────────────────────────────────────────

async function getSettings(clinicId: string) {
  const [settings] = await db
    .select()
    .from(chatbotSettingsTable)
    .where(eq(chatbotSettingsTable.clinicId, clinicId))
    .limit(1);

  if (settings) return settings;

  const id = randomUUID();
  const [created] = await db
    .insert(chatbotSettingsTable)
    .values({ id, clinicId })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

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
) {
  const id = randomUUID();
  const [patient] = await db
    .insert(patientsTable)
    .values({ id, clinicId, name, phone, source: source ?? "whatsapp", status: "new_request", doctorId })
    .returning();
  return patient!;
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
    try {
      settings = await getSettings(clinicId);
    } catch (err) {
      logger.error({ err }, "ChatbotService: failed to load settings");
      return null;
    }

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

    // Parse ref code from any incoming message and persist in session
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

    if (isOperatorRequest(text)) {
      session.state = "human_takeover";
      session.data = data;
      session.humanTakeover = true;
      await saveSession(session);
      await this.notifyHumanTakeover(clinicId, phone, data.patientName);
      return "Соединяю вас с администратором. Пожалуйста, ожидайте — вам ответят в ближайшее время.";
    }

    if (state === "done") {
      // Only run red-alert detection here for UNKNOWN phones (no patient record in CRM).
      // For known patients, MessagesService.handleInboundWebhook already handles red alerts
      // on the stored message — deduplicating to avoid double notifications.
      if (!options?.skipRedAlert && isRedAlert(text)) {
        await triggerRedAlert(clinicId, phone, text, data.createdPatientId);
        const response = "🚨 Мы видим вашу проблему и передаём её администратору. Ожидайте, пожалуйста.";
        if (WHATSAPP_ENABLED) sendWhatsAppMessage(phone, response).catch(() => {});
        return response;
      }
      const response = "Рады вашему обращению! Если возникнут вопросы — пишите. Или напишите «оператор» для связи с администратором.";
      if (WHATSAPP_ENABLED) sendWhatsAppMessage(phone, response).catch(() => {});
      return response;
    }

    let response: string | null = null;

    switch (state) {
      case "greeting": {
        response = settings.greetingTemplate;
        session.state = "collect_name";
        break;
      }

      case "collect_name": {
        data.patientName = text.trim().slice(0, 60);
        response = `Приятно познакомиться, ${data.patientName}! 😊\nОпишите вашу проблему или какую процедуру вы хотели бы пройти (например: болит зуб, профилактика, брекеты и т.д.)`;
        session.state = "collect_problem";
        session.data = data;
        break;
      }

      case "collect_problem": {
        data.problemDescription = text.trim().slice(0, 200);
        const doctor = await pickBestDoctorViaKpi(clinicId);
        if (doctor) {
          data.suggestedDoctorId = doctor.id;
          data.suggestedDoctorName = doctor.name;
          response = `Понял! Исходя из вашего запроса, рекомендую врача *${doctor.name}*.\n\nЗаписать вас к нему? (Ответьте «Да» или «Нет»)`;
          session.state = "suggest_doctor";
        } else {
          response = `Понял! К сожалению, сейчас нет доступных врачей. Напишите «оператор», чтобы связаться с администратором.`;
        }
        session.data = data;
        break;
      }

      case "suggest_doctor": {
        if (isYes(text)) {
          data.confusedCount = 0;
          response = `Отлично! Подтверждаете запись к ${data.suggestedDoctorName ?? "врачу"}? (Да / Нет)`;
          session.state = "confirm_appointment";
        } else if (isNo(text)) {
          data.confusedCount = 0;
          response = "Понял. Опишите снова, что вас беспокоит, и я помогу подобрать специалиста?";
          session.state = "collect_problem";
        } else {
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 2) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            response = "Похоже, я не могу вам помочь. Соединяю с администратором — ожидайте ответа.";
          } else {
            response = `Пожалуйста, ответьте «Да» для записи к врачу или «Нет» для отмены.`;
          }
        }
        break;
      }

      case "confirm_appointment": {
        if (isYes(text)) {
          data.confusedCount = 0;
          if (data.suggestedDoctorId && data.patientName) {
            try {
              const patientSource = data.refCode ? `ref:${data.refCode}` : "whatsapp";
              const patient = await createPatient(clinicId, phone, data.patientName, data.suggestedDoctorId, patientSource);
              data.createdPatientId = patient.id;
              session.data = data;
              // Post-op BullMQ followup jobs (24h/72h/168h) are scheduled automatically
              // via followup.queue.ts when the doctor marks the procedure as "completed".
            } catch (err) {
              logger.error({ err }, "ChatbotService: failed to create patient");
            }
          }
          response = `✅ Запись подтверждена! Администратор свяжется с вами для уточнения времени визита.\n\nЕсли возникнут вопросы — пишите сюда. Мы на связи!`;
          session.state = "done";
        } else if (isNo(text)) {
          data.confusedCount = 0;
          data.suggestedDoctorId = undefined;
          data.suggestedDoctorName = undefined;
          session.data = { patientName: data.patientName };
          response = `Хорошо, отменяем. Опишите снова, что вас беспокоит, и я помогу подобрать специалиста.`;
          session.state = "collect_problem";
        } else {
          const count = (Number(data.confusedCount) || 0) + 1;
          data.confusedCount = count;
          if (count >= 2) {
            session.state = "human_takeover";
            session.humanTakeover = true;
            await this.notifyHumanTakeover(clinicId, phone, data.patientName);
            response = "Похоже, я не могу вам помочь. Соединяю с администратором — ожидайте ответа.";
          } else {
            response = `Пожалуйста, ответьте «Да» для подтверждения записи или «Нет» для отмены.`;
          }
        }
        break;
      }

      default:
        response = null;
    }

    session.data = data;
    await saveSession(session);

    if (response && WHATSAPP_ENABLED) {
      sendWhatsAppMessage(phone, response).catch((err) =>
        logger.error({ err }, "ChatbotService: failed to send WhatsApp reply"),
      );
    } else if (response) {
      logger.info({ phone, response }, "ChatbotService: WhatsApp disabled — would have sent reply");
    }

    return response;
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
    },
  ) {
    const settings = await getSettings(clinicId);
    const [updated] = await db
      .update(chatbotSettingsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chatbotSettingsTable.id, settings.id))
      .returning();
    return updated!;
  }

  async listSessions(clinicId: string) {
    const cutoff = new Date(Date.now() - SESSION_TTL_SECONDS * 1000);
    return db
      .select()
      .from(chatbotSessionsTable)
      .where(and(eq(chatbotSessionsTable.clinicId, clinicId), gte(chatbotSessionsTable.updatedAt, cutoff)))
      .orderBy(chatbotSessionsTable.updatedAt);
  }

  async clearSession(clinicId: string, phone: string) {
    await deleteRedisSession(clinicId, phone);
    await db
      .update(chatbotSessionsTable)
      .set({ state: "greeting", data: {}, humanTakeover: false, updatedAt: new Date() })
      .where(and(eq(chatbotSessionsTable.clinicId, clinicId), eq(chatbotSessionsTable.phone, phone)));
  }

  /** Returns true if there is a non-expired chatbot session for this phone (any state). */
  async hasActiveSession(clinicId: string, phone: string): Promise<boolean> {
    // Check Redis first
    if (redis) {
      try {
        const exists = await redis.exists(`${REDIS_KEY_PREFIX}${clinicId}:${phone}`);
        if (exists) return true;
      } catch (_) { /* fall through */ }
    }
    // Fall back to DB
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
