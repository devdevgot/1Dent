import { Queue, Worker } from "bullmq";
import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { attachWorkerFailedHandler } from "../modules/error-events/error-events.worker-capture";

export interface AlertJobData {
  clinicId: string;
  patientId: string;
  messageId: string;
  content: string;
  patientName: string;
}

const QUEUE_NAME = "red-alerts";

function parseRedisUrl(url: string) {
  try {
    const u = new URL(url);
    const isTLS = u.protocol === "rediss:";
    return {
      host: u.hostname || "127.0.0.1",
      port: u.port ? parseInt(u.port, 10) : isTLS ? 6380 : 6379,
      username: u.username || undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      db: u.pathname && u.pathname !== "/" ? parseInt(u.pathname.slice(1), 10) : 0,
      tls: isTLS ? {} : undefined,
    };
  } catch {
    return { host: "127.0.0.1", port: 6379 };
  }
}

let _queue: Queue | null = null;
let _worker: Worker | null = null;

function getRedisConnection() {
  const url = process.env["REDIS_URL"];
  if (!url) return null;
  return parseRedisUrl(url);
}

export function getAlertQueue(): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return _queue;
}

export function startAlertWorker(): Worker | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  if (_worker) return _worker;

  _worker = new Worker(
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
      connection: conn,
      concurrency: 5,
    },
  );

  attachWorkerFailedHandler(_worker, QUEUE_NAME);

  return _worker;
}
