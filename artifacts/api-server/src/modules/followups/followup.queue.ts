import { Queue, Worker } from "bullmq";
import { randomUUID } from "crypto";
import { db, postopFollowupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const QUEUE_NAME = "postop-followups";

const FOLLOWUP_DELAYS_HOURS = [24, 72, 168] as const;

const TEMPLATES = [
  "Дорогой пациент! Прошло 24 часа после вашей процедуры. Как вы себя чувствуете? Если есть вопросы — обращайтесь.",
  "Прошло 3 дня после процедуры. Надеемся, вы чувствуете себя хорошо. Помните о рекомендациях врача.",
  "Прошла неделя после вашей процедуры. Не забудьте о плановом осмотре. Ждём вас в клинике!",
] as const;

interface FollowupJobData {
  followupId: string;
  clinicId: string;
  patientId: string;
  procedureId: string;
  messageTemplate: string;
}

let followupQueue: Queue<FollowupJobData> | null = null;

if (process.env.REDIS_URL) {
  const connection = { url: process.env.REDIS_URL };

  followupQueue = new Queue<FollowupJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
  });

  new Worker<FollowupJobData>(
    QUEUE_NAME,
    async (job) => {
      const { followupId } = job.data;
      await db
        .update(postopFollowupsTable)
        .set({ status: "sent" })
        .where(eq(postopFollowupsTable.id, followupId));
    },
    { connection, concurrency: 3 },
  );

  console.info("[FollowupQueue] BullMQ worker started for post-op followups");
} else {
  console.info("[FollowupQueue] REDIS_URL not set — followup jobs use DB-only (no delayed scheduling)");
}

export interface ScheduleFollowupsInput {
  clinicId: string;
  patientId: string;
  procedureId: string;
}

export async function scheduleFollowups(input: ScheduleFollowupsInput): Promise<void> {
  const { clinicId, patientId, procedureId } = input;
  const now = new Date();

  const followups = FOLLOWUP_DELAYS_HOURS.map((hours, idx) => ({
    id: randomUUID(),
    clinicId,
    patientId,
    procedureId,
    sendAt: new Date(now.getTime() + hours * 60 * 60 * 1000),
    status: "pending" as const,
    messageTemplate: TEMPLATES[idx]!,
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
  }
}
