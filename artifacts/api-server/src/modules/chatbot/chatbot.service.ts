import { randomUUID } from "crypto";
import { db, chatbotSettingsTable, chatbotSessionsTable, usersTable, patientsTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { sendWhatsAppMessage } from "../../shared/whatsapp";
import { logger } from "../../lib/logger";
import type { ChatbotState, ChatbotSessionData } from "./chatbot.types";

const WHATSAPP_ENABLED = !!(
  process.env["WHATSAPP_TOKEN"] && process.env["WHATSAPP_PHONE_ID"]
);

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const OPERATOR_KEYWORDS = ["оператор", "operator", "человек", "admin", "человека"];

const CONFIRM_YES = ["да", "yes", "ок", "ok", "конечно", "подтверждаю", "согласен", "согласна", "👍", "+"];
const CONFIRM_NO = ["нет", "no", "отмена", "отменить", "cancel", "не надо", "нe", "не"];

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

async function getOrCreateSession(clinicId: string, phone: string) {
  const [existing] = await db
    .select()
    .from(chatbotSessionsTable)
    .where(and(eq(chatbotSessionsTable.clinicId, clinicId), eq(chatbotSessionsTable.phone, phone)))
    .limit(1);

  if (existing) {
    const age = Date.now() - new Date(existing.updatedAt).getTime();
    if (age > SESSION_TTL_MS) {
      await db
        .update(chatbotSessionsTable)
        .set({ state: "greeting", data: {}, humanTakeover: false, updatedAt: new Date() })
        .where(eq(chatbotSessionsTable.id, existing.id));
      return { ...existing, state: "greeting" as ChatbotState, data: {}, humanTakeover: false };
    }
    return existing;
  }

  const id = randomUUID();
  const [created] = await db
    .insert(chatbotSessionsTable)
    .values({ id, clinicId, phone, state: "greeting", data: {}, humanTakeover: false })
    .returning();

  return created!;
}

async function saveSession(
  sessionId: string,
  state: ChatbotState,
  data: ChatbotSessionData,
  humanTakeover = false,
) {
  await db
    .update(chatbotSessionsTable)
    .set({ state, data: data as Record<string, string | null>, humanTakeover, updatedAt: new Date() })
    .where(eq(chatbotSessionsTable.id, sessionId));
}

async function pickBestDoctor(clinicId: string): Promise<{ id: string; name: string } | null> {
  const doctors = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      activePatients: count(patientsTable.id),
    })
    .from(usersTable)
    .leftJoin(
      patientsTable,
      and(
        eq(patientsTable.doctorId, usersTable.id),
        sql`${patientsTable.status} NOT IN ('completed', 'cancelled')`,
      ),
    )
    .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor")))
    .groupBy(usersTable.id, usersTable.name)
    .orderBy(count(patientsTable.id))
    .limit(5);

  if (doctors.length === 0) return null;
  const best = doctors[0]!;
  return { id: best.id, name: best.name };
}

async function createPatient(clinicId: string, phone: string, name: string, doctorId: string) {
  const id = randomUUID();
  const [patient] = await db
    .insert(patientsTable)
    .values({
      id,
      clinicId,
      name,
      phone,
      source: "whatsapp",
      status: "new_request",
      doctorId,
    })
    .returning();
  return patient!;
}

