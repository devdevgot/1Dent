import { Queue, Worker } from "bullmq";
import type { CreateActionLogInput } from "./logs.service";
import { logsService } from "./logs.service";
import { attachWorkerFailedHandler } from "../error-events/error-events.worker-capture";

const QUEUE_NAME = "action-logs";

let logQueue: Queue | null = null;

if (process.env.REDIS_URL) {
  const connection = { url: process.env.REDIS_URL };

  logQueue = new Queue<CreateActionLogInput>(QUEUE_NAME, {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
  });

  const actionLogWorker = new Worker<CreateActionLogInput>(
    QUEUE_NAME,
    async (job) => {
      await logsService.create(job.data);
    },
    { connection, concurrency: 5 },
  );

  attachWorkerFailedHandler(actionLogWorker, QUEUE_NAME);

  console.info("[ActionLogQueue] BullMQ worker started");
} else {
  console.info("[ActionLogQueue] REDIS_URL not set — using direct async DB writes");
}

export async function enqueueActionLog(data: CreateActionLogInput): Promise<void> {
  if (logQueue) {
    await logQueue.add("log", data, { removeOnComplete: 500, removeOnFail: 100 });
  } else {
    logsService.create(data).catch(() => {});
  }
}
