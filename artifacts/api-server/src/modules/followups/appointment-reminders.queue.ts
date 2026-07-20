import { Queue, Worker } from "bullmq";
import { randomUUID } from "crypto";
import {
  db,
  appointmentRemindersTable,
  patientsTable,
  usersTable,
  proceduresTable,
  clinicsTable,
} from "@workspace/db";
import { insertNotifications } from "../../shared/notifications-dispatch";
import { eq, and, lte, inArray } from "drizzle-orm";
import { sendToPatient } from "../../shared/messaging";
import { logger } from "../../lib/logger";
import { attachWorkerFailedHandler } from "../error-events/error-events.worker-capture";

const QUEUE_NAME = "appointment-reminders";

type ReminderType = "24h" | "1h" | "5m";

interface AppointmentReminderJobData {
  reminderId: string;
  clinicId: string;
  patientId: string;
  procedureId: string;
  reminderType: ReminderType;
  patientName: string;
  procedureName: string;
  scheduledAt: string;
  doctorName: string;
  clinicName: string;
  /** Assigned staff user for the appointment (doctor / owner acting as doctor). */
  doctorId?: string | null;
}

function isReminderType(value: string): value is ReminderType {
  return value === "24h" || value === "1h" || value === "5m";
}

async function resolveStaffRecipientIds(
  clinicId: string,
  doctorId: string | null | undefined,
): Promise<string[]> {
  if (doctorId) {
    const [assignee] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, doctorId), eq(usersTable.clinicId, clinicId)))
      .limit(1);
    if (assignee) return [assignee.id];
  }

  // No assignee — fall back to clinic owners/admins so the visit is not silent.
  const recipients = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.clinicId, clinicId),
        inArray(usersTable.role, ["owner", "admin"]),
      ),
    );
  return recipients.map((r) => r.id);
}