export class ChatbotService {
  async processMessage(
    clinicId: string,
    phone: string,
    text: string,
  ): Promise<string | null> {
    let settings: Awaited<ReturnType<typeof getSettings>>;
    try {
      settings = await getSettings(clinicId);
    } catch (err) {
      logger.error({ err }, "ChatbotService: failed to load settings");
      return null;
    }

    if (!settings.enabled) return null;

    const session = await getOrCreateSession(clinicId, phone);
    if (session.humanTakeover) return null;

    const state = session.state as ChatbotState;
    const data = (session.data ?? {}) as ChatbotSessionData;

    if (isOperatorRequest(text)) {
      await saveSession(session.id, "human_takeover", data, true);
      await this.notifyHumanTakeover(clinicId, phone, data.patientName);
      return "Соединяю вас с администратором. Пожалуйста, ожидайте — вам ответят в ближайшее время.";
    }

    let response: string | null = null;
    let nextState = state;
    let nextData = { ...data };

    switch (state) {
      case "greeting": {
        response = settings.greetingTemplate;
        nextState = "collect_name";
        break;
      }

      case "collect_name": {
        nextData.patientName = text.trim().slice(0, 60);
        response = `Приятно познакомиться, ${nextData.patientName}! 😊\nОпишите вашу проблему или какую процедуру вы хотели бы записаться (например: болит зуб, профилактика, брекеты и т.д.)`;
        nextState = "collect_problem";
        break;
      }

      case "collect_problem": {
        nextData.problemDescription = text.trim().slice(0, 200);
        const doctor = await pickBestDoctor(clinicId);
        if (doctor) {
          nextData.suggestedDoctorId = doctor.id;
          nextData.suggestedDoctorName = doctor.name;
          response = `Понял! Исходя из вашего запроса, рекомендую вас к врачу *${doctor.name}*.\n\nЗаписать вас? (Ответьте «Да» или «Нет»)`;
        } else {
          response = `Понял! К сожалению, на данный момент нет доступных врачей. Отвечу «Оператор», чтобы связаться с администратором.`;
        }
        nextState = "suggest_doctor";
        break;
      }

      case "suggest_doctor": {
        if (isYes(text)) {
          nextState = "confirm_appointment";
          response = `Отлично! Подтверждаете запись к ${nextData.suggestedDoctorName ?? "врачу"}? (Да / Нет)`;
        } else if (isNo(text)) {
          nextState = "collect_problem";
          response = "Понял. Опишите снова, к какому специалисту вы хотите записаться?";
        } else {
          response = `Пожалуйста, ответьте «Да» для записи или «Нет» для отмены.`;
        }
        break;
      }

      case "confirm_appointment": {
        if (isYes(text)) {
          if (nextData.suggestedDoctorId && nextData.patientName) {
            try {
              const patient = await createPatient(
                clinicId,
                phone,
                nextData.patientName,
                nextData.suggestedDoctorId,
              );
              nextData.createdPatientId = patient.id;
            } catch (err) {
              logger.error({ err }, "ChatbotService: failed to create patient");
            }
          }
          nextState = "done";
          response = `✅ Запись подтверждена! Администратор свяжется с вами для уточнения времени визита.\n\nЕсли возникнут вопросы — пишите сюда. До встречи!`;
        } else if (isNo(text)) {
          nextState = "collect_problem";
          nextData = { patientName: nextData.patientName };
          response = `Хорошо, отменяем. Опишите снова, что вас беспокоит, и я помогу подобрать специалиста.`;
        } else {
          response = `Пожалуйста, ответьте «Да» для подтверждения или «Нет» для отмены.`;
        }
        break;
      }

      case "done": {
        response = `Если у вас есть ещё вопросы — пишите! Или напишите «оператор», чтобы связаться с администратором.`;
        break;
      }

      default:
        response = null;
    }

    await saveSession(session.id, nextState, nextData, false);

    if (response && WHATSAPP_ENABLED) {
      sendWhatsAppMessage(phone, response).catch((err) =>
        logger.error({ err }, "ChatbotService: failed to send WhatsApp reply"),
      );
    } else if (response) {
      logger.info({ phone, response }, "ChatbotService: WhatsApp disabled — response not sent");
    }

    return response;
  }

  private async notifyHumanTakeover(clinicId: string, phone: string, patientName?: string) {
    const { db: _db, notificationsTable, usersTable: _ut } = await import("@workspace/db");
    const { eq: _eq, and: _and, inArray } = await import("drizzle-orm");

    const recipients = await _db
      .select({ id: _ut.id })
      .from(_ut)
      .where(_and(_eq(_ut.clinicId, clinicId), inArray(_ut.role, ["owner", "admin"])));

    if (recipients.length === 0) return;

    const name = patientName ?? phone;
    const msg = `👤 Пациент ${name} (${phone}) запросил переключение на оператора в чат-боте.`;

    await _db.insert(notificationsTable).values(
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
    return db
      .select()
      .from(chatbotSessionsTable)
      .where(eq(chatbotSessionsTable.clinicId, clinicId))
      .orderBy(chatbotSessionsTable.updatedAt);
  }

  async clearSession(clinicId: string, phone: string) {
    await db
      .update(chatbotSessionsTable)
      .set({ state: "greeting", data: {}, humanTakeover: false, updatedAt: new Date() })
      .where(
        and(eq(chatbotSessionsTable.clinicId, clinicId), eq(chatbotSessionsTable.phone, phone)),
      );
  }
}
