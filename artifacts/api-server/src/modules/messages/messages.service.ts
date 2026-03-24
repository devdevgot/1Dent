import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { MessagesRepository } from "./messages.repository";
import { sendWhatsAppMessage, isRedAlert } from "../../shared/whatsapp";
import { getAlertQueue } from "../../shared/alert-queue";
import { NotFoundError, ForbiddenError } from "../../shared/errors";
import { logger } from "../../lib/logger";
import { ChatbotService } from "../chatbot/chatbot.service";
import type { UserRole, Message, Notification } from "@workspace/db";

const WHATSAPP_ENABLED = !!(
  process.env["WHATSAPP_TOKEN"] && process.env["WHATSAPP_PHONE_ID"]
);

export class MessagesService {
  private repo = new MessagesRepository();
  private chatbot = new ChatbotService();

  async listMessages(
    patientId: string,
    clinicId: string,
    requestingRole: UserRole,
    requestingUserId: string,
  ): Promise<Message[]> {
    const patient = await this.repo.findPatient(patientId, clinicId);
    if (!patient) throw new NotFoundError("Patient not found");

    // Doctors can only view their own patients' messages
    if (requestingRole === "doctor" && patient.doctorId !== requestingUserId) {
      throw new ForbiddenError("Access denied");
    }

    return this.repo.listByPatient(patientId, clinicId);
  }

  async sendMessage(
    patientId: string,
    clinicId: string,
    content: string,
    requestingRole: UserRole,
    requestingUserId: string,
  ): Promise<Message> {
    const patient = await this.repo.findPatient(patientId, clinicId);
    if (!patient) throw new NotFoundError("Patient not found");

    if (requestingRole === "doctor" && patient.doctorId !== requestingUserId) {
      throw new ForbiddenError("Access denied");
    }

    let whatsappMessageId: string | undefined;

    if (WHATSAPP_ENABLED) {
      // Proxy: real phone only exists server-side, never sent to frontend
      const result = await sendWhatsAppMessage(patient.phone, content);
      whatsappMessageId = result.whatsappMessageId;
    }

    const alertFlag = isRedAlert(content);

    const message = await this.repo.create({
      id: randomUUID(),
      clinicId,
      patientId,
      direction: "outbound",
      senderId: requestingUserId,
      content,
      whatsappMessageId: whatsappMessageId ?? null,
      isRedAlert: alertFlag,
    });

    if (alertFlag) {
      const queue = getAlertQueue();
      if (queue) {
        queue
          .add("red-alert", {
            clinicId,
            patientId,
            messageId: message.id,
            content,
            patientName: patient.name,
          })
          .catch(() => {
            this.writeRedAlertNotifications(
              clinicId, patientId, message.id, content, patient.name,
            ).catch((err) => logger.error({ err }, "Failed to write red alert notifications (BullMQ fallback)"));
          });
      } else {
        // Direct DB path — no Redis configured
        this.writeRedAlertNotifications(
          clinicId, patientId, message.id, content, patient.name,
        ).catch((err) => logger.error({ err }, "Failed to write red alert notifications"));
      }
    }

    return message;
  }

  private async writeRedAlertNotifications(
    clinicId: string,
    patientId: string,
    messageId: string,
    content: string,
    patientName: string,
  ): Promise<void> {
    const recipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.clinicId, clinicId),
          inArray(usersTable.role, ["owner", "admin", "doctor"]),
        ),
      );
    if (recipients.length === 0) return;

    const notifMsg = `🚨 Red Alert от пациента ${patientName}: "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}"`;
    await db.insert(notificationsTable).values(
      recipients.map((r) => ({
        id: randomUUID(),
        clinicId,
        userId: r.id,
        type: "red_alert" as const,
        message: notifMsg,
        read: false,
        patientId,
        messageId,
      })),
    );
  }

  async handleInboundWebhook(
    clinicId: string,
    senderPhone: string,
    content: string,
    whatsappMessageId: string,
  ): Promise<Message | null> {
    // Resolve phone → patient (may be null for new/unknown contacts)
    const patient = await this.repo.findPatientByPhone(senderPhone, clinicId);

    // Invoke chatbot FSM only for:
    //  (a) unknown phone numbers — start an onboarding conversation, OR
    //  (b) known patients who already have an active chatbot session
    //      (e.g., mid-booking flow or human_takeover state)
    // This avoids injecting automated replies into ongoing clinical chats.
    const hasChatbotSession = patient
      ? await this.chatbot.hasActiveSession(clinicId, senderPhone)
      : true; // unknown phone always gets the chatbot

    if (hasChatbotSession) {
      // Pass skipRedAlert=true for known patients so MessagesService handles
      // the alert on the stored message (avoids duplicate notifications).
      this.chatbot.processMessage(clinicId, senderPhone, content, { skipRedAlert: !!patient }).catch((err) =>
        logger.error({ err }, "ChatbotService.processMessage failed"),
      );
    }

    if (!patient) {
      logger.info(
        { senderPhone, clinicId },
        "No patient matched for inbound webhook phone — chatbot session started, message not stored",
      );
      return null;
    }

    // Red-alert detection runs for ALL inbound messages from known patients,
    // including replies to post-op BullMQ followup messages.
    const alertFlag = isRedAlert(content);

    const message = await this.repo.create({
      id: randomUUID(),
      clinicId,
      patientId: patient.id,
      direction: "inbound",
      senderId: null,
      content,
      whatsappMessageId,
      isRedAlert: alertFlag,
    });

    if (alertFlag) {
      const queue = getAlertQueue();
      if (queue) {
        queue
          .add("red-alert", {
            clinicId,
            patientId: patient.id,
            messageId: message.id,
            content,
            patientName: patient.name,
          })
          .catch(() => {
            this.writeRedAlertNotifications(
              clinicId, patient.id, message.id, content, patient.name,
            ).catch((err) => logger.error({ err }, "Failed to write inbound red alert notifications (BullMQ fallback)"));
          });
      } else {
        this.writeRedAlertNotifications(
          clinicId, patient.id, message.id, content, patient.name,
        ).catch((err) => logger.error({ err }, "Failed to write inbound red alert notifications"));
      }
    }

    return message;
  }

  async listNotifications(
    userId: string,
    clinicId: string,
  ): Promise<Notification[]> {
    return this.repo.listNotifications(userId, clinicId);
  }

  async countUnread(userId: string, clinicId: string): Promise<number> {
    return this.repo.countUnread(userId, clinicId);
  }

  async markNotificationRead(
    notificationId: string,
    userId: string,
    clinicId: string,
  ): Promise<Notification> {
    const n = await this.repo.markNotificationRead(notificationId, userId, clinicId);
    if (!n) throw new NotFoundError("Notification not found");
    return n;
  }

  async markAllRead(userId: string, clinicId: string): Promise<void> {
    return this.repo.markAllRead(userId, clinicId);
  }
}