async function processReminderJob(data: AppointmentReminderJobData): Promise<void> {
  const {
    reminderId,
    patientId,
    clinicId,
    reminderType,
    patientName,
    procedureName,
    scheduledAt,
    doctorName,
    clinicName,
    doctorId,
  } = data;

  // CRITICAL: Check reminder status in DB before processing.
  // The reminder may have been cancelled after the job was enqueued in Redis/BullMQ.
  const [reminder] = await db
    .select({ status: appointmentRemindersTable.status })
    .from(appointmentRemindersTable)
    .where(eq(appointmentRemindersTable.id, reminderId))
    .limit(1);

  if (!reminder || reminder.status !== "pending") {
    logger.info(
      { reminderId, status: reminder?.status },
      "[AppointmentReminders] Skipping job — reminder was cancelled or already sent",
    );
    return;
  }

  // Skip if the appointment was cancelled / completed since scheduling.
  const [procedureRow] = await db
    .select({
      status: proceduresTable.status,
      doctorId: proceduresTable.doctorId,
      scheduledAt: proceduresTable.scheduledAt,
    })
    .from(proceduresTable)
    .where(eq(proceduresTable.id, data.procedureId))
    .limit(1);

  if (!procedureRow || procedureRow.status === "cancelled") {
    await db
      .update(appointmentRemindersTable)
      .set({ status: "cancelled" })
      .where(eq(appointmentRemindersTable.id, reminderId));
    logger.info(
      { reminderId, procedureId: data.procedureId, status: procedureRow?.status },
      "[AppointmentReminders] Skipping — procedure missing or cancelled",
    );
    return;
  }

  const effectiveDoctorId = doctorId ?? procedureRow.doctorId ?? null;
  const scheduledDate = new Date(procedureRow.scheduledAt?.toISOString() ?? scheduledAt);
  const timeStr = scheduledDate.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Almaty",
  });
  const dateStr = scheduledDate.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Almaty",
  });

  // ── 5-minute staff push (no WhatsApp to patient) ──────────────────────────
  if (reminderType === "5m") {
    const recipientIds = await resolveStaffRecipientIds(clinicId, effectiveDoctorId);
    if (recipientIds.length > 0) {
      // Title already says «Приём через 5 минут» — body starts with patient FIO.
      const notifMessage = `${patientName} — «${procedureName}» в ${timeStr}`;
      await insertNotifications(
        recipientIds.map((userId) => ({
          id: randomUUID(),
          clinicId,
          userId,
          type: "appointment_reminder" as const,
          message: notifMessage,
          read: false,
          payload: {
            patientName,
            doctorName,
            scheduledAt: scheduledDate.toISOString(),
            procedureName,
            reminderType,
            procedureId: data.procedureId,
            patientId,
            clinicName,
            doctorId: effectiveDoctorId,
          } as Record<string, unknown>,
        })),
      );
      logger.info(
        { reminderId, clinicId, recipientCount: recipientIds.length, reminderType },
        "[AppointmentReminders] 5m staff push/in-app notifications created",
      );
    } else {
      logger.warn(
        { reminderId, clinicId, procedureId: data.procedureId },
        "[AppointmentReminders] 5m reminder has no staff recipients",
      );
    }

    await db
      .update(appointmentRemindersTable)
      .set({ status: "sent" })
      .where(eq(appointmentRemindersTable.id, reminderId));
    return;
  }

  // ── 24h / 1h patient WhatsApp + owner/admin notify ────────────────────────
  const [patient] = await db
    .select({ phone: patientsTable.phone })
    .from(patientsTable)
    .where(eq(patientsTable.id, patientId))
    .limit(1);

  const whatsappEnabled = !!(
    process.env["WHATSAPP_TOKEN"] && process.env["WHATSAPP_PHONE_ID"]
  );

  if (patient?.phone) {
    const clinicInfo = clinicName ? ` в клинике «${clinicName}»` : "";
    const messageText =
      reminderType === "24h"
        ? `Здравствуйте, ${patientName}! Напоминаем: ваш приём «${procedureName}»${clinicInfo} запланирован на завтра, ${dateStr} в ${timeStr}. Ждём вас! По вопросам — пишите нам.`
        : `Здравствуйте, ${patientName}! Напоминаем: ваш приём «${procedureName}»${clinicInfo} начнётся через 1 час — сегодня в ${timeStr}. Подскажите, пожалуйста, всё в силе — вы придёте? 😊 Если не получается — напишите, подберём другое время.`;

    // Deliver via the clinic's configured WhatsApp provider (Green API or Meta Cloud API).
    const sentMessageId = await sendToPatient(clinicId, patient.phone, messageText).catch((err) => {
      logger.error({ err, reminderId, patientId }, "[AppointmentReminders] WhatsApp send failed");
      return "";
    });
    if (sentMessageId) {
      logger.info({ reminderId, patientId, reminderType }, "[AppointmentReminders] WhatsApp reminder sent");
    } else if (whatsappEnabled) {
      // Legacy Meta path already attempted inside sendToPatient; nothing more to do.
      logger.info({ reminderId, patientId, reminderType }, "[AppointmentReminders] WhatsApp reminder dispatched");
    } else {
      logger.info(
        { reminderId, patientId, reminderType, messageText },
        "[AppointmentReminders] No WhatsApp provider — reminder would have been sent",
      );
    }

    if (reminderType === "1h") {
      // Arm the chatbot so the patient's «да» / «не смогу» reply gets a warm deterministic answer.
      // Dynamic import avoids a circular dependency (chatbot.service imports this queue).
      try {
        const { armVisitConfirmation } = await import("../chatbot/chatbot.service");
        await armVisitConfirmation({
          clinicId,
          phone: patient.phone,
          procedureId: data.procedureId,
          scheduledAt: scheduledDate,
          doctorName,
          procedureName,
        });
      } catch (err) {
        logger.error({ err, reminderId, patientId }, "[AppointmentReminders] Failed to arm visit confirmation");
      }
    }
  } else {
    logger.warn({ reminderId, patientId }, "[AppointmentReminders] Patient has no phone, skipping WhatsApp");
  }

  const recipients = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.clinicId, clinicId),
        inArray(usersTable.role, ["owner", "admin"]),
      ),
    );

  if (recipients.length > 0) {
    const notifMessage =
      reminderType === "24h"
        ? `Завтра приём: ${patientName} — «${procedureName}» в ${timeStr}${doctorName ? ` (${doctorName})` : ""}`
        : `Через 1 час приём: ${patientName} — «${procedureName}» в ${timeStr}${doctorName ? ` (${doctorName})` : ""}`;

    await insertNotifications(
      recipients.map((r) => ({
        id: randomUUID(),
        clinicId,
        userId: r.id,
        type: "appointment_reminder" as const,
        message: notifMessage,
        read: false,
        payload: {
          patientName,
          doctorName,
          scheduledAt: scheduledDate.toISOString(),
          procedureName,
          reminderType,
          procedureId: data.procedureId,
          patientId,
          clinicName,
          doctorId: effectiveDoctorId,
        } as Record<string, unknown>,
      })),
    );
    logger.info(
      { reminderId, clinicId, recipientCount: recipients.length, reminderType },
      "[AppointmentReminders] In-app notifications created for admins/owners",
    );
  }

  await db
    .update(appointmentRemindersTable)
    .set({ status: "sent" })
    .where(eq(appointmentRemindersTable.id, reminderId));
}

