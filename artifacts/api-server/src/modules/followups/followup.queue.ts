import { Queue, Worker } from "bullmq";
import { randomUUID } from "crypto";
import {
  db,
  postopFollowupsTable,
  patientsTable,
  chatbotSettingsTable,
} from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { sendToPatient } from "../../shared/messaging";
import { withProactiveSendClaim } from "../../shared/conversation-gate";
import { logger } from "../../lib/logger";
import { attachWorkerFailedHandler } from "../error-events/error-events.worker-capture";
import { transitionPatientStage, PATIENT_STAGE_TRIGGERS } from "../patients/patient-stage.service";

const QUEUE_NAME = "postop-followups";
const FOLLOWUP_DELAYS_HOURS = [3, 72, 168] as const;

const DEFAULT_TEMPLATES: [string, string, string] = [
  "Дорогой пациент! Прошло несколько часов после вашей процедуры. Как вы себя чувствуете? Если есть вопросы или дискомфорт — обращайтесь, мы всегда на связи.",
  "Здравствуйте! Прошло 3 дня после процедуры. Как ваше самочувствие? Если что-то беспокоит — напишите нам.",
  "Добрый день! Прошла неделя после процедуры. Надеемся, всё хорошо. Если нужна помощь или контрольный осмотр — мы на связи.",
];

interface FollowupJobData {
  followupId: string;
  clinicId: string;
  patientId: string;
  procedureId: string;
  messageTemplate: string;
}

async function getClinicTemplates(clinicId: string): Promise<[string, string, string]> {
  const [settings] = await db
    .select()
    .from(chatbotSettingsTable)
    .where(eq(chatbotSettingsTable.clinicId, clinicId))
    .limit(1);

  if (settings) {
    return [
      settings.followup24hTemplate,
      settings.followup72hTemplate,
      settings.followup168hTemplate,
    ];
  }
  return DEFAULT_TEMPLATES;
}

async function processFollowupJob(data: FollowupJobData): Promise<void> {
  const { followupId, patientId, clinicId, messageTemplate } = data;

  const [patient] = await db
    .select({ phone: patientsTable.phone })
    .from(patientsTable)
    .where(eq(patientsTable.id, patientId))
    .limit(1);

  if (!patient?.phone) {
    logger.warn({ followupId, patientId }, "[FollowupQueue] Patient has no phone, marking sent and skipping WhatsApp");
  } else {
    const sent = await withProactiveSendClaim(clinicId, patient.phone, "postop", async () => {
      return sendToPatient(clinicId, patient.phone!, messageTemplate);
    });

    if (sent === null) {
      const retryAt = new Date(Date.now() + 2 * 60 * 1000);
      await db
        .update(postopFollowupsTable)
        .set({ sendAt: retryAt })
        .where(eq(postopFollowupsTable.id, followupId));
      if (followupQueue) {
        await followupQueue
          .add(
            `followup-retry-${followupId}`,
            { ...data },
            { delay: 2 * 60 * 1000, jobId: `retry-${followupId}-${retryAt.getTime()}` },
          )
          .catch(() => {});
      }
      logger.info(
        { followupId, patientId },
        "[FollowupQueue] Deferred — booking bot holds conversation",
      );
      return;
    }

    logger.info({ followupId, patientId, phone: patient.phone, msgId: sent }, "[FollowupQueue] Post-op followup WhatsApp sent");
  }

  await transitionPatientStage({
    patientId,
    clinicId,
    toStatus: "post_op_monitoring",
    trigger: PATIENT_STAGE_TRIGGERS.POST_OP_FOLLOWUP_SENT,
  });

  await db
    .update(postopFollowupsTable)
    .set({ status: "sent" })
    .where(eq(postopFollowupsTable.id, followupId));
}

let followupQueue: Queue<FollowupJobData> | null = null;

if (process.env["REDIS_URL"]) {
  const connection = { url: process.env["REDIS_URL"] };

  followupQueue = new Queue<FollowupJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
  });

  const followupWorker = new Worker<FollowupJobData>(
    QUEUE_NAME,
    async (job) => {
      await processFollowupJob(job.data);
    },
    { connection, concurrency: 3 },
  );

  attachWorkerFailedHandler(followupWorker, QUEUE_NAME);

  logger.info("[FollowupQueue] BullMQ worker started for post-op followups");
} else {
  logger.info("[FollowupQueue] REDIS_URL not set — followup jobs use DB-only (no delayed scheduling)");

  setInterval(async () => {
    try {
      const now = new Date();
      const due = await db
        .select()
        .from(postopFollowupsTable)
        .where(and(eq(postopFollowupsTable.status, "pending"), lte(postopFollowupsTable.sendAt, now)))
        .limit(20);

      for (const followup of due) {
        await processFollowupJob({
          followupId: followup.id,
          clinicId: followup.clinicId,
          patientId: followup.patientId,
          procedureId: followup.procedureId,
          messageTemplate: followup.messageTemplate,
        });
      }
    } catch (err) {
      logger.error({ err }, "[FollowupQueue] DB polling error");
    }
  }, 60_000);
}

export interface ScheduleFollowupsInput {
  clinicId: string;
  patientId: string;
  procedureId: string;
}

export async function scheduleFollowups(input: ScheduleFollowupsInput): Promise<void> {
  const { clinicId, patientId, procedureId } = input;

  const templates = await getClinicTemplates(clinicId);
  const now = new Date();

  const followups = FOLLOWUP_DELAYS_HOURS.map((hours, idx) => ({
    id: randomUUID(),
    clinicId,
    patientId,
    procedureId,
    sendAt: new Date(now.getTime() + hours * 60 * 60 * 1000),
    status: "pending" as const,
    messageTemplate: templates[idx]!,
  }));

  await db.insert(postopFollowupsTable).values(followups);

  if (followupQueue) {
    for (let i = 0; i < followups.length; i++) {
      const f = followups[i]!;
      const delayMs = FOLLOWUP_DELAYS_HOURS[i]! * 60 * 60 * 1000;
      await followupQueue.add(
        "send-followup",
        {
          followupId: f.id,
          clinicId,
          patientId,
          procedureId,
          messageTemplate: f.messageTemplate,
        },
        { delay: delayMs, removeOnComplete: 200, removeOnFail: 50 },
      );
    }
    logger.info(
      { clinicId, patientId, procedureId, count: followups.length },
      "[FollowupQueue] Scheduled post-op BullMQ followup jobs",
    );
  } else {
    logger.info(
      { clinicId, patientId, procedureId, count: followups.length },
      "[FollowupQueue] Scheduled post-op followup in DB — will be sent by polling worker",
    );
  }
}
