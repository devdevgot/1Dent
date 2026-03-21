import { Queue, Worker } from "bullmq";
import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { eq, and, inArray } from "drizzle-orm";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";

// Parse redis URL into host/port/password for BullMQ connection options
// BullMQ expects { host, port } not a URL string or IORedis instance
function parseRedisUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || "127.0.0.1",
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password || undefined,
      db: u.pathname && u.pathname !== "/" ? parseInt(u.pathname.slice(1), 10) : 0,
    };
  } catch {
    return { host: "127.0.0.1", port: 6379 };
  }
}

const redisConnection = parseRedisUrl(REDIS_URL);

export interface AlertJobData {
  clinicId: string;
  patientId: string;
  messageId: string;
  content: string;
  patientName: string;
}

const QUEUE_NAME = "red-alerts";

export function getAlertQueue(): Queue {
  return new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });
}

export function startAlertWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const data = job.data as AlertJobData;
      const { clinicId, patientId, messageId, content, patientName } = data;

      const recipients = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.clinicId, clinicId),
            inArray(usersTable.role, ["owner", "admin", "doctor"]),
          ),
        );

      const notifMsg = `🚨 Red Alert от пациента ${patientName}: "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}"`;

      if (recipients.length > 0) {
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
    },
    {
      connection: redisConnection,
      concurrency: 5,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`Red alert job ${job?.id} failed:`, err);
  });

  return worker;
}