let appointmentReminderQueue: Queue<AppointmentReminderJobData> | null = null;

if (process.env["REDIS_URL"]) {
  const connection = { url: process.env["REDIS_URL"] };

  appointmentReminderQueue = new Queue<AppointmentReminderJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
  });

  const reminderWorker = new Worker<AppointmentReminderJobData>(
    QUEUE_NAME,
    async (job) => {
      await processReminderJob(job.data);
    },
    { connection, concurrency: 3 },
  );

  attachWorkerFailedHandler(reminderWorker, QUEUE_NAME);

  logger.info("[AppointmentReminders] BullMQ worker started for appointment reminders");
} else {
  logger.info("[AppointmentReminders] REDIS_URL not set — appointment reminder jobs use DB polling");

  setInterval(async () => {
    try {
      const now = new Date();
      const due = await db
        .select()
        .from(appointmentRemindersTable)
        .where(
          and(
            eq(appointmentRemindersTable.status, "pending"),
            lte(appointmentRemindersTable.sendAt, now),
          ),
        )
        .limit(20);

      for (const reminder of due) {
        const [procedure] = await db
          .select({
            name: proceduresTable.name,
            scheduledAt: proceduresTable.scheduledAt,
            doctorId: proceduresTable.doctorId,
          })
          .from(proceduresTable)
          .where(eq(proceduresTable.id, reminder.procedureId))
          .limit(1);

        const [patient] = await db
          .select({ name: patientsTable.name })
          .from(patientsTable)
          .where(eq(patientsTable.id, reminder.patientId))
          .limit(1);

        const [clinic] = await db
          .select({ name: clinicsTable.name })
          .from(clinicsTable)
          .where(eq(clinicsTable.id, reminder.clinicId))
          .limit(1);

        let doctorName = "";
        if (procedure?.doctorId) {
          const [doctor] = await db
            .select({ name: usersTable.name })
            .from(usersTable)
            .where(eq(usersTable.id, procedure.doctorId))
            .limit(1);
          doctorName = doctor?.name ?? "";
        }

        const reminderType = isReminderType(reminder.reminderType)
          ? reminder.reminderType
          : "1h";

        await processReminderJob({
          reminderId: reminder.id,
          clinicId: reminder.clinicId,
          patientId: reminder.patientId,
          procedureId: reminder.procedureId,
          reminderType,
          patientName: patient?.name ?? "Пациент",
          procedureName: procedure?.name ?? "Процедура",
          scheduledAt: procedure?.scheduledAt?.toISOString() ?? new Date().toISOString(),
          doctorName,
          clinicName: clinic?.name ?? "",
          doctorId: procedure?.doctorId ?? null,
        });
      }
    } catch (err) {
      logger.error({ err }, "[AppointmentReminders] DB polling error");
    }
  }, 60_000);
}

