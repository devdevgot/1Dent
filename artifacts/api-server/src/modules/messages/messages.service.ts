import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { MessagesRepository } from "./messages.repository";
import { isRedAlert } from "../../shared/whatsapp";
import { sendFileToPatient, sendToPatient } from "../../shared/messaging";
import { encodeAttachmentContent } from "../../shared/attachment-content";
import { getAlertQueue } from "../../shared/alert-queue";
import { NotFoundError, ValidationError } from "../../shared/errors";
import { ObjectStorageService } from "../../lib/objectStorage";
import { getObjectAclPolicy } from "../../lib/objectAcl";
import { logger } from "../../lib/logger";
import { ChatbotService } from "../chatbot/chatbot.service";
import { debounceMessage } from "../../shared/message-debounce";
import type { UserRole, Message, Notification } from "@workspace/db";

export interface SendMessageAttachment {
  objectPath: string;
  fileName: string;
  contentType: string;
}

export class MessagesService {
  private repo = new MessagesRepository();
  private chatbot = new ChatbotService();
  private storage = new ObjectStorageService();

  async listMessages(
    patientId: string,
    clinicId: string,
    _requestingRole: UserRole,
    _requestingUserId: string,
  ): Promise<Message[]> {
    const patient = await this.repo.findPatient(patientId, clinicId);
    if (!patient) throw new NotFoundError("Patient not found");

    return this.repo.listByPatient(patientId, clinicId);
  }

  async sendMessage(
    patientId: string,
    clinicId: string,
    content: string,
    requestingRole: UserRole,
    requestingUserId: string,
    attachment?: SendMessageAttachment,
  ): Promise<Message> {
    const patient = await this.repo.findPatient(patientId, clinicId);
    if (!patient) throw new NotFoundError("Patient not found");

    let whatsappMessageId: string | undefined;
    let storedContent = content;

    if (attachment) {
      const normalizedPath = attachment.objectPath.startsWith("/objects/")
        ? attachment.objectPath
        : this.storage.normalizeObjectEntityPath(attachment.objectPath);

      const objectFile = await this.storage.getObjectEntityFile(normalizedPath);
      const aclPolicy = await getObjectAclPolicy(objectFile);
      if (aclPolicy && aclPolicy.owner !== clinicId) {
        throw new ValidationError("Нет доступа к этому файлу");
      }
      if (!aclPolicy) {
        await this.storage.trySetObjectEntityAclPolicy(normalizedPath, {
          owner: clinicId,
          visibility: "private",
        });
      }

      const { buffer, contentType } = await this.storage.readObjectEntityBuffer(normalizedPath);
      const caption = content.trim() || undefined;

      const msgId = await sendFileToPatient(clinicId, patient.phone, {
        buffer,
        fileName: attachment.fileName,
        contentType: attachment.contentType || contentType,
        caption,
      }).catch((err) => {
        logger.warn({ err, objectPath: normalizedPath }, "sendFileToPatient failed — message saved without delivery");
        return "";
      });
      if (msgId) whatsappMessageId = msgId;

      storedContent = encodeAttachmentContent(
        normalizedPath,
        attachment.fileName,
        attachment.contentType || contentType,
        caption,
      );
    } else {
      // Proxy: real phone only exists server-side, never sent to frontend
      // Routes through Green API (if clinic configured) or falls back to Meta
      const msgId = await sendToPatient(clinicId, patient.phone, content).catch((err) => {
        logger.warn({ err }, "sendToPatient failed — message saved without delivery");
        return "";
      });
      if (msgId) whatsappMessageId = msgId;
    }

    const alertFlag = isRedAlert(storedContent);

    const message = await this.repo.create({
      id: randomUUID(),
      clinicId,
      patientId,
      direction: "outbound",
      senderId: requestingUserId,
      content: storedContent,
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
            content: storedContent,
            patientName: patient.name,
          })
          .catch(() => {
            this.writeRedAlertNotifications(
              clinicId, patientId, message.id, storedContent, patient.name,
            ).catch((err) => logger.error({ err }, "Failed to write red alert notifications (BullMQ fallback)"));
          });
      } else {
        // Direct DB path — no Redis configured
        this.writeRedAlertNotifications(
          clinicId, patientId, message.id, storedContent, patient.name,
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

  async handleOutboundPhoneWebhook(
    clinicId: string,
    recipientPhone: string,
    content: string,
    whatsappMessageId: string,
  ): Promise<Message | null> {
    // Dedup: skip if we already have this message (e.g. sent via CRM API)
    const existing = await this.repo.findByWhatsappMessageId(whatsappMessageId, clinicId);
    if (existing) return null;

    const patient = await this.repo.findPatientByPhone(recipientPhone, clinicId);
    if (!patient) {
      logger.info({ recipientPhone, clinicId }, "[GreenAPI] Outbound from phone: no patient matched — skipped");
      return null;
    }

    const message = await this.repo.create({
      id: randomUUID(),
      clinicId,
      patientId: patient.id,
      direction: "outbound",
      senderId: null,
      content,
      whatsappMessageId,
      isRedAlert: false,
    });

    logger.info({ patientId: patient.id, clinicId }, "[GreenAPI] Outbound from phone saved");
    return message;
  }

  async handleInboundWebhook(
    clinicId: string,
    senderPhone: string,
    content: string,
    whatsappMessageId: string,
  ): Promise<Message | null> {
    // Resolve phone → patient (may be null for new/unknown contacts)
    const patient = await this.repo.findPatientByPhone(senderPhone, clinicId);

    // Always route inbound messages through the chatbot FSM.
    // Messages are debounced: if the same sender writes several short messages
    // in quick succession (within 5 s) they are merged into one combined message
    // before being processed. DB storage and alert detection still run per-message.
    debounceMessage(clinicId, senderPhone, content, (combined) => {
      this.chatbot.processMessage(clinicId, senderPhone, combined, { skipRedAlert: !!patient }).catch((err) =>
        logger.error({ err }, "ChatbotService.processMessage failed"),
      );
    });

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