export interface ScheduleAppointmentRemindersInput {
  clinicId: string;
  patientId: string;
  procedureId: string;
  scheduledAt: Date;
  patientName: string;
  procedureName: string;
  doctorName: string;
  clinicName: string;
  doctorId?: string | null;
}

export async function cancelAppointmentReminders(procedureId: string, clinicId: string): Promise<void> {
  const cancelled = await db
    .update(appointmentRemindersTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(appointmentRemindersTable.procedureId, procedureId),
        eq(appointmentRemindersTable.clinicId, clinicId),
        eq(appointmentRemindersTable.status, "pending"),
      ),
    )
    .returning({ id: appointmentRemindersTable.id });

  if (appointmentReminderQueue && cancelled.length > 0) {
    for (const { id } of cancelled) {
      await appointmentReminderQueue.remove(`reminder-${id}`).catch(() => {});
    }
    logger.info(
      { procedureId, count: cancelled.length },
      "[AppointmentReminders] Cancelled and removed BullMQ jobs for old reminders",
    );
  }
}

export async function scheduleAppointmentReminders(
  input: ScheduleAppointmentRemindersInput,
): Promise<void> {
  const {
    clinicId,
    patientId,
    procedureId,
    scheduledAt,
    patientName,
    procedureName,
    doctorName,
    clinicName,
    doctorId,
  } = input;

  const now = new Date();
  const h24Before = new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000);
  const h1Before = new Date(scheduledAt.getTime() - 60 * 60 * 1000);
  const m5Before = new Date(scheduledAt.getTime() - 5 * 60 * 1000);

  const reminders: { id: string; reminderType: ReminderType; sendAt: Date }[] = [];

  if (h24Before > now) {
    reminders.push({ id: randomUUID(), reminderType: "24h", sendAt: h24Before });
  }
  if (h1Before > now) {
    reminders.push({ id: randomUUID(), reminderType: "1h", sendAt: h1Before });
  }
  if (m5Before > now) {
    reminders.push({ id: randomUUID(), reminderType: "5m", sendAt: m5Before });
  } else if (scheduledAt > now) {
    // Appointment is already inside the 5-minute window — notify ASAP.
    reminders.push({ id: randomUUID(), reminderType: "5m", sendAt: now });
  }

  if (reminders.length === 0) {
    logger.info({ procedureId, scheduledAt }, "[AppointmentReminders] scheduledAt is in the past — no reminders created");
    return;
  }

  await db.insert(appointmentRemindersTable).values(
    reminders.map((r) => ({
      id: r.id,
      clinicId,
      patientId,
      procedureId,
      sendAt: r.sendAt,
      status: "pending" as const,
      reminderType: r.reminderType,
    })),
  );

  if (appointmentReminderQueue) {
    for (const r of reminders) {
      const delayMs = Math.max(0, r.sendAt.getTime() - now.getTime());
      await appointmentReminderQueue.add(
        "send-appointment-reminder",
        {
          reminderId: r.id,
          clinicId,
          patientId,
          procedureId,
          reminderType: r.reminderType,
          patientName,
          procedureName,
          scheduledAt: scheduledAt.toISOString(),
          doctorName,
          clinicName,
          doctorId: doctorId ?? null,
        },
        {
          delay: delayMs,
          removeOnComplete: 200,
          removeOnFail: 50,
          jobId: `reminder-${r.id}`,
        },
      );
    }
    logger.info(
      { clinicId, patientId, procedureId, count: reminders.length },
      "[AppointmentReminders] Scheduled BullMQ appointment reminder jobs",
    );
  } else {
    logger.info(
      { clinicId, patientId, procedureId, count: reminders.length },
      "[AppointmentReminders] Scheduled appointment reminders in DB — will be sent by polling worker",
    );
  }
}
